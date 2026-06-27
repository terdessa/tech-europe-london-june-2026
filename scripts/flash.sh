#!/usr/bin/env bash
# Flash service manager — start / stop / restart / status for all four services.
#
#   ./scripts/flash.sh start      # start everything (P2, n8n, Face, Agent)
#   ./scripts/flash.sh stop       # stop everything (+ kill stray bot browsers)
#   ./scripts/flash.sh restart    # stop then start
#   ./scripts/flash.sh status     # show health of each service
#
# Logs: ./logs/<name>.log   PIDs: ./logs/<name>.pid
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

# name | port | health-path | working-dir (relative) | start command
SERVICES=(
  "p2|3000|/health|.|npm run dev"
  "n8n|5678|/healthz|.|npm run n8n:start"
  "face|3001|/|face|npm run dev -- -p 3001"
  "agent|8001|/health|agent|npm start"
)

c_green() { printf "\033[32m%s\033[0m" "$1"; }
c_red()   { printf "\033[31m%s\033[0m" "$1"; }
c_dim()   { printf "\033[2m%s\033[0m" "$1"; }

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

is_up() {
  local port="$1" path="$2"
  curl -s -o /dev/null --max-time 2 "http://localhost:${port}${path}"
}

start_one() {
  local name="$1" port="$2" path="$3" dir="$4" cmd="$5"
  if is_up "$port" "$path"; then
    echo "  $(c_dim "•") $name already up on :$port"
    return
  fi
  kill_port "$port"  # clear anything half-bound
  ( cd "$ROOT/$dir" && nohup bash -lc "$cmd" >"$LOGS/$name.log" 2>&1 </dev/null & echo $! >"$LOGS/$name.pid" )
  printf "  starting %s on :%s" "$name" "$port"
  # n8n needs ~25s to migrate + register webhooks; others are quick.
  local tries=40
  for ((i=1; i<=tries; i++)); do
    if is_up "$port" "$path"; then echo " … $(c_green ok)"; return; fi
    printf "."
    sleep 1
  done
  echo " … $(c_red 'not healthy yet') (see logs/$name.log)"
}

stop_one() {
  local name="$1" port="$2"
  kill_port "$port"
  rm -f "$LOGS/$name.pid"
}

cmd_start() {
  echo "Starting Flash services…"
  for s in "${SERVICES[@]}"; do
    IFS='|' read -r name port path dir cmd <<<"$s"
    start_one "$name" "$port" "$path" "$dir" "$cmd"
  done
  echo "Logs: $LOGS/<name>.log"
}

cmd_stop() {
  echo "Stopping Flash services…"
  for s in "${SERVICES[@]}"; do
    IFS='|' read -r name port path dir cmd <<<"$s"
    stop_one "$name" "$port"
    echo "  stopped $name (:$port)"
  done
  # tsx spawns parent+child; n8n spawns task-broker/runners; the bot spawns Chromium.
  pkill -f 'tsx watch src/server.ts' 2>/dev/null || true
  pkill -f 'agent/.*src/index.ts' 2>/dev/null || true
  pkill -f 'src/index.ts' 2>/dev/null || true
  pkill -f 'next dev' 2>/dev/null || true
  pkill -f 'n8n-local' 2>/dev/null || true
  pkill -f 'ms-playwright.*[Cc]hromium' 2>/dev/null || true
  kill_port 5679 # n8n task broker
  echo "Done."
}

cmd_status() {
  echo "Flash service status:"
  for s in "${SERVICES[@]}"; do
    IFS='|' read -r name port path dir cmd <<<"$s"
    if is_up "$port" "$path"; then
      echo "  $(c_green '● up  ') $name  http://localhost:$port"
    else
      echo "  $(c_red '○ down') $name  (:$port)"
    fi
  done
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; echo; cmd_start ;;
  status)  cmd_status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
