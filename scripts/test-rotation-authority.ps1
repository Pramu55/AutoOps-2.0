$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$project = Join-Path $PSScriptRoot '..\authority\AutoOpsRotationAuthority\AutoOpsRotationAuthority.csproj'
$artifactRoot = Join-Path ([IO.Path]::GetTempPath()) ('autoops-rotation-authority-test-' + [Guid]::NewGuid().ToString('N'))
$syntheticStore = Join-Path ([IO.Path]::GetTempPath()) ('autoops-rotation-authority-store-' + [Guid]::NewGuid().ToString('N'))
try {
  $provisioner = Join-Path $PSScriptRoot 'provision-rotation-authority.ps1'
  & $provisioner -RequesterSid 'S-1-5-21-1-2-3-1001' -SecretRoot 'C:\synthetic\secrets'
  if (Test-Path -LiteralPath $syntheticStore) { throw 'PROVISIONING_DEFAULT_MUTATED_HOST' }
  if ((Get-Content -LiteralPath $provisioner -Raw) -notmatch "ServiceImageFromRepository\s*=\s*'NO'") { throw 'SERVICE_IMAGEPATH_FROM_REPOSITORY' }
  [Console]::WriteLine('PROVISIONING_DEFAULT_NON_MUTATING PASS')
  [Console]::WriteLine('SERVICE_IMAGEPATH_FROM_REPOSITORY_BLOCKED PASS')
  & dotnet build $project --artifacts-path $artifactRoot --nologo | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'ROTATION_AUTHORITY_BUILD_FAILED' }
  $assembly = Get-ChildItem -LiteralPath $artifactRoot -Recurse -Filter 'AutoOpsRotationAuthority.dll' | Select-Object -First 1 -ExpandProperty FullName
  if ([string]::IsNullOrWhiteSpace($assembly)) { throw 'ROTATION_AUTHORITY_BUILD_OUTPUT_MISSING' }
  & dotnet $assembly --self-test
  if ($LASTEXITCODE -ne 0) { throw 'ROTATION_AUTHORITY_SELF_TEST_FAILED' }
  [Console]::WriteLine('ROTATION_AUTHORITY_SYNTHETIC_TEST PASS')
} finally {
  if (Test-Path -LiteralPath $artifactRoot) { Remove-Item -LiteralPath $artifactRoot -Recurse -Force }
  if (Test-Path -LiteralPath $syntheticStore) { Remove-Item -LiteralPath $syntheticStore -Recurse -Force }
}
