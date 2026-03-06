@echo off
title WA Broadcast - Git Setup & Railway Deploy
color 0C
echo.
echo  ================================================
echo   WA Broadcast - Railway Deploy via Git
echo  ================================================
echo.

:: ---- Step 1: Check Git ----
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Git belum terinstall!
  echo Download di: https://git-scm.com/download/win
  pause
  exit /b 1
)

:: ---- Step 2: Init Git jika belum ----
if not exist ".git" (
  echo [1/5] Inisialisasi Git repository...
  git init
  echo.
) else (
  echo [1/5] Git sudah diinisialisasi.
)

:: ---- Step 3: Buat/update .gitignore ----
echo [2/5] Memastikan .gitignore lengkap...
if not exist ".gitignore" (
  echo # Dependencies > .gitignore
  echo node_modules/ >> .gitignore
  echo .next/ >> .gitignore
  echo .env.local >> .gitignore
  echo .env*.local >> .gitignore
  echo *.log >> .gitignore
  echo cron_result.tmp >> .gitignore
  echo Dibuat .gitignore baru.
) else (
  echo .gitignore sudah ada.
)
echo.

:: ---- Step 4: Git add & commit ----
echo [3/5] Menambahkan semua file ke Git...
git add .
echo.
echo [4/5] Membuat commit...
for /f "tokens=2 delims==" %%A in ('wmic os get LocalDateTime /value') do set DT=%%A
set COMMIT_MSG=WA Broadcast SaaS - deploy %DT:~0,8% %DT:~8,6%
git commit -m "%COMMIT_MSG%"
echo.

:: ---- Step 5: Remote & Push ----
echo [5/5] Cek remote origin...
git remote -v
echo.
echo  ================================================
echo   Langkah selanjutnya:
echo  ================================================
echo.
echo  [A] Jika belum ada GitHub repo:
echo      1. Buka: https://github.com/new
echo      2. Buat repo baru (JANGAN centang "Initialize")
echo      3. Jalankan perintah ini:
echo.
echo         git remote add origin https://github.com/USERNAME/REPO.git
echo         git branch -M main
echo         git push -u origin main
echo.
echo  [B] Jika sudah ada GitHub repo:
echo      Jalankan: git push
echo.
echo  [C] Connect ke Railway:
echo      1. Buka: https://railway.app/new
echo      2. Pilih "Deploy from GitHub repo"
echo      3. Pilih repo ini
echo      4. Atur Environment Variables (lihat .env.example)
echo      5. Railway akan auto-deploy setiap git push!
echo.
echo  ================================================
echo.
pause
