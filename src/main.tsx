import './trustedTypes'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'

registerSW({ immediate: true })

// iOS can leave the page scrolled after the keyboard closes, which pushes the
// layout up. Snap back once focus leaves a text field.
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const el = document.activeElement
    if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) window.scrollTo(0, 0)
  }, 50)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
