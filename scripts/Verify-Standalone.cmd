@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Verify-Standalone.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
    echo [Standalone] Verification failed with exit code %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo [Standalone] Verification passed.
pause
exit /b 0
