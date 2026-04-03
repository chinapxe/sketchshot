#!/usr/bin/env bash
set -euo pipefail

bundle_dir='.'
purge_data=0

usage() {
  cat <<'EOF'
Usage:
  bash ./Cleanup-OfflineBundle.sh [--bundle-dir <dir>] [--purge-data]

Options:
  --bundle-dir <dir>   Offline bundle directory, default is current directory
  --purge-data         Remove local data directories as well
  -h, --help           Show help
EOF
}

assert_child_path() {
  local root_path target_path
  root_path="$(cd "$1" && pwd)"
  target_path="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"

  case "$target_path" in
    "$root_path"/*) ;;
    *)
      echo "Target path is outside bundle root: $target_path" >&2
      exit 1
      ;;
  esac
}

clear_directory_contents() {
  local directory_path="$1"
  if [[ ! -d "$directory_path" ]]; then
    return
  fi

  find "$directory_path" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
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
    --purge-data)
      purge_data=1
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

bundle_path="$(cd "$bundle_dir" && pwd)"
compose_file="${bundle_path}/docker-compose.offline.yml"
env_file="${bundle_path}/.env"
data_root="${bundle_path}/data"

if [[ ! -f "$compose_file" ]]; then
  echo "Offline compose file not found: $compose_file" >&2
  exit 1
fi

cd "$bundle_path"

echo '[Cleanup] Stopping and removing containers...'
docker compose --env-file "$env_file" -f "$compose_file" down 2>/dev/null || true

echo '[Cleanup] Removing offline images...'
for img in \
  wxhb-backend:offline \
  wxhb-frontend:offline \
  localhost/wxhb-backend:offline \
  localhost/wxhb-frontend:offline
do
  docker rmi "$img" 2>/dev/null || true
done

if [[ "$purge_data" -eq 1 ]]; then
  echo '[Cleanup] Purging bundle data directories...'
  for dir in uploads outputs workflows; do
    target_dir="${data_root}/${dir}"
    mkdir -p "$target_dir"
    assert_child_path "$bundle_path" "$target_dir"
    clear_directory_contents "$target_dir"
  done
  echo '[Cleanup] Data directories cleaned.'
else
  echo '[Cleanup] Data directories kept. Use --purge-data to remove local runtime data.'
fi

echo '[Cleanup] Done.'
