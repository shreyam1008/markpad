param([Parameter(Mandatory=$true)][string]$ReleaseExe, [Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$releasePath = (Resolve-Path -LiteralPath $ReleaseExe).Path
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'A stable X.Y.Z release version is required.' }
$binaryVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($releasePath).ProductVersion
if ($binaryVersion -ne $Version -and $binaryVersion -ne "$Version.0") { throw "Executable version $binaryVersion does not match $Version." }
$outputDir = Join-Path $repoRoot 'dist/store'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$stage = Join-Path $outputDir ('stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null
Copy-Item -LiteralPath $releasePath -Destination (Join-Path $stage 'markpad.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AppxManifest.xml') -Destination $stage
$manifestPath = Join-Path $stage 'AppxManifest.xml'
[xml]$manifest = Get-Content -LiteralPath $manifestPath
$manifest.Package.Identity.Version = "$Version.0"
$manifest.Save($manifestPath)
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination $stage

# Export only resized copies of the existing icon. Never redraw or overwrite it.
Add-Type -AssemblyName System.Drawing
$iconPath = Join-Path $repoRoot 'packaging/windows/markpad.ico'
$iconHash = (Get-FileHash -LiteralPath $iconPath).Hash
$icon = [System.Drawing.Icon]::new($iconPath, 256, 256)
$bitmap = $icon.ToBitmap()
try {
    foreach ($asset in @(@('StoreLogo',50), @('Square44x44Logo',44), @('Square150x150Logo',150))) {
        $size = [int]$asset[1]
        $resized = [System.Drawing.Bitmap]::new($size,$size)
        $graphics = [System.Drawing.Graphics]::FromImage($resized)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($bitmap,0,0,$size,$size)
            $resized.Save((Join-Path $stage ('Assets/' + $asset[0] + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $resized.Dispose() }
    }
} finally { $bitmap.Dispose(); $icon.Dispose() }
if ((Get-FileHash -LiteralPath $iconPath).Hash -ne $iconHash) { throw 'Original icon changed unexpectedly.' }
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeAppx = Get-ChildItem -LiteralPath $sdkRoot -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'x64/makeappx.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $makeAppx) { throw 'Windows SDK x64 MakeAppx is required.' }
$package = Join-Path $outputDir "Quillpane_${Version}.0_x64.msix"
if (Test-Path -LiteralPath $package) { throw 'Output exists; retain it or choose a new version before rebuilding.' }
& $makeAppx pack /d $stage /p $package
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation/pack failed.' }
Get-FileHash -LiteralPath $package -Algorithm SHA256
Write-Output "Store package: $package"
Write-Output "Unmodified package staging: $stage"
