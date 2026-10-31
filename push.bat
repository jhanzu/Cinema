@echo off
title Hanzu Cinema - Git Push
cd /d "%~dp0"
echo ========================================================
echo   HANZU CINEMA - ENTERPRISE DEPLOYMENT PUSH TO GITHUB
echo ========================================================
echo.
echo Remote: https://github.com/jhanzu/Cinema.git
echo Branch: main
echo.
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Da push toan bo code len GitHub thanh cong!
) else (
    echo [ERROR] Push that bai. Vui long kiem tra dang nhap GitHub.
)
echo.
pause
