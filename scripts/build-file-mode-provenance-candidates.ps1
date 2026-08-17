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

function Test-Digest([string]$Identity) {
  return -not [string]::IsNullOrWhiteSpace($Identity) -and $Identity -cmatch '^sha256:[0-9a-f]{64}$'
}

if (-not (Test-Revision $ExpectedRevision) -or -not (Test-ImageReference $ApiImage) -or -not (Test-ImageReference $WorkerImage) -or -not (Test-BuildxBuilder $BuildxBuilder)) {
  throw 'FILE_MODE_CANDIDATE_BUILD_ARGUMENT_INVALID'
}

$gitContext = "${gitContextRepository}?ref=$ExpectedRevision&checksum=$ExpectedRevision"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('autoops-file-mode-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

function Invoke-CommitPinnedCandidateBuild([string]$Name, [string]$Image, [string]$Dockerfile) {
  $metadataPath = Join-Path $temporaryRoot "$Name.metadata.json"
  $iidPath = Join-Path $temporaryRoot "$Name.iid"

  & docker buildx build --builder $BuildxBuilder --file $Dockerfile --build-arg "AUTOOPS_SOURCE_REVISION=$ExpectedRevision" --provenance=mode=max --metadata-file $metadataPath --iidfile $iidPath --load --tag $Image $gitContext
  if ($LASTEXITCODE -ne 0) { throw "FILE_MODE_CANDIDATE_BUILD_FAILED_$Name" }

  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $fullRecordRef = [string]$metadata.'buildx.build.ref'
  $indexDigest = [string]$metadata.'containerimage.descriptor'.digest
  $metadataConfigDigest = [string]$metadata.'containerimage.config.digest'
  $iidIdentity = (Get-Content -LiteralPath $iidPath -Raw).Trim()
  $loadedImageIdentity = (& docker image inspect --format '{{.Id}}' $Image).Trim()

  # Docker Desktop's local image store uses the OCI index identity for --load
  # image IDs. The Buildx config digest is a distinct manifest child and must
  # never be substituted for either of these identities.
  if ([string]::IsNullOrWhiteSpace($fullRecordRef) -or -not (Test-Digest $indexDigest) -or -not (Test-Digest $iidIdentity) -or -not (Test-Digest $loadedImageIdentity)) {
    throw "FILE_MODE_CANDIDATE_BUILD_METADATA_INVALID_$Name"
  }
  if ($iidIdentity -cne $loadedImageIdentity -or $indexDigest -cne $loadedImageIdentity) {
    throw "FILE_MODE_CANDIDATE_BUILD_LOADED_INDEX_BINDING_MISMATCH_$Name"
  }

  $recordRef = $fullRecordRef.Split('/')[-1]
  if ([string]::IsNullOrWhiteSpace($recordRef) -or $recordRef -notmatch '^[a-z0-9]{20,64}$') {
    throw "FILE_MODE_CANDIDATE_BUILD_RECORD_INVALID_$Name"
  }
  $manifestOutput = (& docker buildx history inspect attachment --builder $BuildxBuilder $recordRef --type application/vnd.oci.image.manifest.v1+json)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($manifestOutput)) {
    throw "FILE_MODE_CANDIDATE_BUILD_MANIFEST_EVIDENCE_UNAVAILABLE_$Name"
  }
  try { $manifest = $manifestOutput | ConvertFrom-Json -ErrorAction Stop } catch { throw "FILE_MODE_CANDIDATE_BUILD_MANIFEST_EVIDENCE_INVALID_$Name" }
  $manifestConfigDigest = [string]$manifest.config.digest
  if (-not (Test-Digest $manifestConfigDigest)) {
    throw "FILE_MODE_CANDIDATE_BUILD_MANIFEST_CONFIG_DIGEST_INVALID_$Name"
  }
  # Buildx metadata does not expose this optional field in every local image
  # store.  When it is present, it must agree with the trusted manifest;
  # otherwise the manifest attachment is the sole ConfigDigest evidence.
  if (-not [string]::IsNullOrWhiteSpace($metadataConfigDigest) -and (-not (Test-Digest $metadataConfigDigest) -or $manifestConfigDigest -cne $metadataConfigDigest)) {
    throw "FILE_MODE_CANDIDATE_BUILD_CONFIG_DIGEST_CONFLICT_$Name"
  }
  $metadataConfigBinding = if ([string]::IsNullOrWhiteSpace($metadataConfigDigest)) { 'NOT_AVAILABLE' } else { 'PASS' }

  Write-Host "$Name`_IMAGE=$Image"
  Write-Host "$Name`_BUILD_RECORD_REF=$recordRef"
  Write-Host "$Name`_IID_IDENTITY=$iidIdentity"
  Write-Host "$Name`_LOADED_IMAGE_IDENTITY=$loadedImageIdentity"
  Write-Host "$Name`_INDEX_DIGEST=$indexDigest"
  Write-Host "$Name`_CONFIG_DIGEST=$manifestConfigDigest"
  Write-Host "$Name`_METADATA_CONFIG_EQUALS_MANIFEST_CONFIG=$metadataConfigBinding"
}

try {
  # The Git URL and checksum are BuildKit inputs. The mutable checkout is never
  # used as this build context.
  Invoke-CommitPinnedCandidateBuild 'API' $ApiImage 'infra/docker/Dockerfile.api'
  Invoke-CommitPinnedCandidateBuild 'WORKER' $WorkerImage 'infra/docker/Dockerfile.worker'
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
