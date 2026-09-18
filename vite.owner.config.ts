import { fileURLToPath } from 'node:url'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import DefineOptions from 'unplugin-vue-define-options'
import { defineConfig, loadEnv } from 'vite'
import vuetify from 'vite-plugin-vuetify'
import { alphaPaletteBackgrounds, alphaPaletteStyles } from './src/config/palettes'

/*
 * Owner mobile app (Capacitor). Same source tree and design system as the
 * admin panel, but its own entry (src/owner/index.html), router and output
 * (dist-owner). Run with `--mode owner` so `.env.owner` bakes the API host.
 */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('./'), ['VITE_', ''])
  const backendHost = env.VITE_BACKEND_HOST || 'http://127.0.0.1:8000'

  return {
    root: here('./src/owner'),
    envDir: here('./'),
    publicDir: here('./public'),
    base: './',
    plugins: [
      {
        name: 'alpha-owner-palette',
        transformIndexHtml(html) {
          return html
            .replace('__ALPHA_PALETTE_STYLES__', alphaPaletteStyles())
            .replace('__ALPHA_PALETTE_BACKGROUNDS__', JSON.stringify(alphaPaletteBackgrounds()))
        },
      },
      vue(),
      vuetify({
        styles: {
          configFile: here('./src/styles/variables/_vuetify.scss'),
        },
      }),
      Components({
        dirs: [here('./src/@core/components')],
        dts: false,
      }),
      AutoImport({
        imports: ['vue', 'vue-router', '@vueuse/core', 'vue-i18n', 'pinia'],
        dirs: [here('./src/composables')],
        vueTemplate: true,
        dts: false,
      }),
      VueI18nPlugin({
        runtimeOnly: true,
        compositionOnly: true,
        include: [here('./src/plugins/i18n/locales/**')],
      }),
      DefineOptions.vite(),
    ],
    define: { 'process.env': {} },
    resolve: {
      alias: {
        '@': here('./src'),
        '@themeConfig': here('./src/config/theme.ts'),
        '@core': here('./src/@core'),
        '@layouts': here('./src/@layouts'),
        '@images': here('./src/assets/images/'),
        '@styles': here('./src/styles/'),
        '@configured-variables': here('./src/styles/variables/_template.scss'),
      },
    },
    build: {
      outDir: here('./dist-owner'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 5000,
      target: ['es2020', 'safari15', 'chrome90'],
    },
    server: {
      port: 5182,
      proxy: {
        '/api': {
          target: backendHost,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['vuetify'],
      entries: ['./**/*.vue'],
    },
  }
})
