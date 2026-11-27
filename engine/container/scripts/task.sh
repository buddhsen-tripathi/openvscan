#!/bin/sh
# Start a long command detached from the request that started it.
#   task.sh <task-dir> <cmd> [args...]
# Returns once the detached runner has recorded itself, so a launch failure
# (bad cwd, missing binary) is reported to the caller instead of looking like
# a task that never finishes. The runner writes <task-dir>/pid
# ("<pid> <boot_id>"), stdout/stderr logs, and <task-dir>/exit-code atomically
# on exit. Output goes to files, not pipes: a piped process gets SIGPIPE once
# the starting request ends.
dir=$1; shift
[ -d "$PWD" ] || { echo "task.sh: working directory missing" >&2; exit 1; }
command -v "$1" >/dev/null 2>&1 || { echo "task.sh: $1: command not found" >&2; exit 127; }
mkdir -p "$dir" || exit 1
rm -f "$dir/pid" "$dir/exit-code" "$dir/exit-code.tmp"

setsid sh -c '
  dir=$0
  echo "$$ $(cat /proc/sys/kernel/random/boot_id)" >"$dir/pid.tmp" && mv "$dir/pid.tmp" "$dir/pid"
  "$@" >"$dir/stdout.log" 2>"$dir/stderr.log" </dev/null
  echo "$?" >"$dir/exit-code.tmp" && mv "$dir/exit-code.tmp" "$dir/exit-code"
' "$dir" "$@" </dev/null >/dev/null 2>&1 &

i=0
while [ ! -s "$dir/pid" ]; do
  i=$((i + 1))
  [ "$i" -gt 100 ] && { echo "task.sh: runner did not start" >&2; exit 1; }
  sleep 0.1
done
