// Light, dark, or whatever the system says. Tailwind's dark: styles key off
// a class on <html>, so the choice here wins over the system setting.
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'platter.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // storage blocked
  }
  return 'system'
}

export function applyTheme(theme: Theme = getTheme()) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light' // form controls and scrollbars
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0a09' : '#fafaf9')
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // still applies for this visit
  }
  applyTheme(theme)
}

// follow the system while on "system"
export function watchSystemTheme() {
  media().addEventListener('change', () => getTheme() === 'system' && applyTheme('system'))
}
