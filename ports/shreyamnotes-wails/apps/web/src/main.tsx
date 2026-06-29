import { installBridge } from './bridge/http-bridge'
import { registerServiceWorker } from './register-service-worker'

const PREFS_KEY = 'zen:prefs:v2'

installBridge()
registerServiceWorker()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Renderer root element #root was not found')
}

const params = new URLSearchParams(window.location.search)
void boot(root, params)

async function boot(target: HTMLElement, params: URLSearchParams): Promise<void> {
  const exportNotePath = params.get('exportNote')
  if (exportNotePath) {
    const { renderExportNoteWindow } = await import('./export-window')
    renderExportNoteWindow(target, exportNotePath)
    return
  }

  if (await shouldRenderFirstRunShell(params)) {
    renderFirstRunShell(target)
    return
  }

  await renderFullApp(target)
}

async function shouldRenderFirstRunShell(params: URLSearchParams): Promise<boolean> {
  if (
    params.get('floating') === '1' ||
    params.get('quickCapture') === '1' ||
    params.get('externalFile') !== null
  ) {
    return false
  }

  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return await isDefaultFirstRunVault()
    const prefs = JSON.parse(raw) as { hasCompletedOnboarding?: unknown }
    return prefs.hasCompletedOnboarding !== true && (await isDefaultFirstRunVault())
  } catch {
    return await isDefaultFirstRunVault()
  }
}

async function isDefaultFirstRunVault(): Promise<boolean> {
  try {
    const vault = await window.zen.getCurrentVault()
    if (!vault?.root) return true
    return vault.root.split(/[\\/]/).filter(Boolean).at(-1) === 'ShreyamNotesVault'
  } catch {
    return true
  }
}

async function renderFullApp(target: HTMLElement): Promise<void> {
  const { renderZenNotesApp } = await import('@zennotes/app-core/main')
  renderZenNotesApp(target)
}

function markFirstRunComplete(): void {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...prefs, hasCompletedOnboarding: true })
    )
  } catch {
    /* ignore */
  }
}

function renderFirstRunShell(target: HTMLElement): void {
  document.documentElement.style.colorScheme = 'dark'
  document.body.style.margin = '0'
  target.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#171a1f;color:#f4f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <section style="width:min(560px,calc(100vw - 48px));">
        <p style="margin:0 0 10px;color:#d6b36a;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">ShreyamNotes</p>
        <h1 style="margin:0;color:#fff;font-size:34px;line-height:1.1;font-weight:760;letter-spacing:0;">Choose where your notes live</h1>
        <p style="margin:16px 0 26px;color:#c7c0b3;font-size:16px;line-height:1.6;">Use the default local vault or pick any folder. Files stay as plain markdown on disk.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          <button type="button" data-start-default style="border:0;border-radius:8px;background:#f0b84f;color:#171a1f;padding:11px 14px;font-size:14px;font-weight:740;cursor:pointer;">Start with default vault</button>
          <button type="button" data-choose-vault style="border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(255,255,255,.08);color:#f4f0e8;padding:10px 14px;font-size:14px;font-weight:680;cursor:pointer;">Choose folder</button>
        </div>
        <p data-first-run-error style="display:none;margin:18px 0 0;color:#ffb4a8;font-size:13px;line-height:1.5;"></p>
      </section>
    </main>
  `

  const showError = (message: string): void => {
    const error = target.querySelector<HTMLElement>('[data-first-run-error]')
    if (!error) return
    error.textContent = message
    error.style.display = 'block'
  }

  const continueToApp = (): void => {
    markFirstRunComplete()
    target.innerHTML = ''
    void renderFullApp(target)
  }

  target.querySelector('[data-start-default]')?.addEventListener('click', continueToApp)
  target.querySelector('[data-choose-vault]')?.addEventListener('click', () => {
    void window.zen
      .pickVault()
      .then((vault) => {
        if (vault) continueToApp()
      })
      .catch((err: unknown) => {
        showError(err instanceof Error ? err.message : String(err))
      })
  })
}
