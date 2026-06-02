#!/usr/bin/env bash
set -euo pipefail

output_dir=""
skip_build=0
no_cache=0
zip_enabled=1

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/Package-OfflineBundle.sh [--output-dir <dir>] [--skip-build] [--no-cache] [--no-zip]

Options:
  --output-dir <dir>  Output bundle directory. Default: ./offline-bundle/<timestamp>
  --skip-build        Reuse existing Docker images and only assemble the offline bundle
  --no-cache          Rebuild backend/frontend images without Docker layer cache
  --no-zip            Do not create <bundle>.zip
  -h, --help          Show help
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Command not found: $name" >&2
    exit 1
  fi
}

assert_docker_engine_ready() {
  local output
  if output="$(docker info --format '{{.ServerVersion}}' 2>&1)" && [[ -n "$output" ]]; then
    return
  fi

  echo "Docker engine is not ready. Please start Docker Engine or Docker Desktop first." >&2
  if [[ -n "${output:-}" ]]; then
    echo "Raw output: $output" >&2
  fi
  exit 1
}

test_docker_image_exists() {
  local image="$1"
  docker image inspect "$image" >/dev/null 2>&1
}

assert_docker_image_exists() {
  local image="$1"
  local hint="$2"
  if ! test_docker_image_exists "$image"; then
    echo "Docker image not found: $image. $hint" >&2
    exit 1
  fi
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

get_dotenv_value_raw() {
  local env_path="$1"
  local key="$2"
  local line value

  if [[ ! -f "$env_path" ]]; then
    return 0
  fi

  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$env_path" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  value="${line#*=}"
  trim_whitespace "$value"
}

set_dotenv_value() {
  local env_path="$1"
  local key="$2"
  local value="$3"
  local temp_path

  temp_path="$(mktemp)"

  awk -v key="$key" -v value="$value" '
    BEGIN {
      updated = 0
    }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      print key "=" value
      updated = 1
      next
    }
    {
      print
    }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$env_path" > "$temp_path"

  mv "$temp_path" "$env_path"
}

create_zip_archive() {
  local bundle_dir="$1"
  local zip_path="$2"

  require_command zip

  rm -f "$zip_path"
  (
    cd "$bundle_dir"
    zip -qr "$zip_path" .
  )
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="${2:-}"
      if [[ -z "$output_dir" ]]; then
        echo "--output-dir requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --skip-build)
      skip_build=1
      shift
      ;;
    --no-cache)
      no_cache=1
      shift
      ;;
    --no-zip)
      zip_enabled=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
compose_file="${repo_root}/docker-compose.yml"
docker_env_example="${repo_root}/.env.docker.example"
docker_env_file="${repo_root}/.env.docker"
offline_compose_src="${repo_root}/docker-compose.offline.yml"
offline_env_example_src="${repo_root}/.env.offline.example"

require_command docker
assert_docker_engine_ready

if [[ -z "$output_dir" ]]; then
  timestamp="$(date +%Y%m%d_%H%M%S)"
  output_dir="${repo_root}/offline-bundle/${timestamp}"
fi

mkdir -p "$output_dir"

backend_image_source="wxhb-backend"
frontend_image_source="wxhb-frontend"
backend_image_offline="wxhb-backend:offline"
frontend_image_offline="wxhb-frontend:offline"

if [[ ! -f "$docker_env_file" && -f "$docker_env_example" ]]; then
  cp "$docker_env_example" "$docker_env_file"
  echo "[OfflinePack] Created .env.docker from template: $docker_env_file"
fi

if [[ "$skip_build" -ne 1 ]]; then
  echo "[OfflinePack] Building backend/frontend images..."
  build_args=(compose --env-file .env.docker -f docker-compose.yml build)
  if [[ "$no_cache" -eq 1 ]]; then
    build_args+=(--no-cache)
  fi
  build_args+=(backend frontend)
  (
    cd "$repo_root"
    docker "${build_args[@]}"
  )
fi

assert_docker_image_exists "$backend_image_source" "Build backend first or rerun without --skip-build."
assert_docker_image_exists "$frontend_image_source" "Build frontend first or rerun without --skip-build."

echo "[OfflinePack] Tagging offline images..."
docker tag "$backend_image_source" "$backend_image_offline"
docker tag "$frontend_image_source" "$frontend_image_offline"

images_tar="${output_dir}/wxhb-images-offline.tar"
echo "[OfflinePack] Saving images -> $images_tar"
docker save -o "$images_tar" "$backend_image_offline" "$frontend_image_offline"

if [[ ! -f "$images_tar" ]]; then
  echo "Offline image archive not created: $images_tar" >&2
  exit 1
fi

cp "$offline_compose_src" "${output_dir}/docker-compose.offline.yml"
cp "$offline_env_example_src" "${output_dir}/.env.example"
cp "${script_dir}/Deploy-OfflineBundle.ps1" "${output_dir}/Deploy-OfflineBundle.ps1"
cp "${script_dir}/Verify-OfflineBundle.ps1" "${output_dir}/Verify-OfflineBundle.ps1"
cp "${script_dir}/Cleanup-OfflineBundle.ps1" "${output_dir}/Cleanup-OfflineBundle.ps1"
cp "${script_dir}/Start-SketchShot.cmd" "${output_dir}/Start-SketchShot.cmd"
cp "${script_dir}/Verify-SketchShot.cmd" "${output_dir}/Verify-SketchShot.cmd"
cp "${script_dir}/Cleanup-SketchShot.cmd" "${output_dir}/Cleanup-SketchShot.cmd"
cp "${script_dir}/Start-WXHB.cmd" "${output_dir}/Start-WXHB.cmd"
cp "${script_dir}/Verify-WXHB.cmd" "${output_dir}/Verify-WXHB.cmd"
cp "${script_dir}/Cleanup-WXHB.cmd" "${output_dir}/Cleanup-WXHB.cmd"
cp "${script_dir}/Deploy-OfflineBundle.sh" "${output_dir}/Deploy-OfflineBundle.sh"
cp "${script_dir}/Verify-OfflineBundle.sh" "${output_dir}/Verify-OfflineBundle.sh"
cp "${script_dir}/Cleanup-OfflineBundle.sh" "${output_dir}/Cleanup-OfflineBundle.sh"

cp "$offline_env_example_src" "${output_dir}/.env"

declare -a env_mappings=(
  "WXHB_APP_NAME:APP_NAME"
  "WXHB_DEBUG:DEBUG"
  "WXHB_BACKEND_PORT:BACKEND_PORT"
  "WXHB_FRONTEND_PORT:WEB_PORT"
  "WXHB_CORS_ORIGINS:CORS_ORIGINS"
  "WXHB_DEFAULT_ADAPTER:DEFAULT_ADAPTER"
  "WXHB_PUBLIC_BASE_URL:PUBLIC_BASE_URL"
  "WXHB_MOCK_DELAY:MOCK_DELAY"
  "WXHB_VOLCENGINE_ENABLED:VOLCENGINE_ENABLED"
  "WXHB_ARK_BASE_URL:ARK_BASE_URL"
  "WXHB_ARK_API_KEY:ARK_API_KEY"
  "WXHB_VOLCENGINE_TIMEOUT:VOLCENGINE_TIMEOUT"
  "WXHB_VOLCENGINE_REQUEST_TIMEOUT:VOLCENGINE_REQUEST_TIMEOUT"
  "WXHB_VOLCENGINE_VIDEO_TIMEOUT:VOLCENGINE_VIDEO_TIMEOUT"
  "WXHB_VOLCENGINE_POLL_INTERVAL:VOLCENGINE_POLL_INTERVAL"
  "WXHB_VOLCENGINE_PROMPT_MODEL:VOLCENGINE_PROMPT_MODEL"
  "WXHB_VOLCENGINE_IMAGE_MODEL:VOLCENGINE_IMAGE_MODEL"
  "WXHB_VOLCENGINE_IMAGE_EDIT_MODEL:VOLCENGINE_IMAGE_EDIT_MODEL"
  "WXHB_VOLCENGINE_VIDEO_MODEL:VOLCENGINE_VIDEO_MODEL"
  "WXHB_VOLCENGINE_IMAGE_OUTPUT_FORMAT:VOLCENGINE_IMAGE_OUTPUT_FORMAT"
  "WXHB_VOLCENGINE_WATERMARK:VOLCENGINE_WATERMARK"
  "WXHB_COMFYUI_ENABLED:COMFYUI_ENABLED"
  "WXHB_COMFYUI_BASE_URL:COMFYUI_BASE_URL"
  "WXHB_COMFYUI_POLL_INTERVAL:COMFYUI_POLL_INTERVAL"
  "WXHB_COMFYUI_TIMEOUT:COMFYUI_TIMEOUT"
  "WXHB_COMFYUI_NEGATIVE_PROMPT:COMFYUI_NEGATIVE_PROMPT"
)

for mapping in "${env_mappings[@]}"; do
  source_key="${mapping%%:*}"
  target_key="${mapping##*:}"
  source_value="$(get_dotenv_value_raw "$docker_env_file" "$source_key")"
  if [[ -n "$source_value" ]]; then
    if [[ "$source_key" == "WXHB_APP_NAME" && "$source_value" == "WXHB-AI-Workflow" ]]; then
      source_value="SketchShot - AI Storyboard Canvas"
    fi
    set_dotenv_value "${output_dir}/.env" "$target_key" "$source_value"
  fi
done

bundle_data_root="${output_dir}/data"
for dir_name in uploads outputs workflows; do
  target_dir="${bundle_data_root}/${dir_name}"
  mkdir -p "$target_dir"
  : > "${target_dir}/.gitkeep"
done

sha256_hash="$(sha256sum "$images_tar" | awk '{print $1}')"
cat > "${output_dir}/wxhb-images-offline.sha256.txt" <<EOF
File: wxhb-images-offline.tar
SHA256: ${sha256_hash}
EOF

cat > "${output_dir}/README_OFFLINE.txt" <<'EOF'
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
- data/: local persistent directories for uploads, outputs, workflows and engine_config.json

Windows steps:
1. Copy this bundle directory to the target machine.
2. Update .env only if you need to change ports or preseed engine defaults.
3. Double-click Start-SketchShot.cmd, or run:
   powershell -ExecutionPolicy Bypass -File .\Deploy-OfflineBundle.ps1
4. For daily use, engine settings can also be edited in the frontend toolbar and will persist in data\engine_config.json.
5. If you need a separate health check later:
   powershell -ExecutionPolicy Bypass -File .\Verify-OfflineBundle.ps1
6. If you need a clean reinstall:
   powershell -ExecutionPolicy Bypass -File .\Cleanup-OfflineBundle.ps1
   powershell -ExecutionPolicy Bypass -File .\Cleanup-OfflineBundle.ps1 -PurgeData

Linux steps:
1. Copy this bundle directory to the target machine.
2. Update .env only if you need to change ports or preseed engine defaults.
3. Start services:
   bash ./Deploy-OfflineBundle.sh
4. Engine settings can also be edited in the frontend toolbar and will persist in data/engine_config.json.
5. Verify deployment:
   bash ./Verify-OfflineBundle.sh
6. If you need a clean reinstall:
   bash ./Cleanup-OfflineBundle.sh
   bash ./Cleanup-OfflineBundle.sh --purge-data
EOF

if [[ "$zip_enabled" -eq 1 ]]; then
  zip_path="${output_dir}.zip"
  echo "[OfflinePack] Creating zip archive -> $zip_path"
  create_zip_archive "$output_dir" "$zip_path"
  echo "[OfflinePack] Zip created: $zip_path"
fi

echo "[OfflinePack] Done."
echo "Bundle dir: $output_dir"
if [[ "$zip_enabled" -eq 1 ]]; then
  echo "Bundle zip: ${output_dir}.zip"
fi
echo "Images SHA256: ${sha256_hash}"
