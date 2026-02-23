@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gestionstore-app.ps1" -Action stop
endlocal

