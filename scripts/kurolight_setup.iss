; Inno Setup 7 Installer Script for KuroLight Professional Desktop Application
; KuroLabs - KuroLight Professional v1.0.0

#define MyAppName "KuroLight Professional"
#define MyAppShortName "KuroLight"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "KuroLabs"
#define MyAppURL "https://github.com/kuroLabs-ai/KuroLight"
#define MyAppExeName "KuroLight.exe"

[Setup]
; Unique application GUID
AppId={{B8A1D398-3568-45F2-9FE9-0C3D7614A73F}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes

; Visual presentation and branding
SetupIconFile=..\assets\icons\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
OutputDir=..\dist\installer
OutputBaseFilename=KuroLight_Professional_Setup_v{#MyAppVersion}

; 64-bit Windows architecture optimization
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=yes
CloseApplications=yes
CloseApplicationsFilter=*.exe,{#MyAppExeName}

; Executable metadata
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=KuroLight Professional Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (C) 2026 KuroLabs. All rights reserved.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "onefolder"; Description: "Standard Installation (Recommended — Fast Startup & Direct Files)"; Flags: iscustom
Name: "onefile";   Description: "Single Portable Executable (Self-Contained Single File)"

[Components]
Name: "mode_folder";  Description: "Full Folder Package (Fastest launch speed, uncompressed dependencies)"; Types: onefolder; Flags: exclusive
Name: "mode_onefile"; Description: "Single Standalone Executable (Compact single file KuroLight.exe)";      Types: onefile;   Flags: exclusive

[Tasks]
Name: "desktopicon";   Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startmenuicon"; Description: "Create Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"
Name: "fileassoc";     Description: "Associate KuroLight Project files (.kurolight, .klproj)"; GroupDescription: "File Associations:"

[Files]
; Mode 1: Directory Package (Fast launch / open files)
Source: "..\dist\onefolder\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist; Components: mode_folder
Source: "..\dist\KuroLight\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist; Components: mode_folder

; Mode 2: Single-File Executable
Source: "..\dist\onefile\KuroLight.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion skipifsourcedoesntexist; Components: mode_onefile
Source: "..\dist\KuroLight.exe";         DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion skipifsourcedoesntexist; Components: mode_onefile

[Icons]
; Shortcuts use the Professional app name so it appears clearly on Desktop and Start Menu
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; Tasks: startmenuicon
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; App Paths registration for Windows Run Dialog (Win+R -> kurolight)
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: "Path"; ValueData: "{app}"; Flags: uninsdeletekey

; File Association for .kurolight project files
Root: HKA; Subkey: "Software\Classes\.kurolight"; ValueType: string; ValueName: ""; ValueData: "KuroLight.Project"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\.klproj";    ValueType: string; ValueName: ""; ValueData: "KuroLight.Project"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\KuroLight.Project"; ValueType: string; ValueName: ""; ValueData: "KuroLight Project"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\KuroLight.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\KuroLight.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
