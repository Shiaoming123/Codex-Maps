param(
  [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Maps.lnk')
)

if (Test-Path -LiteralPath $ShortcutPath) {
  Remove-Item -LiteralPath $ShortcutPath -Force
  Write-Output "Removed Codex Maps shortcut: $ShortcutPath"
} else {
  Write-Output "Codex Maps shortcut not found: $ShortcutPath"
}
