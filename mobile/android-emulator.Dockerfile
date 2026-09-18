# Headless Android emulator for launching the owner APK locally (needs /dev/kvm).
FROM alphapos-android-build:36
RUN apt-get update && apt-get install -y --no-install-recommends libpulse0 libgl1 libnss3 libxcomposite1 libxcursor1 libxi6 libxtst6 libasound2t64 libxdamage1 libxrandr2 libdrm2 libgbm1 libxkbfile1 \
 && rm -rf /var/lib/apt/lists/* \
 && sdkmanager --install "emulator" "system-images;android-35;google_apis;x86_64" > /dev/null \
 && echo no | avdmanager create avd -n owner -k "system-images;android-35;google_apis;x86_64" -d pixel_7 > /dev/null \
 && chmod -R a+rwX $ANDROID_HOME /root
ENV PATH=$PATH:$ANDROID_HOME/emulator
