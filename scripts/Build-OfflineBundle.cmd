@echo off
setlocal
set SCRIPT_DIR=%~dp0

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Package-OfflineBundle.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
    echo [OfflinePack] Failed with exit code %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo [OfflinePack] Completed successfully.
pause
exit /b 0
