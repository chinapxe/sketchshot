param(
    [switch]$NoBrowser,
    [int]$TimeoutSec = 60,
    [int]$Port = 0,
    [switch]$RequireBundledPython,
    [string]$RuntimeSubdir = ".runtime"
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

function Ensure-DotEnvEntry {
    param(
        [string]$EnvPath,
        [string]$Key,
        [string]$Value
    )

    $safeKey = [regex]::Escape($Key)
    $lines = @()
    if (Test-Path $EnvPath) {
        $lines = Get-Content -Path $EnvPath
    }

    if ($lines | Where-Object { $_ -match "^\s*$safeKey\s*=" }) {
        return
    }

    Add-Content -Path $EnvPath -Value "$Key=$Value"
}

function ConvertTo-BoolLikeValue {
    param(
        [string]$Value,
        [bool]$DefaultValue = $false
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $DefaultValue
    }

    switch ($Value.Trim().ToLowerInvariant()) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "on" { return $true }
        "debug" { return $true }
        "0" { return $false }
        "false" { return $false }
        "no" { return $false }
        "off" { return $false }
        "release" { return $false }
        "prod" { return $false }
        "production" { return $false }
        default { return $DefaultValue }
    }
}

function Resolve-PythonLauncher {
    param(
        [string]$ProjectRoot,
        [string]$BackendDir,
        [switch]$RequireBundledPython
    )

    $directCandidates = @(
        (Join-Path $ProjectRoot "runtime\python\python.exe"),
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        (Join-Path $BackendDir ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $directCandidates) {
        if (Test-Path $candidate) {
            return @{
                FilePath = $candidate
                PrefixArgs = @()
                Display = $candidate
            }
        }
    }

    if ($RequireBundledPython) {
        throw "Bundled Python runtime not found. Expected runtime\python\python.exe next to the package files."
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

    throw "Python launcher not found. Please install Python 3, or package a portable runtime into runtime\python\python.exe."
}

function Test-HealthReady {
    param([string]$HealthUrl)

    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -Method Get -TimeoutSec 3 -UseBasicParsing
        if ($null -eq $response -or $response.StatusCode -ne 200) {
            return $false
        }

        $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
        return ($payload.status -eq "ok")
    }
    catch {
        return $false
    }
}

function Get-ServiceProbeResult {
    param(
        [string]$BaseUrl,
        [string]$HealthUrl,
        [bool]$ExpectFrontend
    )

    $result = [ordered]@{
        HealthOk = $false
        FrontendOk = $false
        AppName = ""
        Error = ""
    }

    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -Method Get -TimeoutSec 3 -UseBasicParsing
        if ($null -eq $response -or $response.StatusCode -ne 200) {
            return [pscustomobject]$result
        }

        $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
        if ($payload.status -ne "ok") {
            return [pscustomobject]$result
        }

        $result.HealthOk = $true
        $result.AppName = [string]$payload.app

        if (-not $ExpectFrontend) {
            $result.FrontendOk = $true
            return [pscustomobject]$result
        }

        $frontend = Invoke-WebRequest -Uri "$BaseUrl/" -Method Get -TimeoutSec 3 -UseBasicParsing
        $result.FrontendOk = ($null -ne $frontend -and $frontend.StatusCode -ge 200 -and $frontend.StatusCode -lt 400)
        return [pscustomobject]$result
    }
    catch {
        $result.Error = $_.Exception.Message
        return [pscustomobject]$result
    }
}

function Get-PortListenerDescription {
    param([int]$PortNumber)

    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($null -eq $getNetTcpConnection) {
        return $null
    }

    try {
        $connection = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction Stop |
            Select-Object -First 1
    }
    catch {
        return $null
    }

    if ($null -eq $connection) {
        return $null
    }

    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return "PID=$($connection.OwningProcess)"
    }

    return "$($process.ProcessName) (PID=$($process.Id))"
}

function Get-ExistingProcess {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $pidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($pidText)) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    $existing = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    return $existing
}

function Stop-StaleProcessIfNeeded {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$PidFile
    )

    if ($null -eq $Process) {
        return $false
    }

    try {
        Stop-Process -Id $Process.Id -Force -ErrorAction Stop
        Write-Host "[Standalone] Removed stale tracked process PID=$($Process.Id)." -ForegroundColor Yellow
    }
    catch {
        Write-Host "[Standalone] Unable to stop stale tracked process PID=$($Process.Id): $($_.Exception.Message)" -ForegroundColor Yellow
    }

    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    return $true
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-ProjectRoot -ScriptDir $scriptDir
$backendDir = Join-Path $projectRoot "backend"
$frontendDistIndex = Join-Path $projectRoot "frontend\dist\index.html"
$envTemplate = Join-Path $backendDir ".env.standalone.example"
$envFile = Join-Path $backendDir ".env.standalone"
$runtimeDir = Join-Path $projectRoot $RuntimeSubdir
$pidFile = Join-Path $runtimeDir "standalone-backend.pid"
$stdoutLog = Join-Path $runtimeDir "standalone-backend.stdout.log"
$stderrLog = Join-Path $runtimeDir "standalone-backend.stderr.log"

if (-not (Test-Path $envFile)) {
    if (-not (Test-Path $envTemplate)) {
        throw "Standalone env template not found: $envTemplate"
    }

    Copy-Item -LiteralPath $envTemplate -Destination $envFile
    Write-Host "[Standalone] Created backend\.env.standalone from .env.standalone.example" -ForegroundColor Yellow
}

Ensure-DotEnvEntry -EnvPath $envFile -Key "WORKFLOW_STORAGE_DIR" -Value "./data-standalone/workflows"
Ensure-DotEnvEntry -EnvPath $envFile -Key "TEMPLATE_STORAGE_DIR" -Value "./data-standalone/templates"
Ensure-DotEnvEntry -EnvPath $envFile -Key "UPLOAD_DIR" -Value "./data-standalone/uploads"
Ensure-DotEnvEntry -EnvPath $envFile -Key "OUTPUT_DIR" -Value "./data-standalone/outputs"

$expectedAppName = Get-DotEnvValue -EnvPath $envFile -Key "APP_NAME" -DefaultValue "SketchShot - AI Storyboard Canvas"
$expectFrontend = ConvertTo-BoolLikeValue `
    -Value (Get-DotEnvValue -EnvPath $envFile -Key "SERVE_FRONTEND" -DefaultValue "true") `
    -DefaultValue $true

if (-not (Test-Path $frontendDistIndex)) {
    throw "frontend\\dist\\index.html not found. Please build the frontend first:`nSet-Location .\\frontend`n npm run build"
}

$configuredPort = [int](Get-DotEnvValue -EnvPath $envFile -Key "PORT" -DefaultValue "8000")
$port = if ($Port -gt 0) { $Port } else { $configuredPort }
$baseUrl = "http://127.0.0.1:$port"
$healthUrl = "$baseUrl/api/health"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$serviceProbe = Get-ServiceProbeResult `
    -BaseUrl $baseUrl `
    -HealthUrl $healthUrl `
    -ExpectFrontend:$expectFrontend

if ($serviceProbe.HealthOk -and $serviceProbe.AppName -eq $expectedAppName -and $serviceProbe.FrontendOk) {
    Write-Host "[Standalone] SketchShot is already running: $baseUrl/" -ForegroundColor Green
    if (-not $NoBrowser) {
        Start-Process "$baseUrl/"
    }
    exit 0
}

$portListener = Get-PortListenerDescription -PortNumber $port
$existingProcess = Get-ExistingProcess -PidFile $pidFile
$resolvedEnvFile = (Resolve-Path $envFile).Path

if ($null -eq $portListener -and $null -ne $existingProcess) {
    Stop-StaleProcessIfNeeded -Process $existingProcess -PidFile $pidFile | Out-Null
    $existingProcess = $null
}

if ($serviceProbe.HealthOk -and $serviceProbe.AppName -and $serviceProbe.AppName -ne $expectedAppName) {
    throw "Port $port is already occupied by another healthy service: $($serviceProbe.AppName). Stop that service first, or rerun with -Port <new-port>."
}

if ($serviceProbe.HealthOk -and $serviceProbe.AppName -eq $expectedAppName -and -not $serviceProbe.FrontendOk) {
    throw "Port $port is already occupied by a SketchShot-compatible backend, but the frontend root is not available. Stop the existing service, or rerun with -Port <new-port>."
}

if ($null -ne $portListener) {
    throw "Port $port is already in use by $portListener. Please stop that process, change backend\.env.standalone PORT, or rerun with -Port <new-port>."
}

$startedProcessId = $null
if ($null -ne $existingProcess) {
    Write-Host "[Standalone] Existing backend process found (PID=$($existingProcess.Id)), waiting for health check..." -ForegroundColor Yellow
}
else {
    $launcher = Resolve-PythonLauncher `
        -ProjectRoot $projectRoot `
        -BackendDir $backendDir `
        -RequireBundledPython:$RequireBundledPython
    $arguments = @()
    $arguments += $launcher.PrefixArgs
    $arguments += "run.py"

    Write-Host "[Standalone] Starting backend with $($launcher.Display)" -ForegroundColor Cyan
    $previousPortValue = $env:PORT
    $previousEnvFile = $env:SKETCHSHOT_ENV_FILE
    try {
        if ($Port -gt 0) {
            $env:PORT = "$port"
        }
        $env:SKETCHSHOT_ENV_FILE = $resolvedEnvFile

        $process = Start-Process `
            -FilePath $launcher.FilePath `
            -ArgumentList $arguments `
            -WorkingDirectory $backendDir `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -PassThru
    }
    finally {
        $env:PORT = $previousPortValue
        $env:SKETCHSHOT_ENV_FILE = $previousEnvFile
    }

    Set-Content -Path $pidFile -Value $process.Id -Encoding ascii
    $startedProcessId = $process.Id
}

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    if ($null -ne $startedProcessId) {
        $startedProcess = Get-Process -Id $startedProcessId -ErrorAction SilentlyContinue
        if ($null -eq $startedProcess) {
            throw "Standalone backend exited before becoming healthy. Check logs:`nSTDOUT: $stdoutLog`nSTDERR: $stderrLog"
        }
    }

    if (Test-HealthReady -HealthUrl $healthUrl) {
        Write-Host "[Standalone] SketchShot is ready: $baseUrl/" -ForegroundColor Green
        Write-Host "[Standalone] Backend health: $healthUrl" -ForegroundColor Green
        Write-Host "[Standalone] Logs: $stdoutLog" -ForegroundColor DarkGray
        if (-not $NoBrowser) {
            Start-Process "$baseUrl/"
        }
        exit 0
    }

    Start-Sleep -Seconds 1
}

if ($null -ne $startedProcessId) {
    $startedProcess = Get-Process -Id $startedProcessId -ErrorAction SilentlyContinue
    if ($null -eq $startedProcess) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

throw "Standalone startup timed out. Check logs:`nSTDOUT: $stdoutLog`nSTDERR: $stderrLog"
