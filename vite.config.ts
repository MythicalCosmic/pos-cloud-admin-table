import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import DefineOptions from 'unplugin-vue-define-options'
import { defineConfig, loadEnv } from 'vite'
import Pages from 'vite-plugin-pages'
import Layouts from 'vite-plugin-vue-layouts'
import vuetify from 'vite-plugin-vuetify'
import { alphaPaletteBackgrounds, alphaPaletteStyles } from './src/config/palettes'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Loads VITE_BACKEND_HOST (and any other VITE_* / non-VITE vars matched by
  // the third arg) from .env / .env.local at config time. Used only for the
  // dev-server proxy target — never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), ['VITE_', ''])
  const backendHost = env.VITE_BACKEND_HOST || 'http://127.0.0.1:8000'

  return {
    plugins: [
      {
        name: 'alpha-startup-copy',
        transformIndexHtml(html) {
          // The pre-Vue loader uses the same translation source as the app.
          const messages = Object.fromEntries(['en', 'ru', 'uz'].map(locale => {
            const source = JSON.parse(readFileSync(new URL(`./src/plugins/i18n/locales/${locale}.json`, import.meta.url), 'utf8'))
            return [locale, Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith('app_loader_')))]
          }))

          return html
            .replace('__ALPHA_STARTUP_MESSAGES__', JSON.stringify(messages).replace(/</g, '\\u003c'))
            .replace('__ALPHA_PALETTE_STYLES__', alphaPaletteStyles())
            .replace('__ALPHA_PALETTE_BACKGROUNDS__', JSON.stringify(alphaPaletteBackgrounds()))
        },
      },
      vue(),
      vueJsx(),

      // https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vite-plugin
      vuetify({
        styles: {
          configFile: 'src/styles/variables/_vuetify.scss',
        },
      }),
      Pages({
        dirs: ['./src/pages'],
        extensions: ['vue'],
      }),
      Layouts({
        layoutsDirs: './src/layouts/',
        exclude: ['**/components/**'],
      }),
      Components({
        dirs: ['src/@core/components'],
        dts: 'src/types/generated/components.d.ts',
      }),
      AutoImport({
        imports: ['vue', 'vue-router', '@vueuse/core', 'vue-i18n', 'pinia'],
        dirs: ['src/composables'],
        vueTemplate: true,
        dts: 'src/types/generated/auto-imports.d.ts',
      }),
      VueI18nPlugin({
        runtimeOnly: true,
        compositionOnly: true,
        include: [
          fileURLToPath(new URL('./src/plugins/i18n/locales/**', import.meta.url)),
        ],
      }),
      DefineOptions.vite(),
    ],
    define: { 'process.env': {} },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@themeConfig': fileURLToPath(new URL('./src/config/theme.ts', import.meta.url)),
        '@core': fileURLToPath(new URL('./src/@core', import.meta.url)),
        '@layouts': fileURLToPath(new URL('./src/@layouts', import.meta.url)),
        '@images': fileURLToPath(new URL('./src/assets/images/', import.meta.url)),
        '@styles': fileURLToPath(new URL('./src/styles/', import.meta.url)),
        '@configured-variables': fileURLToPath(new URL('./src/styles/variables/_template.scss', import.meta.url)),

        // NOTE: `@axios` alias removed — it collided with the npm package name `axios`
        // and eslint-plugin-import kept auto-rewriting `from 'axios'` to `from '@axios'`,
        // creating a circular import. Use `@/plugins/axios` instead.
      },
    },
    build: {
      chunkSizeWarningLimit: 5000,
    },
    server: {
      port: 5181,
      proxy: {
        '/api': {
          target: backendHost,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['vuetify'],
      entries: [
        './src/**/*.vue',
      ],
    },
  }
})
