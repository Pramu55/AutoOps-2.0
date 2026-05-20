param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$ContainerName = "autoops-postgres",
  [string]$Database = "autoops",
  [string]$Username = "autoops"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupPath)) {
  Write-Error "Backup file was not found: $BackupPath"
}

$containerId = docker ps --filter "name=^/$ContainerName$" --format "{{.ID}}"
if (-not $containerId) {
  Write-Error "PostgreSQL container '$ContainerName' is not running."
}

Write-Host "WARNING: restoring a backup can overwrite existing database objects." -ForegroundColor Yellow
Write-Host "No Docker volumes will be deleted and prisma migrate reset will not be run." -ForegroundColor Yellow
$confirmation = Read-Host "Type RESTORE to continue"

if ($confirmation -ne "RESTORE") {
  Write-Host "Restore cancelled." -ForegroundColor Yellow
  exit 1
}

$resolvedPath = Resolve-Path $BackupPath
$remoteFile = "/tmp/autoops-restore.dump"

Write-Host "Copying backup into PostgreSQL container..." -ForegroundColor Cyan
docker cp $resolvedPath "${ContainerName}:$remoteFile"

Write-Host "Restoring PostgreSQL backup..." -ForegroundColor Cyan
docker exec $ContainerName sh -c "pg_restore -U '$Username' -d '$Database' --clean --if-exists --no-owner '$remoteFile'"
docker exec $ContainerName sh -c "rm -f '$remoteFile'" | Out-Null

Write-Host ""
Write-Host "Restore completed." -ForegroundColor Green
