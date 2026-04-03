#!/usr/bin/env bash
set -euo pipefail

bundle_dir='.'
timeout_sec=180
interval_sec=5

usage() {
  cat <<'EOF'
Usage:
  bash ./Verify-OfflineBundle.sh [--bundle-dir <dir>] [--timeout-sec <sec>] [--interval-sec <sec>]

Options:
  --bundle-dir <dir>     Offline bundle directory, default is current directory
  --timeout-sec <sec>    Max wait time, default 180
  --interval-sec <sec>   Poll interval, default 5
  -h, --help             Show help
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Command not found: $name" >&2
    exit 1
  fi
}

trim_quotes() {
  local value="$1"
  if [[ ${#value} -ge 2 ]]; then
    local first_char="${value:0:1}"
    local last_char="${value: -1}"
    if [[ "$first_char" == '"' && "$last_char" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$first_char" == "'" && "$last_char" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

get_dotenv_value() {
  local env_path="$1"
  local key="$2"
  local default_value="$3"

  if [[ ! -f "$env_path" ]]; then
    printf '%s' "$default_value"
    return
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$env_path" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default_value"
    return
  fi

  local value="${line#*=}"
  value="$(trim_quotes "${value#"${value%%[![:space:]]*}"}")"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

service_ready() {
  local container_name="$1"
  local require_health="$2"
  local inspect_output

  inspect_output="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_name" 2>/dev/null || true)"
  if [[ -z "$inspect_output" ]]; then
    return 1
  fi

  local status health
  status="${inspect_output%% *}"
  health="${inspect_output#* }"

  if [[ "$status" != 'running' ]]; then
    return 1
  fi

  if [[ "$require_health" == '1' && "$health" != 'healthy' ]]; then
    return 1
  fi

  return 0
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
    --timeout-sec)
      timeout_sec="${2:-}"
      shift 2
      ;;
    --interval-sec)
      interval_sec="${2:-}"
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
require_command curl

bundle_path="$(cd "$bundle_dir" && pwd)"
compose_file="${bundle_path}/docker-compose.offline.yml"
env_file="${bundle_path}/.env"
env_example="${bundle_path}/.env.example"

if [[ ! -f "$compose_file" ]]; then
  echo "Compose file not found: $compose_file" >&2
  exit 1
fi

if [[ ! -f "$env_file" && -f "$env_example" ]]; then
  cp "$env_example" "$env_file"
  echo "[OfflineVerify] Created .env from template: $env_file"
fi

required_services=(
  "wxhb-backend:1"
  "wxhb-frontend:1"
)

cd "$bundle_path"

deadline=$(( $(date +%s) + timeout_sec ))
ready=0

while [[ "$(date +%s)" -lt "$deadline" ]]; do
  all_ready=1
  for item in "${required_services[@]}"; do
    container_name="${item%%:*}"
    require_health="${item##*:}"
    if ! service_ready "$container_name" "$require_health"; then
      all_ready=0
      break
    fi
  done

  if [[ "$all_ready" -eq 1 ]]; then
    ready=1
    break
  fi

  sleep "$interval_sec"
done

if [[ "$ready" -ne 1 ]]; then
  echo '[OfflineVerify] Services are not ready before timeout. Current status:' >&2
  docker compose --env-file "$env_file" -f "$compose_file" ps
  exit 1
fi

backend_port="$(get_dotenv_value "$env_file" 'BACKEND_PORT' '8000')"
web_port="$(get_dotenv_value "$env_file" 'WEB_PORT' '8080')"
backend_url="http://localhost:${backend_port}/api/health"
web_url="http://localhost:${web_port}/"

echo "[OfflineVerify] Checking backend: $backend_url"
backend_resp="$(curl -fsS --max-time 15 "$backend_url")"
if [[ ! "$backend_resp" =~ \"status\"[[:space:]]*:[[:space:]]*\"ok\" ]]; then
  echo "Backend health check failed: $backend_resp" >&2
  exit 1
fi

echo "[OfflineVerify] Checking frontend: $web_url"
web_resp="$(curl -fsS --max-time 15 "$web_url")"
if ! printf '%s' "$web_resp" | grep -Eiq '<!doctype html|<html'; then
  echo 'Frontend check failed: response is not HTML.' >&2
  exit 1
fi

echo '[OfflineVerify] Container status:'
docker compose --env-file "$env_file" -f "$compose_file" ps

echo '[OfflineVerify] PASS'
