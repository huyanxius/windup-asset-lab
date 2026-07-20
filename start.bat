@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo   Windup Asset Lab - Startup Script
echo ========================================
echo.

set "PYTHON_CMD="
py -3 -c "import sys; assert sys.version_info >= (3, 11)" >nul 2>&1
if not errorlevel 1 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
    python -c "import sys; assert sys.version_info >= (3, 11)" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo [ERROR] Python 3.11 or newer was not found.
    echo Install Python, then run this script again.
    echo.
    pause
    exit /b 1
)

%PYTHON_CMD% -c "from PIL import Image" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Pillow is not installed for the selected Python.
    echo Run: %PYTHON_CMD% -m pip install -r server\requirements.txt
    echo.
    pause
    exit /b 1
)

echo [1/2] Starting API-backed studio on http://127.0.0.1:5174 ...
start "Windup Studio API" cmd /k "%PYTHON_CMD% -m server.app --demo --port 5174"

echo [2/2] Starting Cocos runtime on http://127.0.0.1:5173 ...
start "Windup Cocos Runtime" cmd /k "%PYTHON_CMD% -m http.server 5173 --bind 127.0.0.1 --directory build\lamplighter-mvp"

echo.
echo Waiting for the project asset API...
for /l %%I in (1,1,20) do (
    %PYTHON_CMD% -c "import json, urllib.request; payload=json.load(urllib.request.urlopen('http://127.0.0.1:5174/api/characters', timeout=1)); assert isinstance(payload.get('characters'), list)" >nul 2>&1 && goto server_ready
    timeout /t 1 /nobreak >nul
)

echo.
echo [ERROR] The Windup API did not become ready.
echo Check the "Windup Studio API" window for the startup error.
echo.
pause
exit /b 1

:server_ready
echo [OK] Project asset API is ready.
echo Opening http://127.0.0.1:5174/asset-lab/ ...
start "" "http://127.0.0.1:5174/asset-lab/"

echo.
echo ========================================
echo   Asset Lab : http://127.0.0.1:5174/asset-lab/
echo   Game Build: http://127.0.0.1:5173/
echo ========================================
echo.
echo Servers are running in separate windows.
echo Close those windows to stop the services.
echo Press any key to close this launcher...
pause >nul
