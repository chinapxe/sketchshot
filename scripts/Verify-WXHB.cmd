@echo off
setlocal
set SCRIPT_DIR=%~dp0

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Verify-OfflineBundle.ps1" -BundleDir "%SCRIPT_DIR%"
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
    echo [SketchShot] Verification failed with exit code %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo [SketchShot] Verification completed successfully.
pause
exit /b 0
