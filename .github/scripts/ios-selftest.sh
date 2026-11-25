#!/usr/bin/env bash
set -eu
APP=com.yearfield.jadpathways
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for k in sorted(d, reverse=True) if 'iOS' in k for x in d[k] if x['name'].startswith('iPhone')))")
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" build/Build/Products/Debug-iphonesimulator/App.app
mkdir -p out/ios
xcrun simctl launch --console-pty "$UDID" "$APP" > out/ios/console.txt 2>&1 &
.github/scripts/watch-selftest.sh "cat out/ios/console.txt" "xcrun simctl io $UDID screenshot %s" out/ios
