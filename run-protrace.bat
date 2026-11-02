@echo off
setlocal
title ProTrace Analyzer launcher
set "APPDIR=%USERPROFILE%\Documents\ProTrace-Analyzer"
set "REPO=https://github.com/Abhijit425/ProTrace-Analyzer"

echo ==============================================
echo   ProTrace Analyzer - one-click launcher
echo ==============================================
echo.

rem ---- 1. Node.js -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing Node.js LTS with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo Could not install Node.js automatically.
    echo Please install it from https://nodejs.org ^(LTS^), then run this file again.
    pause
    exit /b 1
  )
  echo.
  echo Node.js installed. Close this window and double-click run-protrace.bat again
  echo so Windows picks up the new PATH.
  pause
  exit /b 0
)
for /f "delims=" %%v in ('node -v') do echo Node.js %%v found.

rem ---- 2. Get or update the code ---------------------------------
if exist "%APPDIR%\package.json" (
  echo Project found in %APPDIR%
  where git >nul 2>nul
  if not errorlevel 1 if exist "%APPDIR%\.git" (
    echo Updating from GitHub...
    git -C "%APPDIR%" pull --ff-only
  )
) else (
  where git >nul 2>nul
  if not errorlevel 1 (
    echo Downloading with git...
    git clone %REPO%.git "%APPDIR%"
  ) else (
    echo Git not found - downloading ZIP from GitHub...
    powershell -NoProfile -Command ^
      "$z=Join-Path $env:TEMP 'protrace.zip'; $t=Join-Path $env:TEMP 'protrace-unzip';" ^
      "Invoke-WebRequest '%REPO%/archive/refs/heads/main.zip' -OutFile $z;" ^
      "if (Test-Path $t) { Remove-Item $t -Recurse -Force };" ^
      "Expand-Archive $z $t -Force;" ^
      "Move-Item (Get-ChildItem $t | Select-Object -First 1).FullName '%APPDIR%'"
  )
)
if not exist "%APPDIR%\package.json" (
  echo.
  echo Download failed. Check your internet connection and try again.
  pause
  exit /b 1
)

cd /d "%APPDIR%"

rem ---- 3. Install dependencies (first run only) -------------------
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo Installing dependencies - first run downloads Electron ^(~120 MB^), please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Copy the red error text above and send it to Claude.
    pause
    exit /b 1
  )
)

rem ---- 4. Start the app ------------------------------------------
echo.
echo Starting ProTrace Analyzer... ^(close this window to stop the app^)
call npm run dev
if errorlevel 1 (
  echo.
  echo The app stopped with an error. Copy the text above and send it to Claude.
)
pause
