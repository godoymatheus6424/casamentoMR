@echo off
title Planejador de Casamento
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado. Baixe em https://nodejs.org ^(versao LTS^) e tente de novo.
  echo.
  pause
  exit /b 1
)
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server.js
pause
