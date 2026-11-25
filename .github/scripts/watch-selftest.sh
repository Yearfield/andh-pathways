#!/usr/bin/env bash
# Follows the app's self-test output (store/selftest.js) in a native log and takes a screenshot at each "SHOT" line.
#   watch-selftest.sh <dump-log-command> <screenshot-command-with-%s-for-the-file> <out-dir>
set -u
LOGCMD="$1"; SHOTCMD="$2"; OUT="$3"; mkdir -p "$OUT"; taken=""
for i in $(seq 1 180); do
  bash -c "$LOGCMD" 2>/dev/null | grep -o 'SELFTEST .*' > "$OUT/selftest.txt" || true
  for s in $(grep -o 'SELFTEST SHOT [a-z-]*' "$OUT/selftest.txt" | awk '{print $3}'); do
    case " $taken " in *" $s "*) ;; *) sleep 2; bash -c "$(printf "$SHOTCMD" "$OUT/$s.png")"; taken="$taken $s";; esac
  done
  grep -q 'SELFTEST DONE' "$OUT/selftest.txt" && break
  sleep 1
done
cat "$OUT/selftest.txt"
grep -q 'SELFTEST DONE pass=[1-9][0-9]* fail=0' "$OUT/selftest.txt"
