param(
    [ValidateSet("build", "up", "down", "restart", "logs", "ps", "config")]
    [string]$Action = "build",

    [switch]$NoCache
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$composeFile = Join-Path $projectRoot "docker-compose.yml"
$envExample = Join-Path $projectRoot ".env.docker.example"
$envFile = Join-Path $projectRoot ".env.docker"

function Assert-DockerEngineReady {
    param(
        [string]$Purpose = "run Docker commands"
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = (& docker info --format "{{.ServerVersion}}" 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
        return
    }

    $raw = ""
    if ($null -ne $output) {
        $raw = $output.Trim()
    }
    $hint = "Docker engine is not ready. Please install/start Docker Desktop first."

    if ($raw -match "dockerDesktopLinuxEngine") {
        $hint = "Docker Desktop Linux engine is not available. Please start Docker Desktop and ensure Linux containers are enabled."
    }
    elseif ($raw -match "The system cannot find the file specified" -or $raw -match "cannot find the file specified") {
        $hint = "Docker engine pipe is missing. Please wait for Docker Desktop to finish startup, then retry."
    }
    elseif ($raw -match "error during connect") {
        $hint = "Docker engine is not reachable. Please confirm Docker Desktop is fully started, then retry."
    }

    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "$hint Purpose: $Purpose"
    }

    throw "$hint Purpose: $Purpose`nRaw output: $raw"
}

if (-not (Test-Path $composeFile)) {
    throw "docker-compose.yml not found: $composeFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker command not found. Please install and start Docker Desktop first."
}

Assert-DockerEngineReady -Purpose "manage project Docker services"

if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created Docker env template: $envFile"
    Write-Host "Fill in .env.docker before starting production services."
}

Push-Location $projectRoot
try {
    switch ($Action) {
        "build" {
            if ($NoCache) {
                docker compose --env-file .env.docker -f docker-compose.yml build --no-cache
            }
            else {
                docker compose --env-file .env.docker -f docker-compose.yml build
            }
        }
        "up" {
            if ($NoCache) {
                docker compose --env-file .env.docker -f docker-compose.yml up -d --build --force-recreate
            }
            else {
                docker compose --env-file .env.docker -f docker-compose.yml up -d --build
            }
        }
        "down" {
            docker compose --env-file .env.docker -f docker-compose.yml down
        }
        "restart" {
            docker compose --env-file .env.docker -f docker-compose.yml down
            docker compose --env-file .env.docker -f docker-compose.yml up -d --build
        }
        "logs" {
            docker compose --env-file .env.docker -f docker-compose.yml logs -f
        }
        "ps" {
            docker compose --env-file .env.docker -f docker-compose.yml ps
        }
        "config" {
            docker compose --env-file .env.docker -f docker-compose.yml config
        }
    }
}
finally {
    Pop-Location
}
