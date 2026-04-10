param(
    [switch]$SkipFrontendBuild,
    [string]$PythonRuntimeDir = "",
    [switch]$SkipZip,
    [string]$BundleRootDir = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $Name"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$frontendDir = Join-Path $projectRoot "frontend"
$frontendDistDir = Join-Path $frontendDir "dist"
$backendDir = Join-Path $projectRoot "backend"
$bundleRoot = if ([string]::IsNullOrWhiteSpace($BundleRootDir)) {
    Join-Path $projectRoot "standalone-bundle"
}
else {
    $BundleRootDir
}
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bundleDir = Join-Path $bundleRoot $timestamp
$zipPath = "$bundleDir.zip"

if (-not $SkipFrontendBuild) {
    Require-Command "npm"
    Push-Location $frontendDir
    try {
        Write-Host "[StandalonePack] Building frontend dist..." -ForegroundColor Cyan
        npm run build
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path (Join-Path $frontendDistDir "index.html"))) {
    throw "Frontend dist not found. Please run frontend build first, or omit -SkipFrontendBuild."
}

New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data\uploads") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data\outputs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data\workflows") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data\templates") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data-standalone\uploads") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data-standalone\outputs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data-standalone\workflows") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "backend\data-standalone\templates") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDir "frontend") -Force | Out-Null

Write-Host "[StandalonePack] Copying backend files..." -ForegroundColor Cyan
Copy-Item -LiteralPath (Join-Path $backendDir "app") -Destination (Join-Path $bundleDir "backend\app") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $backendDir "run.py") -Destination (Join-Path $bundleDir "backend\run.py") -Force
Copy-Item -LiteralPath (Join-Path $backendDir "requirements.txt") -Destination (Join-Path $bundleDir "backend\requirements.txt") -Force
Copy-Item -LiteralPath (Join-Path $backendDir ".env.standalone.example") -Destination (Join-Path $bundleDir "backend\.env.standalone.example") -Force
Copy-Item -LiteralPath (Join-Path $backendDir ".env.standalone.example") -Destination (Join-Path $bundleDir "backend\.env.standalone") -Force
Copy-Item -LiteralPath (Join-Path $backendDir ".env.example") -Destination (Join-Path $bundleDir "backend\.env.example") -Force

Write-Host "[StandalonePack] Copying frontend dist..." -ForegroundColor Cyan
Copy-Item -LiteralPath $frontendDistDir -Destination (Join-Path $bundleDir "frontend\dist") -Recurse -Force

Write-Host "[StandalonePack] Copying standalone scripts..." -ForegroundColor Cyan
Copy-Item -LiteralPath (Join-Path $scriptDir "Start-Standalone.ps1") -Destination (Join-Path $bundleDir "Start-Standalone.ps1") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Stop-Standalone.ps1") -Destination (Join-Path $bundleDir "Stop-Standalone.ps1") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Verify-Standalone.ps1") -Destination (Join-Path $bundleDir "Verify-Standalone.ps1") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Start-Standalone.cmd") -Destination (Join-Path $bundleDir "Start-Standalone.cmd") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Stop-Standalone.cmd") -Destination (Join-Path $bundleDir "Stop-Standalone.cmd") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Verify-Standalone.cmd") -Destination (Join-Path $bundleDir "Verify-Standalone.cmd") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Start-Standalone.bat") -Destination (Join-Path $bundleDir "Start-Standalone.bat") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Stop-Standalone.bat") -Destination (Join-Path $bundleDir "Stop-Standalone.bat") -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "Verify-Standalone.bat") -Destination (Join-Path $bundleDir "Verify-Standalone.bat") -Force

if (-not [string]::IsNullOrWhiteSpace($PythonRuntimeDir)) {
    $resolvedPythonRuntime = (Resolve-Path $PythonRuntimeDir).Path
    $targetRuntimeDir = Join-Path $bundleDir "runtime\python"
    New-Item -ItemType Directory -Path (Split-Path $targetRuntimeDir -Parent) -Force | Out-Null
    Write-Host "[StandalonePack] Copying portable Python runtime..." -ForegroundColor Cyan
    Copy-Item -LiteralPath $resolvedPythonRuntime -Destination $targetRuntimeDir -Recurse -Force
}

$readmePath = Join-Path $bundleDir "README_STANDALONE.txt"
$readmeContent = @"
SketchShot Standalone Bundle
============================

1. If you packaged a portable Python runtime, double-click Start-Standalone.cmd.
2. If no runtime is included, install Python 3 first, then double-click Start-Standalone.cmd.
3. After startup, open the toolbar engine settings and fill your own Volcengine / DashScope / Wanx configuration.
4. Runtime data is stored under backend\data\ and should stay on the local machine.
5. Standalone mode uses backend\.env.standalone and does not depend on backend\.env.
6. Standalone runtime data is isolated under backend\data-standalone\.

Useful files:
- Start-Standalone.cmd
- Start-Standalone.bat
- Verify-Standalone.cmd
- Stop-Standalone.cmd
- backend\.env.standalone
"@
Set-Content -Path $readmePath -Value $readmeContent -Encoding UTF8

if (-not $SkipZip) {
    if (Test-Path $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Write-Host "[StandalonePack] Creating zip archive..." -ForegroundColor Cyan
    Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force
}

Write-Host "[StandalonePack] Bundle ready: $bundleDir" -ForegroundColor Green
if (-not $SkipZip) {
    Write-Host "[StandalonePack] Zip ready: $zipPath" -ForegroundColor Green
}

[pscustomobject]@{
    BundleDir = $bundleDir
    ZipPath = if ($SkipZip) { $null } else { $zipPath }
}
