param(
    [string]$OutputDir,
    [switch]$SkipBuild,
    [switch]$NoCache,
    [switch]$Zip,
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $Name"
    }
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [string[]]$Arguments = @()
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        $commandText = (@($FilePath) + $Arguments) -join " "
        throw "External command failed with exit code ${exitCode}: $commandText"
    }
}

function Test-DockerImageExists {
    param([string]$Image)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & docker image inspect $Image 1>$null 2>$null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Assert-DockerImageExists {
    param(
        [string]$Image,
        [string]$Hint
    )

    if (-not (Test-DockerImageExists -Image $Image)) {
        throw "Docker image not found: $Image. $Hint"
    }
}

function Read-DotEnvFile {
    param([string]$Path)

    $values = [ordered]@{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed) { continue }
        if ($trimmed.StartsWith("#")) { continue }
        if ($trimmed -notmatch "=") { continue }

        $pair = $trimmed -split "=", 2
        $key = $pair[0].Trim()
        $value = $pair[1]

        if (-not $key) { continue }
        $values[$key] = $value
    }

    return $values
}

function Write-DotEnvFile {
    param(
        [string]$Path,
        [System.Collections.Specialized.OrderedDictionary]$Values
    )

    $lines = foreach ($key in $Values.Keys) {
        "$key=$($Values[$key])"
    }

    [System.IO.File]::WriteAllLines($Path, $lines)
}

function Merge-OfflineEnv {
    param(
        [System.Collections.Specialized.OrderedDictionary]$BaseValues,
        [System.Collections.Specialized.OrderedDictionary]$DockerValues
    )

    $mapping = [ordered]@{
        "WXHB_APP_NAME" = "APP_NAME"
        "WXHB_DEBUG" = "DEBUG"
        "WXHB_BACKEND_PORT" = "BACKEND_PORT"
        "WXHB_FRONTEND_PORT" = "WEB_PORT"
        "WXHB_CORS_ORIGINS" = "CORS_ORIGINS"
        "WXHB_DEFAULT_ADAPTER" = "DEFAULT_ADAPTER"
        "WXHB_PUBLIC_BASE_URL" = "PUBLIC_BASE_URL"
        "WXHB_MOCK_DELAY" = "MOCK_DELAY"
        "WXHB_VOLCENGINE_ENABLED" = "VOLCENGINE_ENABLED"
        "WXHB_ARK_BASE_URL" = "ARK_BASE_URL"
        "WXHB_ARK_API_KEY" = "ARK_API_KEY"
        "WXHB_VOLCENGINE_TIMEOUT" = "VOLCENGINE_TIMEOUT"
        "WXHB_VOLCENGINE_REQUEST_TIMEOUT" = "VOLCENGINE_REQUEST_TIMEOUT"
        "WXHB_VOLCENGINE_VIDEO_TIMEOUT" = "VOLCENGINE_VIDEO_TIMEOUT"
        "WXHB_VOLCENGINE_POLL_INTERVAL" = "VOLCENGINE_POLL_INTERVAL"
        "WXHB_VOLCENGINE_PROMPT_MODEL" = "VOLCENGINE_PROMPT_MODEL"
        "WXHB_VOLCENGINE_IMAGE_MODEL" = "VOLCENGINE_IMAGE_MODEL"
        "WXHB_VOLCENGINE_IMAGE_EDIT_MODEL" = "VOLCENGINE_IMAGE_EDIT_MODEL"
        "WXHB_VOLCENGINE_VIDEO_MODEL" = "VOLCENGINE_VIDEO_MODEL"
        "WXHB_VOLCENGINE_IMAGE_OUTPUT_FORMAT" = "VOLCENGINE_IMAGE_OUTPUT_FORMAT"
        "WXHB_VOLCENGINE_WATERMARK" = "VOLCENGINE_WATERMARK"
        "WXHB_COMFYUI_ENABLED" = "COMFYUI_ENABLED"
        "WXHB_COMFYUI_BASE_URL" = "COMFYUI_BASE_URL"
        "WXHB_COMFYUI_POLL_INTERVAL" = "COMFYUI_POLL_INTERVAL"
        "WXHB_COMFYUI_TIMEOUT" = "COMFYUI_TIMEOUT"
        "WXHB_COMFYUI_NEGATIVE_PROMPT" = "COMFYUI_NEGATIVE_PROMPT"
    }

    foreach ($sourceKey in $mapping.Keys) {
        if ($DockerValues.Keys -contains $sourceKey) {
            $targetKey = $mapping[$sourceKey]
            $sourceValue = "$($DockerValues[$sourceKey])".Trim()
            if ($sourceValue -ne "") {
                if ($sourceKey -eq "WXHB_APP_NAME" -and $sourceValue -eq "WXHB-AI-Workflow") {
                    $sourceValue = "SketchShot - AI Storyboard Canvas"
                }
                $BaseValues[$targetKey] = $sourceValue
            }
        }
    }

    return $BaseValues
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$composeFile = Join-Path $repoRoot "docker-compose.yml"
$dockerEnvExample = Join-Path $repoRoot ".env.docker.example"
$dockerEnvFile = Join-Path $repoRoot ".env.docker"

Require-Command "docker"

if (-not $OutputDir) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputDir = Join-Path $repoRoot ("offline-bundle\$timestamp")
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$backendImageSource = "wxhb-backend"
$frontendImageSource = "wxhb-frontend"
$backendImageOffline = "wxhb-backend:offline"
$frontendImageOffline = "wxhb-frontend:offline"
$zipEnabled = $Zip -or (-not $NoZip)

if (-not (Test-Path $dockerEnvFile) -and (Test-Path $dockerEnvExample)) {
    Copy-Item -LiteralPath $dockerEnvExample -Destination $dockerEnvFile
    Write-Host "[OfflinePack] Created .env.docker from template: $dockerEnvFile" -ForegroundColor Yellow
}

if (-not $SkipBuild) {
    Write-Host "[OfflinePack] Building backend/frontend images..." -ForegroundColor Cyan
    $buildArgs = @("compose", "--env-file", ".env.docker", "-f", "docker-compose.yml", "build")
    if ($NoCache) {
        $buildArgs += "--no-cache"
    }
    $buildArgs += @("backend", "frontend")
    Invoke-External -FilePath "docker" -Arguments $buildArgs
}

Assert-DockerImageExists -Image $backendImageSource -Hint "Build backend first or rerun without -SkipBuild."
Assert-DockerImageExists -Image $frontendImageSource -Hint "Build frontend first or rerun without -SkipBuild."

Write-Host "[OfflinePack] Tagging offline images..." -ForegroundColor Cyan
Invoke-External -FilePath "docker" -Arguments @("tag", $backendImageSource, $backendImageOffline)
Invoke-External -FilePath "docker" -Arguments @("tag", $frontendImageSource, $frontendImageOffline)

$imagesTar = Join-Path $OutputDir "wxhb-images-offline.tar"
Write-Host "[OfflinePack] Saving images -> $imagesTar" -ForegroundColor Cyan
Invoke-External -FilePath "docker" -Arguments @(
    "save",
    "-o",
    $imagesTar,
    $backendImageOffline,
    $frontendImageOffline
)

if (-not (Test-Path $imagesTar)) {
    throw "Offline image archive not created: $imagesTar"
}

$composeSrc = Join-Path $repoRoot "docker-compose.offline.yml"
$envExampleSrc = Join-Path $repoRoot ".env.offline.example"
$deployScriptSrc = Join-Path $PSScriptRoot "Deploy-OfflineBundle.ps1"
$verifyScriptSrc = Join-Path $PSScriptRoot "Verify-OfflineBundle.ps1"
$cleanupScriptSrc = Join-Path $PSScriptRoot "Cleanup-OfflineBundle.ps1"
$startCmdSrc = Join-Path $PSScriptRoot "Start-WXHB.cmd"
$verifyCmdSrc = Join-Path $PSScriptRoot "Verify-WXHB.cmd"
$cleanupCmdSrc = Join-Path $PSScriptRoot "Cleanup-WXHB.cmd"
$startSketchShotCmdSrc = Join-Path $PSScriptRoot "Start-SketchShot.cmd"
$verifySketchShotCmdSrc = Join-Path $PSScriptRoot "Verify-SketchShot.cmd"
$cleanupSketchShotCmdSrc = Join-Path $PSScriptRoot "Cleanup-SketchShot.cmd"
$deployScriptLinuxSrc = Join-Path $PSScriptRoot "Deploy-OfflineBundle.sh"
$verifyScriptLinuxSrc = Join-Path $PSScriptRoot "Verify-OfflineBundle.sh"
$cleanupScriptLinuxSrc = Join-Path $PSScriptRoot "Cleanup-OfflineBundle.sh"

Copy-Item -Path $composeSrc -Destination (Join-Path $OutputDir "docker-compose.offline.yml") -Force
Copy-Item -Path $envExampleSrc -Destination (Join-Path $OutputDir ".env.example") -Force
Copy-Item -Path $deployScriptSrc -Destination (Join-Path $OutputDir "Deploy-OfflineBundle.ps1") -Force
Copy-Item -Path $verifyScriptSrc -Destination (Join-Path $OutputDir "Verify-OfflineBundle.ps1") -Force
Copy-Item -Path $cleanupScriptSrc -Destination (Join-Path $OutputDir "Cleanup-OfflineBundle.ps1") -Force
Copy-Item -Path $startSketchShotCmdSrc -Destination (Join-Path $OutputDir "Start-SketchShot.cmd") -Force
Copy-Item -Path $verifySketchShotCmdSrc -Destination (Join-Path $OutputDir "Verify-SketchShot.cmd") -Force
Copy-Item -Path $cleanupSketchShotCmdSrc -Destination (Join-Path $OutputDir "Cleanup-SketchShot.cmd") -Force
Copy-Item -Path $startCmdSrc -Destination (Join-Path $OutputDir "Start-WXHB.cmd") -Force
Copy-Item -Path $verifyCmdSrc -Destination (Join-Path $OutputDir "Verify-WXHB.cmd") -Force
Copy-Item -Path $cleanupCmdSrc -Destination (Join-Path $OutputDir "Cleanup-WXHB.cmd") -Force
Copy-Item -Path $deployScriptLinuxSrc -Destination (Join-Path $OutputDir "Deploy-OfflineBundle.sh") -Force
Copy-Item -Path $verifyScriptLinuxSrc -Destination (Join-Path $OutputDir "Verify-OfflineBundle.sh") -Force
Copy-Item -Path $cleanupScriptLinuxSrc -Destination (Join-Path $OutputDir "Cleanup-OfflineBundle.sh") -Force

$offlineEnvValues = Read-DotEnvFile -Path $envExampleSrc
$dockerEnvValues = Read-DotEnvFile -Path $dockerEnvFile
$mergedOfflineEnv = Merge-OfflineEnv -BaseValues $offlineEnvValues -DockerValues $dockerEnvValues
Write-DotEnvFile -Path (Join-Path $OutputDir ".env") -Values $mergedOfflineEnv

$bundleDataRoot = Join-Path $OutputDir "data"
foreach ($dir in @("uploads", "outputs", "workflows")) {
    $targetDir = Join-Path $bundleDataRoot $dir
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $targetDir ".gitkeep") -Force | Out-Null
}

$hash = Get-FileHash -Path $imagesTar -Algorithm SHA256
$hash | Format-List | Out-File -FilePath (Join-Path $OutputDir "wxhb-images-offline.sha256.txt") -Encoding utf8

$readme = @"
SketchShot offline deployment bundle

Files:
- wxhb-images-offline.tar: Docker image archive for backend + frontend
- docker-compose.offline.yml: offline deployment compose file
- .env: ready-to-run environment file, generated from current .env.docker when available
- .env.example: environment template for reference
- Deploy-OfflineBundle.ps1: load images and start services
- Verify-OfflineBundle.ps1: verify service health after deployment
- Cleanup-OfflineBundle.ps1: stop services and optionally remove local data
- Start-SketchShot.cmd: one-click Windows deploy entry
- Verify-SketchShot.cmd: one-click Windows verify entry
- Cleanup-SketchShot.cmd: one-click Windows cleanup entry
- Start-WXHB.cmd: one-click Windows deploy entry
- Verify-WXHB.cmd: one-click Windows verify entry
- Cleanup-WXHB.cmd: one-click Windows cleanup entry
- Deploy-OfflineBundle.sh: Linux deploy script
- Verify-OfflineBundle.sh: Linux verify script
- Cleanup-OfflineBundle.sh: Linux cleanup script
- data/: local persistent directories for uploads, outputs and workflows

Windows steps:
1. Copy this bundle directory to the target machine.
2. Update .env only if you need to change ports or API keys.
3. Double-click Start-SketchShot.cmd, or run:
   powershell -ExecutionPolicy Bypass -File .\Deploy-OfflineBundle.ps1
4. If you need a separate health check later:
   powershell -ExecutionPolicy Bypass -File .\Verify-OfflineBundle.ps1
5. If you need a clean reinstall:
   powershell -ExecutionPolicy Bypass -File .\Cleanup-OfflineBundle.ps1
   powershell -ExecutionPolicy Bypass -File .\Cleanup-OfflineBundle.ps1 -PurgeData

Linux steps:
1. Copy this bundle directory to the target machine.
2. Update .env only if you need to change ports or API keys.
3. Start services:
   bash ./Deploy-OfflineBundle.sh
4. Verify deployment:
   bash ./Verify-OfflineBundle.sh
5. If you need a clean reinstall:
   bash ./Cleanup-OfflineBundle.sh
   bash ./Cleanup-OfflineBundle.sh --purge-data
"@
$readme | Out-File -FilePath (Join-Path $OutputDir "README_OFFLINE.txt") -Encoding utf8

if ($zipEnabled) {
    $zipPath = "${OutputDir}.zip"
    if (Test-Path $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $OutputDir "*") -DestinationPath $zipPath -Force
    Write-Host "[OfflinePack] Zip created: $zipPath" -ForegroundColor Green
}

Write-Host "[OfflinePack] Done." -ForegroundColor Green
Write-Host "Bundle dir: $OutputDir" -ForegroundColor Green
if ($zipEnabled) {
    Write-Host "Bundle zip: ${OutputDir}.zip" -ForegroundColor Green
}
Write-Host "Images SHA256: $($hash.Hash)" -ForegroundColor Green
