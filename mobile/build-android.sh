#!/usr/bin/env bash
# Build the owner app for Android inside Docker.
#   mobile/build-android.sh            debug APK (install on a phone)
#   mobile/build-android.sh release    release AAB (needs OWNER_KEYSTORE_* env)
set -euo pipefail
cd "$(dirname "$0")/.."

kind="${1:-debug}"
image="alphapos-android-build:36"

node node_modules/vite/bin/vite.js build --config vite.owner.config.ts --mode owner
npx --no-install cap sync android

docker build -q -t "$image" -f mobile/android-build.Dockerfile mobile > /dev/null

env_args=()
for name in OWNER_VERSION_CODE OWNER_VERSION_NAME OWNER_KEYSTORE_PASSWORD OWNER_KEY_ALIAS OWNER_KEY_PASSWORD; do
  [[ -n "${!name:-}" ]] && env_args+=(-e "$name")
done
mkdir -p "$HOME/.cache/alphapos-gradle"
mounts=(-v "$PWD:/work" -v "$HOME/.cache/alphapos-gradle:/gradle-cache")
if [[ -n "${OWNER_KEYSTORE_PATH:-}" ]]; then
  mounts+=(-v "$(realpath "$OWNER_KEYSTORE_PATH"):/keystore/owner.jks:ro")
  env_args+=(-e OWNER_KEYSTORE_PATH=/keystore/owner.jks)
fi

task=assembleDebug
[[ "$kind" == release ]] && task=bundleRelease

docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp "${mounts[@]}" "${env_args[@]}" "$image" \
  ./gradlew --no-daemon -q "$task"

if [[ "$kind" == release ]]; then
  ls -la android/app/build/outputs/bundle/release/*.aab
else
  ls -la android/app/build/outputs/apk/debug/*.apk
fi
