@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  Multi-Investor Top Picks — local server
echo  ========================================
echo.

where python >nul 2>&1
if %errorlevel%==0 (
  set PY=python
) else (
  where py >nul 2>&1
  if %errorlevel%==0 (
    set PY=py -3
  ) else (
    echo [ERROR] Python not found.
    echo Install from https://www.python.org/downloads/
    echo Enable "Add Python to PATH" during install.
    pause
    exit /b 1
  )
)

echo Starting server...
echo   PC:    http://127.0.0.1:8765/
echo   Phone: same Wi-Fi → look at the IP printed below
echo.
echo Browser on this PC will open automatically...
echo Keep this window OPEN while you use the site.
echo.

start "" "http://127.0.0.1:8765/"
%PY% server.py
if errorlevel 1 (
  echo.
  echo Server stopped with an error.
  pause
)
