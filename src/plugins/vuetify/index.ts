import { useI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'

// Vuetify ships en + ru; no built-in Uzbek pack, so we use en for uz.
import { en, ru } from 'vuetify/locale'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { VBtn } from 'vuetify/components/VBtn'
import { VDataTable, VDataTableServer } from 'vuetify/labs/VDataTable'
import { VSkeletonLoader } from 'vuetify/labs/VSkeletonLoader'
import defaults from './defaults'
import { icons } from './icons'
import theme from './theme'
import i18n from '@/plugins/i18n'

// Styles
import '@core/scss/template/libs/vuetify/index.scss'
import 'vuetify/styles'

// Inject Vuetify's built-in locale messages under a `$vuetify` namespace
// so its components ("No data available", "Items per page:", etc.) translate
// alongside our app strings.
// Uzbek overrides for the most user-visible Vuetify strings.
// Inherits English for anything we don't override.
const uzOverrides = {
  ...en,
  noDataText: 'Ma\'lumotlar mavjud emas',
  loading: 'Yuklanmoqda...',
  dataIterator: { loadingText: 'Yuklanmoqda...', noResultsText: 'Hech narsa topilmadi' },
  dataTable: {
    ...en.dataTable,
    itemsPerPageText: 'Sahifada:',
    sortBy: 'Saralash',
    ariaLabel: { ...en.dataTable.ariaLabel },
  },
  dataFooter: {
    ...en.dataFooter,
    itemsPerPageText: 'Sahifada:',
    itemsPerPageAll: 'Barchasi',
    pageText: '{0}-{1} / {2}',
    firstPage: 'Birinchi sahifa',
    prevPage: 'Oldingi sahifa',
    nextPage: 'Keyingi sahifa',
    lastPage: 'Oxirgi sahifa',
  },
  pagination: {
    ...en.pagination,
    ariaLabel: { ...en.pagination.ariaLabel, page: 'Sahifa {0}' },
  },
}

const vuetifyLocales: Record<string, any> = { en, ru, uz: uzOverrides }
for (const [code, pack] of Object.entries(vuetifyLocales)) {
  const existing = (i18n.global.getLocaleMessage(code) as any) || {}

  i18n.global.setLocaleMessage(code, { ...existing, $vuetify: pack })
}

export default createVuetify({
  aliases: {
    IconBtn: VBtn,
  },
  components: {
    VDataTable,
    VDataTableServer,
    VSkeletonLoader,
  },
  defaults,
  icons,
  theme,
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
})
