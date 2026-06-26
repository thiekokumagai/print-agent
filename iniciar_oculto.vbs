Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strFolder

' O número 0 no final significa "Rodar Oculto" (sem tela preta)
WshShell.Run chr(34) & "PrintAgent.exe" & Chr(34), 0
Set WshShell = Nothing
