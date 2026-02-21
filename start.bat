@echo off
chcp 65001 >nul
echo ============================================
echo   GestionStore - Demarrage (Frontend)
echo ============================================
echo.

if not exist "frontend\node_modules" (
    echo [!] Les dependances ne sont pas installees.
    echo     Lancez d'abord : install.bat
    pause
    exit /b 1
)

echo Demarrage du frontend...
echo.
echo   L'application sera accessible sur :
echo   http://localhost:5173
echo.
echo   Comptes par defaut :
echo   Gerant  : admin@store.com / admin123
echo   Vendeur : vendeur@store.com / vendeur123
echo.
echo   Fermez cette fenetre pour arreter.
echo ============================================
echo.

cd frontend
call npm run dev -- --host 0.0.0.0
