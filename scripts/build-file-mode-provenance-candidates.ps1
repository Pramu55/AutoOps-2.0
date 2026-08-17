param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedRevision,
  [string]$ApiImage = 'autoops-api:file-mode-candidate',
  [string]$WorkerImage = 'autoops-worker:file-mode-candidate',
  [string]$BuildxBuilder = 'desktop-linux'
)

$ErrorActionPreference = 'Stop'
$gitContextRepository = 'https://github.com/Pramu55/AutoOps-2.0.git'

function Test-Revision([string]$Revision) {
  return -not [string]::IsNullOrWhiteSpace($Revision) -and $Revision -cmatch '^[0-9a-f]{40}$'
}

function Test-ImageReference([string]$Image) {
  return -not [string]::IsNullOrWhiteSpace($Image) -and $Image -cmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$'
}

function Test-BuildxBuilder([string]$Builder) {
  return -not [string]::IsNullOrWhiteSpace($Builder) -and $Builder -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$'
}

function Test-ImageIdentity([string]$Identity) {
  return -not [string]::IsNullOrWhiteSpace($Identity) -and $Identity -cmatch '^sha256:[0-9a-f]{64}$'
}

if (-not (Test-Revision $ExpectedRevision) -or -not (Test-ImageReference $ApiImage) -or -not (Test-ImageReference $WorkerImage) -or -not (Test-BuildxBuilder $BuildxBuilder)) {
  throw 'FILE_MODE_CANDIDATE_BUILD_ARGUMENT_INVALID'
}

$gitContext = "$gitContextRepository?ref=$ExpectedRevision&checksum=$ExpectedRevision"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('autoops-file-mode-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

function Invoke-CommitPinnedCandidateBuild([string]$Name, [string]$Image, [string]$Dockerfile) {
  $metadataPath = Join-Path $temporaryRoot "$Name.metadata.json"
  $iidPath = Join-Path $temporaryRoot "$Name.iid"

  & docker buildx build --builder $BuildxBuilder --file $Dockerfile --build-arg "AUTOOPS_SOURCE_REVISION=$ExpectedRevision" --provenance=mode=max --metadata-file $metadataPath --iidfile $iidPath --load --tag $Image $gitContext
  if ($LASTEXITCODE -ne 0) { throw "FILE_MODE_CANDIDATE_BUILD_FAILED_$Name" }

  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $fullRecordRef = [string]$metadata.'buildx.build.ref'
  $descriptorDigest = [string]$metadata.'containerimage.descriptor'.digest
  $iid = (Get-Content -LiteralPath $iidPath -Raw).Trim()
  $loadedIdentity = (& docker image inspect --format '{{.Id}}' $Image).Trim()

  if ([string]::IsNullOrWhiteSpace($fullRecordRef) -or -not (Test-ImageIdentity $descriptorDigest) -or -not (Test-ImageIdentity $iid) -or -not (Test-ImageIdentity $loadedIdentity)) {
    throw "FILE_MODE_CANDIDATE_BUILD_METADATA_INVALID_$Name"
  }
  if ($descriptorDigest -cne $iid -or $descriptorDigest -cne $loadedIdentity) {
    throw "FILE_MODE_CANDIDATE_BUILD_IDENTITY_MISMATCH_$Name"
  }

  $recordRef = $fullRecordRef.Split('/')[-1]
  if ([string]::IsNullOrWhiteSpace($recordRef) -or $recordRef -notmatch '^[a-z0-9]{20,64}$') {
    throw "FILE_MODE_CANDIDATE_BUILD_RECORD_INVALID_$Name"
  }

  Write-Host "$Name`_IMAGE=$Image"
  Write-Host "$Name`_BUILD_RECORD_REF=$recordRef"
  Write-Host "$Name`_IMAGE_IDENTITY=$loadedIdentity"
}

try {
  # The Git URL and checksum are BuildKit inputs. The mutable checkout is never
  # used as this build context.
  Invoke-CommitPinnedCandidateBuild 'API' $ApiImage 'infra/docker/Dockerfile.api'
  Invoke-CommitPinnedCandidateBuild 'WORKER' $WorkerImage 'infra/docker/Dockerfile.worker'
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
