@echo off
chcp 65001 >nul
title 智能题库测试系统

cd /d "%~dp0"

echo ╔══════════════════════════════════════╗
echo ║                                      ║
echo ║     📝 智能题库测试系统              ║
echo ║                                      ║
echo ║     正在启动，请稍候...              ║
echo ║                                      ║
echo ╚══════════════════════════════════════╝
echo.

:: Check if already running (check port 5000)
netstat -an | findstr ":5000 " >nul 2>&1
if not errorlevel 1 (
    echo ✅ 服务已在运行中
    echo.
    start http://127.0.0.1:5000
    exit /b
)

:: Start Flask server minimized
start /B /MIN python app.py > server.log 2>&1

:: Wait for server to be ready
echo 正在启动本地服务...
echo.
set "ready="
for /L %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    netstat -an | findstr ":5000 " >nul 2>&1
    if not errorlevel 1 (
        set ready=1
        goto :ready
    )
)

:ready
if defined ready (
    echo ✅ 服务启动成功！
    echo.
    echo 正在打开浏览器...
    start http://127.0.0.1:5000
    echo.
    echo ╔══════════════════════════════════════╗
    echo ║                                      ║
    echo ║     已就绪！浏览器已打开            ║
    echo ║                                      ║
    echo ║     关闭此窗口 = 停止服务           ║
    echo ║                                      ║
    echo ╚══════════════════════════════════════╝
    echo.
) else (
    echo ❌ 服务启动超时，请检查 server.log
    pause
    exit /b
)

:: Wait for user to close
pause >nul

:: Clean shutdown
echo 正在关闭服务...
taskkill /f /fi "WINDOWTITLE eq *app.py" >nul 2>&1
echo ✅ 已停止
timeout /t 2 /nobreak >nul