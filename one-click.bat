@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   GestionStore - Lancement en un clic
echo ============================================
echo.
echo Installation automatique si necessaire, puis demarrage complet...
echo.

call start-all.bat
