param(
  [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Maps.lnk'),
  [switch]$Force
)

$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$launcherPath = Join-Path $PSScriptRoot 'start-codex-maps.vbs'

if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "Codex Maps launcher is missing: $launcherPath"
}
if ((Test-Path -LiteralPath $ShortcutPath) -and -not $Force) {
  throw "Shortcut already exists: $ShortcutPath. Re-run with -Force to replace it."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shortcut.Arguments = "//B //Nologo `"$launcherPath`""
$shortcut.WorkingDirectory = $projectDirectory
$shortcut.Description = 'Start Codex Maps'
$shortcut.Save()

Write-Output "Created Codex Maps shortcut: $ShortcutPath"
