param(
  [string]$Email = "pramod.local@autoops.dev",
  [string]$Password = "StrongPass123",
  [string]$BaseUrl = "http://localhost:4000/api/v1"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AutoOps Current Org Context" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$loginBody = @{
  email = $Email
  password = $Password
} | ConvertTo-Json

try {
  $login = Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/auth/login" `
    -ContentType "application/json" `
    -Body $loginBody
} catch {
  Write-Host "Login failed for $Email." -ForegroundColor Red
  throw
}

$session = $login.data
$primaryOrg = $session.organizations | Select-Object -First 1

Write-Host ""
Write-Host "User email: $($session.user.email)" -ForegroundColor Green
Write-Host "Organization name: $($primaryOrg.name)" -ForegroundColor Green
Write-Host "Organization slug: $($primaryOrg.slug)" -ForegroundColor Green
Write-Host "Organization id: $($primaryOrg.id)" -ForegroundColor Green
Write-Host "Role: $($primaryOrg.role)" -ForegroundColor Green

Write-Host ""
Write-Host "Tokens were used only for login and were not printed." -ForegroundColor DarkCyan
