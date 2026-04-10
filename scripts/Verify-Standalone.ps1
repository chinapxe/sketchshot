param(
    [int]$TimeoutSec = 10,
    [int]$Port = 0
)

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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-ProjectRoot -ScriptDir $scriptDir
$envFile = Join-Path $projectRoot "backend\.env.standalone"
$configuredPort = [int](Get-DotEnvValue -EnvPath $envFile -Key "PORT" -DefaultValue "8000")
$port = if ($Port -gt 0) { $Port } else { $configuredPort }
$baseUrl = "http://127.0.0.1:$port"
$healthUrl = "$baseUrl/api/health"

$health = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec $TimeoutSec -UseBasicParsing
if ($health.StatusCode -ne 200) {
    throw "Health check failed: $healthUrl"
}

$healthPayload = $health.Content | ConvertFrom-Json -ErrorAction Stop
if ($healthPayload.status -ne "ok") {
    throw "Health payload is not ready: $healthUrl"
}

$frontend = Invoke-WebRequest -Uri "$baseUrl/" -Method Get -TimeoutSec $TimeoutSec -UseBasicParsing
if ($frontend.StatusCode -lt 200 -or $frontend.StatusCode -ge 400) {
    throw "Frontend page check failed: $baseUrl/"
}

Write-Host "[Standalone] PASS" -ForegroundColor Green
Write-Host "  Frontend: $baseUrl/" -ForegroundColor Green
Write-Host "  Backend health: $healthUrl" -ForegroundColor Green
