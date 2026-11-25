#!/usr/bin/env bash
set -eu
APP=com.yearfield.jadpocketdoc
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -n "$APP/.MainActivity"
.github/scripts/watch-selftest.sh "adb logcat -d" "adb exec-out screencap -p > %s" out/android
