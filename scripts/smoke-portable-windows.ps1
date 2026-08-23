param(
  [string]$ArtifactDirectory = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist\Codex Maps Portable\Codex Maps Portable')
)

$executable = Join-Path $ArtifactDirectory 'Codex Maps.exe'
$mainScript = Join-Path $ArtifactDirectory 'resources\app\build\desktop\src\main.js'
if (-not (Test-Path -LiteralPath $executable)) {
  throw "Portable executable is missing: $executable"
}
if (-not (Test-Path -LiteralPath $mainScript)) {
  throw "Portable main script is missing: $mainScript"
}

$temporarySessions = Join-Path ([IO.Path]::GetTempPath()) ("codex-maps-portable-smoke-{0}" -f [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporarySessions -Force | Out-Null
$previousSessionsDirectory = $env:CODEX_MAPS_SESSIONS_DIR
$previousPort = $env:CODEX_MAPS_PORT
$process = $null

try {
  $env:CODEX_MAPS_SESSIONS_DIR = $temporarySessions
  $env:CODEX_MAPS_PORT = '41763'
  $process = Start-Process -FilePath $executable -WorkingDirectory $ArtifactDirectory -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  if ($process.HasExited) {
    throw "Portable Electron process exited during startup: $($process.ExitCode)"
  }

  $observedProcess = Get-Process -Id $process.Id -ErrorAction Stop
  $observedPath = $observedProcess.Path
  $expectedPath = (Resolve-Path -LiteralPath $executable).Path
  if ($observedPath -ne $expectedPath) {
    throw "Portable smoke resolved an unexpected process: $observedPath"
  }

  [ordered]@{
    started = $true
    processId = $process.Id
    artifact = $expectedPath
    usedTemporarySessionsDirectory = $true
  } | ConvertTo-Json -Compress
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  if ($null -eq $previousSessionsDirectory) { Remove-Item Env:CODEX_MAPS_SESSIONS_DIR -ErrorAction SilentlyContinue } else { $env:CODEX_MAPS_SESSIONS_DIR = $previousSessionsDirectory }
  if ($null -eq $previousPort) { Remove-Item Env:CODEX_MAPS_PORT -ErrorAction SilentlyContinue } else { $env:CODEX_MAPS_PORT = $previousPort }
  Remove-Item -LiteralPath $temporarySessions -Recurse -Force -ErrorAction SilentlyContinue
}
