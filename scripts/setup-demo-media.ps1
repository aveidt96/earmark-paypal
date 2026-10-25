$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$target = Join-Path $workspace ".tools/stage-7"
[IO.Directory]::CreateDirectory($target) | Out-Null
$archive = Join-Path $target "ffmpeg.zip"
$url = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip"
$expected = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
if (![IO.File]::Exists($archive)) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $archive -TimeoutSec 180 -UseBasicParsing
}
function Get-StreamDigest($stream) {
  $digest = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($digest.ComputeHash($stream)).Replace("-", "").ToLowerInvariant()
  } finally { $digest.Dispose() }
}
$archiveStream = [IO.File]::OpenRead($archive)
try { $actual = Get-StreamDigest $archiveStream } finally { $archiveStream.Dispose() }
if ($actual -ne $expected) { throw "FFmpeg archive checksum mismatch; no binary executed." }
[Reflection.Assembly]::LoadWithPartialName("System.IO.Compression.FileSystem") | Out-Null
$extract = Join-Path $target "ffmpeg"
if (![IO.Directory]::Exists($extract)) {
  [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extract)
}
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  foreach ($name in @("ffmpeg", "ffprobe")) {
    $relative = "ffmpeg-9.0.2-essentials_build/bin/$name.exe"
    $entry = $zip.GetEntry($relative)
    if (!$entry) { throw "Expected media binary missing from verified archive." }
    $entryStream = $entry.Open()
    try { $entryDigest = Get-StreamDigest $entryStream } finally { $entryStream.Dispose() }
    $binary = Join-Path $extract $relative
    $binaryStream = [IO.File]::OpenRead($binary)
    try { $binaryDigest = Get-StreamDigest $binaryStream } finally { $binaryStream.Dispose() }
    if ($binaryDigest -ne $entryDigest) { throw "Extracted media binary mismatch; no binary executed." }
    $version = & $binary -version
    if ($LASTEXITCODE -ne 0) { throw "Media binary verification failed." }
    $version | Select-Object -First 1
  }
} finally { $zip.Dispose() }
Write-Output "Portable media tools verified under ignored .tools/stage-7. No system installation."