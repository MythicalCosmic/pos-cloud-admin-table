import { isDarkPreferred } from '@core/composable/useThemeConfig'
import { themeConfig } from '@themeConfig'

export const resolveVuetifyTheme = () => {
  // The design topbar writes to 'alphapos-theme' (matches the handoff bundle's
  // bootstrap script). Read that first so the Vuetify theme stays in sync
  // with the data-theme attr set pre-paint in index.html.
  const designTheme = localStorage.getItem('alphapos-theme')
  if (designTheme === 'dark' || designTheme === 'light')
    return designTheme

  const storedTheme = localStorage.getItem(`${themeConfig.app.title}-theme`) || themeConfig.app.theme.value

  return storedTheme === 'system'
    ? isDarkPreferred.value
      ? 'dark'
      : 'light'
    : storedTheme
}
