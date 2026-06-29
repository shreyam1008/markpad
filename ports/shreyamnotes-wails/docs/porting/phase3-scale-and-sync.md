# Phase 3 Scale And Sync Plan

## Performance Targets

- Keep Wails startup on the home/sidebar path below the Phase 2 measured median.
- Keep profile-cold startup PSS under 155 MiB on Linux/X11 after feature work.
- Validate at 5,000 notes, 25,000 notes, and mixed vaults with very large markdown/code files.
- Keep the editor responsive by avoiding >50 ms main-thread chunks during indexing, search, and large-file rendering.
- Do not add a heavy editor dependency for code files.

## Modern Performance Patterns

- Render only what is visible. Existing note lists already virtualize; new active/recent/favorite sidebar sections must keep fixed row heights and avoid growing the DOM with thousands of notes.
- Use `content-visibility: auto` and `contain-intrinsic-size` for long offscreen static panels where virtualization is not practical.
- Preserve CodeMirror's small viewport behavior for markdown editing. Do not enlarge the rendered editor viewport to "fix" fast scrolling; that trades scroll smoothness for memory and input latency.
- Break vault indexing/search/history work into small tasks. Prefer `scheduler.yield()` when available and fall back to `setTimeout(0)`/idle scheduling.
- Keep previews and diagrams out of startup. Mermaid, D3, JSXGraph, function-plot, KaTeX, and highlight.js should load only after matching content is visible.
- Treat huge files differently:
  - Markdown under the safe threshold opens in the rich editor.
  - Huge markdown opens in source mode first, with preview behind a button.
  - Code/plain text opens in a lightweight textarea-overlay editor.
  - Very large files show a streaming/readonly guard before loading the whole body.

## Vault Model

- A vault is a normal folder.
- Wails defaults to `~/ShreyamNotesVault`.
- The app owns only predictable subfolders:
  - `inbox/`
  - `quick/`
  - `archive/`
  - `trash/`
  - `assets/`
  - `.zennotes/` for app metadata
- Users can still open any other folder as a vault.
- Sync metadata lives under `.zennotes/sync/` and never changes markdown portability.

## Sync Options

### Option 1: External Folder Sync

This is the default recommendation for a small binary.

- User chooses a folder already synced by Google Drive for desktop, Dropbox, OneDrive, iCloud Drive, Syncthing, or any filesystem sync tool.
- ShreyamNotes stores plain files in that folder.
- The app can show sync status as "folder-managed" without embedding a cloud SDK.
- "Sync now" becomes "flush local writes and rescan".
- Auto-sync-on-open becomes "rescan on launch and after external watcher events".

### Option 2: Google Drive API Sync

This is optional and should be behind a provider interface.

- Login opens the default browser with Google OAuth for installed desktop apps.
- Callback uses a loopback localhost redirect.
- Tokens are stored in the OS credential store.
- Vault metadata maps local relative paths to Drive file IDs under `.zennotes/sync/google-drive.json`.
- Sync button:
  - flush dirty notes
  - upload local changes
  - pull remote changes
  - resolve conflicts into `.zennotes/conflicts/` or conflict-marked copies
- Auto sync on open:
  - optional setting
  - runs after startup, not on the critical path
  - uses the Drive Changes API cursor to avoid scanning everything every time

## MCP And Agent Access

MCP remains a first-class surface.

### Local MCP

- Default mode.
- Runs on the user's machine and reads the local vault folder.
- Best for Codex CLI, local Claude Desktop/Code clients, local scripts, and private machine workflows.
- Works with local-only vaults and with folders synced by Google Drive/Dropbox/iCloud/OneDrive/Syncthing because those folders are still normal local files.

### Remote HTTPS MCP

- Needed when ChatGPT, a custom GPT, or another hosted agent needs access.
- Expose a hosted MCP server over HTTPS.
- The hosted MCP server should read from an explicitly linked sync profile, not from a random local path.
- Authentication must be per-user. Write tools must be separately gated from read/search tools.
- Useful tool split:
  - read-only: search notes, read note, list backlinks, list tasks, get history
  - write: create note, append note, update task, restore history revision
  - admin: connect sync provider, rotate token, revoke access

### ChatGPT App / Custom GPT Shape

- ChatGPT Apps use MCP-backed tools. A ShreyamNotes app can point at the remote HTTPS MCP endpoint.
- Custom GPT actions can call a normal HTTPS API if MCP app distribution is not the target.
- Shareable Drive links alone are not enough for safe agent access. They should open an authorization/linking flow that creates a scoped sync profile and then exposes tools through MCP/API.
- "Give this link to ChatGPT and it works" should mean:
  1. user links a vault/sync profile,
  2. hosted MCP/API gets a scoped token,
  3. ChatGPT connects to the app/action,
  4. user approves what the agent may read or write.

### Wails Port Gap

- The Wails shell serves the web bridge, and the bridge now detects Wails runtime globals so it reports `runtime: desktop` inside the Wails app.
- Native window controls are wired through Wails runtime calls; native folder pickers and floating windows are still intentionally not advertised until implemented.
- Reimplement the local MCP server in Go or a tiny sidecar only after measuring binary size. The legacy desktop runtime/Node MCP path is upstream-compatible but not acceptable as the long-term Wails path.

## Credential Storage

- macOS: Keychain Services.
- Windows: Credential Manager via `CredWrite`/`CredRead`.
- Linux: freedesktop Secret Service API over D-Bus, with a clear fallback when no keyring service exists.
- Do not store refresh tokens in plaintext config files.
- Keep provider credentials separate from vault data so copied vaults do not copy account tokens.

## Provider Interface

Backend package shape:

- `internal/sync/provider.go`
- `internal/sync/localfolder`
- `internal/sync/googledrive`
- `internal/secrets`

Frontend state:

- Settings section: Sync
- Vault-level setting: provider, linked folder/provider ID, auto-sync-on-open, sync-on-save, conflict policy.
- Sidebar button: Sync now for the current vault.
- Status surface: idle, checking, uploading, downloading, conflict, offline, auth required.

## Small Binary Rules

- First implementation ships external-folder sync only.
- Google Drive API ships only after measuring binary growth.
- Prefer direct REST calls with Go standard library over pulling a large generated Google client.
- OAuth and JSON code should be tiny and isolated.
- Secret storage can use small OS-specific files with build tags. Avoid bundling native libraries.

## Validation Matrix

- Linux/X11 and Linux/Wayland: startup, vault watch, keyring available/unavailable.
- macOS: default folder under home, Keychain token round-trip, file watcher.
- Windows: default folder under user profile, Credential Manager token round-trip, path normalization.
- Large vaults:
  - 5,000 notes
  - 25,000 notes
  - 100,000 small notes metadata-only listing
  - 10 MiB markdown note
  - 50 MiB code/text file
- Evidence:
  - benchmark JSONL
  - memory PSS/RSS/USS
  - startup wall time
  - screenshot
  - console errors
  - build/test commands

## Sources Checked

- Wails Linux build tags: https://wails.io/docs/gettingstarted/building/
- Wails manual build flags: https://wails.io/docs/guides/manual-builds/
- Wails events: https://wails.io/docs/reference/runtime/events/
- Wails Linux options: https://pkg.go.dev/github.com/wailsapp/wails/v2/pkg/options/linux
- CodeMirror viewport behavior: https://codemirror.net/docs/ref/
- CSS content visibility: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility
- Long task yielding: https://web.dev/articles/optimize-long-tasks
- Scheduler yield: https://developer.chrome.com/blog/use-scheduler-yield
- List virtualization: https://web.dev/articles/virtualize-long-lists-react-window
- Google OAuth for installed apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google Drive app data: https://developers.google.com/workspace/drive/api/guides/appdata
- Google Drive changes API: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list
- ChatGPT Apps SDK: https://developers.openai.com/apps-sdk
- Build MCP servers for ChatGPT: https://developers.openai.com/apps-sdk/build/mcp-server
- Connect MCP server to ChatGPT: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- Custom GPT Actions: https://help.openai.com/en/articles/9442513-configuring-actions-in-gpts
- macOS Keychain Services: https://developer.apple.com/documentation/security/keychain-services
- Windows Credential Manager: https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew
- Linux Secret Service API: https://specifications.freedesktop.org/secret-service/latest-single
