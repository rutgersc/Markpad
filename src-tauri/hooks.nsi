!macro NSIS_HOOK_POST_INSTALL
  RMDir /r "$LOCALAPPDATA\com.alecdotdev.markpad\EBWebView"
  CreateShortcut "$DESKTOP\Markpad.lnk" "$INSTDIR\markdown-viewer-v2.exe" "" "$INSTDIR\markdown-viewer-v2.exe" 0
!macroend

!macro NSIS_HOOK_POST_UNINSTALL
  Delete "$DESKTOP\Markpad.lnk"
  RMDir /r "$LOCALAPPDATA\com.alecdotdev.markpad"
!macroend
