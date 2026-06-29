import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'

const App = lazy(async () => {
  const module = await import('./App')
  return { default: module.default }
})

const FloatingNoteApp = lazy(async () => {
  const module = await import('./components/FloatingNoteApp')
  return { default: module.FloatingNoteApp }
})

const QuickCaptureApp = lazy(async () => {
  const module = await import('./components/QuickCaptureApp')
  return { default: module.QuickCaptureApp }
})

const ExternalFileApp = lazy(async () => {
  const module = await import('./components/ExternalFileApp')
  return { default: module.ExternalFileApp }
})

export function renderZenNotesApp(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search)
  const isFloating = params.get('floating') === '1'
  const isQuickCapture = params.get('quickCapture') === '1'
  const isExternalFile = params.get('externalFile') !== null
  const floatingNotePath = params.get('note')

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Suspense fallback={null}>
        {isQuickCapture ? (
          <QuickCaptureApp />
        ) : isExternalFile ? (
          <ExternalFileApp />
        ) : isFloating && floatingNotePath ? (
          <FloatingNoteApp notePath={floatingNotePath} />
        ) : (
          <App />
        )}
      </Suspense>
    </React.StrictMode>
  )
}
