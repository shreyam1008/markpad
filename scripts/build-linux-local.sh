#!/usr/bin/env sh
set -eu

GO_BIN="${GO:-/usr/local/go/bin/go}"
APT_DIR="${MARKPAD_APT_DIR:-/tmp/markpad-apt}"
SYSROOT="${MARKPAD_SYSROOT:-/tmp/markpad-sysroot}"
PKG_CONFIG_PATH_VALUE="$SYSROOT/usr/lib/x86_64-linux-gnu/pkgconfig:$SYSROOT/usr/share/pkgconfig"

PACKAGES="
libwayland-dev
libxkbcommon-dev
libx11-dev
libx11-xcb-dev
libxkbcommon-x11-dev
libgles2-mesa-dev
libegl1-mesa-dev
libffi-dev
libxcursor-dev
libvulkan-dev
libxau-dev
libxdmcp-dev
x11proto-dev
xtrans-dev
libxcb1-dev
libxrender-dev
libxfixes-dev
libxcb-xkb-dev
libegl-dev
libglvnd-dev
libgles-dev
libglvnd-core-dev
libgl-dev
libglx-dev
libopengl-dev
"

mkdir -p "$APT_DIR" "$SYSROOT" dist

(
	cd "$APT_DIR"
	apt-get download $PACKAGES
	for deb in ./*.deb; do
		dpkg-deb -x "$deb" "$SYSROOT"
	done
)

copy_runtime() {
	if [ -e "$1" ]; then
		cp -L "$1" "$SYSROOT/usr/lib/x86_64-linux-gnu/"
	fi
}

copy_runtime /usr/lib/x86_64-linux-gnu/libEGL.so.1
copy_runtime /usr/lib/x86_64-linux-gnu/libwayland-client.so.0
copy_runtime /usr/lib/x86_64-linux-gnu/libwayland-cursor.so.0
copy_runtime /usr/lib/x86_64-linux-gnu/libwayland-egl.so.1
copy_runtime /usr/lib/x86_64-linux-gnu/libxkbcommon.so.0
copy_runtime /usr/lib/x86_64-linux-gnu/libxkbcommon-x11.so.0
copy_runtime /usr/lib/x86_64-linux-gnu/libX11.so.6.4.0
copy_runtime /usr/lib/x86_64-linux-gnu/libXcursor.so.1.0.2
copy_runtime /usr/lib/x86_64-linux-gnu/libXfixes.so.3.1.0
copy_runtime /usr/lib/x86_64-linux-gnu/libXrender.so.1.3.0
copy_runtime /usr/lib/x86_64-linux-gnu/libxcb.so.1
copy_runtime /usr/lib/x86_64-linux-gnu/libX11-xcb.so.1

env \
	GOCACHE="${GOCACHE:-/tmp/markpad-go-cache}" \
	GOMODCACHE="${GOMODCACHE:-/tmp/markpad-gomod-cache}" \
	PKG_CONFIG_PATH="$PKG_CONFIG_PATH_VALUE" \
	CGO_CFLAGS="-I$SYSROOT/usr/include ${CGO_CFLAGS:-}" \
	CGO_LDFLAGS="-L$SYSROOT/usr/lib/x86_64-linux-gnu -lXau -lXdmcp ${CGO_LDFLAGS:-}" \
	"$GO_BIN" build -trimpath -ldflags="-s -w" -o dist/markpad ./cmd/markpad

file dist/markpad
du -h dist/markpad
