@echo off
echo =========================================
echo  Despatch System - PM2 Production Launcher
echo  Running on Port 28
echo =========================================
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo Right-click this file and choose "Run as administrator"
    pause
    exit /b 1
)

:: Navigate to the project folder
cd /d "E:\DESPATCH_SYSTEM\Despatch_system_server\despatch system (1)\despatch system\despatch system"

echo [1] Stopping any existing PM2 instance...
pm2 stop despatch-backend 2>nul
pm2 delete despatch-backend 2>nul

echo [2] Starting backend with PM2 on port 28...
pm2 start ecosystem.config.js --env production

echo [3] Saving PM2 process list...
pm2 save

echo [4] Setting PM2 to auto-start on Windows boot...
pm2 startup

echo.
echo =========================================
echo  Server is now running on port 28 via PM2
echo  Use: pm2 status        - to check status
echo  Use: pm2 logs          - to view logs
echo  Use: pm2 restart despatch-backend
echo =========================================
pause
