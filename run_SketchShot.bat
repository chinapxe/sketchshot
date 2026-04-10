@echo off
setlocal
set "ROOT_DIR=%~dp0"
set "FRONTEND_DIST=%ROOT_DIR%frontend\dist\index.html"

if not exist "%FRONTEND_DIST%" (
    echo [SketchShot] Frontend build not found. Trying to build frontend...
    where npm >nul 2>nul
    if errorlevel 1 (
        echo [SketchShot] npm was not found.
        echo [SketchShot] Please install Node.js first, or run npm run build inside the frontend folder.
        echo [SketchShot] See QUICK_START.txt for details.
        pause
        exit /b 1
    )

    pushd "%ROOT_DIR%frontend"
    call npm run build
    set "BUILD_EXIT_CODE=%ERRORLEVEL%"
    popd

    if not "%BUILD_EXIT_CODE%"=="0" (
        echo [SketchShot] Frontend build failed.
        echo [SketchShot] See QUICK_START.txt for details.
        pause
        exit /b %BUILD_EXIT_CODE%
    )
)

call "%ROOT_DIR%scripts\Start-Standalone.bat"
exit /b %ERRORLEVEL%
