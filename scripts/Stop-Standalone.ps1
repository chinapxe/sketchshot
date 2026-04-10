param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-ProjectRoot {
    param([string]$ScriptDir)

    if (Test-Path (Join-Path $ScriptDir "backend\run.py")) {
        return (Resolve-Path $ScriptDir).Path
    }

    $parent = Resolve-Path (Join-Path $ScriptDir "..")
    if (Test-Path (Join-Path $parent.Path "backend\run.py")) {
        return $parent.Path
    }

    throw "Unable to locate project root from $ScriptDir"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-ProjectRoot -ScriptDir $scriptDir
$pidFile = Join-Path $projectRoot ".runtime\standalone-backend.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "[Standalone] No PID file found. Backend is probably not running." -ForegroundColor Yellow
    exit 0
}

$pidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($pidText)) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host "[Standalone] PID file was empty and has been cleared." -ForegroundColor Yellow
    exit 0
}

$process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
if ($null -eq $process) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host "[Standalone] Backend process was not running. Cleared stale PID file." -ForegroundColor Yellow
    exit 0
}

Stop-Process -Id $process.Id -Force
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "[Standalone] Stopped backend process PID=$($process.Id)." -ForegroundColor Green
