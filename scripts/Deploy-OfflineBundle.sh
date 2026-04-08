#!/usr/bin/env bash
set -euo pipefail

bundle_dir='.'

usage() {
  cat <<'EOF'
Usage:
  bash ./Deploy-OfflineBundle.sh [--bundle-dir <dir>]

Options:
  --bundle-dir <dir>   Offline bundle directory, default is current directory
  -h, --help           Show help
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Command not found: $name" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-dir)
      bundle_dir="${2:-}"
      if [[ -z "$bundle_dir" ]]; then
        echo "--bundle-dir requires a value" >&2
        exit 1
      fi
      shift 2
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

require_command docker

bundle_path="$(cd "$bundle_dir" && pwd)"
images_tar="${bundle_path}/wxhb-images-offline.tar"
compose_file="${bundle_path}/docker-compose.offline.yml"
env_example="${bundle_path}/.env.example"
env_file="${bundle_path}/.env"
data_root="${bundle_path}/data"

if [[ ! -f "$images_tar" ]]; then
  echo "Offline images archive not found: $images_tar" >&2
  exit 1
fi

if [[ ! -f "$compose_file" ]]; then
  echo "Offline compose file not found: $compose_file" >&2
  exit 1
fi

if [[ ! -f "$env_file" && -f "$env_example" ]]; then
  cp "$env_example" "$env_file"
  echo "[OfflineDeploy] Created .env from template: $env_file"
fi

mkdir -p "${data_root}/uploads" "${data_root}/outputs" "${data_root}/workflows"

cd "$bundle_path"

echo '[OfflineDeploy] Loading docker images...'
docker load -i "$images_tar"

echo '[OfflineDeploy] Starting services...'
docker compose --env-file "$env_file" -f "$compose_file" up -d

echo '[OfflineDeploy] Current status:'
docker compose --env-file "$env_file" -f "$compose_file" ps

echo '[OfflineDeploy] Done.'
