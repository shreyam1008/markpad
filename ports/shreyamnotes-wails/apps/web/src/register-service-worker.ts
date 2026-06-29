export function registerServiceWorker(): void {
  const maybeWailsWindow = window as typeof window & {
    runtime?: unknown
    go?: unknown
  }
  if (
    maybeWailsWindow.runtime ||
    maybeWailsWindow.go ||
    !('serviceWorker' in navigator) ||
    window.location.protocol === 'file:'
  ) {
    return
  }
  window.addEventListener('load', () => {
    // Relative URL keeps the scope aligned with prefixed deployments.
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}
