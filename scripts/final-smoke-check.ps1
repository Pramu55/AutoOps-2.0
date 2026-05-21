param(
  [string]$ApiBase = "http://localhost:4000/api/v1",
  [string]$WebBase = "http://localhost:3000",
  [string]$Email = "pramod.local@autoops.dev",
  [string]$Password = "StrongPass123"
)

$ErrorActionPreference = "Stop"

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name, [bool]$Passed, [string]$Message)
  $results.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Message = $Message }) | Out-Null
  $color = if ($Passed) { "Green" } else { "Red" }
  $status = if ($Passed) { "PASS" } else { "FAIL" }
  Write-Host "[$status] $Name - $Message" -ForegroundColor $color
}

function Check-Get {
  param([string]$Name, [string]$Uri, [hashtable]$Headers = @{})
  try {
    Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers -TimeoutSec 20 | Out-Null
    Add-Result $Name $true "reachable"
  } catch {
    Add-Result $Name $false $_.Exception.Message
  }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Final Smoke Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Check-Get "API health" "http://localhost:4000/health"
Check-Get "API readiness" "http://localhost:4000/ready"
Check-Get "Web root" "$WebBase/"
Check-Get "Web login" "$WebBase/login"

$headers = @{}
try {
  $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 20
  $token = $login.data.tokens.accessToken
  if (-not $token) { throw "No access token returned" }
  $headers = @{ Authorization = "Bearer $token" }
  Add-Result "Demo requester login" $true "authenticated"
} catch {
  Add-Result "Demo requester login" $false $_.Exception.Message
}

if ($headers.Count -gt 0) {
  Check-Get "Operations observability" "$ApiBase/ops/observability" $headers
  Check-Get "Operation activity" "$ApiBase/ops/activity" $headers
  Check-Get "Governance evidence" "$ApiBase/ops/governance" $headers
  Check-Get "Jenkins status" "$ApiBase/integrations/jenkins/status" $headers
  Check-Get "Docker status" "$ApiBase/integrations/docker/status" $headers
  Check-Get "Kubernetes status" "$ApiBase/integrations/kubernetes/status" $headers
  Check-Get "Infrastructure status" "$ApiBase/integrations/infrastructure/status" $headers
  Check-Get "GitHub Actions status" "$ApiBase/integrations/github-actions/status" $headers
  Check-Get "Observability integration status" "$ApiBase/integrations/observability/status" $headers
  Check-Get "Cloud readiness status" "$ApiBase/integrations/cloud/status" $headers
  Check-Get "DevOps tools status" "$ApiBase/integrations/devops-tools/status" $headers
  Check-Get "Incidents" "$ApiBase/incidents" $headers
}

$failed = @($results | Where-Object { -not $_.Passed })
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Final Smoke Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("Passed: {0}" -f (($results | Where-Object { $_.Passed }).Count)) -ForegroundColor Green
Write-Host ("Failed: {0}" -f $failed.Count) -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Red" })

if ($failed.Count -gt 0) {
  throw "Final smoke check failed. Review the failed checks above."
}

Write-Host "Final smoke check passed." -ForegroundColor Green
