#!/bin/sh
# Exit 0 while the task recorded in <task-dir>/pid is alive in THIS instance.
read -r pid boot <"$1/pid" &&
  [ "$boot" = "$(cat /proc/sys/kernel/random/boot_id)" ] &&
  kill -0 "$pid"
