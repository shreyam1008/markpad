!include "MUI2.nsh"

!ifndef BASEDIR
  !define BASEDIR "..\.."
!endif

Name "Markpad"
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

  ; Register Markpad for Open With in Explorer
  WriteRegStr HKCR "Applications\markpad.exe" "FriendlyAppName" "Markpad"
  WriteRegStr HKCR "Applications\markpad.exe\DefaultIcon" "" "$INSTDIR\markpad.exe,0"
  WriteRegStr HKCR "Applications\markpad.exe\shell\open" "" "Open with Markpad"
  WriteRegStr HKCR "Applications\markpad.exe\shell\open\command" "" '"$INSTDIR\markpad.exe" "%1"'

  ; Set Markpad as the default app for markdown family files
  WriteRegStr HKCR ".md" "" "Markpad.MarkdownFile"
  WriteRegStr HKCR ".markdown" "" "Markpad.MarkdownFile"
  WriteRegStr HKCR ".mdx" "" "Markpad.MarkdownFile"

  WriteRegStr HKCR "Markpad.MarkdownFile" "" "Markpad Markdown File"
  WriteRegStr HKCR "Markpad.MarkdownFile\DefaultIcon" "" "$INSTDIR\markpad.exe,0"
  WriteRegStr HKCR "Markpad.MarkdownFile\shell\open" "" "Open with Markpad"
  WriteRegStr HKCR "Markpad.MarkdownFile\shell\open\command" "" '"$INSTDIR\markpad.exe" "%1"'

  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.md" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.markdown" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.mdx" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.txt" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.log" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.csv" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.tsv" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.env" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.json" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.yaml" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.yml" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.xml" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.toml" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.ini" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.cfg" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.conf" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.properties" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.py" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.js" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.ts" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.jsx" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.tsx" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.go" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.rs" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.rb" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.lua" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.java" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.c" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.cpp" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.h" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.cs" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.php" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.swift" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.kt" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.dart" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.r" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.sql" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.html" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.htm" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.css" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.scss" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.less" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.svg" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.vue" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.svelte" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.doc" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.docx" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.odt" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.rtf" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.pdf" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.epub" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.mobi" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.azw" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.azw3" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.fb2" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.png" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.jpg" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.jpeg" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.gif" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.webp" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.zip" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.tar" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.gz" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.7z" "" ""
  WriteRegStr HKCR "Applications\markpad.exe\SupportedTypes\.rar" "" ""

  ; Create start menu shortcut
  CreateDirectory "$SMPROGRAMS\Markpad"
  CreateShortcut "$SMPROGRAMS\Markpad\Markpad.lnk" "$INSTDIR\markpad.exe" "" "$INSTDIR\markpad.exe" 0
  CreateShortcut "$SMPROGRAMS\Markpad\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\Markpad.lnk" "$INSTDIR\markpad.exe" "" "$INSTDIR\markpad.exe" 0

  ; Write uninstall info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad" "DisplayName" "Markpad"
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

  Delete "$SMPROGRAMS\Markpad\Markpad.lnk"
  Delete "$SMPROGRAMS\Markpad\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Markpad"
  Delete "$DESKTOP\Markpad.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Markpad"
  DeleteRegKey HKLM "Software\Markpad"

  DeleteRegKey HKCR "Applications\markpad.exe\shell\open\command"
  DeleteRegKey HKCR "Applications\markpad.exe\shell\open"
  DeleteRegKey HKCR "Applications\markpad.exe\shell"
  DeleteRegKey HKCR "Applications\markpad.exe\SupportedTypes"
  DeleteRegKey HKCR "Applications\markpad.exe\DefaultIcon"
  DeleteRegKey HKCR "Applications\markpad.exe"

  DeleteRegKey HKCR ".md"
  DeleteRegKey HKCR ".markdown"
  DeleteRegKey HKCR ".mdx"
  DeleteRegKey HKCR "Markpad.MarkdownFile"
SectionEnd
