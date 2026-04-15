param(
    [switch]$SkipFrontendBuild,
    [string]$PythonExe = "",
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-ProjectRoot {
    param([string]$ScriptDir)

    $parent = Resolve-Path (Join-Path $ScriptDir "..")
    if (Test-Path (Join-Path $parent.Path "backend\run.py")) {
        return $parent.Path
    }

    throw "Unable to locate project root from $ScriptDir"
}

function Resolve-PythonLauncher {
    param([string]$RequestedPythonExe)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPythonExe)) {
        $resolved = Resolve-Path $RequestedPythonExe
        return @{
            FilePath = $resolved.Path
            PrefixArgs = @()
            Display = $resolved.Path
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $pythonCommand) {
        return @{
            FilePath = $pythonCommand.Source
            PrefixArgs = @()
            Display = $pythonCommand.Source
        }
    }

    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($null -ne $pyCommand) {
        return @{
            FilePath = $pyCommand.Source
            PrefixArgs = @("-3")
            Display = "$($pyCommand.Source) -3"
        }
    }

    throw "Python launcher not found. Please install Python 3 on the build machine, or pass -PythonExe explicitly."
}

function Get-PythonRuntimeInfo {
    param(
        [string]$FilePath,
        [string[]]$PrefixArgs,
        [string]$TempScriptRoot
    )

    $code = @'
import json
import site
import sys
import sysconfig

payload = {
    "executable": sys.executable,
    "prefix": sys.prefix,
    "base_prefix": sys.base_prefix,
    "version": sys.version,
    "purelib": sysconfig.get_paths().get("purelib", ""),
}
print(json.dumps(payload))
'@

    if (-not (Test-Path $TempScriptRoot)) {
        New-Item -ItemType Directory -Path $TempScriptRoot -Force | Out-Null
    }

    $tempScriptPath = Join-Path $TempScriptRoot ([System.IO.Path]::GetRandomFileName() + ".py")
    Set-Content -Path $tempScriptPath -Value $code -Encoding ASCII

    try {
        $output = & $FilePath @PrefixArgs $tempScriptPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to query Python runtime information from $FilePath"
        }
    }
    finally {
        Remove-Item -LiteralPath $tempScriptPath -Force -ErrorAction SilentlyContinue
    }

    return ($output | ConvertFrom-Json)
}

function Copy-PortablePythonRuntime {
    param(
        [pscustomobject]$PythonInfo,
        [string]$DestinationDir
    )

    $basePrefix = $PythonInfo.base_prefix
    if (-not (Test-Path $basePrefix)) {
        throw "Python base prefix does not exist: $basePrefix"
    }

    if (Test-Path $DestinationDir) {
        Remove-Item -LiteralPath $DestinationDir -Recurse -Force
    }

    Write-Host "[GreenPack] Copying Python runtime from $basePrefix" -ForegroundColor Cyan
    Copy-Item -LiteralPath $basePrefix -Destination $DestinationDir -Recurse -Force

    if ($PythonInfo.prefix -ne $PythonInfo.base_prefix) {
        $sourceSitePackages = $PythonInfo.purelib
        $targetSitePackages = Join-Path $DestinationDir "Lib\site-packages"
        if (-not (Test-Path $targetSitePackages)) {
            New-Item -ItemType Directory -Path $targetSitePackages -Force | Out-Null
        }

        if (Test-Path $sourceSitePackages) {
            Write-Host "[GreenPack] Overlaying active environment site-packages..." -ForegroundColor Cyan
            Copy-Item -Path (Join-Path $sourceSitePackages "*") -Destination $targetSitePackages -Recurse -Force
        }
    }

    foreach ($relativePath in @("Doc", "Tools", "Lib\test", "Lib\idlelib")) {
        $fullPath = Join-Path $DestinationDir $relativePath
        if (Test-Path $fullPath) {
            Remove-Item -LiteralPath $fullPath -Recurse -Force
        }
    }

    Get-ChildItem -Path $DestinationDir -Directory -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $DestinationDir -File -Recurse -Include *.pyc, *.pyo -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

function Test-PortablePythonRuntime {
    param(
        [string]$PythonExecutable,
        [string]$TempScriptRoot
    )

    $code = @'
import aiofiles
import fastapi
import multipart
import oss2
import PIL
import pydantic
import pydantic_settings
import uvicorn
import wsproto
print("ok")
'@

    if (-not (Test-Path $TempScriptRoot)) {
        New-Item -ItemType Directory -Path $TempScriptRoot -Force | Out-Null
    }

    $tempScriptPath = Join-Path $TempScriptRoot ([System.IO.Path]::GetRandomFileName() + ".py")
    Set-Content -Path $tempScriptPath -Value $code -Encoding ASCII

    try {
        $output = & $PythonExecutable $tempScriptPath
    }
    finally {
        Remove-Item -LiteralPath $tempScriptPath -Force -ErrorAction SilentlyContinue
    }

    if ($LASTEXITCODE -ne 0 -or "$output".Trim() -ne "ok") {
        throw "Portable Python runtime validation failed: $PythonExecutable"
    }
}

function Write-AsciiTextFile {
    param(
        [string]$Path,
        [string]$Content
    )

    Set-Content -Path $Path -Value $Content -Encoding ASCII
}

function Write-Utf8TextFile {
    param(
        [string]$Path,
        [string]$Content
    )

    Set-Content -Path $Path -Value $Content -Encoding UTF8
}

function Remove-BundlePath {
    param([string]$Path)

    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Reset-BundleState {
    param([string]$BundleDir)

    foreach ($path in @(
            (Join-Path $BundleDir ".runtime"),
            (Join-Path $BundleDir "_internal\.runtime"),
            (Join-Path $BundleDir "backend\.env.standalone")
        )) {
        Remove-BundlePath -Path $path
    }

    foreach ($relativePath in @(
            "backend\data-standalone\uploads",
            "backend\data-standalone\outputs",
            "backend\data-standalone\workflows",
            "backend\data-standalone\templates"
        )) {
        $targetDir = Join-Path $BundleDir $relativePath
        Remove-BundlePath -Path $targetDir
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
}

function Finalize-GreenBundleLayout {
    param([string]$BundleDir)

    $internalDir = Join-Path $BundleDir "_internal"
    New-Item -ItemType Directory -Path $internalDir -Force | Out-Null

    $scriptMoves = @{
        "Start-Standalone.ps1" = "Start-SketchShot.ps1"
        "Stop-Standalone.ps1" = "Stop-SketchShot.ps1"
        "Verify-Standalone.ps1" = "Verify-SketchShot.ps1"
        "bundle-manifest.json" = "bundle-manifest.json"
    }

    foreach ($entry in $scriptMoves.GetEnumerator()) {
        $sourcePath = Join-Path $BundleDir $entry.Key
        if (Test-Path $sourcePath) {
            Move-Item -LiteralPath $sourcePath -Destination (Join-Path $internalDir $entry.Value) -Force
        }
    }

    foreach ($path in @(
            "Start-Standalone.bat",
            "Start-Standalone.cmd",
            "Stop-Standalone.bat",
            "Stop-Standalone.cmd",
            "Verify-Standalone.bat",
            "Verify-Standalone.cmd",
            "Run-SketchShot.bat",
            "README_STANDALONE.txt"
        )) {
        Remove-BundlePath -Path (Join-Path $BundleDir $path)
    }

    return $internalDir
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-ProjectRoot -ScriptDir $scriptDir
$bundleRoot = Join-Path $projectRoot "green-bundle"
$tempRuntimeRoot = Join-Path $projectRoot ".runtime\green-bundle-python"
$tempScriptRoot = Join-Path $projectRoot ".runtime\green-bundle-scripts"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$tempRuntimeDir = Join-Path $tempRuntimeRoot $timestamp
$launcher = Resolve-PythonLauncher -RequestedPythonExe $PythonExe

New-Item -ItemType Directory -Path $tempRuntimeRoot -Force | Out-Null
New-Item -ItemType Directory -Path $tempScriptRoot -Force | Out-Null

try {
    Write-Host "[GreenPack] Using build Python: $($launcher.Display)" -ForegroundColor Cyan
    $pythonInfo = Get-PythonRuntimeInfo `
        -FilePath $launcher.FilePath `
        -PrefixArgs $launcher.PrefixArgs `
        -TempScriptRoot $tempScriptRoot

    Copy-PortablePythonRuntime -PythonInfo $pythonInfo -DestinationDir $tempRuntimeDir

    $portablePythonExe = Join-Path $tempRuntimeDir "python.exe"
    if (-not (Test-Path $portablePythonExe)) {
        throw "Portable Python runtime is incomplete: $portablePythonExe"
    }

    Test-PortablePythonRuntime -PythonExecutable $portablePythonExe -TempScriptRoot $tempScriptRoot

    $bundleResult = & (Join-Path $scriptDir "Package-StandaloneBundle.ps1") `
        -SkipFrontendBuild:$SkipFrontendBuild `
        -PythonRuntimeDir $tempRuntimeDir `
        -SkipZip `
        -BundleRootDir $bundleRoot

    # Package-StandaloneBundle.ps1 can emit build logs on stdout (for example npm output),
    # so the captured result may be an array mixing strings and the final metadata object.
    $bundleInfo = $bundleResult | Where-Object {
        $_ -is [psobject] -and $_.PSObject.Properties.Name -contains "BundleDir"
    } | Select-Object -Last 1

    if ($null -eq $bundleInfo -or [string]::IsNullOrWhiteSpace([string]$bundleInfo.BundleDir)) {
        throw "Failed to resolve BundleDir from Package-StandaloneBundle output."
    }

    $bundleDir = [string]$bundleInfo.BundleDir
    $zipPath = "$bundleDir.zip"

    $manifest = [pscustomobject]@{
        bundle_kind = "green"
        built_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
        python_executable = $pythonInfo.executable
        python_version = $pythonInfo.version
        bundle_dir = $bundleDir
        prebuilt_frontend = $true
        bundled_python = $true
    }
    $manifest | ConvertTo-Json | Set-Content -Path (Join-Path $bundleDir "bundle-manifest.json") -Encoding ASCII

    $internalDir = Finalize-GreenBundleLayout -BundleDir $bundleDir

    Write-AsciiTextFile -Path (Join-Path $bundleDir "Run-SketchShot.cmd") -Content @'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%_internal\Start-SketchShot.ps1" -RequireBundledPython -RuntimeSubdir "_internal\.runtime" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [SketchShot] Startup failed. Check logs in "_internal\.runtime".
    pause
)

exit /b %EXIT_CODE%
'@

    Write-AsciiTextFile -Path (Join-Path $bundleDir "Stop-SketchShot.cmd") -Content @'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%_internal\Stop-SketchShot.ps1" -RuntimeSubdir "_internal\.runtime" %*
exit /b %ERRORLEVEL%
'@

    Write-Utf8TextFile -Path (Join-Path $bundleDir "README.txt") -Content @"
SketchShot Green Bundle
Updated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")

Only these files are intended for end users:
1. Run-SketchShot.cmd
2. Stop-SketchShot.cmd

How to use:
1. Double-click Run-SketchShot.cmd
2. Wait for the browser to open http://127.0.0.1:8000/
3. Open engine settings in the UI and fill your own Volcengine or DashScope credentials

Notes:
- This bundle already includes the frontend build and bundled Python runtime
- End users do not need Python, npm, Node.js, or Docker
- AI generation still requires network access to Volcengine / DashScope / Wanx APIs
- Wanx video also requires OSS because the first and last frames must use public URLs
- Internal scripts and logs are stored under _internal
- Runtime data is stored under backend\data-standalone\
- Do not redistribute your real keys with this bundle
"@

    Reset-BundleState -BundleDir $bundleDir

    if (-not $SkipZip) {
        if (Test-Path $zipPath) {
            Remove-Item -LiteralPath $zipPath -Force
        }

        Write-Host "[GreenPack] Creating zip archive..." -ForegroundColor Cyan
        Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force
    }

    Write-Host "[GreenPack] Bundle ready: $bundleDir" -ForegroundColor Green
    if (-not $SkipZip) {
        Write-Host "[GreenPack] Zip ready: $zipPath" -ForegroundColor Green
    }

    [pscustomobject]@{
        BundleDir = $bundleDir
        ZipPath = if ($SkipZip) { $null } else { $zipPath }
        PythonVersion = $pythonInfo.version
    }
}
finally {
    if (Test-Path $tempRuntimeDir) {
        Remove-Item -LiteralPath $tempRuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
