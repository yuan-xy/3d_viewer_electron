#!/usr/bin/env bash
# Run all CI checks and tests locally
set -euo pipefail

PLATFORM=$(uname -s)

# Detect Windows host regardless of shell:
#   $OS / $os = Windows_NT — cmd, pwsh, Git Bash (uppercase or lowercase)
#   uname -s matches MINGW*/MSYS*/CYGWIN* — Git Bash, MSYS2
#   /mnt/c/Windows exists — WSL bash running on a Windows host
if echo "${OS:-}${os:-}" | grep -q "Windows_NT" ||
   echo "$PLATFORM" | grep -qE "^(MINGW|MSYS|CYGWIN)"; then
  PLATFORM="Windows"
  BUILD_SCRIPT="build:unpacked"
  SRC_DIR="dist/win-unpacked"
  SRC_BIN="3D_Viewer.exe"
elif [ "$PLATFORM" = "Linux" ]; then
  BUILD_SCRIPT="build:unpacked:linux"
  SRC_DIR="dist/linux-unpacked"
  SRC_BIN="3d_viewer_electron"
elif [ "$PLATFORM" = "Darwin" ]; then
  BUILD_SCRIPT="build:unpacked:mac"
  SRC_DIR="dist/mac"
  SRC_BIN="3D_Viewer.app"
else
  echo "Unsupported platform: $PLATFORM" >&2
  exit 1
fi

echo "Platform: $PLATFORM  |  Build: $BUILD_SCRIPT"
echo ""

echo "========================================"
echo "  1/5  Type check (tsc --noEmit)"
echo "========================================"
pnpm exec tsc --noEmit

echo ""
echo "========================================"
echo "  2/5  Lint (eslint)"
echo "========================================"
pnpm run lint

echo ""
echo "========================================"
echo "  3/5  Build ($BUILD_SCRIPT)"
echo "========================================"
pnpm run "$BUILD_SCRIPT"

# Symlink so tests find the binary at dist/win-unpacked/3D_Viewer.exe
# Only needed on non-Windows where the binary lives at a different path
if [ "$SRC_DIR" != "dist/win-unpacked" ]; then
  mkdir -p dist/win-unpacked
  ln -sf "$PWD/$SRC_DIR/$SRC_BIN" "dist/win-unpacked/3D_Viewer.exe"
fi

echo ""
echo "========================================"
echo "  4/5  Unit tests (vitest run)"
echo "========================================"
pnpm exec vitest run

echo ""
echo "========================================"
echo "  5/5  Integration tests (playwright)"
echo "========================================"
pnpm exec playwright test

echo ""
echo "========================================"
echo "  All checks and tests passed"
echo "========================================"
