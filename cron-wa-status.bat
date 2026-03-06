@echo off
title WA Broadcast - Cron Simulator
color 0B
echo.
echo  =====================================
echo   WA Status - Cron Simulator (Lokal)
echo  =====================================
echo.
echo Simulator ini menjalankan cron WA Status setiap menit.
echo Pastikan dev server sudah berjalan di port 3001.
echo Tekan Ctrl+C untuk berhenti.
echo.

:: Ambil CRON_SECRET dari .env.local
for /f "tokens=2 delims==" %%A in ('findstr "CRON_SECRET" .env.local 2^>nul') do set CRON_SECRET=%%A
if "%CRON_SECRET%"=="" set CRON_SECRET=dev-cron-secret

echo [INFO] Menggunakan CRON_SECRET: %CRON_SECRET%
echo.

:loop
echo [%time%] Menjalankan cron check...

:: Cek jadwal yang aktif
curl -s -X GET "http://localhost:3001/api/wa-status/post" ^
  -H "x-cron-secret: %CRON_SECRET%" ^
  -H "Content-Type: application/json" > cron_result.tmp

:: Tampilkan hasil
type cron_result.tmp 2>nul
del cron_result.tmp 2>nul
echo.

:: Tunggu 60 detik sebelum iterasi berikutnya
echo [INFO] Menunggu 60 detik...
timeout /t 60 /nobreak
goto loop
