$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Provider Connectivity Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$branch = git branch --show-current
Write-Host "`nGit branch: $branch" -ForegroundColor DarkCyan

$DotEnv = @{}
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
    $parts = $_ -split "=", 2
    $DotEnv[$parts[0].Trim()] = $parts[1].Trim()
  }
}

Write-Host "`nContainer status:" -ForegroundColor Cyan
docker ps --filter "name=autoops" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

function Test-EnvPresence {
  param(
    [string]$Name
  )
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $DotEnv.ContainsKey($Name)) {
    $value = $DotEnv[$Name]
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    $containerValue = docker exec autoops-api printenv $Name 2>$null
    if ($LASTEXITCODE -eq 0) {
      $value = $containerValue
    }
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "  ${Name}: missing" -ForegroundColor Yellow
  } else {
    Write-Host "  ${Name}: present" -ForegroundColor Green
  }
}

Write-Host "`nAPI readiness:" -ForegroundColor Cyan
try {
  Invoke-RestMethod http://localhost:4000/ready | Out-Null
  Write-Host "  API ready: yes" -ForegroundColor Green
} catch {
  Write-Host "  API ready: no" -ForegroundColor Yellow
}

Write-Host "`nProvider inventory allowlist:" -ForegroundColor Cyan
Test-EnvPresence "PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS"
Test-EnvPresence "PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS"
Write-Host "  Reminder: new organizations remain blocked unless explicitly allowlisted." -ForegroundColor DarkCyan

Write-Host "`nJenkins config presence:" -ForegroundColor Cyan
Test-EnvPresence "JENKINS_URL"
Test-EnvPresence "JENKINS_USERNAME"
Test-EnvPresence "JENKINS_API_TOKEN"

Write-Host "`nKubernetes config presence:" -ForegroundColor Cyan
Test-EnvPresence "KUBECONFIG_HOST_PATH"
Test-EnvPresence "KUBERNETES_API_SERVER_OVERRIDE"
if (Test-Path "$env:USERPROFILE\.kube\config") {
  Write-Host "  Host kubeconfig file: present" -ForegroundColor Green
} else {
  Write-Host "  Host kubeconfig file: missing" -ForegroundColor Yellow
}

Write-Host "`nDocker socket:" -ForegroundColor Cyan
try {
  docker exec autoops-api sh -lc "test -S /var/run/docker.sock" | Out-Null
  Write-Host "  API Docker socket mount: present" -ForegroundColor Green
} catch {
  Write-Host "  API Docker socket mount: missing" -ForegroundColor Yellow
}

Write-Host "`nAWS config presence:" -ForegroundColor Cyan
Test-EnvPresence "AWS_REGION"
Test-EnvPresence "AWS_ACCESS_KEY_ID"
Test-EnvPresence "AWS_SECRET_ACCESS_KEY"
Test-EnvPresence "AWS_ALLOWED_DEPLOYMENT_WORKSPACES"
Test-EnvPresence "AWS_ECR_ALLOWED_REPOSITORIES"
Test-EnvPresence "AWS_ECR_ALLOWED_BUILD_TARGETS"

Write-Host "`nGitHub Actions config presence:" -ForegroundColor Cyan
Test-EnvPresence "GITHUB_ACTIONS_TOKEN"
Test-EnvPresence "GITHUB_REPOSITORY_OWNER"
Test-EnvPresence "GITHUB_REPOSITORY_NAME"

Write-Host "`nDone. This script reports presence only and never prints token or credential values." -ForegroundColor Green
