param(
  [string]$OutputDirectory = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist\Codex Maps Portable')
)

$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$electronDirectory = Join-Path $projectDirectory 'node_modules\electron\dist'
$buildDirectory = Join-Path $projectDirectory 'build'
$manifestPath = Join-Path $projectDirectory 'packaging\windows\app-package.json'

if (-not [IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory = Join-Path $projectDirectory $OutputDirectory
}

if (-not (Test-Path -LiteralPath $electronDirectory)) {
  throw "Electron runtime is missing: $electronDirectory"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Portable app manifest is missing: $manifestPath"
}

& pnpm build
if ($LASTEXITCODE -ne 0) {
  throw "TypeScript build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $buildDirectory)) {
  throw "Build output is missing: $buildDirectory"
}

$packageDirectory = Join-Path $OutputDirectory 'Codex Maps Portable'
if (Test-Path -LiteralPath $packageDirectory) {
  Remove-Item -LiteralPath $packageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null

Get-ChildItem -LiteralPath $electronDirectory | Copy-Item -Destination $packageDirectory -Recurse -Force
$appDirectory = Join-Path $packageDirectory 'resources\app'
New-Item -ItemType Directory -Path $appDirectory -Force | Out-Null
Copy-Item -LiteralPath $buildDirectory -Destination (Join-Path $appDirectory 'build') -Recurse -Force
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $appDirectory 'package.json') -Force

$electronExecutable = Join-Path $packageDirectory 'electron.exe'
$portableExecutable = Join-Path $packageDirectory 'Codex Maps.exe'
if (-not (Test-Path -LiteralPath $electronExecutable)) {
  throw "Electron executable is missing: $electronExecutable"
}
Copy-Item -LiteralPath $electronExecutable -Destination $portableExecutable -Force
Remove-Item -LiteralPath $electronExecutable -Force

$packageMetadata = Get-Content -Raw (Join-Path $projectDirectory 'package.json') | ConvertFrom-Json
$electronMetadata = Get-Content -Raw (Join-Path $electronDirectory '..\package.json') | ConvertFrom-Json
$sourceCommit = (& git -C $projectDirectory rev-parse HEAD 2>$null).Trim()
$sourceDirty = [bool]((& git -C $projectDirectory status --porcelain 2>$null).Trim())
$provenance = [ordered]@{
  schemaVersion = 1
  appVersion = [string]$packageMetadata.version
  electronVersion = [string]$electronMetadata.version
  platform = 'win32'
  architecture = 'x64'
  sourceCommit = $sourceCommit
  sourceDirty = $sourceDirty
}
$provenancePath = Join-Path $appDirectory '.build-provenance.json'
$utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
[IO.File]::WriteAllText($provenancePath, ($provenance | ConvertTo-Json -Depth 3), $utf8NoBom)

[ordered]@{
  artifact = $packageDirectory
  executable = 'Codex Maps.exe'
  sourceCommit = $sourceCommit
  sourceDirty = $sourceDirty
} | ConvertTo-Json -Compress
