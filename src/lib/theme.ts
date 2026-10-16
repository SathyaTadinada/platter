import { readChoice, writePref } from './prefs'

// Light, dark, or whatever the system says. A "light" or "dark" class on <html>
// overrides the system setting (see the dark variant in index.css).
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'platter.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export const getTheme = () => readChoice<Theme>(KEY, ['system', 'light', 'dark'], 'system')

export function applyTheme(theme: Theme = getTheme()) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = dark ? 'dark' : 'light' // form controls and scrollbars
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0a09' : '#fafaf9')
}

export function setTheme(theme: Theme) {
  writePref(KEY, theme)
  applyTheme(theme)
}

// follow the system while on "system"
export function watchSystemTheme() {
  media().addEventListener('change', () => getTheme() === 'system' && applyTheme('system'))
}
