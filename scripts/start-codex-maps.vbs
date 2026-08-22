Option Explicit

Dim shell, fileSystem, scriptsDirectory, projectDirectory, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptsDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
projectDirectory = fileSystem.GetParentFolderName(scriptsDirectory)
command = "cmd.exe /d /c cd /d """ & projectDirectory & """ && pnpm start:desktop"

shell.Run command, 0, False
