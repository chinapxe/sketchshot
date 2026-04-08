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

if (-not (Test-Path $composeFile)) {
    throw "docker-compose.yml not found: $composeFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker command not found. Please install and start Docker Desktop first."
}

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
