!include "MUI2.nsh"

!ifndef BASEDIR
  !define BASEDIR "..\.."
!endif

Name "Quillpane"
OutFile "${BASEDIR}\dist\markpad-setup.exe"
InstallDir "$PROGRAMFILES\Markpad"
InstallDirRegKey HKLM "Software\Markpad" "InstallDir"
RequestExecutionLevel admin

!define MUI_ICON "${BASEDIR}\packaging\windows\markpad.ico"
!define MUI_UNICON "${BASEDIR}\packaging\windows\markpad.ico"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "${BASEDIR}\dist\markpad.exe"

  ; Remove old display-name shortcuts during an in-place upgrade.
  Delete "$SMPROGRAMS\Markpad\Markpad.lnk"
  Delete "$SMPROGRAMS\Markpad\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Markpad"
  Delete "$DESKTOP\Markpad.lnk"

  ; Create start menu shortcut
  CreateDirectory "$SMPROGRAMS\Quillpane"
  CreateShortcut "$SMPROGRAMS\Quillpane\Quillpane.lnk" "$INSTDIR\markpad.exe" "" "$INSTDIR\markpad.exe" 0
  CreateShortcut "$SMPROGRAMS\Quillpane\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\Quillpane.lnk" "$INSTDIR\markpad.exe" "" "$INSTDIR\markpad.exe" 0

  ; Write uninstall info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "DisplayName" "Quillpane"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "DisplayIcon" "$INSTDIR\markpad.exe,0"
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

  Delete "$SMPROGRAMS\Quillpane\Quillpane.lnk"
  Delete "$SMPROGRAMS\Quillpane\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Quillpane"
  Delete "$DESKTOP\Quillpane.lnk"
  Delete "$SMPROGRAMS\Markpad\Markpad.lnk"
  Delete "$SMPROGRAMS\Markpad\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Markpad"
  Delete "$DESKTOP\Markpad.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad"
  DeleteRegKey HKLM "Software\Markpad"
SectionEnd
