#!/bin/sh
# Builds the two Swift helpers as universal (arm64 + x86_64) binaries for macOS 14+.
# Usage: scripts/build-native.sh [audio|extractor|all]
set -eu

cd "$(dirname "$0")/.."
MIN_MACOS=14.0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

build() {
  name=$1
  shift
  for arch in arm64 x86_64; do
    xcrun swiftc -swift-version 5 -O -target "$arch-apple-macos$MIN_MACOS" \
      "native/$name.swift" -o "$TMP/$name-$arch" "$@"
  done
  lipo -create "$TMP/$name-arm64" "$TMP/$name-x86_64" -output "native/$name"
  codesign --sign - --force "native/$name"
  echo "built native/$name"
}

what=${1:-all}

if [ "$what" = audio ] || [ "$what" = all ]; then
  build AudioCaptureHelper \
    -framework AVFoundation -framework ScreenCaptureKit -framework Speech \
    -framework CoreAudio -framework CoreMedia \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/Info.plist
fi

if [ "$what" = extractor ] || [ "$what" = all ]; then
  build DocTextExtractor -framework PDFKit -framework Vision -framework AppKit
fi
