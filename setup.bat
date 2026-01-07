@echo off
echo ==========================================
echo    Despatch System - Setup Assistant
echo ==========================================
echo.

echo 1. Installing Backend Dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend installation failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo 2. Installing Frontend Dependencies...
cd printing-press-frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend installation failed.
    pause
    exit /b %ERRORLEVEL%
)
cd ..

echo.
echo 3. Preparing Environment File...
if not exist .env (
    copy .env.example .env
    echo [INFO] Created .env from .env.example. Please open it and set your MONGO_URI.
) else (
    echo [INFO] .env file already exists.
)

echo.
echo ==========================================
echo SETUP COMPLETE!
echo ==========================================
echo 1. Open .env and add your MongoDB URI.
echo 2. Run 'npm run dev' to start the system.
echo ==========================================
pause
