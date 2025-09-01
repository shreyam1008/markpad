!include "MUI2.nsh"

Name "Markpad"
OutFile "..\..\dist\markpad-setup.exe"
InstallDir "$PROGRAMFILES\Markpad"
InstallDirRegKey HKLM "Software\Markpad" "InstallDir"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\..\dist\markpad.exe"

  ; Create start menu shortcut
  CreateDirectory "$SMPROGRAMS\Markpad"
  CreateShortcut "$SMPROGRAMS\Markpad\Markpad.lnk" "$INSTDIR\markpad.exe"
  CreateShortcut "$SMPROGRAMS\Markpad\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\Markpad.lnk" "$INSTDIR\markpad.exe"

  ; Write uninstall info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "DisplayName" "Markpad"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "Publisher" "Shreyam Adhikari"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "DisplayVersion" "@VERSION@"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "NoRepair" 1
  WriteRegStr HKLM "Software\Markpad" "InstallDir" "$INSTDIR"

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\markpad.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\Markpad\Markpad.lnk"
  Delete "$SMPROGRAMS\Markpad\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Markpad"
  Delete "$DESKTOP\Markpad.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad"
  DeleteRegKey HKLM "Software\Markpad"
SectionEnd
