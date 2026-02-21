@echo off
chcp 65001 >nul
echo ============================================
echo   GestionStore - Installation
echo   Application de gestion de boutique
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo.
    echo Installez Node.js ^(version 18 ou plus^) depuis : https://nodejs.org/fr/download
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js detecte : %NODE_VERSION%
echo.

echo [1/3] Installation du frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERREUR] L'installation du frontend a echoue.
    echo          Essayez : rmdir /s /q node_modules ^&^& npm install
    cd ..
    pause
    exit /b 1
)
echo [OK] Frontend installe.
cd ..

echo.
echo [2/3] Installation du backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [ERREUR] L'installation du backend a echoue.
    echo          Essayez : rmdir /s /q node_modules ^&^& npm install
    cd ..
    pause
    exit /b 1
)
echo [OK] Backend installe.

echo.
echo [3/3] Generation du client Prisma...
call npx prisma generate 2>nul
echo [OK] Client Prisma pret.
cd ..

echo.
echo ============================================
echo   Installation terminee avec succes !
echo ============================================
echo.
echo Pour demarrer l'application (frontend seul) :
echo   start.bat
echo.
echo Pour demarrer frontend + backend :
echo   start-all.bat
echo.
echo Pour deployer avec Docker :
echo   docker compose up -d --build
echo.
echo Comptes par defaut (mode hors-ligne) :
echo   Gerant  : admin@store.com / admin123
echo.
pause
