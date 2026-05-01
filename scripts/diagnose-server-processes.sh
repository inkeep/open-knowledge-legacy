#!/usr/bin/env bash
set -u

USE_COLOR=0
if [[ -z "${NO_COLOR:-}" ]]; then
  if [[ -n "${FORCE_COLOR:-}" && "${FORCE_COLOR:-}" != "0" ]]; then
    USE_COLOR=1
  elif [[ -t 1 && "${TERM:-}" != "dumb" ]]; then
    USE_COLOR=1
  fi
fi

if [[ "$USE_COLOR" == "1" ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
  BLUE=$'\033[34m'
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
else
  BOLD=''
  DIM=''
  RESET=''
  BLUE=''
  CYAN=''
  GREEN=''
  YELLOW=''
  RED=''
fi

print_section() {
  printf '\n%s%s%s\n' "$BLUE" "========================================" "$RESET"
  printf '%s%s%s\n' "$BOLD$CYAN" "$1" "$RESET"
}

print_subsection() {
  printf '\n%s-- %s --%s\n' "$BOLD" "$1" "$RESET"
}

print_label() {
  printf '%s%s:%s ' "$BOLD" "$1" "$RESET"
}

print_note() {
  printf '%s%s%s\n' "$DIM" "$1" "$RESET"
}

print_missing() {
  printf '%s%s not found%s\n' "$YELLOW" "$1" "$RESET"
}

print_found_path() {
  printf '%s--- %s%s\n' "$GREEN" "$1" "$RESET"
}

run_or_note() {
  local cmd="$1"
  shift

  if ! command -v "$cmd" >/dev/null 2>&1; then
    print_missing "$cmd"
    return 0
  fi

  "$cmd" "$@"
}

SUSPECT_PIDS=()
LOCK_FILES=()

add_suspect_pid() {
  local pid="$1"

  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  if ((${#SUSPECT_PIDS[@]} > 0)); then
    local existing
    for existing in "${SUSPECT_PIDS[@]}"; do
      if [[ "$existing" == "$pid" ]]; then
        return 0
      fi
    done
  fi

  SUSPECT_PIDS+=("$pid")
}

add_pids_from_table() {
  local pid

  while read -r pid _; do
    [[ "$pid" == "PID" ]] && continue
    add_suspect_pid "$pid"
  done
}

add_pids_from_lsof_table() {
  local command pid

  while read -r command pid _; do
    [[ "$pid" == "PID" ]] && continue
    add_suspect_pid "$pid"
  done
}

add_lock_file() {
  local file="$1"

  [[ -n "$file" ]] || return 0

  local existing
  if ((${#LOCK_FILES[@]} > 0)); then
    for existing in "${LOCK_FILES[@]}"; do
      if [[ "$existing" == "$file" ]]; then
        return 0
      fi
    done
  fi

  LOCK_FILES+=("$file")
}

add_lock_files_for_dir() {
  local dir="$1"

  [[ -n "$dir" ]] || return 0

  add_lock_file "$dir/.ok/server.lock"
  add_lock_file "$dir/.open-knowledge/server.lock"
}

pid_cwd() {
  local pid="$1"

  [[ "$pid" =~ ^[0-9]+$ ]] || return 0

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -p "$pid" -a -d cwd -Fn 2>/dev/null | awk '
      /^n/ {
        print substr($0, 2)
        exit
      }
    '
  fi
}

read_lock_number() {
  local file="$1"
  local key="$2"

  [[ -f "$file" ]] || return 0

  awk -v key="\"$key\"" -F: '
    index($1, key) {
      gsub(/[^0-9]/, "", $2)
      print $2
      exit
    }
  ' "$file" 2>/dev/null
}

add_lock_pid() {
  local file="$1"
  local pid

  pid="$(read_lock_number "$file" pid)"
  add_suspect_pid "$pid"
}

discover_lock_files_from_suspect_cwds() {
  local pid cwd

  if ((${#SUSPECT_PIDS[@]} == 0)); then
    return 0
  fi

  for pid in "${SUSPECT_PIDS[@]}"; do
    cwd="$(pid_cwd "$pid")"
    if [[ -n "$cwd" ]]; then
      add_lock_files_for_dir "$cwd"
    fi
  done
}

print_lock_health() {
  local file="$1"

  [[ -f "$file" ]] || return 0

  local pid port port_owners
  pid="$(read_lock_number "$file" pid)"
  port="$(read_lock_number "$file" port)"

  printf '%s%s:%s ' "$BOLD" "$file" "$RESET"

  if [[ -z "$pid" && -z "$port" ]]; then
    printf '%scould not parse pid/port%s\n' "$YELLOW" "$RESET"
    return 0
  fi

  if [[ -n "$pid" ]]; then
    if ps -p "$pid" >/dev/null 2>&1; then
      printf 'pid=%s(%slive%s)' "$pid" "$GREEN" "$RESET"
    else
      printf 'pid=%s(%sdead%s)' "$pid" "$RED" "$RESET"
    fi
  else
    printf 'pid=%smissing%s' "$YELLOW" "$RESET"
  fi

  if [[ -n "$port" ]]; then
    if command -v lsof >/dev/null 2>&1; then
      port_owners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ',' | sed 's/,$//')"
      if [[ -n "$port_owners" ]]; then
        printf ' port=%s(%sLISTEN pid=%s%s)' "$port" "$GREEN" "$port_owners" "$RESET"
      else
        printf ' port=%s(%snot listening%s)' "$port" "$YELLOW" "$RESET"
      fi
    else
      printf ' port=%s(%slsof unavailable%s)' "$port" "$YELLOW" "$RESET"
    fi
  else
    printf ' port=%smissing%s' "$YELLOW" "$RESET"
  fi

  printf '\n'
}

filter_listening_lines() {
  awk '
    BEGIN {
      pattern = "open-knowledge|(^|[[:space:]])ok([[:space:]]|$)|ok start|ok mcp|(^|[[:space:]/])bun([[:space:]/]|$)|(^|[[:space:]/])node([[:space:]/]|$)|vite|hocuspocus|(^|[[:space:]/])mcp([[:space:]/]|$)|5173|5174|3000|3001"
    }
    NR == 1 || $0 ~ pattern { print }
  '
}

filter_process_lines() {
  awk '
    BEGIN {
      include = "cli\\.mjs|(^|[[:space:]/])(open-knowledge|ok)[[:space:]]+(start|mcp|ui)($|[[:space:]])|(^|[[:space:]/])bun([[:space:]/]|$).*(run dev|packages/app|vite|hocuspocus)|(^|[[:space:]/])node([[:space:]/]|$).*(packages/(cli|app)|vite|hocuspocus)"
      exclude = "diagnose-server-processes|bun run diagnose:processes|awk"
    }
    NR == 1 || ($0 ~ include && $0 !~ exclude) { print }
  '
}

inspect_pid() {
  local pid="$1"

  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    printf '%sSkipping non-numeric PID:%s %s\n' "$YELLOW" "$RESET" "$pid"
    return 0
  fi

  print_subsection "PID $pid"
  printf '%sprocess:%s\n' "$BOLD" "$RESET"
  ps -p "$pid" -o pid,ppid,pgid,sess,tty,stat,etime,command 2>/dev/null || {
    printf '%sPID %s is not running%s\n' "$YELLOW" "$pid" "$RESET"
    return 0
  }

  printf '%sfiles/ports:%s\n' "$BOLD" "$RESET"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -p "$pid" 2>/dev/null | awk '
      NR == 1 ||
      $4 == "cwd" ||
      $4 == "txt" ||
      /LISTEN/ ||
      /server\.lock/ ||
      /\.ok/ ||
      /\.open-knowledge/
    ' || true
  else
    print_missing lsof
  fi

  local ppid
  ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
  if [[ -n "$ppid" ]]; then
    printf '%sparent:%s\n' "$BOLD" "$RESET"
    ps -p "$ppid" -o pid,ppid,pgid,sess,tty,stat,etime,command 2>/dev/null || true
  fi

  printf '%schildren:%s\n' "$BOLD" "$RESET"
  ps -axo pid,ppid,pgid,sess,tty,stat,etime,command | awk -v ppid="$pid" '
    NR == 1 { print; next }
    $2 == ppid { print; found = 1 }
    END {
      if (!found) {
        print "  (none)"
      }
    }
  '
}

print_section "Capture plan"
printf '%sCapture this output:%s\n' "$BOLD" "$RESET"
printf '  %s1.%s before pressing Ctrl+C in the terminal running Open Knowledge,\n' "$CYAN" "$RESET"
printf '  %s2.%s immediately after pressing Ctrl+C,\n' "$CYAN" "$RESET"
printf '  %s3.%s 30 seconds later.\n\n' "$CYAN" "$RESET"
printf '%sOn macOS, Ctrl+C interrupts a terminal process. Cmd+C usually copies text.%s\n' "$YELLOW" "$RESET"
print_note "This command is read-only; it does not kill or restart anything."

print_section "System snapshot"
print_subsection "Environment"
date
print_label pwd
printf '%s\n' "$PWD"
print_label "repo root"
git rev-parse --show-toplevel 2>/dev/null || true
print_label bun
run_or_note bun --version 2>/dev/null || true
print_label node
run_or_note node --version 2>/dev/null || true

print_subsection "Listening TCP ports"
if command -v lsof >/dev/null 2>&1; then
  LISTENING_SNAPSHOT="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | filter_listening_lines || true)"
  printf '%s\n' "$LISTENING_SNAPSHOT"
  add_pids_from_lsof_table <<<"$LISTENING_SNAPSHOT"
else
  print_missing lsof
fi

print_subsection "Relevant processes"
PROCESS_SNAPSHOT="$(ps -axo pid,ppid,pgid,sess,tty,stat,etime,command | filter_process_lines || true)"
printf '%s\n' "$PROCESS_SNAPSHOT"
add_pids_from_table <<<"$PROCESS_SNAPSHOT"

print_section "Project state"
add_lock_files_for_dir "$PWD"
discover_lock_files_from_suspect_cwds

print_subsection "OK state directories"
for dir in .ok .open-knowledge; do
  if [[ -d "$dir" ]]; then
    print_found_path "$dir"
    ls -la "$dir" 2>/dev/null || true
  else
    print_missing "$dir"
  fi
done

print_subsection "Discovered server lock files"
if ((${#LOCK_FILES[@]} == 0)); then
  print_note "No server lock paths discovered."
fi

for file in "${LOCK_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    print_found_path "$file"
    sed 's/^/  /' "$file"
    printf '\n'
    add_lock_pid "$file"
  else
    print_missing "$file"
  fi
done

print_subsection "Server lock health"
for file in "${LOCK_FILES[@]}"; do
  print_lock_health "$file"
done

print_section "Process relationships"
print_subsection "MCP-ish process parentage"
if command -v pgrep >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    add_suspect_pid "$pid"
    printf '%s--- MCP-ish PID %s%s\n' "$GREEN" "$pid" "$RESET"
    ps -p "$pid" -o pid,ppid,pgid,sess,tty,stat,etime,command 2>/dev/null || true
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
    if [[ -n "$ppid" ]]; then
      printf '%sParent:%s\n' "$BOLD" "$RESET"
      ps -p "$ppid" -o pid,ppid,pgid,sess,tty,stat,etime,command 2>/dev/null || true
    fi
  done < <(pgrep -f 'cli\.mjs mcp|(^|[ /])(open-knowledge|ok)[[:space:]]+mcp([[:space:]]|$)' 2>/dev/null || true)
else
  print_missing pgrep
fi

for pid in "$@"; do
  add_suspect_pid "$pid"
done

print_section "PID details"
if ((${#SUSPECT_PIDS[@]} == 0)); then
  print_note "No suspect PIDs were found. You can still pass explicit PIDs:"
  printf '  %sbun run diagnose:processes -- <pid> [more-pids...]%s\n' "$CYAN" "$RESET"
else
  print_note "Inspecting deduped PIDs from listening ports, OK processes, MCP processes, server locks, and any explicit arguments."
  for pid in "${SUSPECT_PIDS[@]}"; do
    inspect_pid "$pid"
  done
fi
