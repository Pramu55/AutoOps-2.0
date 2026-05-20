param(
  [string]$ContainerName = "autoops-postgres",
  [string]$Database = "autoops",
  [string]$Username = "autoops",
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

$containerId = docker ps --filter "name=^/$ContainerName$" --format "{{.ID}}"
if (-not $containerId) {
  Write-Error "PostgreSQL container '$ContainerName' is not running."
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupFile = Join-Path $OutputDir "autoops-$timestamp.dump"
$remoteFile = "/tmp/autoops-$timestamp.dump"

Write-Host "Creating PostgreSQL backup..." -ForegroundColor Cyan
docker exec $ContainerName sh -c "pg_dump -U '$Username' -d '$Database' -Fc -f '$remoteFile'"
docker cp "${ContainerName}:$remoteFile" $backupFile
docker exec $ContainerName sh -c "rm -f '$remoteFile'" | Out-Null

Write-Host ""
Write-Host "Backup created:" -ForegroundColor Green
Write-Host $backupFile -ForegroundColor Green
