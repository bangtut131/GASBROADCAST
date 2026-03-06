@echo off
title WA Broadcast - Dev Server
color 0A
echo.
echo  =====================================
echo   WA Broadcast - Development Server
echo  =====================================
echo.

:: Check .env.local
if not exist ".env.local" (
  echo [ERROR] .env.local tidak ditemukan!
  echo Salin dari .env.example dan isi dengan credentials Supabase.
  echo.
  pause
  exit /b 1
)

:: Check node_modules
if not exist "node_modules" (
  echo [INFO] node_modules belum ada. Menjalankan npm install...
  npm install
  echo.
)

echo [INFO] Memulai dev server di http://localhost:3001
echo [INFO] Tekan Ctrl+C untuk menghentikan
echo.
npx next dev -p 3001
pause
