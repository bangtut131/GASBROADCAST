@echo off
title WA Broadcast - Production Build Test
color 0E
echo.
echo  =====================================
echo   WA Broadcast - Build Verification
echo  =====================================
echo.

echo [1/2] Memeriksa TypeScript...
call npx tsc --noEmit
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Ada TypeScript error. Perbaiki dulu sebelum build.
  pause
  exit /b 1
)
echo [OK] Tidak ada TypeScript error.
echo.

echo [2/2] Menjalankan Next.js build...
call npx next build
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Build gagal. Periksa error di atas.
  pause
  exit /b 1
)

echo.
echo  =====================================
echo   Build BERHASIL! Siap deploy Railway.
echo  =====================================
echo.
pause
