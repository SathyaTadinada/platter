// If the app script fails to load, the page is usually stale from before an
// update and points at files that no longer exist. Reload once to fix it.
window.addEventListener(
  'error',
  function (e) {
    var t = e.target
    if (!t || t.tagName !== 'SCRIPT') return
    try {
      if (sessionStorage.getItem('platter.reloaded')) return
      sessionStorage.setItem('platter.reloaded', '1')
    } catch (_) {
      return
    }
    location.reload()
  },
  true,
)
