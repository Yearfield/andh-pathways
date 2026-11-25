#!/usr/bin/env bash
set -eu
APP=com.yearfield.jadpocketdoc
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -n "$APP/.MainActivity"
rc=0; .github/scripts/watch-selftest.sh "adb logcat -d" "adb exec-out screencap -p > %s" out/android || rc=$?
adb logcat -d -s Capacitor:* Capacitor/Console:* AndroidRuntime:* ActivityManager:I | grep -i "jadpocketdoc\|capacitor\|SELFTEST" | tail -80 || true
exit $rc
