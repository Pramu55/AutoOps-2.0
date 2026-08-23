Set-StrictMode -Version Latest

$script:RotationAuthorityPipeName = 'AutoOpsRotationAuthority-v1'
$script:RotationAuthorityOperations = @(
  'CREATE_CANONICAL_PLAN',
  'INITIALIZE_OPERATION',
  'GET_OPERATION_STATE',
  'CONSUME_ACTIVATION_ATTEMPT',
  'RECORD_ACTIVATION_FAILURE',
  'CONSUME_ROLLBACK_ATTEMPT',
  'CONFIRM_CANDIDATE',
  'CONFIRM_ROLLBACK',
  'RECORD_MANUAL_INTERVENTION'
)

function Stop-RotationAuthorityClient([string]$Code) {
  throw [System.InvalidOperationException]::new($Code)
}

function Invoke-RotationAuthorityRequest(
  [ValidateSet('CREATE_CANONICAL_PLAN','INITIALIZE_OPERATION','GET_OPERATION_STATE','CONSUME_ACTIVATION_ATTEMPT','RECORD_ACTIVATION_FAILURE','CONSUME_ROLLBACK_ATTEMPT','CONFIRM_CANDIDATE','CONFIRM_ROLLBACK','RECORD_MANUAL_INTERVENTION')][string]$Operation,
  [ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [string]$PlanProposalJson
) {
  if ($Operation -eq 'CREATE_CANONICAL_PLAN') {
    if ([string]::IsNullOrWhiteSpace($PlanProposalJson)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_REQUIRED' }
    try { $proposal = $PlanProposalJson | ConvertFrom-Json -ErrorAction Stop } catch { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_INVALID' }
    $request = [ordered]@{ operation = 'CreateCanonicalPlan'; operationId = $OperationId; planProposal = $proposal }
  } else {
    if (-not [string]::IsNullOrWhiteSpace($PlanProposalJson)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PLAN_PROPOSAL_FORBIDDEN' }
    $pascal = (($Operation -split '_' | ForEach-Object { $_.Substring(0,1) + $_.Substring(1).ToLowerInvariant() }) -join '')
    $request = [ordered]@{ operation = $pascal; operationId = $OperationId }
  }
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($request | ConvertTo-Json -Depth 8 -Compress))
  try {
    $pipe = [IO.Pipes.NamedPipeClientStream]::new('.', $script:RotationAuthorityPipeName, [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::None)
    try {
      $pipe.Connect(3000)
      if ($bytes.Length -le 0 -or $bytes.Length -gt 16384) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }
      $header = [BitConverter]::GetBytes([int]$bytes.Length)
      $pipe.Write($header, 0, $header.Length); $pipe.Write($bytes, 0, $bytes.Length); $pipe.Flush()
      $responseHeader = New-Object byte[] 4; $offset = 0
      while ($offset -lt $responseHeader.Length) { $read = $pipe.Read($responseHeader, $offset, $responseHeader.Length - $offset); if ($read -le 0) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }; $offset += $read }
      $length = [BitConverter]::ToInt32($responseHeader, 0)
      if ($length -le 0 -or $length -gt 16384) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }
      $buffer = New-Object byte[] $length; $offset = 0
      while ($offset -lt $buffer.Length) { $read = $pipe.Read($buffer, $offset, $buffer.Length - $offset); if ($read -le 0) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_PROTOCOL_INVALID' }; $offset += $read }
      $response = ([Text.UTF8Encoding]::new($false)).GetString($buffer, 0, $buffer.Length) | ConvertFrom-Json -ErrorAction Stop
    } finally { $pipe.Dispose() }
  } catch {
    if ($_.Exception.Message -match '^ROTATION_AUTHORITY_') { throw }
    Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_UNAVAILABLE'
  }
  if ($response.result -cne 'PASS') { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_REJECTED' }
  return $response
}

function Test-RotationAuthorityClientSelfTest {
  $source = Get-Content -LiteralPath $PSCommandPath -Raw
  $forbidden = @('Skip' + 'Validation', 'Trusted' + 'Caller', 'Validation' + 'Passed', 'Acceptance' + 'Result=PASS', 'Script' + 'Block', 'rotation-' + 'operations', 'rotation-' + 'initialization-claims')
  foreach ($token in $forbidden) { if ($source -match [regex]::Escape($token)) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_CLIENT_SELF_TEST_FAILED' } }
  $unavailable = $false
  try { Invoke-RotationAuthorityRequest 'GET_OPERATION_STATE' ('0' * 32) | Out-Null } catch { $unavailable = $_.Exception.Message -eq 'ROTATION_AUTHORITY_UNAVAILABLE' }
  if (-not $unavailable) { Stop-RotationAuthorityClient 'ROTATION_AUTHORITY_CLIENT_SELF_TEST_FAILED' }
  [Console]::WriteLine('ROTATION_AUTHORITY_CLIENT_NO_LOCAL_WRITER YES')
  [Console]::WriteLine('ROTATION_AUTHORITY_CLIENT_SERVICE_UNAVAILABLE_FAIL_CLOSED YES')
}
