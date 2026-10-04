; Custom NSIS script for YT Ad Helper
; Automatically registers the Chrome Native Messaging Host during installation
; and unregisters it cleanly during uninstallation.

!macro customInstall
  DetailPrint "Configuring Chrome Native Messaging Host..."
  
  ; Write Chrome Registry Key
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.ytadhelper.nativehost" "" "$INSTDIR\resources\native-host\com.ytadhelper.nativehost.json"
  
  ; Write Edge Registry Key
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.ytadhelper.nativehost" "" "$INSTDIR\resources\native-host\com.ytadhelper.nativehost.json"
  
  DetailPrint "Chrome Native Messaging Host registered successfully."
!macroend

!macro customUnInstall
  DetailPrint "Removing Chrome Native Messaging Host..."
  
  ; Remove Chrome Registry Key
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.ytadhelper.nativehost"
  
  ; Remove Edge Registry Key
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.ytadhelper.nativehost"
  
  DetailPrint "Chrome Native Messaging Host removed successfully."
!macroend
