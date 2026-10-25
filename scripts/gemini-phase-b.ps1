param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('save', 'models', 'probe', 'count', 'ping', 'ping-ps', 'ping-alt', 'normal', 'normal-tools', 'injection', 'injection-tools', 'disabled', 'boundary', 'console', 'console-test')]
  [string] $Action,
  [ValidatePattern('^[a-zA-Z0-9._-]+$')]
  [string] $Model = 'gemini-3.8-flash',
  [string] $BrowserFilter = '',
  [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$privateDir = Join-Path $repoRoot '.tools/gemini-phase-b'
$keyPath = Join-Path $privateDir 'key.dpapi'

if ($Action -eq 'save') {
  New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
  $key = Read-Host 'Gemini API key (input hidden)' -AsSecureString
  if ($key.Length -eq 0) { throw 'No key entered.' }
  $encrypted = ConvertFrom-SecureString -SecureString $key
  [IO.File]::WriteAllText($keyPath, $encrypted, [Text.UTF8Encoding]::new($false))
  Write-Host 'Encrypted key saved under ignored .tools/gemini-phase-b. Its value was not displayed.'
  return
}

if (-not (Test-Path -LiteralPath $keyPath)) {
  throw 'No local encrypted key. Run: powershell -NoProfile -File scripts/gemini-phase-b.ps1 save'
}

Push-Location $repoRoot
try {
  if ($SkipBuild) {
    $source = Get-Item -LiteralPath (Join-Path $repoRoot 'agent/src/models.ts')
    $compiled = Get-Item -LiteralPath (Join-Path $repoRoot 'agent/dist/models.js') -ErrorAction Stop
    if ($compiled.LastWriteTimeUtc -lt $source.LastWriteTimeUtc) {
      throw 'Compiled Gemini adapter is stale; rerun without -SkipBuild.'
    }
  } else {
    npm run build --workspace @flint/agent
    if ($LASTEXITCODE -ne 0) { throw 'Agent build failed.' }
  }

  $encrypted = [IO.File]::ReadAllText($keyPath)
  $key = ConvertTo-SecureString -String $encrypted
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
  try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $env:GEMINI_MODEL = $Model
  $env:GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
  $env:EARMARK_ENABLE_TESTNET_EXECUTION = 'false'
  $env:AGENT_MODEL_PROVIDER = 'gemini'
  $env:AI_ENABLE_NETWORK = if ($Action -eq 'disabled') { 'false' } else { 'true' }
  $env:EARMARK_GEMINI_ENABLED = if ($Action -eq 'disabled') { 'false' } else { 'true' }

  switch ($Action) {
    'models' { node scripts/gemini-model-probe.mjs --list }
    'boundary' { node scripts/gemini-secret-check.mjs }
    'console' { $env:AGENT_MODEL_PROVIDER = 'mock'; node scripts/start-gemini-console.mjs }
    'console-test' { $env:AGENT_MODEL_PROVIDER = 'mock'; if ($BrowserFilter) { node node_modules/@playwright/test/cli.js test e2e/gemini.spec.mjs --grep $BrowserFilter } else { node node_modules/@playwright/test/cli.js test e2e/gemini.spec.mjs } }
    'probe' { node scripts/gemini-model-probe.mjs }
    'ping' { node scripts/gemini-model-probe.mjs --generate }
    { $_ -in @('count', 'ping-ps', 'ping-alt') } {
      $started = [DateTime]::UtcNow
      $requestData = @{ contents = @(@{ role = 'user'; parts = @(@{ text = 'Reply READY.' }) }) }
      if ($Action -ne 'count') { $requestData.generationConfig = @{ maxOutputTokens = 256; thinkingConfig = @{ thinkingLevel = 'LOW' } } }
      $body = $requestData | ConvertTo-Json -Depth 8 -Compress
      $methodName = if ($Action -eq 'count') { 'countTokens' } else { 'generateContent' }
      $modelName = if ($Action -eq 'ping-alt') { 'gemini-3.5-flash' } else { $Model }
      try {
        $timeoutSeconds = if ($Action -eq 'count') { 15 } else { 45 }
        $response = Invoke-WebRequest -Uri ("https://generativelanguage.googleapis.com/v1beta/models/" + $modelName + ":" + $methodName) -Method Post -ContentType 'application/json' -Headers @{ 'x-goog-api-key' = $env:GEMINI_API_KEY } -Body $body -TimeoutSec $timeoutSeconds -ErrorAction Stop
        $payload = $response.Content | ConvertFrom-Json
        $finishReason = if ($Action -eq 'count') { $null } else { $payload.candidates[0].finishReason }
        [PSCustomObject]@{ model = $modelName; apiMethod = $methodName; status = $response.StatusCode; finishReason = $finishReason; totalTokens = $payload.totalTokens; elapsedMs = [int]([DateTime]::UtcNow - $started).TotalMilliseconds; financialExecution = $false } | ConvertTo-Json -Compress
        $global:LASTEXITCODE = 0
      } catch {
        [PSCustomObject]@{ model = $modelName; apiMethod = $methodName; status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }; errorType = $_.Exception.GetType().Name; elapsedMs = [int]([DateTime]::UtcNow - $started).TotalMilliseconds; financialExecution = $false } | ConvertTo-Json -Compress
        $global:LASTEXITCODE = 1
      }
    }
    'normal' { node scripts/gemini-live-smoke.mjs }
    'normal-tools' { node scripts/gemini-live-smoke.mjs --conversation }
    'injection' { node scripts/gemini-live-smoke.mjs --injection }
    'injection-tools' { node scripts/gemini-live-smoke.mjs --injection --conversation }
    'disabled' { node scripts/gemini-live-smoke.mjs }
  }
  $result = $LASTEXITCODE
  if ($Action -eq 'disabled' -and $result -eq 2) {
    Write-Host 'PASS: disabled feature switch stopped Gemini before a network request.'
    return
  }
  if ($result -ne 0) { throw "Gemini Phase B action failed with exit code $result." }
} finally {
  foreach ($name in @('GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL', 'EARMARK_ENABLE_TESTNET_EXECUTION', 'AGENT_MODEL_PROVIDER', 'AI_ENABLE_NETWORK', 'EARMARK_GEMINI_ENABLED')) {
    Remove-Item -Path ("Env:" + $name) -ErrorAction SilentlyContinue
  }
  Pop-Location
}
