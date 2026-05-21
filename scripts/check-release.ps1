$ErrorActionPreference = "Continue"

function Run-Step {
  param(
    [string]$Name,
    [scriptblock]$Command,
    [int]$Retries = 0
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  $attempt = 0
  while ($true) {
    & $Command
    if ($LASTEXITCODE -eq 0) {
      return
    }

    if ($attempt -ge $Retries) {
      throw "$Name failed with exit code $LASTEXITCODE"
    }

    $attempt += 1
    Write-Host "$Name failed; retrying once after a short pause." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
  }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Release Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "==> Git status" -ForegroundColor Cyan
git --no-pager status --short
if ($LASTEXITCODE -ne 0) {
  throw "Git status failed with exit code $LASTEXITCODE"
}

# Prisma generate can fail on Windows when invoked through nested PowerShell
# scriptblocks while another process briefly holds the generated client files.
# Keep the database package build as a direct command so release checks behave
# like the documented manual build command.
Write-Host ""
Write-Host "==> Database build" -ForegroundColor Cyan
pnpm.cmd --filter "@autoops/database" build
if ($LASTEXITCODE -ne 0) {
  throw "Database build failed with exit code $LASTEXITCODE"
}

Run-Step "Types build" { pnpm.cmd --filter "@autoops/types" build }
Run-Step "Utils build" { pnpm.cmd --filter "@autoops/utils" build }
Run-Step "Logger build" { pnpm.cmd --filter "@autoops/logger" build }
Run-Step "API typecheck" { pnpm.cmd --filter "@autoops/api" typecheck }
Run-Step "API build" { pnpm.cmd --filter "@autoops/api" build }
Run-Step "API tests" { pnpm.cmd --filter "@autoops/api" test }
Run-Step "Worker typecheck" { pnpm.cmd --filter "@autoops/worker" typecheck }
Run-Step "Worker build" { pnpm.cmd --filter "@autoops/worker" build }
Run-Step "Web typecheck" { pnpm.cmd --filter "@autoops/web" typecheck }
Run-Step "Web build" { pnpm.cmd --filter "@autoops/web" build }
Run-Step "Secret scan" { powershell -ExecutionPolicy Bypass -File scripts/scan-secrets.ps1 }
Run-Step "Git whitespace check" { git diff --check }

if ($env:DATABASE_URL) {
  Run-Step "Prisma migration status" {
    .\node_modules\.bin\prisma.cmd migrate status --schema packages/database/prisma/schema.prisma
  }
} else {
  Write-Host ""
  Write-Host "Skipping Prisma migration status because DATABASE_URL is not set." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Release check completed." -ForegroundColor Green
