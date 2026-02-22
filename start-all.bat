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

echo Preparation de la base de donnees...
set "DB_NAME="
set "PGHOST="
set "PGPORT="
set "PGUSER="
set "PGPASSWORD="
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\extract-db-info.ps1" -EnvFile "backend/.env"`) do (
    if not defined DB_NAME (
        set "DB_NAME=%%L"
    ) else if not defined PGHOST (
        set "PGHOST=%%L"
    ) else if not defined PGPORT (
        set "PGPORT=%%L"
    ) else if not defined PGUSER (
        set "PGUSER=%%L"
    ) else if not defined PGPASSWORD (
        set "PGPASSWORD=%%L"
    )
)

if not defined DB_NAME (
    echo [ERREUR] DATABASE_URL introuvable dans backend\.env
    pause
    exit /b 1
)
if not defined PGHOST set "PGHOST=localhost"
if not defined PGPORT set "PGPORT=5432"

where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] psql n'est pas disponible. Installez PostgreSQL ou ajoutez psql au PATH.
    pause
    exit /b 1
)

set "DB_EXISTS="
for /f "delims=" %%E in ('psql -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%';" 2^>nul') do set "DB_EXISTS=%%E"
if not "%DB_EXISTS%"=="1" (
    echo [INFO] Creation de la base "%DB_NAME%"...
    psql -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"%DB_NAME%\";" >nul
    if %errorlevel% neq 0 (
        echo [ERREUR] Impossible de creer la base "%DB_NAME%".
        pause
        exit /b 1
    )
    echo [OK] Base creee.
) else (
    echo [OK] Base "%DB_NAME%" deja presente.
)

cd backend
echo [INFO] Prisma db push...
call npx prisma db push
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de "npx prisma db push".
    cd ..
    pause
    exit /b 1
)

echo [INFO] Seed initial...
call npm run db:seed
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de db:seed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Base preparee.
echo.

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
