#!/usr/bin/env bash
# Boot a headless emulator (needs /dev/kvm), install the debug APK, launch the
# owner app and save screenshots to $1 (default: mobile/emulator-shots).
set -euo pipefail
cd "$(dirname "$0")/.."
out="$(realpath -m "${1:-mobile/emulator-shots}")"
mkdir -p "$out"
apk=android/app/build/outputs/apk/debug/app-debug.apk
[[ -f "$apk" ]] || { echo "build the APK first: mobile/build-android.sh" >&2; exit 1; }

docker run --rm --device /dev/kvm -e HOME=/root \
  -v "$PWD/$apk:/app.apk:ro" -v "$out:/shots" alphapos-android-emu:35 bash -c '
set -e
emulator -avd owner -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot > /tmp/emu.log 2>&1 &
adb wait-for-device
for i in $(seq 1 120); do [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" == 1 ]] && break; sleep 2; done
adb shell settings put global window_animation_scale 0
adb install -r /app.apk > /dev/null
adb shell am start -W -n uz.alphapos.owner/.MainActivity > /dev/null
sleep 12
adb exec-out screencap -p > /shots/01-launch.png
adb logcat -d -s Capacitor:* Capacitor/Console:* chromium:* AndroidRuntime:E > /shots/logcat.txt || true
adb shell pidof uz.alphapos.owner > /shots/pid.txt || echo "not running" > /shots/pid.txt
'
ls -la "$out"
