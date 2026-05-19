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
echo "  3/5  Build "
echo "========================================"
pnpm run build:unpacked


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
