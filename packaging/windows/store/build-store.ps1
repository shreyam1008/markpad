param([Parameter(Mandatory=$true)][string]$ReleaseExe)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$releasePath = (Resolve-Path -LiteralPath $ReleaseExe).Path
$expected = '79333aa1ee52db7b85c6e269211660c28030f4886ad80cfd96f26b4e8f8e7088'
if ((Get-FileHash -LiteralPath $releasePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Expected the unchanged v0.13.3 markpad.exe release artifact.'
}
$outputDir = Join-Path $repoRoot 'dist/store'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$stage = Join-Path $outputDir ('stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null
Copy-Item -LiteralPath $releasePath -Destination (Join-Path $stage 'markpad.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AppxManifest.xml') -Destination $stage
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
$makeAppx = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/makeappx.exe'
if (-not (Test-Path -LiteralPath $makeAppx)) { throw 'Windows SDK 10.0.26100.0 x64 MakeAppx required.' }
$package = Join-Path $outputDir 'Quillpane_0.13.3.0_x64.msix'
if (Test-Path -LiteralPath $package) { throw 'Output exists; retain it or choose a new version before rebuilding.' }
& $makeAppx pack /d $stage /p $package
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation/pack failed.' }
Get-FileHash -LiteralPath $package -Algorithm SHA256
Write-Output "Store package: $package"
Write-Output "Unmodified package staging: $stage"
