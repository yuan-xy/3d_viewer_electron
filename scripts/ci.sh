#!/usr/bin/env bash
# Run all CI checks and tests locally
set -euo pipefail

PLATFORM=$(uname -s)

case "$PLATFORM" in
  Linux)
    BUILD_SCRIPT="build:unpacked:linux"
    SRC_DIR="dist/linux-unpacked"
    SRC_BIN="3d_viewer_electron"
    ;;
  Darwin)
    BUILD_SCRIPT="build:unpacked:mac"
    SRC_DIR="dist/mac"
    SRC_BIN="3D_Viewer.app"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    BUILD_SCRIPT="build:unpacked"
    SRC_DIR="dist/win-unpacked"
    SRC_BIN="3D_Viewer.exe"
    ;;
  *)
    echo "Unsupported platform: $PLATFORM" >&2
    exit 1
    ;;
esac

echo "Platform: $PLATFORM  |  Build: $BUILD_SCRIPT"
echo ""

echo "========================================"
echo "  1/5  Type check (tsc --noEmit)"
echo "========================================"
npx tsc --noEmit

echo ""
echo "========================================"
echo "  2/5  Lint (eslint)"
echo "========================================"
npm run lint

echo ""
echo "========================================"
echo "  3/5  Build ($BUILD_SCRIPT)"
echo "========================================"
npm run "$BUILD_SCRIPT"

# Symlink so tests find the binary at dist/win-unpacked/3D_Viewer.exe
mkdir -p dist/win-unpacked
ln -sf "$PWD/$SRC_DIR/$SRC_BIN" "dist/win-unpacked/3D_Viewer.exe"

echo ""
echo "========================================"
echo "  4/5  Unit tests (vitest run)"
echo "========================================"
npx vitest run

echo ""
echo "========================================"
echo "  5/5  Integration tests (playwright)"
echo "========================================"
npx playwright test

echo ""
echo "========================================"
echo "  All checks and tests passed"
echo "========================================"
