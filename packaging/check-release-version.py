"""Reject release metadata drift before any platform package is published."""
import json
import os
from pathlib import Path
import plistlib
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
version = re.search(r'^const Version = "([0-9.]+)"', (root / 'main.go').read_text(), re.M)[1]
tag = os.environ.get('RELEASE_TAG', 'v' + version)
assert tag == 'v' + version, f'Tag {tag} differs from application {version}'
assert json.loads((root / 'frontend/package.json').read_text())['version'] == version
assert f'VERSION = "{version}"' in (root / 'frontend/src/brand.ts').read_text()
with (root / 'packaging/macos/Info.plist').open('rb') as file:
    plist = plistlib.load(file)
assert plist['CFBundleShortVersionString'] == version
assert plist['CFBundleVersion'] == version
manifest = ET.parse(root / 'packaging/windows/store/AppxManifest.xml')
identity = manifest.getroot().find('{http://schemas.microsoft.com/appx/manifest/foundation/windows10}Identity')
assert identity.attrib['Version'] == version + '.0'
assert f'"softwareVersion": "{version}"' in (root / 'docs/index.html').read_text()
for name in ('packaging/linux/io.github.markpad.metainfo.xml', 'packaging/flatpak/io.github.shreyam1008.markpad.metainfo.xml'):
    assert ET.parse(root / name).find('releases/release').attrib['version'] == version, name
assert 'craftctl set version="$version"' in (root / 'snap/snapcraft.yaml').read_text()
print(f'All release metadata agrees on {version}; Snap adopts the Go version.')
