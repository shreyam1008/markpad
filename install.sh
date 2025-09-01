#!/bin/sh
set -e

REPO="shreyam1008/markpad"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/scalable/apps"

echo "Installing Markpad..."

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ;;
  *) echo "Error: unsupported architecture $ARCH"; exit 1 ;;
esac

# Get latest release tag
TAG=$(curl -sI "https://github.com/$REPO/releases/latest" | grep -i '^location:' | sed 's|.*/||' | tr -d '\r\n')
if [ -z "$TAG" ]; then
  echo "Error: could not determine latest release"
  exit 1
fi
VERSION="${TAG#v}"
echo "Latest version: $TAG"

# Download binary
URL="https://github.com/$REPO/releases/download/$TAG/markpad"
echo "Downloading from $URL"
TMP=$(mktemp)
curl -sL "$URL" -o "$TMP"
chmod +x "$TMP"

# Install binary
echo "Installing to $BIN_DIR/markpad (may need sudo)"
if [ -w "$BIN_DIR" ]; then
  mv "$TMP" "$BIN_DIR/markpad"
else
  sudo mv "$TMP" "$BIN_DIR/markpad"
fi

# Install desktop entry
mkdir -p "$APP_DIR" "$ICON_DIR"

# Download icon
curl -sL "https://raw.githubusercontent.com/$REPO/main/packaging/linux/markpad.svg" -o "$ICON_DIR/markpad.svg"

# Create desktop entry
cat > "$APP_DIR/markpad.desktop" <<DESKTOP
[Desktop Entry]
Name=Markpad
GenericName=Text Editor
Comment=A tiny native Markdown notepad
Exec=markpad %F
Icon=markpad
Type=Application
Categories=Utility;TextEditor;Development;
Keywords=notepad;markdown;text;editor;code;viewer;
MimeType=text/markdown;text/plain;application/json;text/x-python;text/x-go;text/html;text/css;
StartupNotify=true
DESKTOP

echo ""
echo "Markpad $TAG installed successfully!"
echo "  Run:  markpad"
echo "  Find it in your application launcher"
