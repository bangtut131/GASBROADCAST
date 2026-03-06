@echo off
title GasBroadcast - Baileys WA Bridge
color 0B
echo.
echo  =========================================
echo   GasBroadcast - Baileys WA Bridge
echo  =========================================
echo.

cd /d "%~dp0bridge"

:: Check .env
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env"
    echo [INFO] .env dibuat dari .env.example
    echo [!] Edit bridge\.env dan isi API_SECRET serta WEBHOOK_URL
    echo.
    notepad ".env"
    pause
  )
)

:: Install deps
if not exist "node_modules" (
  echo [INFO] Install dependencies...
  npm install
  echo.
)

echo [INFO] Memulai Baileys Bridge di http://localhost:3002
echo [INFO] Health check: http://localhost:3002/health
echo.
node server.js
pause
