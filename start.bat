@echo off
chcp 65001 >nul
title Windup - 点灯人资产工作台

echo ============================================
echo   Windup 资产工作台 + Cocos 运行时
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] 启动 Windup 后端 (Demo 模式) ...
start "Windup-Server" python -m server.app --port 4174 --demo

echo [2/2] 启动 Cocos Web 运行时 ...
start "Cocos-Runtime" python -m http.server 4173 --bind 127.0.0.1 --directory build/lamplighter-mvp

echo.
echo 等待服务就绪...
:wait_backend
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:4174/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 goto wait_backend

echo.
echo ============================================
echo   服务已启动, 请打开以下页面:
echo ============================================
echo   审核台:       http://127.0.0.1:4174/asset-lab/
echo   动作生成:     http://127.0.0.1:4174/asset-lab/generate.html
echo   创建角色:     http://127.0.0.1:4174/asset-lab/create-character.html
echo   角色管理:     http://127.0.0.1:4174/asset-lab/characters.html
echo   Cocos 游戏:   http://127.0.0.1:4173/
echo ============================================
echo.
echo 按任意键打开审核台...
pause >nul
start http://127.0.0.1:4174/asset-lab/
