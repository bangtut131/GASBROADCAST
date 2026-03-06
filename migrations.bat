@echo off
title WA Broadcast - Database Migration Helper
color 0D
echo.
echo  =====================================
echo   WA Broadcast - Migration Helper
echo  =====================================
echo.
echo Status migrasi yang perlu dijalankan di Supabase SQL Editor:
echo https://supabase.com/dashboard/project/eyrmlqptarasckuxjnrw/sql/new
echo.
echo  [001] supabase\migrations\001_init.sql     - Tables (wajib, belum dijalankan?)
echo  [002] supabase\migrations\002_rls.sql      - Row Level Security
echo  [003] supabase\migrations\003_ai.sql       - AI Auto-Reply fields
echo  [004] supabase\migrations\004_cs.sql       - Multi-CS columns
echo  [005] supabase\migrations\005_wa_status.sql- WA Status Manager tables
echo.

:menu
echo Pilih opsi:
echo  [1] Buka folder migrations di Explorer
echo  [2] Tampilkan isi migration file tertentu
echo  [3] Buka Supabase di browser
echo  [4] Keluar
echo.
set /p choice=Pilihan (1-4): 

if "%choice%"=="1" (
  explorer "supabase\migrations"
  goto menu
)
if "%choice%"=="2" (
  set /p mignum=Nomor migration (001-005): 
  type "supabase\migrations\%mignum%_*.sql" 2>nul || echo File tidak ditemukan.
  echo.
  pause
  goto menu
)
if "%choice%"=="3" (
  start https://supabase.com/dashboard/project/eyrmlqptarasckuxjnrw/sql/new
  goto menu
)
if "%choice%"=="4" exit /b 0
goto menu
