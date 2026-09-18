import type { CapacitorConfig } from '@capacitor/cli'

/*
 * Alpha POS owner app. The web layer is the owner build (`yarn build:owner`
 * -> dist-owner). The user agent is fixed per platform and carries no app
 * version: admin sessions are bound to the exact user agent, so an app update
 * must not sign the owner out.
 */
const config: CapacitorConfig = {
  appId: 'uz.alphapos.owner',
  appName: 'Alpha POS',
  webDir: 'dist-owner',
  backgroundColor: '#f4f7fc',
  android: {
    overrideUserAgent: 'AlphaPOS-Owner/1 (android)',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    overrideUserAgent: 'AlphaPOS-Owner/1 (ios)',
    contentInset: 'never',
    scheme: 'Alpha POS',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: '#2563eb',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
}

export default config
