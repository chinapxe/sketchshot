param(
    [string]$BundleDir = ".",
    [switch]$SkipVerify,
    [int]$TimeoutSec = 180,
    [int]$IntervalSec = 5
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $Name"
    }
}

function Get-DotEnvValue {
    param(
        [string]$EnvPath,
        [string]$Key,
        [string]$DefaultValue
    )

    if (-not (Test-Path $EnvPath)) {
        return $DefaultValue
    }

    $safeKey = [regex]::Escape($Key)
    $line = Get-Content -Path $EnvPath |
        Where-Object { $_ -match "^\s*$safeKey\s*=" } |
        Select-Object -First 1

    if (-not $line) {
        return $DefaultValue
    }

    $value = ($line -split "=", 2)[1].Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Trim('"')
    }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) {
        $value = $value.Trim("'")
    }
    return $value
}

Require-Command "docker"

$bundlePath = (Resolve-Path $BundleDir).Path
$imagesTar = Join-Path $bundlePath "wxhb-images-offline.tar"
$composeFile = Join-Path $bundlePath "docker-compose.offline.yml"
$envExample = Join-Path $bundlePath ".env.example"
$envFile = Join-Path $bundlePath ".env"
$dataRoot = Join-Path $bundlePath "data"
$verifyScript = Join-Path $bundlePath "Verify-OfflineBundle.ps1"

if (-not (Test-Path $imagesTar)) {
    throw "Offline images archive not found: $imagesTar"
}

if (-not (Test-Path $composeFile)) {
    throw "Offline compose file not found: $composeFile"
}

if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item -Path $envExample -Destination $envFile -Force
    Write-Host "[OfflineDeploy] Created .env from template: $envFile" -ForegroundColor Yellow
}

foreach ($dir in @("uploads", "outputs", "workflows")) {
    New-Item -ItemType Directory -Path (Join-Path $dataRoot $dir) -Force | Out-Null
}

Set-Location $bundlePath

Write-Host "[OfflineDeploy] Loading docker images..." -ForegroundColor Cyan
docker load -i $imagesTar

Write-Host "[OfflineDeploy] Starting services..." -ForegroundColor Cyan
docker compose --env-file $envFile -f $composeFile up -d --remove-orphans

Write-Host "[OfflineDeploy] Current status:" -ForegroundColor Cyan
docker compose --env-file $envFile -f $composeFile ps

if (-not $SkipVerify) {
    if (-not (Test-Path $verifyScript)) {
        throw "Verify script not found: $verifyScript"
    }

    Write-Host "[OfflineDeploy] Verifying deployment..." -ForegroundColor Cyan
    & $verifyScript -BundleDir $bundlePath -TimeoutSec $TimeoutSec -IntervalSec $IntervalSec
}

$backendPort = Get-DotEnvValue -EnvPath $envFile -Key "BACKEND_PORT" -DefaultValue "8000"
$webPort = Get-DotEnvValue -EnvPath $envFile -Key "WEB_PORT" -DefaultValue "8080"

Write-Host "[OfflineDeploy] Access URLs:" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:$webPort/" -ForegroundColor Green
Write-Host "  Backend health: http://localhost:$backendPort/api/health" -ForegroundColor Green

Write-Host "[OfflineDeploy] Done." -ForegroundColor Green
