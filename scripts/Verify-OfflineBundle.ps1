param(
    [string]$BundleDir = ".",
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

function Get-ComposePsJson {
    param(
        [string]$ComposeFile,
        [string]$EnvFile
    )

    $raw = docker compose --env-file $EnvFile -f $ComposeFile ps --format json 2>&1
    if ($LASTEXITCODE -ne 0) {
        $errorText = ($raw -join [Environment]::NewLine)
        throw "docker compose ps failed: $errorText"
    }

    $lines = @($raw | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    if ($lines.Count -eq 0) {
        return @()
    }

    $records = @()
    foreach ($line in $lines) {
        try {
            $item = $line | ConvertFrom-Json
            if ($item -is [System.Array]) {
                $records += $item
            }
            else {
                $records += @($item)
            }
            continue
        }
        catch {
            if ($lines.Count -eq 1) {
                throw "docker compose ps returned non-json output: $line"
            }
        }
    }

    if ($records.Count -eq 0) {
        $rawText = ($lines -join [Environment]::NewLine)
        throw "docker compose ps returned non-json output: $rawText"
    }

    return $records
}

function Get-ServiceRecord {
    param(
        [object[]]$Records,
        [string]$ServiceName
    )

    return $Records | Where-Object { $_.Service -eq $ServiceName } | Select-Object -First 1
}

function Test-ServiceReady {
    param(
        [object]$Record,
        [bool]$RequireHealth
    )

    if (-not $Record) { return $false }
    if ($Record.State -ne "running") { return $false }

    if ($RequireHealth) {
        $hasHealth = $Record.PSObject.Properties.Name -contains "Health"
        if (-not $hasHealth) { return $false }
        if ($Record.Health -ne "healthy") { return $false }
    }

    return $true
}

Require-Command "docker"

$bundlePath = (Resolve-Path $BundleDir).Path
$composeFile = Join-Path $bundlePath "docker-compose.offline.yml"
$envFile = Join-Path $bundlePath ".env"
$envExample = Join-Path $bundlePath ".env.example"

if (-not (Test-Path $composeFile)) {
    throw "Compose file not found: $composeFile"
}

if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item -Path $envExample -Destination $envFile -Force
    Write-Host "[OfflineVerify] Created .env from template: $envFile" -ForegroundColor Yellow
}

$requiredServices = @(
    @{ Name = "backend"; RequireHealth = $true },
    @{ Name = "frontend"; RequireHealth = $true }
)

Set-Location $bundlePath

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ready = $false

while ((Get-Date) -lt $deadline) {
    $records = Get-ComposePsJson -ComposeFile $composeFile -EnvFile $envFile
    $allReady = $true

    foreach ($svc in $requiredServices) {
        $record = Get-ServiceRecord -Records $records -ServiceName $svc.Name
        if (-not (Test-ServiceReady -Record $record -RequireHealth $svc.RequireHealth)) {
            $allReady = $false
            break
        }
    }

    if ($allReady) {
        $ready = $true
        break
    }

    Start-Sleep -Seconds $IntervalSec
}

if (-not $ready) {
    Write-Host "[OfflineVerify] Services did not become ready before timeout. Current status:" -ForegroundColor Red
    docker compose --env-file $envFile -f $composeFile ps
    throw "Offline deployment verification failed: services not ready."
}

$backendPort = Get-DotEnvValue -EnvPath $envFile -Key "BACKEND_PORT" -DefaultValue "8000"
$webPort = Get-DotEnvValue -EnvPath $envFile -Key "WEB_PORT" -DefaultValue "8080"

$backendUrl = "http://localhost:$backendPort/api/health"
$webUrl = "http://localhost:$webPort/"

Write-Host "[OfflineVerify] Checking backend: $backendUrl" -ForegroundColor Cyan
$backendResp = Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 15
$backendJson = $backendResp.Content | ConvertFrom-Json
if ($backendJson.status -ne "ok") {
    throw "Backend health check failed: $($backendResp.Content)"
}

Write-Host "[OfflineVerify] Checking frontend: $webUrl" -ForegroundColor Cyan
$webResp = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 15
if ($webResp.StatusCode -lt 200 -or $webResp.StatusCode -ge 400) {
    throw "Frontend check failed with HTTP $($webResp.StatusCode)"
}
if ($webResp.Content -notmatch "<!doctype html|<html") {
    throw "Frontend check failed: response is not HTML."
}

Write-Host "[OfflineVerify] Container status:" -ForegroundColor Cyan
docker compose --env-file $envFile -f $composeFile ps

Write-Host "[OfflineVerify] PASS" -ForegroundColor Green
