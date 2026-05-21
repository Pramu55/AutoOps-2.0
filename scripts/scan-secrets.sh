#!/usr/bin/env bash
set -euo pipefail

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

is_allowed_value() {
  local value="$1"
  [[ -z "${value// }" ]] && return 0
  [[ "$value" == \$* ]] && return 0
  case "${value,,}" in
    *change-me*|*replace-with*|*replace-me*|*placeholder*|*local-only*|*autoops_dev*|*autoops_ci*|*"<token>"*|*not-for-production*|*strongpass123*)
      return 0
      ;;
  esac
  return 1
}

scan_line() {
  local file="$1"
  local line_number="$2"
  local line="$3"
  local category=""
  local value=""

  if [[ "$line" =~ JENKINS_API_TOKEN[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="Jenkins API token"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ JWT_([A-Z_]+)?SECRET[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="JWT secret"; value="${BASH_REMATCH[2]}"
  elif [[ "$line" =~ DATABASE_URL[[:space:]]*=[[:space:]]*(postgres(ql)?://[^[:space:]]+) ]]; then
    category="Database URL"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ AWS_SECRET_ACCESS_KEY[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="AWS secret key"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ AWS_ACCESS_KEY_ID[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="AWS access key"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ AZURE_CLIENT_SECRET[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="Azure client secret"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ GOOGLE_APPLICATION_CREDENTIALS[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="Google credentials"; value="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ (GITHUB_TOKEN|GITHUB_ACTIONS_TOKEN)[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="GitHub token"; value="${BASH_REMATCH[2]}"
  elif [[ "$line" =~ Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.-]{20,} ]]; then
    category="Bearer token"; value="$line"
  elif [[ "$line" =~ (client-key-data|client-certificate-data|certificate-authority-data):[[:space:]]*[A-Za-z0-9+/=]{40,} ]]; then
    category="Kubeconfig certificate data"; value="$line"
  elif [[ "$line" =~ (api_key|apikey|access_token|refresh_token)[[:space:]]*=[[:space:]]*([^=].*)$ ]]; then
    category="API key"; value="${BASH_REMATCH[2]}"
  elif [[ "$line" =~ (^|[^[:alnum:]_.])password[[:space:]]*=[[:space:]]*([^=[:space:]#]+) ]]; then
    category="Password assignment"; value="${BASH_REMATCH[2]}"
  elif [[ "$line" =~ -----BEGIN[[:space:]](RSA[[:space:]]|EC[[:space:]]|OPENSSH[[:space:]])?PRIVATE[[:space:]]KEY----- ]]; then
    category="Private key"; value="$line"
  fi

  if [[ -n "$category" ]] && ! is_allowed_value "$value"; then
    printf '%s:%s:%s\n' "$file" "$line_number" "$category" >> "$tmp_file"
  fi
}

while IFS= read -r file; do
  case "$file" in
    node_modules/*|.git/*|.next/*|dist/*|build/*|coverage/*|backups/*|logs/*)
      continue
      ;;
  esac
  [[ -f "$file" ]] || continue
  line_number=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    scan_line "$file" "$line_number" "$line"
  done < "$file"
done < <({ git ls-files; git ls-files --others --exclude-standard; } | sort -u)

if [[ -s "$tmp_file" ]]; then
  echo "Potential secrets found. Values are intentionally not printed."
  cat "$tmp_file"
  exit 1
fi

echo "Secret scan passed."
