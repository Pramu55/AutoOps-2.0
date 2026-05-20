$ErrorActionPreference = "Stop"

$allowedPlaceholders = @(
  "change-me",
  "replace-with",
  "replace-me",
  "placeholder",
  "local-only",
  "autoops_dev",
  "autoops_ci",
  "<token>",
  "not-for-production",
  "StrongPass123"
)

$excludedPrefixes = @(
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "backups/",
  "logs/"
)

$checks = @(
  @{ Name = "Jenkins API token"; Pattern = "(?i)\bJENKINS_API_TOKEN\s*=(?!=)\s*(.+)$" },
  @{ Name = "JWT secret"; Pattern = "(?i)\bJWT_(ACCESS_)?SECRET\s*=(?!=)\s*(.+)$" },
  @{ Name = "JWT refresh secret"; Pattern = "(?i)\bJWT_REFRESH_SECRET\s*=(?!=)\s*(.+)$" },
  @{ Name = "Database URL"; Pattern = "(?i)\bDATABASE_URL\s*=(?!=)\s*(postgres(?:ql)?://[^`"'\s]+)" },
  @{ Name = "AWS access key"; Pattern = "(?i)\bAWS_ACCESS_KEY_ID\s*=(?!=)\s*(.+)$" },
  @{ Name = "AWS secret key"; Pattern = "(?i)\bAWS_SECRET_ACCESS_KEY\s*=(?!=)\s*(.+)$" },
  @{ Name = "GitHub token"; Pattern = "(?i)\bGITHUB_TOKEN\s*=(?!=)\s*(.+)$" },
  @{ Name = "Private key"; Pattern = "-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----" },
  @{ Name = "Bearer token"; Pattern = "(?i)Authorization:\s*Bearer\s+[A-Za-z0-9_\-\.]{20,}" },
  @{ Name = "Kubeconfig certificate data"; Pattern = "(?i)\b(client-key-data|client-certificate-data|certificate-authority-data):\s*[A-Za-z0-9+/=]{40,}" },
  @{ Name = "API key"; Pattern = "(?i)\b(api_key|apikey|access_token|refresh_token)\s*=(?!=)\s*(.+)$" },
  @{ Name = "Password assignment"; Pattern = "(?i)(?<![.\w])password\s*=(?!=)\s*([^`"'\s#]+)" }
)

function Is-ExcludedFile {
  param([string]$Path)
  $normalized = $Path -replace "\\", "/"
  foreach ($prefix in $excludedPrefixes) {
    if ($normalized.StartsWith($prefix)) { return $true }
  }
  return $false
}

function Is-AllowedValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  foreach ($placeholder in $allowedPlaceholders) {
    if ($Value.IndexOf($placeholder, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }
  return $false
}

$findings = @()
$files = @()
$files += git ls-files
$files += git ls-files --others --exclude-standard

foreach ($file in $files) {
  if (Is-ExcludedFile $file) { continue }
  if (-not (Test-Path $file)) { continue }

  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $file -ErrorAction SilentlyContinue) {
    $lineNumber += 1
    foreach ($check in $checks) {
      $match = [regex]::Match($line, $check.Pattern)
      if (-not $match.Success) { continue }

      $value = if ($match.Groups.Count -gt 1) { $match.Groups[$match.Groups.Count - 1].Value.Trim() } else { $line }
      if (Is-AllowedValue $value) { continue }

      $findings += [pscustomobject]@{
        File = $file
        Line = $lineNumber
        Category = $check.Name
      }
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host "Potential secrets found. Values are intentionally not printed." -ForegroundColor Red
  $findings | Format-Table -AutoSize
  exit 1
}

Write-Host "Secret scan passed." -ForegroundColor Green
