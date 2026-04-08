param(
    [string]$BundleDir = ".",
    [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-ChildPath {
    param(
        [string]$RootPath,
        [string]$TargetPath
    )

    $resolvedRoot = [System.IO.Path]::GetFullPath($RootPath)
    $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)

    if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Target path is outside bundle root: $resolvedTarget"
    }
}

function Clear-DirectoryContents {
    param([string]$DirectoryPath)

    if (-not (Test-Path $DirectoryPath)) {
        return
    }

    Get-ChildItem -LiteralPath $DirectoryPath -Force | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

$bundlePath = (Resolve-Path $BundleDir).Path
$composeFile = Join-Path $bundlePath "docker-compose.offline.yml"
$envFile = Join-Path $bundlePath ".env"
$dataRoot = Join-Path $bundlePath "data"

if (-not (Test-Path $composeFile)) {
    throw "Offline compose file not found: $composeFile"
}

Set-Location $bundlePath

Write-Host "[Cleanup] Stopping and removing containers..." -ForegroundColor Cyan
docker compose --env-file $envFile -f $composeFile down 2>$null
$global:LASTEXITCODE = 0

Write-Host "[Cleanup] Removing offline images..." -ForegroundColor Cyan
foreach ($image in @("wxhb-backend:offline", "wxhb-frontend:offline")) {
    docker rmi $image 2>$null
    $global:LASTEXITCODE = 0
}

if ($PurgeData) {
    Write-Host "[Cleanup] Purging bundle data directories..." -ForegroundColor Red
    foreach ($dir in @("uploads", "outputs", "workflows")) {
        $targetDir = Join-Path $dataRoot $dir
        Assert-ChildPath -RootPath $bundlePath -TargetPath $targetDir
        Clear-DirectoryContents -DirectoryPath $targetDir
    }
    $engineConfigFile = Join-Path $dataRoot "engine_config.json"
    Assert-ChildPath -RootPath $bundlePath -TargetPath $engineConfigFile
    if (Test-Path $engineConfigFile) {
        Remove-Item -LiteralPath $engineConfigFile -Force
    }
    Write-Host "[Cleanup] Data directories cleaned." -ForegroundColor Yellow
}
else {
    Write-Host "[Cleanup] Data directories kept. Use -PurgeData to remove local runtime data." -ForegroundColor Yellow
}

Write-Host "[Cleanup] Done." -ForegroundColor Green
