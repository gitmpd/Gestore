@echo off
chcp 65001 >nul
echo ============================================
echo   GestionStore - Demarrage complet
echo   Frontend + Backend
echo ============================================
echo.

if not exist "frontend\node_modules" (
    echo [!] Dependances manquantes. Installation automatique...
    call install.bat --no-pause
    if %errorlevel% neq 0 (
        echo [ERREUR] Installation automatique echouee.
        pause
        exit /b 1
    )
)

if not exist "backend\node_modules" (
    echo [!] Dependances backend manquantes. Installation automatique...
    call install.bat --no-pause
    if %errorlevel% neq 0 (
        echo [ERREUR] Installation automatique echouee.
        pause
        exit /b 1
    )
)

if not exist "backend\.env" (
    echo [!] Le fichier backend\.env n'existe pas.
    echo     Creation depuis .env.example...
    copy backend\.env.example backend\.env >nul
    echo [OK] backend\.env cree. Modifiez-le si necessaire.
    echo.
)

echo Demarrage du backend (port 3001)...
start "GestionStore Backend" cmd /c "cd backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Demarrage du frontend (port 5173)...
echo.
echo ============================================
echo   Tout est lance !
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo.
echo   Comptes par defaut :
echo   Gerant  : admin@store.com / admin123
echo   Vendeur : vendeur@store.com / vendeur123
echo.
echo   Fermez les fenetres pour arreter.
echo ============================================
echo.

cd frontend
call npm run dev -- --host 0.0.0.0
