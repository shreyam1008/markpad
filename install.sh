#!/bin/sh
set -e

REPO="shreyam1008/markpad"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/scalable/apps"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${GREEN}▸${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}▸${NC} %s\n" "$1"; }
error() { printf "${RED}✗${NC} %s\n" "$1"; exit 1; }

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ;;
  *) error "Unsupported architecture: $ARCH" ;;
esac

# The release binary uses the system GTK/WebKit libraries. Fail before the
# download when the dynamic linker cache proves they are unavailable.
if command -v ldconfig >/dev/null 2>&1; then
  RUNTIME_LIBS=$(ldconfig -p 2>/dev/null || true)
  MISSING_LIBS=""
  case "$RUNTIME_LIBS" in *libgtk-3.so*) ;; *) MISSING_LIBS="$MISSING_LIBS libgtk-3" ;; esac
  case "$RUNTIME_LIBS" in *libwebkit2gtk-4.1.so*) ;; *) MISSING_LIBS="$MISSING_LIBS libwebkit2gtk-4.1" ;; esac
  if [ -n "$MISSING_LIBS" ]; then
    error "Missing runtime libraries:$MISSING_LIBS. Install GTK 3 and WebKitGTK 4.1, or use the release .deb on Debian/Ubuntu."
  fi
else
  warn "Could not preflight GTK/WebKit runtime libraries (ldconfig is unavailable)."
fi

# Get latest release tag via GitHub API
info "Checking latest version..."
TAG=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
if [ -z "$TAG" ]; then
  error "Could not determine latest release. Check https://github.com/$REPO/releases"
fi
VERSION="${TAG#v}"

# Check if already installed and up to date
if command -v markpad >/dev/null 2>&1; then
  CURRENT=$(markpad --version 2>/dev/null || echo "unknown")
  if [ "$CURRENT" = "$VERSION" ]; then
    info "Quillpane $VERSION (formerly Markpad) is already installed and up to date."
    exit 0
  fi
  warn "Updating Quillpane (formerly Markpad): $CURRENT → $VERSION"
else
  info "Installing Quillpane $VERSION (formerly Markpad)"
fi

# Download binary
URL="https://github.com/$REPO/releases/download/$TAG/markpad"
info "Downloading $URL"
TMP=$(mktemp)
curl -fSL --progress-bar "$URL" -o "$TMP"

# Validate it's an ELF binary, not an HTML error page
if ! file "$TMP" | grep -q "ELF"; then
  rm -f "$TMP"
  error "Download failed — file is not a valid Linux binary. Check the release assets at https://github.com/$REPO/releases"
fi
chmod +x "$TMP"

# Install binary
info "Installing to $BIN_DIR/markpad"
if [ -w "$BIN_DIR" ]; then
  mv "$TMP" "$BIN_DIR/markpad"
else
  sudo mv "$TMP" "$BIN_DIR/markpad"
fi

# Install desktop entry + icon
mkdir -p "$APP_DIR" "$ICON_DIR"

curl -sL "https://raw.githubusercontent.com/$REPO/main/packaging/linux/markpad.svg" -o "$ICON_DIR/markpad.svg"

cat > "$APP_DIR/markpad.desktop" <<DESKTOP
[Desktop Entry]
Name=Quillpane
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

# Update desktop database if available
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" 2>/dev/null || true
fi

echo ""
printf "${BOLD}${GREEN}✓ Quillpane %s installed!${NC}\n" "$VERSION"
echo ""
echo "  Run from terminal:   markpad"
echo "  Open from launcher:  search 'Quillpane'"
echo "  Update anytime:      re-run this script"
echo ""
