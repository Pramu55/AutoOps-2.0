param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location "C:\AutoOps 2.0"

Write-Host "`nChecking Docker engine..." -ForegroundColor Cyan
try {
  docker version | Out-Null
  Write-Host "Docker engine: available" -ForegroundColor Green
} catch {
  Write-Host "Docker engine is not available. Start Docker Desktop and try again." -ForegroundColor Red
  exit 1
}

Write-Host "`nChecking Git working tree..." -ForegroundColor Cyan
git --no-pager status --short
$branch = git branch --show-current
if ($branch) {
  Write-Host "Current branch: $branch" -ForegroundColor DarkCyan
}

if (-not (Test-Path ".env")) {
  Write-Host "`n.env was not found. Copy .env.example to .env and set local secrets before starting." -ForegroundColor Yellow
}

Write-Host "`nStarting Jenkins..." -ForegroundColor Cyan
docker start autoops-jenkins 2>$null | Out-Null

Write-Host "Starting Docker smoke container..." -ForegroundColor Cyan
docker start autoops-docker-smoke 2>$null | Out-Null

Write-Host "`nPreparing Kubernetes environment..." -ForegroundColor Cyan
$KUBE_SERVER = kubectl config view --minify -o jsonpath="{.clusters[0].cluster.server}"

if (-not $KUBE_SERVER) {
  Write-Host "Kubernetes server was not found. Is Docker Desktop Kubernetes running?" -ForegroundColor Red
  exit 1
}

$PORT = ($KUBE_SERVER -replace "https://127.0.0.1:", "" -replace "https://localhost:", "")

$env:KUBECONFIG_HOST_PATH="$env:USERPROFILE\.kube\config"
$env:KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:$PORT"
$env:KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"

Write-Host "Kubernetes host override: $env:KUBERNETES_API_SERVER_OVERRIDE" -ForegroundColor Green

Write-Host "`nStarting AutoOps Docker Compose stack..." -ForegroundColor Cyan

if ($Build) {
  docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build
} else {
  docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d
}

Write-Host "`nChecking AutoOps containers..." -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.k8s.yml ps

Write-Host "`nChecking Jenkins..." -ForegroundColor Cyan
docker ps --filter "name=autoops-jenkins"

Write-Host "`nChecking Docker smoke container..." -ForegroundColor Cyan
docker ps --filter "name=autoops-docker-smoke"

Write-Host "`nQuick health checks..." -ForegroundColor Cyan

try {
  Invoke-RestMethod http://localhost:4000/health | Out-Null
  Write-Host "API health: OK" -ForegroundColor Green
} catch {
  Write-Host "API health check failed. API may still be starting." -ForegroundColor Yellow
}

try {
  Invoke-RestMethod http://localhost:3000 | Out-Null
  Write-Host "Web route: OK" -ForegroundColor Green
} catch {
  Write-Host "Web check failed. Web may still be starting." -ForegroundColor Yellow
}

Write-Host "`nAutoOps started." -ForegroundColor Green
Write-Host "Open: http://localhost:3000" -ForegroundColor Green
Write-Host "API: http://localhost:4000" -ForegroundColor Green
Write-Host "Jenkins: http://localhost:8080" -ForegroundColor Green
Write-Host "Grafana: http://localhost:3001" -ForegroundColor Green
Write-Host "Prometheus: http://localhost:9090" -ForegroundColor Green
