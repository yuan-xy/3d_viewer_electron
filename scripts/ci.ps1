# CI pipeline for Windows
# Fast checks (~30s): typecheck + lint + unit tests + component tests
# Slow checks (~3min): build + E2E tests

Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  1/7  Type check (tsc --noEmit)"       -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm exec tsc --noEmit

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  2/7  Lint (eslint)"                    -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm run lint

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  3/7  Unit tests (vitest, node env)"    -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm exec vitest run

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  4/7  Component & integration tests"     -ForegroundColor Cyan
Write-Host "       (vitest, jsdom env)"               -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm exec vitest run --config vitest.jsdom.config.ts

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  5/7  Build (build:unpacked)"           -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm run build:unpacked

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  6/7  E2E tests (playwright)"           -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
pnpm exec playwright test

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  All checks and tests passed"            -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Cyan
