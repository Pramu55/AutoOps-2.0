$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Shutdown" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location "C:\AutoOps 2.0"

Write-Host "`nStopping AutoOps Docker Compose stack..." -ForegroundColor Cyan

$KUBE_SERVER = kubectl config view --minify -o jsonpath="{.clusters[0].cluster.server}" 2>$null
$PORT = ($KUBE_SERVER -replace "https://127.0.0.1:", "" -replace "https://localhost:", "")

$env:KUBECONFIG_HOST_PATH="$env:USERPROFILE\.kube\config"
$env:KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:$PORT"
$env:KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml stop

Write-Host "`nStopping Jenkins..." -ForegroundColor Cyan
docker stop autoops-jenkins 2>$null

Write-Host "`nStopping Docker smoke container..." -ForegroundColor Cyan
docker stop autoops-docker-smoke 2>$null

Write-Host "`nRunning containers after shutdown:" -ForegroundColor Cyan
docker ps

Write-Host "`nAutoOps stopped safely." -ForegroundColor Green
