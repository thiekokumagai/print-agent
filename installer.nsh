!macro customUnInstall
  ; Só limpa na desinstalação manual (nunca durante atualização automática)
  ${ifNot} ${isUpdated}
    ; Remove entradas de inicialização com o Windows criadas pelo Electron
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Pod e Mais"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pod e Mais"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.print-agent"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "print-agent"

    ; Remove o histórico de aprovação da aba Aplicativos de Inicialização do Windows
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.Pod e Mais"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Pod e Mais"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.print-agent"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "print-agent"

    ; Remove cache do atualizador automático
    RMDir /r "$LOCALAPPDATA\print-agent-updater"
  ${endIf}
!macroend