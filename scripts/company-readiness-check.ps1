$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Company Readiness Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$docsPresent = $true
$scriptsPresent = $true
$runtimeReachable = $false
$dockerReachable = $false

function Test-FilePresence {
  param(
    [string]$Path,
    [string]$Label,
    [string]$Kind
  )

  if (Test-Path $Path) {
    Write-Host "  [OK] $Label" -ForegroundColor Green
    return $true
  }

  Write-Host "  [MISSING] $Label ($Path)" -ForegroundColor Yellow
  return $false
}

Write-Host "`nGit context:" -ForegroundColor Cyan
try {
  $branch = git branch --show-current
  Write-Host "  Branch: $branch" -ForegroundColor DarkCyan
  $status = git --no-pager status --short
  if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  Working tree: clean" -ForegroundColor Green
  } else {
    Write-Host "  Working tree: dirty" -ForegroundColor Yellow
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
  }
} catch {
  Write-Host "  Git status: unavailable" -ForegroundColor Yellow
}

Write-Host "`nRequired files:" -ForegroundColor Cyan
$requiredDocs = @(
  ".env.example",
  "docker-compose.yml",
  "docs/COMPANY_DEPLOYMENT_HANDOFF.md",
  "docs/COMPANY_SECURITY_REVIEW_CHECKLIST.md",
  "docs/COMPANY_PILOT_RUNBOOK.md",
  "docs/ENTERPRISE_ARCHITECTURE_OVERVIEW.md",
  "docs/TCS_READY_POSITIONING.md"
)

foreach ($file in $requiredDocs) {
  $docsPresent = (Test-FilePresence $file $file "doc") -and $docsPresent
}

if (Test-Path "docker-compose.prod.yml") {
  Write-Host "  [OK] docker-compose.prod.yml" -ForegroundColor Green
} else {
  Write-Host "  [INFO] docker-compose.prod.yml not present in this checkout" -ForegroundColor DarkYellow
}

Write-Host "`nSafety scripts:" -ForegroundColor Cyan
$requiredScripts = @(
  "scripts/check-provider-connectivity.ps1",
  "scripts/show-current-org-context.ps1",
  "scripts/scan-secrets.ps1",
  "scripts/final-smoke-check.ps1"
)

foreach ($file in $requiredScripts) {
  $scriptsPresent = (Test-FilePresence $file $file "script") -and $scriptsPresent
}

Write-Host "`nDocker runtime:" -ForegroundColor Cyan
try {
  $dockerOutput = & docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker: not running or unavailable" -ForegroundColor Yellow
  } else {
    $dockerOutput | Out-String | ForEach-Object {
      if (-not [string]::IsNullOrWhiteSpace($_)) {
        Write-Host $_.TrimEnd()
      }
    }
    $dockerReachable = $true
  }
} catch {
  Write-Host "  Docker: not running or unavailable" -ForegroundColor Yellow
}

Write-Host "`nAPI readiness:" -ForegroundColor Cyan
try {
  Invoke-RestMethod "http://localhost:4000/ready" -TimeoutSec 5 | Out-Null
  Write-Host "  API ready: yes" -ForegroundColor Green
  $runtimeReachable = $true
} catch {
  Write-Host "  API ready: not running" -ForegroundColor Yellow
}

Write-Host "`nPresence-only config checks:" -ForegroundColor Cyan
$presenceNames = @(
  "PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS",
  "JENKINS_URL",
  "KUBECONFIG_HOST_PATH",
  "AWS_REGION",
  "GITHUB_REPOSITORY_OWNER",
  "PROMETHEUS_URL",
  "GRAFANA_URL"
)

foreach ($name in $presenceNames) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "  ${name}: not set in current shell" -ForegroundColor DarkYellow
  } else {
    Write-Host "  ${name}: present" -ForegroundColor Green
  }
}

Write-Host "`nReadiness summary:" -ForegroundColor Cyan
Write-Host "  Docs present: $docsPresent"
Write-Host "  Safety scripts present: $scriptsPresent"
Write-Host "  Provider diagnostic present: $(Test-Path 'scripts/check-provider-connectivity.ps1')"
Write-Host "  Docker reachable: $dockerReachable"
Write-Host "  Runtime reachable: $runtimeReachable"
Write-Host "  Secrets printed: no"

Write-Host "`nDone. This script reports file presence and runtime reachability only. It never prints tokens or secret values." -ForegroundColor Green
