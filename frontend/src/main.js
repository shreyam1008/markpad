// Markpad — vanilla JS + Tailwind + Wails
// All file I/O via window.go.main.App.*

let viewMode = 'viewer'; // 'markdown' | 'split' | 'viewer'
let sidebarCollapsed = false;
let currentContent = '';
let committedContent = '';
let committedDirty = false;
let activeId = '';
let cachedNotes = [];
let draftTimer = null;
let renderTimer = null;
let draggedNoteId = null;
let ctxNoteId = null;
let findOpen = false;
let historyOpen = false;
let historySelectedTs = null;
let saving = false;
let readPosTimer = null;
let pdfRenderToken = 0;
let viewerRenderKey = '';
let pdfLibPromise = null;
const noteViewModes = {};
const noteScrollPos = {};
const editHistories = new Map();
const collapsedSections = JSON.parse(localStorage.getItem('markpad-sections') || '{}');
const DRAFT_MS = 300;
const RENDER_MS = 120;
const EDIT_HISTORY_LIMIT = 80;
const EDIT_HISTORY_CHARS = 1024 * 1024;
let applyingEditHistory = false;
let searchOpen = false;
let searchTimer = null;
let searchToken = 0;
let searchActiveIndex = 0;
let commandOpen = false;
let commandActiveIndex = 0;
let currentTheme = localStorage.getItem('markpad-theme') || 'paper';
let taskViewMode = localStorage.getItem('markpad-task-view') || 'list';
let latestTasks = [];
let canvasTool = localStorage.getItem('markpad-canvas-tool') || 'pan';
let focusMode = localStorage.getItem('markpad-focus') === '1';
let splitRatio = parseFloat(localStorage.getItem('markpad-split-ratio') || '50');
let canvasDoc = null;
let canvasSession = null;
let canvasActive = false;
let canvasDrawing = null;
let canvasDraftElement = null;
let canvasPanStart = null;
let canvasTextTarget = null;
let canvasHistory = [];
let canvasHistoryIndex = -1;

// Zoom
const ZOOM_MIN = 10, ZOOM_MAX = 24, ZOOM_STEP = 1, ZOOM_DEFAULT = 14;
let fontSize = parseInt(localStorage.getItem('markpad-zoom') || ZOOM_DEFAULT, 10);
function applyZoom(silent) {
  editor.style.fontSize = fontSize + 'px';
  viewer.style.fontSize = fontSize + 'px';
  localStorage.setItem('markpad-zoom', fontSize);
  if (!silent && typeof statusText !== 'undefined' && statusText) statusText.textContent = `Editor zoom: ${Math.round(fontSize / ZOOM_DEFAULT * 100)}%`;
}
function zoomIn()  { fontSize = Math.min(fontSize + ZOOM_STEP, ZOOM_MAX); applyZoom(); }
function zoomOut() { fontSize = Math.max(fontSize - ZOOM_STEP, ZOOM_MIN); applyZoom(); }
function zoomReset() { fontSize = ZOOM_DEFAULT; applyZoom(); }

const $ = (id) => document.getElementById(id);
const sidebar      = $('sidebar');
const sidebarCol   = $('sidebar-collapsed-content');
const notesList    = $('notes-list');
const favsList     = $('favorites-list');
const favsSection  = $('favorites-section');
const recentList   = $('recent-list');
const recentSection = $('recent-section');
const editor       = $('editor');
const editorCont   = $('editor-container');
const viewerCont   = $('viewer-container');
const viewer       = $('viewer');
const toolbar      = $('toolbar');
const divider      = $('resize-divider');
const noteTitle    = $('note-title');
const dirtyInd     = $('dirty-indicator');
const statusText   = $('status-text');
const statusStats  = $('status-stats');
const ctxMenu      = $('ctx-menu');
const findBar      = $('find-bar');
const findInput    = $('find-input');
const findInfo     = $('find-info');
const histPanel    = $('history-panel');
const histList     = $('history-list');
const histEmpty    = $('history-empty');
const histActions  = $('history-actions');
const histRestore  = $('history-restore');
const histBack     = $('history-back');
const modalOverlay = $('modal-overlay');
const modalTitle   = $('modal-title');
const modalBodyEl  = $('modal-body');
const saveBtn      = $('btn-save');
const undoBtn      = $('btn-undo');
const redoBtn      = $('btn-redo');
const closeOverlay = $('close-overlay');
const closeMessage = $('close-message');
const searchOverlay = $('search-overlay');
const searchInput  = $('search-input');
const searchResults = $('search-results');
const searchMeta   = $('search-meta');
const commandOverlay = $('command-overlay');
const commandInput = $('command-input');
const commandResults = $('command-results');
const themeBtn     = $('btn-theme');
const focusBtn     = $('btn-focus');
const canvasOverlay = $('canvas-overlay');
const canvasStage  = $('canvas-stage');
const canvasTextEditor = $('canvas-text-editor');
const canvasColor  = $('canvas-color');
const canvasWidth  = $('canvas-width');
const canvasImportFile = $('canvas-import-file');
const canvasStatus = $('canvas-status');

const THEMES = [
  { id: 'paper', label: 'Paper' },
  { id: 'linen', label: 'Linen' },
  { id: 'ink', label: 'Ink' },
  { id: 'pine', label: 'Pine' },
];
const SEARCH_CONTENT_CAP = 2 * 1024 * 1024;
const CANVAS_DOC_KEY = 'markpad-canvas-draft';
const CANVAS_SESSION_KEY = 'markpad-canvas-session';
const CANVAS_DPR_CAP = 1.5;
const CANVAS_HISTORY_LIMIT = 28;
const CANVAS_HISTORY_BYTES = 768 * 1024;
const DRAFT_TRASH_KEY = 'markpad-draft-trash-v1';
const DRAFT_TRASH_DAYS = 30;

function applyTheme(id, silent) {
  if (!THEMES.some(t => t.id === id)) id = 'paper';
  currentTheme = id;
  document.documentElement.dataset.theme = id;
  localStorage.setItem('markpad-theme', id);
  const theme = THEMES.find(t => t.id === id);
  if (themeBtn) themeBtn.textContent = theme.label;
  if (!silent && statusText) statusText.textContent = `Theme: ${theme.label}`;
}

function cycleTheme() {
  const index = THEMES.findIndex(t => t.id === currentTheme);
  applyTheme(THEMES[(index + 1) % THEMES.length].id);
}

function applyFocusMode(silent) {
  document.body.classList.toggle('markpad-focus', focusMode);
  if (focusBtn) focusBtn.classList.toggle('active', focusMode);
  localStorage.setItem('markpad-focus', focusMode ? '1' : '0');
  if (!silent && statusText) statusText.textContent = focusMode ? 'Focus mode on' : 'Focus mode off';
  requestAnimationFrame(() => {
    if (viewMode === 'split') applySplitRatio();
    if (canvasActive) resizeCanvasStage();
  });
}

function toggleFocusMode() {
  focusMode = !focusMode;
  applyFocusMode();
}

function normalizeSplitRatio(value) {
  return Math.max(28, Math.min(72, Number.isFinite(value) ? value : 50));
}

function applySplitRatio() {
  if (viewMode !== 'split') return;
  splitRatio = normalizeSplitRatio(splitRatio);
  editorCont.style.flex = `0 0 ${splitRatio}%`;
  viewerCont.style.flex = '1 1 0';
  localStorage.setItem('markpad-split-ratio', String(Math.round(splitRatio * 10) / 10));
}

function rememberSplitRatio() {
  if (viewMode !== 'split') return;
  const total = editorCont.parentElement?.getBoundingClientRect().width || 0;
  const width = editorCont.getBoundingClientRect().width;
  if (total > 0 && width > 0) {
    splitRatio = normalizeSplitRatio((width / total) * 100);
    localStorage.setItem('markpad-split-ratio', String(Math.round(splitRatio * 10) / 10));
  }
}

// ── File type icons ──────────────────────────────────────
function fileIcon(path) {
  if (!path) return 'MD';
  const ext = path.split('.').pop().toLowerCase();
  return (ext || 'TXT').slice(0, 3);
}

function closeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = '<path d="M18 6 6 18M6 6l12 12"/>';
  return svg;
}

const MD_EXTS = new Set(['md', 'markdown', 'mdx']);
const TEXT_EXTS = new Set(['txt', 'log', 'csv', 'tsv']);
const CODE_EXTS = new Set([
  'py', 'js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'rb', 'lua', 'sh', 'bash', 'zsh', 'fish',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env',
  'html', 'htm', 'css', 'scss', 'less', 'svg', 'vue', 'svelte',
  'sql', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'kt', 'swift', 'dart',
  'r', 'pl', 'php', 'ex', 'exs', 'zig', 'nim', 'ps1', 'bat', 'cmd',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'tf', 'hcl',
]);
const PDF_EXTS = new Set(['pdf']);
const EBOOK_EXTS = new Set(['epub', 'mobi', 'azw', 'azw3', 'fb2']);
const OFFICE_EXTS = new Set(['doc', 'docx', 'odt', 'rtf', 'pages']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'ico']);
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar']);
function fileExt(path) { return path ? path.split('.').pop().toLowerCase() : ''; }
function getFileType(path, kind) {
  if (kind) return kind === 'markdown' ? 'md' : kind;
  if (!path) return 'md';
  const ext = fileExt(path);
  if (MD_EXTS.has(ext)) return 'md';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (CODE_EXTS.has(ext)) return 'code';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (EBOOK_EXTS.has(ext)) return 'ebook';
  if (OFFICE_EXTS.has(ext)) return 'office';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  return 'text';
}
function activeType() { const active = cachedNotes.find(n => n.id === activeId); return getFileType(active?.path, active?.kind); }
function isReadOnlyType(type) { return ['pdf', 'ebook', 'office', 'image', 'archive'].includes(type); }
function typeLabel(type) { return ({ md: 'Markdown', code: 'Code', text: 'Text', pdf: 'PDF', ebook: 'Ebook', office: 'Office document', image: 'Image', archive: 'Archive' })[type] || 'File'; }
function escapeHtml(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const CODE_LINE_CAP = 5000;
function renderCode(content, path) {
  const ext = path ? path.split('.').pop().toLowerCase() : '';
  const langMap = { py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', rs: 'rust', rb: 'ruby', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', yml: 'yaml', htm: 'html', cfg: 'ini', conf: 'ini', h: 'c', hpp: 'cpp', cs: 'csharp', kt: 'kotlin', ex: 'elixir', exs: 'elixir', pl: 'perl', ps1: 'powershell', bat: 'dos', cmd: 'dos', tf: 'hcl', gradle: 'groovy', svelte: 'xml', vue: 'xml' };
  const lang = langMap[ext] || ext;
  const lines = content.split('\n');
  const capped = lines.length > CODE_LINE_CAP;
  const toHighlight = capped ? lines.slice(0, CODE_LINE_CAP).join('\n') : content;
  let highlighted = escapeHtml(toHighlight);
  try {
    if (window.hljs && lang && hljs.getLanguage(lang)) highlighted = hljs.highlight(toHighlight, { language: lang }).value;
    else if (window.hljs) highlighted = hljs.highlightAuto(toHighlight).value;
  } catch {}
  const capNote = capped ? `<div style="padding:8px 20px;color:#6b6e68;font-size:12px;border-top:1px solid #e8e6df;">Showing first ${CODE_LINE_CAP} of ${lines.length} lines</div>` : '';
  return `<pre class="hljs" style="margin:0;padding:20px;border-radius:8px;background:#fffffc;font-size:13px;line-height:1.7;overflow:auto;white-space:pre;tab-size:4;"><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>${capNote}`;
}


function renderDocumentCard(note) {
  const type = getFileType(note?.path, note?.kind);
  const icon = fileIcon(note?.path);
  const size = note?.size ? formatBytes(note.size) : 'Unknown size';
  const title = note?.title || 'Document';
  const path = note?.path || '';
  const label = typeLabel(type);
  return `
    <div class="doc-card">
      <div class="doc-icon">${icon}</div>
      <div class="doc-title">${title}</div>
      <div class="doc-meta">${label} · ${size}</div>
      <div class="doc-path">${path.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <p class="doc-note">This format is kept read-only in Markpad to stay tiny, fast, and safe. Open it in your system viewer for full rendering.</p>
      <button class="doc-open" data-open-external="${path.replace(/"/g,'&quot;')}">Open Externally</button>
    </div>`;
}

// ── PDF rendering (pdf.js) ───────────────────────────────
function ensurePdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('PDF renderer could not be loaded'));
    document.head.appendChild(script);
  });
  return pdfLibPromise;
}

async function renderPdf(note) {
  const path = note?.path;
  if (!path) return renderDocumentCard(note);
  const token = ++pdfRenderToken;
  viewer.innerHTML = '<div style="text-align:center;padding:40px;color:#6b6e68;">Loading PDF...</div>';
  try {
    await ensurePdfLib();
    let b64 = await window.go.main.App.ReadFileBase64(path);
    let raw = atob(b64);
    b64 = '';
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    raw = '';
    const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
    if (token !== pdfRenderToken) return;
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px;';
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;color:#6b6e68;font-size:12px;font-weight:600;margin-bottom:8px;';
    header.textContent = `${note.title || 'PDF'} — ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;
    container.appendChild(header);
    const MAX_INITIAL = 2;
    const LOAD_STEP = 3;
    const renderPage = async (num) => {
      const page = await pdf.getPage(num);
      const scale = 1.15;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.cssText = 'max-width:100%;border:1px solid #e8e6df;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);';
      await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise;
      return canvas;
    };
    for (let i = 1; i <= Math.min(MAX_INITIAL, pdf.numPages); i++) {
      container.appendChild(await renderPage(i));
    }
    if (pdf.numPages > MAX_INITIAL) {
      let rendered = MAX_INITIAL;
      const more = document.createElement('button');
      more.style.cssText = 'border:none;background:#2f6f61;color:#fffffb;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;margin:8px 0;';
      more.textContent = `Load next ${Math.min(LOAD_STEP, pdf.numPages - rendered)} pages`;
      more.addEventListener('click', async () => {
        more.textContent = 'Loading...';
        more.disabled = true;
        const end = Math.min(rendered + LOAD_STEP, pdf.numPages);
        for (let i = rendered + 1; i <= end; i++) {
          container.insertBefore(await renderPage(i), more);
        }
        rendered = end;
        if (rendered >= pdf.numPages) more.remove();
        else {
          more.textContent = `Load next ${Math.min(LOAD_STEP, pdf.numPages - rendered)} pages`;
          more.disabled = false;
        }
        restoreScrollPos();
      });
      container.appendChild(more);
    }
    const openBtn = document.createElement('button');
    openBtn.className = 'doc-open';
    openBtn.textContent = 'Open Externally';
    openBtn.dataset.openExternal = path;
    container.appendChild(openBtn);
    viewer.innerHTML = '';
    viewer.appendChild(container);
    restoreScrollPos();
  } catch (err) {
    viewer.innerHTML = renderDocumentCard(note) + '<div style="text-align:center;color:#c54b33;font-size:12px;margin-top:8px;">PDF render error: ' + (err.message || err) + '</div>';
  }
}

// ── Image preview ────────────────────────────────────────
async function renderImagePreview(note) {
  const path = note?.path;
  if (!path) return renderDocumentCard(note);
  viewer.innerHTML = '<div style="text-align:center;padding:40px;color:#6b6e68;">Loading image...</div>';
  try {
    const b64 = await window.go.main.App.ReadFileBase64(path);
    const ext = fileExt(path);
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tiff: 'image/tiff', ico: 'image/x-icon', svg: 'image/svg+xml' };
    const mime = mimeMap[ext] || 'image/png';
    const size = note?.size ? formatBytes(note.size) : '';
    viewer.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px;">
        <div style="font-size:14px;font-weight:700;color:#1a1c1b;">${note.title || 'Image'}</div>
        <div style="font-size:12px;color:#6b6e68;">${ext.toUpperCase()} ${size ? '· ' + size : ''}</div>
        <img src="data:${mime};base64,${b64}" style="max-width:100%;max-height:70vh;border-radius:8px;border:1px solid #e8e6df;box-shadow:0 4px 16px rgba(0,0,0,0.08);" />
        <button class="doc-open" data-open-external="${path.replace(/"/g, '&quot;')}">Open Externally</button>
      </div>`;
  } catch (err) {
    viewer.innerHTML = renderDocumentCard(note) + '<div style="text-align:center;color:#c54b33;font-size:12px;margin-top:8px;">Image load error: ' + (err.message || err) + '</div>';
  }
}

// ── Viewer dispatch ──────────────────────────────────────
function renderViewer(content, active) {
  const ft = getFileType(active?.path, active?.kind);
  const stableKey = `${ft}:${active?.id || ''}:${active?.path || ''}`;
  if ((ft === 'pdf' || ft === 'image') && viewerRenderKey === stableKey) return;
  viewerRenderKey = stableKey;
  if (ft === 'pdf') { renderPdf(active); return; }
  if (ft === 'image') { renderImagePreview(active); return; }
  if (ft === 'md') { viewer.innerHTML = renderMd(content); return; }
  if (isReadOnlyType(ft)) { viewer.innerHTML = renderDocumentCard(active); return; }
  viewer.innerHTML = renderCode(content, active?.path);
}

// ── Markdown ─────────────────────────────────────────────
const markedRenderer = new marked.Renderer();
markedRenderer.heading = function(text, level) {
  const slug = text.toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, '');
  return `<h${level} id="${slug}">${text}</h${level}>`;
};
marked.setOptions({
  renderer: markedRenderer,
  gfm: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; } catch {}
    }
    try { return hljs.highlightAuto(code).value; } catch {}
    return code;
  }
});

function renderMd(md) {
  return DOMPurify.sanitize(marked.parse(md || ''), {
    ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked', 'disabled']
  });
}

function updateOutline() {
  const outlineList = $('outline-list');
  const outlineSection = $('outline-section');
  if (!outlineList || !outlineSection) return;

  const active = cachedNotes.find(n => n.id === activeId);
  const ft = getFileType(active?.path, active?.kind);
  if (ft !== 'md') {
    outlineSection.classList.add('hidden');
    outlineList.innerHTML = '';
    return;
  }

  const content = editor.value || '';
  const lines = content.split('\n');
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        lineIndex: i
      });
    }
  }

  if (headings.length === 0) {
    outlineSection.classList.add('hidden');
    outlineList.innerHTML = '';
    return;
  }

  outlineSection.classList.remove('hidden');
  outlineList.innerHTML = '';

  headings.forEach(h => {
    const row = el('button', `w-full text-left px-2 py-0.5 hover:bg-hover rounded transition-colors text-muted hover:text-[#1a1c1b] truncate block text-[11px] font-medium`);
    row.style.paddingLeft = `${(h.level - 1) * 8 + 6}px`;
    row.textContent = h.title;
    row.title = h.title;
    row.addEventListener('click', () => {
      // Scroll editor
      let charOffset = 0;
      for (let j = 0; j < h.lineIndex; j++) {
        charOffset += lines[j].length + 1;
      }
      editor.focus();
      editor.setSelectionRange(charOffset, charOffset);
      const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
      editor.scrollTop = h.lineIndex * lineHeight - 60;

      // Scroll viewer
      const slug = h.title.toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, '');
      const target = viewer.querySelector(`[id="${slug}"]`);
      if (target && viewerCont) {
        const containerRect = viewerCont.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        viewerCont.scrollTop = targetRect.top - containerRect.top + viewerCont.scrollTop - 20;
      }
    });
    outlineList.appendChild(row);
  });
}

// ── External link handler ───────────────────────────────
function interceptLinks(container) {
  container.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      e.preventDefault();
      e.stopPropagation();
      if (window.go && window.go.main && window.go.main.App) {
        window.go.main.App.OpenURL(href);
      }
    }
  });
}

// ── Session ──────────────────────────────────────────────
function renderSession(state) {
  if (!state) return;
  activeId = state.activeId || '';
  cachedNotes = state.notes || [];
  notesList.innerHTML = '';
  favsList.innerHTML = '';
  recentList.innerHTML = '';
  applySectionState();

  const hasFavs = state.favorites && state.favorites.length > 0;
  favsSection.classList.toggle('hidden', !hasFavs);
  if (hasFavs) state.favorites.forEach(f => favsList.appendChild(makeFavRow(f)));
  cachedNotes.forEach(n => {
    if (!noteScrollPos[n.id] && ((n.scrollTop || 0) || (n.viewTop || 0) || (n.cursor || 0))) {
      noteScrollPos[n.id] = { editor: n.scrollTop || 0, viewer: n.viewTop || 0, cursor: n.cursor || 0 };
    }
  });
  cachedNotes.forEach(n => notesList.appendChild(makeNoteRow(n)));

  // Recent files (exclude currently open paths)
  const openPaths = new Set(cachedNotes.filter(n => n.path).map(n => n.path));
  const recents = (state.recents || []).filter(r => !openPaths.has(r.path));
  recentSection.classList.toggle('hidden', recents.length === 0);
  recents.forEach(r => recentList.appendChild(makeRecentRow(r)));

  const active = cachedNotes.find(n => n.id === activeId);
  noteTitle.textContent = active ? (active.path ? active.title : 'Untitled') : 'Untitled';
  dirtyInd.classList.toggle('hidden', !(active && active.dirty));
  updateHistoryButtons();

  requestAnimationFrame(() => {
    const activeRow = notesList.querySelector(`[data-note-id="${activeId}"]`);
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function makeFavRow(fav) {
  const row = el('div', 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-hover');
  const icon = el('span', 'text-star text-sm flex-shrink-0'); icon.textContent = '\u2605';
  const t = el('span', 'text-[13px] font-medium truncate'); t.textContent = fav.title || 'Untitled';
  row.append(icon, t);
  row.addEventListener('click', async () => {
    if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
    try {
      renderSession(await window.go.main.App.OpenPathFromBookmark(fav.path));
      loadContent(await window.go.main.App.GetActiveContent());
      restoreNoteView();
    } catch {}
  });
  return row;
}

function makeRecentRow(recent) {
  const row = el('div', `group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-hover ${recent.missing ? 'opacity-55' : 'text-muted'}`);
  const ico = el('span', 'file-badge opacity-70');
  ico.textContent = fileIcon(recent.path);
  const body = el('div', 'flex-1 min-w-0');
  const t = el('div', 'text-[12px] truncate'); t.textContent = recent.title;
  const sub = el('div', 'text-[10px] truncate text-muted'); sub.textContent = recent.missing ? 'missing' : typeLabel(getFileType(recent.path, recent.kind));
  body.append(t, sub);
  const rm = el('button', 'row-icon opacity-0 group-hover:opacity-100 transition-opacity');
  rm.appendChild(closeIcon());
  rm.title = 'Remove from recent';
  rm.addEventListener('click', async (e) => {
    e.stopPropagation();
    renderSession(await window.go.main.App.RemoveRecent(recent.path));
  });
  row.append(ico, body, rm);
  row.title = recent.path;
  row.addEventListener('click', async () => {
    if (recent.missing) { statusText.textContent = 'Recent file is missing'; return; }
    if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
    try {
      renderSession(await window.go.main.App.OpenPathFromBookmark(recent.path));
      loadContent(await window.go.main.App.GetActiveContent());
      restoreNoteView();
    } catch (err) { statusText.textContent = 'Open failed: ' + err; }
  });
  return row;
}

function basename(path) {
  if (!path) return '';
  const clean = String(path).replace(/\\/g, '/');
  return clean.slice(clean.lastIndexOf('/') + 1);
}

function firstMatchIndex(text, query, terms) {
  const lower = text.toLowerCase();
  const direct = query ? lower.indexOf(query) : -1;
  if (direct >= 0) return { index: direct, length: query.length };
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) return { index: idx, length: term.length };
  }
  return { index: -1, length: 0 };
}

function makeSnippet(content, matchIndex, matchLength) {
  if (matchIndex < 0) return '';
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(content.length, matchIndex + Math.max(matchLength, 1) + 140);
  let slice = content.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) slice = '...' + slice;
  if (end < content.length) slice += '...';
  return slice;
}

function lineForIndex(content, index) {
  if (index < 0) return 0;
  let line = 0;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function scoreSearch(note, content, query, terms) {
  const title = note.path ? (note.title || basename(note.path)) : 'Untitled';
  const path = note.path || 'Draft';
  const titleLower = title.toLowerCase();
  const pathLower = path.toLowerCase();
  const body = content || '';
  const bodyLower = body.toLowerCase();
  const haystack = `${titleLower}\n${pathLower}\n${bodyLower}`;
  if (terms.length && !terms.every(term => haystack.includes(term))) return null;

  let score = 0;
  if (!query) score = note.id === activeId ? 20 : 1;
  if (query && titleLower.includes(query)) score += 120;
  if (query && pathLower.includes(query)) score += 70;
  const match = firstMatchIndex(body, query, terms);
  if (match.index >= 0) score += 40 + Math.max(0, 30 - Math.floor(match.index / 4000));
  for (const term of terms) {
    if (titleLower.includes(term)) score += 18;
    if (pathLower.includes(term)) score += 10;
    if (bodyLower.includes(term)) score += 4;
  }
  if (score <= 0 && terms.length) return null;

  return {
    id: note.id,
    title,
    path,
    kind: getFileType(note.path, note.kind),
    dirty: !!note.dirty,
    score,
    matchIndex: match.index,
    matchLength: match.length,
    line: lineForIndex(body, match.index),
    snippet: makeSnippet(body, match.index, match.length),
  };
}

async function runLoadedSearch(query) {
  const token = ++searchToken;
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  searchResults.innerHTML = '<div class="search-empty">Searching loaded files...</div>';
  if (window.go?.main?.App?.SearchLoadedDocuments) {
    try {
      const results = await window.go.main.App.SearchLoadedDocuments(query, activeId, currentContent, 40);
      if (token !== searchToken) return;
      renderSearchResults(results || [], q);
      return;
    } catch {}
  }
  const results = [];

  for (const note of cachedNotes) {
    const type = getFileType(note.path, note.kind);
    let content = '';
    if (!isReadOnlyType(type)) {
      content = note.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(note.id);
      if (content.length > SEARCH_CONTENT_CAP) content = content.slice(0, SEARCH_CONTENT_CAP);
    }
    if (token !== searchToken) return;
    const result = scoreSearch(note, content, q, terms);
    if (result) results.push(result);
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  renderSearchResults(results.slice(0, 40), q);
}

function renderSearchResults(results, query) {
  searchResults.innerHTML = '';
  searchActiveIndex = Math.min(searchActiveIndex, Math.max(0, results.length - 1));
  searchMeta.textContent = query
    ? `${results.length} result${results.length === 1 ? '' : 's'} across loaded files`
    : 'Type to search content. Empty state lists loaded files.';
  if (!results.length) {
    searchResults.innerHTML = '<div class="search-empty">No loaded files matched. Open more files or use exact text from the current document.</div>';
    return;
  }
  results.forEach((result, index) => {
    const row = el('button', `search-row${index === searchActiveIndex ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.searchId = result.id;
    row.dataset.matchIndex = String(result.matchIndex);
    row.dataset.matchLength = String(result.matchLength);
    row.innerHTML = `
      <span class="search-badge">${escapeHtml(fileIcon(result.path))}</span>
      <span class="search-body">
        <span class="search-title-line">
          <strong>${escapeHtml(result.title)}</strong>
          ${result.dirty ? '<em>Unsaved</em>' : ''}
          ${result.matchIndex >= 0 ? `<small>Line ${result.line + 1}</small>` : ''}
        </span>
        <span class="search-path">${escapeHtml(result.path)}</span>
        ${result.snippet ? `<span class="search-snippet">${escapeHtml(result.snippet)}</span>` : ''}
      </span>`;
    row.addEventListener('mousemove', () => setSearchActive(index));
    row.addEventListener('click', () => openSearchResult(result));
    searchResults.appendChild(row);
  });
}

function setSearchActive(index) {
  searchActiveIndex = index;
  [...searchResults.querySelectorAll('.search-row')].forEach((row, i) => row.classList.toggle('active', i === index));
}

function queueLoadedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runLoadedSearch(searchInput.value), 80);
}

function openSearchPalette() {
  searchOpen = true;
  searchOverlay.classList.remove('hidden');
  searchInput.value = '';
  searchActiveIndex = 0;
  runLoadedSearch('');
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearchPalette() {
  searchOpen = false;
  searchOverlay.classList.add('hidden');
  searchInput.blur();
}

async function openSearchResult(result) {
  if (!result) return;
  if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
  await window.go.main.App.SetActive(result.id);
  activeId = result.id;
  loadContent(await window.go.main.App.GetNoteContent(result.id));
  renderSession(await window.go.main.App.GetSession());
  closeSearchPalette();
  if (result.matchIndex >= 0) {
    setView('markdown');
    requestAnimationFrame(() => {
      const start = Math.min(result.matchIndex, editor.value.length);
      const end = Math.min(start + Math.max(result.matchLength, 1), editor.value.length);
      editor.focus();
      editor.setSelectionRange(start, end);
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
      editor.scrollTop = Math.max(0, result.line * lineHeight - editor.clientHeight * 0.35);
      queueReadPositionSave();
    });
  } else {
    restoreNoteView();
  }
}

searchInput?.addEventListener('input', queueLoadedSearch);
searchInput?.addEventListener('keydown', (e) => {
  const rows = [...searchResults.querySelectorAll('.search-row')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSearchActive(Math.min(rows.length - 1, searchActiveIndex + 1));
    rows[searchActiveIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSearchActive(Math.max(0, searchActiveIndex - 1));
    rows[searchActiveIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    rows[searchActiveIndex]?.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearchPalette();
  }
});
$('search-close')?.addEventListener('click', closeSearchPalette);
searchOverlay?.addEventListener('click', (e) => { if (e.target === searchOverlay) closeSearchPalette(); });
themeBtn?.addEventListener('click', cycleTheme);

function commandItems() {
  return [
    { id: 'new', icon: '+', title: 'New note', hint: 'Create an empty draft', kbd: 'Ctrl+N', run: doNew },
    { id: 'open', icon: 'O', title: 'Open file', hint: 'Open a local file', kbd: 'Ctrl+O', run: doOpen },
    { id: 'save', icon: 'S', title: 'Save', hint: 'Save the active document', kbd: 'Ctrl+S', run: doSave },
    { id: 'saveas', icon: 'A', title: 'Save as', hint: 'Choose a save path', kbd: 'Ctrl+Shift+S', run: doSaveAs },
    { id: 'search', icon: '/', title: 'Search loaded files', hint: 'Search currently loaded documents', kbd: 'Ctrl+Shift+F', run: openSearchPalette },
    { id: 'find', icon: 'F', title: 'Find in current file', hint: 'Open inline find bar', kbd: 'Ctrl+F', run: toggleFind },
    { id: 'tasks', icon: 'T', title: 'Tasks', hint: 'List, calendar, and kanban from loaded Markdown tasks', run: () => showTasksView() },
    { id: 'add-task', icon: '+T', title: 'Add task', hint: 'Append a Markdown task to Tasks.md or a Tasks draft', run: addQuickTask },
    { id: 'trash', icon: 'X', title: 'Trash', hint: 'Restore deleted drafts kept for 30 days', run: showTrashView },
    { id: 'canvas', icon: 'C', title: 'Canvas draft', hint: 'Open the local infinite canvas draft', run: openCanvas },
    { id: 'canvas-fit', icon: 'CF', title: 'Fit canvas content', hint: 'Center all canvas elements in view', run: () => { openCanvas(); fitCanvasToContent(); } },
    { id: 'canvas-load-current', icon: 'CL', title: 'Load current document into canvas', hint: 'Parse current Markpad or Obsidian canvas JSON from the editor', run: loadCurrentDocumentIntoCanvas },
    { id: 'canvas-import', icon: 'CI', title: 'Import canvas JSON', hint: 'Load Markpad or Obsidian .canvas JSON into the canvas draft', run: importCanvasJson },
    { id: 'canvas-svg', icon: 'SV', title: 'Export canvas SVG', hint: 'Download the current canvas as a lightweight SVG', run: exportCanvasSvg },
    { id: 'canvas-draft', icon: 'CD', title: 'Save canvas as draft', hint: 'Create an editable JSON draft that can be saved as a .canvas file', run: saveCanvasAsDraft },
    { id: 'focus', icon: 'L', title: focusMode ? 'Exit focus mode' : 'Enter focus mode', hint: 'Hide secondary chrome for writing', kbd: 'Ctrl+Shift+L', run: toggleFocusMode },
    { id: 'split', icon: '||', title: 'Split view', hint: 'Editor and preview side by side', kbd: 'Ctrl+Shift+E', run: () => setView('split') },
    { id: 'editor', icon: 'E', title: 'Editor view', hint: 'Show editor only', run: () => setView('markdown') },
    { id: 'preview', icon: 'P', title: 'Preview view', hint: 'Show preview/document only', run: () => setView('viewer') },
    { id: 'sidebar', icon: 'B', title: 'Toggle sidebar', hint: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar', kbd: 'Ctrl+Shift+B', run: toggleSidebar },
    { id: 'history', icon: 'H', title: 'Version history', hint: 'Open saved snapshots and diffs', kbd: 'Ctrl+H', run: toggleHistory },
    { id: 'theme', icon: '☼', title: 'Cycle theme', hint: 'Switch Paper, Linen, Ink, Pine', run: cycleTheme },
    { id: 'footprint', icon: 'M', title: 'Local footprint', hint: 'Show loaded text, local canvas, trash, and heap estimates', run: showLocalFootprint },
    { id: 'local-folder', icon: 'LF', title: 'Local folder', hint: 'Show the default local folder and recent file list', run: () => showLocalFolder() },
    { id: 'choose-local-folder', icon: 'LD', title: 'Choose local folder', hint: 'Set Markpad default local workspace folder', run: chooseLocalFolder },
    { id: 'new-local-note', icon: 'LN', title: 'New local note', hint: 'Create a Markdown note in the default local folder', run: createLocalFolderNote },
    { id: 'new-local-canvas', icon: 'LC', title: 'New local canvas', hint: 'Create a .canvas JSON file in the default local folder', run: createLocalFolderCanvas },
    { id: 'search-local-folder', icon: 'LS', title: 'Search local folder', hint: 'Search text files in the default local folder', run: searchLocalFolderPrompt },
    { id: 'preferences', icon: ',', title: 'Preferences', hint: 'Appearance, file handling, storage', kbd: 'Ctrl+,', run: showPreferences },
    { id: 'help', icon: '?', title: 'Help', hint: 'Show shortcuts and workflow notes', run: () => showModal('Help', `
      <p><b>Markpad</b> is a native Markdown notepad.</p>
      <p>Open Markdown, text, code, config, logs, PDFs, ebooks, and office documents.</p>
      <p>Star notes to pin them. Drag to reorder. Only unsaved drafts can be deleted.</p>
      <p>Lists auto-continue on Enter. Press Enter on an empty list item to end the list.</p>
      <h3 style="margin-top:12px;margin-bottom:4px;">Shortcuts</h3>
      <p><kbd>Ctrl+N</kbd> New &nbsp; <kbd>Ctrl+O</kbd> Open &nbsp; <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+W</kbd> Close</p>
      <p><kbd>Ctrl+Z</kbd> Undo &nbsp; <kbd>Ctrl+Shift+Z</kbd> Redo &nbsp; <kbd>Ctrl+Shift+S</kbd> Save As</p>
      <p><kbd>Ctrl+Shift+E</kbd> Cycle view (Editor / Split / Preview)</p>
      <p><kbd>Ctrl+Shift+B</kbd> Toggle sidebar &nbsp; <kbd>Ctrl+Shift+L</kbd> Focus mode &nbsp; <kbd>Ctrl+F</kbd> Find in file &nbsp; <kbd>Ctrl+Shift+F</kbd> Search loaded files &nbsp; <kbd>Ctrl+H</kbd> History</p>
      <p><kbd>Ctrl+B</kbd> Bold &nbsp; <kbd>Ctrl+I</kbd> Italic &nbsp; <kbd>Ctrl+K</kbd> Link</p>
      <p><kbd>Ctrl+=</kbd> Zoom in &nbsp; <kbd>Ctrl+-</kbd> Zoom out &nbsp; <kbd>Ctrl+0</kbd> Reset zoom</p>
      <p><kbd>Ctrl+Del</kbd> Delete draft &nbsp; <kbd>Esc</kbd> Close modal/find</p>
    `) },
  ];
}

function commandScore(item, query) {
  if (!query) return 1;
  const haystack = `${item.title} ${item.hint} ${item.id}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.every(term => haystack.includes(term))) return 0;
  let score = 10;
  for (const term of terms) {
    if (item.title.toLowerCase().startsWith(term)) score += 30;
    else if (item.title.toLowerCase().includes(term)) score += 18;
    else score += 8;
  }
  return score;
}

function renderCommandPalette() {
  const query = commandInput.value.trim();
  const items = commandItems()
    .map(item => ({ item, score: commandScore(item, query) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 18)
    .map(row => row.item);
  commandResults.innerHTML = '';
  commandActiveIndex = Math.min(commandActiveIndex, Math.max(0, items.length - 1));
  if (!items.length) {
    commandResults.innerHTML = '<div class="command-empty">No command matched.</div>';
    return;
  }
  items.forEach((item, index) => {
    const row = el('button', `command-row${index === commandActiveIndex ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.commandId = item.id;
    row.innerHTML = `
      <span class="command-icon">${escapeHtml(item.icon)}</span>
      <span class="command-body"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.hint)}</span></span>
      ${item.kbd ? `<span class="command-kbd">${escapeHtml(item.kbd)}</span>` : '<span></span>'}`;
    row.addEventListener('mousemove', () => setCommandActive(index));
    row.addEventListener('click', () => runCommand(item));
    commandResults.appendChild(row);
  });
}

function setCommandActive(index) {
  commandActiveIndex = index;
  [...commandResults.querySelectorAll('.command-row')].forEach((row, i) => row.classList.toggle('active', i === index));
}

function openCommandPalette() {
  commandOpen = true;
  commandOverlay.classList.remove('hidden');
  commandInput.value = '';
  commandActiveIndex = 0;
  renderCommandPalette();
  requestAnimationFrame(() => commandInput.focus());
}

function closeCommandPalette() {
  commandOpen = false;
  commandOverlay.classList.add('hidden');
  commandInput.blur();
}

async function runCommand(item) {
  closeCommandPalette();
  await item.run();
}

commandInput?.addEventListener('input', () => {
  commandActiveIndex = 0;
  renderCommandPalette();
});
commandInput?.addEventListener('keydown', (e) => {
  const rows = [...commandResults.querySelectorAll('.command-row')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setCommandActive(Math.min(rows.length - 1, commandActiveIndex + 1));
    rows[commandActiveIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setCommandActive(Math.max(0, commandActiveIndex - 1));
    rows[commandActiveIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    rows[commandActiveIndex]?.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
  }
});
$('command-close')?.addEventListener('click', closeCommandPalette);
commandOverlay?.addEventListener('click', (e) => { if (e.target === commandOverlay) closeCommandPalette(); });

function loadDraftTrash() {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(DRAFT_TRASH_KEY) || '[]');
  } catch {
    items = [];
  }
  const cutoff = Date.now() - DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000;
  const pruned = items.filter(item => item && item.deletedAt && new Date(item.deletedAt).getTime() >= cutoff);
  if (pruned.length !== items.length) localStorage.setItem(DRAFT_TRASH_KEY, JSON.stringify(pruned));
  return pruned;
}

function saveDraftTrash(items) {
  localStorage.setItem(DRAFT_TRASH_KEY, JSON.stringify(items.slice(0, 80)));
}

function trashDraftSnapshot(note, content) {
  const items = loadDraftTrash();
  items.unshift({
    id: 'trash-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    title: note?.title || sessionTitleFromContent(content) || 'Untitled',
    content: content || '',
    deletedAt: new Date().toISOString(),
  });
  saveDraftTrash(items);
}

function sessionTitleFromContent(content) {
  const first = String(content || '').split('\n').find(line => line.trim());
  if (!first) return '';
  return first.replace(/^#+\s*/, '').trim().slice(0, 80);
}

function daysLeft(deletedAt) {
  const expires = new Date(deletedAt).getTime() + DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function deleteDraftWithTrash(note) {
  if (!note || note.path) return;
  const content = note.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(note.id);
  trashDraftSnapshot(note, content);
  renderSession(await window.go.main.App.DeleteNote(note.id));
  loadContent(await window.go.main.App.GetActiveContent());
  statusText.textContent = 'Draft moved to Trash for 30 days';
}

async function restoreDraftTrash(itemId) {
  const items = loadDraftTrash();
  const item = items.find(entry => entry.id === itemId);
  if (!item) return;
  renderSession(await window.go.main.App.NewNote());
  await window.go.main.App.UpdateContent(activeId, item.content || '', true);
  loadContent(item.content || '');
  renderSession(await window.go.main.App.GetSession());
  saveDraftTrash(items.filter(entry => entry.id !== itemId));
  modalOverlay.classList.add('hidden');
  setView('markdown');
  statusText.textContent = 'Draft restored from Trash';
}

async function deleteDraftTrashItem(itemId) {
  saveDraftTrash(loadDraftTrash().filter(entry => entry.id !== itemId));
  await showTrashView();
}

async function emptyDraftTrash() {
  saveDraftTrash([]);
  await showTrashView();
}

function renderTrashRows(items) {
  if (!items.length) return '<div class="trash-empty">Trash is empty. Deleted drafts stay here for 30 days.</div>';
  return `<div class="trash-list">${items.map(item => `
    <div class="trash-row">
      <div class="trash-body">
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
        <span>Deleted ${escapeHtml(new Date(item.deletedAt).toLocaleString())} · ${daysLeft(item.deletedAt)} day${daysLeft(item.deletedAt) === 1 ? '' : 's'} left</span>
        <p>${escapeHtml((item.content || '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Empty draft')}</p>
      </div>
      <div class="trash-actions">
        <button data-trash-restore="${escapeHtml(item.id)}">Restore</button>
        <button data-trash-delete="${escapeHtml(item.id)}" class="danger">Delete</button>
      </div>
    </div>`).join('')}</div>`;
}

async function loadFileTrash() {
  try {
    if (window.go?.main?.App?.ListFileTrash) return await window.go.main.App.ListFileTrash();
  } catch {}
  return [];
}

function renderFileTrashRows(items) {
  if (!items.length) return '<div class="trash-empty">No saved files in Trash.</div>';
  return `<div class="trash-list">${items.map(item => `
    <div class="trash-row">
      <div class="trash-body">
        <strong>${escapeHtml(item.title || basename(item.originalPath) || 'File')}</strong>
        <span>Deleted ${escapeHtml(new Date(item.deletedAt).toLocaleString())} · ${daysLeft(item.deletedAt)} day${daysLeft(item.deletedAt) === 1 ? '' : 's'} left · ${escapeHtml(typeLabel(getFileType(item.originalPath, item.kind)))}</span>
        <p>${escapeHtml(item.originalPath || '')} · ${formatBytes(item.size || 0)}</p>
      </div>
      <div class="trash-actions">
        <button data-file-trash-restore="${escapeHtml(item.id)}">Restore</button>
        <button data-file-trash-delete="${escapeHtml(item.id)}" class="danger">Delete</button>
      </div>
    </div>`).join('')}</div>`;
}

async function emptyAllTrash() {
  saveDraftTrash([]);
  try {
    if (window.go?.main?.App?.EmptyFileTrash) await window.go.main.App.EmptyFileTrash();
  } catch {}
  await showTrashView();
}

async function showTrashView() {
  const items = loadDraftTrash();
  const fileItems = await loadFileTrash();
  const total = items.length + fileItems.length;
  showModal('Trash', `
    <div class="trash-head">
      <span>${total} item${total === 1 ? '' : 's'} · auto-cleanup after ${DRAFT_TRASH_DAYS} days</span>
      <button data-trash-empty ${total ? '' : 'disabled'}>Empty Trash</button>
    </div>
    <h3 style="margin:8px 0 6px;font-size:12px;font-weight:900;">Saved files</h3>
    ${renderFileTrashRows(fileItems)}
    <h3 style="margin:12px 0 6px;font-size:12px;font-weight:900;">Drafts</h3>
    ${renderTrashRows(items)}
    <p style="margin-top:10px;color:var(--muted);font-size:11px;">Saved files are copied into Markpad storage before originals are removed. Restores use the original path or a restored-name fallback if there is a collision.</p>
  `);
}

function byteSize(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function localStorageMarkpadBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('markpad-')) continue;
    total += byteSize(key) + byteSize(localStorage.getItem(key) || '');
  }
  return total;
}

async function loadedDocumentFootprint() {
  let editableBytes = 0;
  let editableCount = 0;
  let readOnlyCount = 0;
  for (const note of cachedNotes) {
    const type = getFileType(note.path, note.kind);
    if (isReadOnlyType(type)) {
      readOnlyCount++;
      continue;
    }
    editableCount++;
    const content = note.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(note.id);
    editableBytes += byteSize(content);
  }
  return { editableBytes, editableCount, readOnlyCount };
}

function heapFootprintHtml() {
  const mem = performance && performance.memory ? performance.memory : null;
  if (!mem) return '<span class="diag-muted">Unavailable in this webview</span>';
  return `
    <span>${formatBytes(mem.usedJSHeapSize || 0)} used JS heap</span>
    <span>${formatBytes(mem.totalJSHeapSize || 0)} total JS heap</span>
    <span>${formatBytes(mem.jsHeapSizeLimit || 0)} heap limit</span>`;
}

async function runtimeFootprint() {
  try {
    if (window.go?.main?.App?.GetRuntimeStats) return await window.go.main.App.GetRuntimeStats();
  } catch {}
  return null;
}

async function showLocalFootprint() {
  const docs = await loadedDocumentFootprint();
  const runtimeStats = await runtimeFootprint();
  const canvasBytes = byteSize(localStorage.getItem(CANVAS_DOC_KEY) || '') + byteSize(localStorage.getItem(CANVAS_SESSION_KEY) || '');
  const trashItems = loadDraftTrash();
  const trashBytes = byteSize(localStorage.getItem(DRAFT_TRASH_KEY) || '');
  const markpadLocalBytes = localStorageMarkpadBytes();
  showModal('Local Footprint', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${runtimeStats?.rssAvailable ? formatBytes(runtimeStats.processRss) : 'N/A'}</strong><span>Process RSS</span><small>${runtimeStats?.rssSource || 'Backend metric unavailable'}</small></div>
      <div class="diag-card"><strong>${runtimeStats ? formatBytes(runtimeStats.goAlloc) : 'N/A'}</strong><span>Go heap alloc</span><small>${runtimeStats ? `${formatBytes(runtimeStats.goSys)} Go sys · ${runtimeStats.goNumGC} GC` : 'Backend metric unavailable'}</small></div>
      <div class="diag-card"><strong>${formatBytes(docs.editableBytes)}</strong><span>Loaded editable text</span><small>${docs.editableCount} editable · ${docs.readOnlyCount} read-only loaded</small></div>
      <div class="diag-card"><strong>${formatBytes(canvasBytes)}</strong><span>Canvas draft/session</span><small>${(canvasDoc?.elements || []).length} canvas elements</small></div>
      <div class="diag-card"><strong>${formatBytes(trashBytes)}</strong><span>Draft trash</span><small>${trashItems.length} retained draft${trashItems.length === 1 ? '' : 's'}</small></div>
      <div class="diag-card"><strong>${formatBytes(markpadLocalBytes)}</strong><span>Markpad localStorage</span><small>themes, layout, canvas, draft trash</small></div>
    </div>
    <div class="diag-heap"><strong>Browser heap</strong>${heapFootprintHtml()}</div>
    <p class="diag-note">Metrics are sampled only when this panel opens. Loaded text and local persisted UI data are counted without scanning the filesystem.</p>
  `);
}

async function chooseLocalFolder() {
  try {
    if (!window.go?.main?.App?.ChooseLocalFolder) {
      statusText.textContent = 'Local folder backend unavailable';
      return;
    }
    await window.go.main.App.ChooseLocalFolder();
    await showLocalFolder();
  } catch (err) {
    statusText.textContent = 'Choose folder failed: ' + err;
  }
}

async function searchLocalFolderPrompt() {
  const query = window.prompt('Search local folder');
  if (!query || !query.trim()) return;
  await showLocalFolder(query.trim());
}

async function createLocalFolderNote() {
  const title = window.prompt('New local note title');
  if (title === null) return;
  try {
    if (!window.go?.main?.App?.CreateLocalFolderNote) {
      statusText.textContent = 'Local note backend unavailable';
      return;
    }
    renderSession(await window.go.main.App.CreateLocalFolderNote(title));
    loadContent(await window.go.main.App.GetActiveContent());
    setView('markdown');
    modalOverlay.classList.add('hidden');
    statusText.textContent = 'Local note created';
  } catch (err) {
    statusText.textContent = 'Create local note failed: ' + err;
  }
}

async function createLocalFolderCanvas() {
  const title = window.prompt('New local canvas title');
  if (title === null) return;
  try {
    if (!window.go?.main?.App?.CreateLocalFolderCanvas) {
      statusText.textContent = 'Local canvas backend unavailable';
      return;
    }
    renderSession(await window.go.main.App.CreateLocalFolderCanvas(title));
    loadContent(await window.go.main.App.GetActiveContent());
    modalOverlay.classList.add('hidden');
    loadCurrentDocumentIntoCanvas();
    statusText.textContent = 'Local canvas created';
  } catch (err) {
    statusText.textContent = 'Create local canvas failed: ' + err;
  }
}

async function openLocalFolderFile(path) {
  if (!path) return;
  if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
  try {
    renderSession(await window.go.main.App.OpenDroppedFile(path));
    loadContent(await window.go.main.App.GetActiveContent());
    const active = cachedNotes.find(n => n.id === activeId);
    setView(defaultViewForFileType(active?.path, active?.kind));
    modalOverlay.classList.add('hidden');
    statusText.textContent = 'Opened local file';
  } catch (err) {
    statusText.textContent = 'Open failed: ' + err;
  }
}

function renderLocalFolderFiles(files) {
  if (!files.length) return '<div class="local-empty">No files listed. Choose a folder or search for text.</div>';
  return `<div class="local-list">${files.map(file => `
    <button class="local-row" data-local-open="${escapeHtml(file.path)}">
      <span class="local-badge">${escapeHtml(fileIcon(file.path))}</span>
      <span class="local-body">
        <strong>${escapeHtml(file.relPath || file.title)}</strong>
        <span>${escapeHtml(typeLabel(getFileType(file.path, file.kind)))} · ${formatBytes(file.size || 0)}${file.modified ? ' · ' + escapeHtml(file.modified) : ''}</span>
      </span>
    </button>`).join('')}</div>`;
}

function renderLocalSearchHits(hits) {
  if (!hits.length) return '<div class="local-empty">No local folder matches.</div>';
  return `<div class="local-list">${hits.map(hit => `
    <button class="local-row" data-local-open="${escapeHtml(hit.path)}">
      <span class="local-badge">${escapeHtml(fileIcon(hit.path))}</span>
      <span class="local-body">
        <strong>${escapeHtml(hit.relPath || hit.title)}</strong>
        <span>Line ${Number(hit.line || 0) + 1} · ${escapeHtml(typeLabel(getFileType(hit.path, hit.kind)))}</span>
        <small>${escapeHtml(hit.snippet || '')}</small>
      </span>
    </button>`).join('')}</div>`;
}

async function showLocalFolder(query = '') {
  if (!window.go?.main?.App?.GetLocalFolder) {
    showModal('Local Folder', '<div class="local-empty">Local folder backend unavailable in this build.</div>');
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  let content = '';
  if (!info.path) {
    content = '<div class="local-empty">No default local folder set yet.</div>';
  } else if (info.missing) {
    content = '<div class="local-empty">The saved local folder is missing.</div>';
  } else if (query) {
    const hits = await window.go.main.App.SearchLocalFolder(query, 50);
    content = `<div class="local-summary">Search: <b>${escapeHtml(query)}</b> · ${hits.length} hit${hits.length === 1 ? '' : 's'}</div>${renderLocalSearchHits(hits)}`;
  } else {
    const files = await window.go.main.App.ListLocalFolderFiles(200);
    content = `<div class="local-summary">${files.length} listed file${files.length === 1 ? '' : 's'} · bounded preview</div>${renderLocalFolderFiles(files)}`;
  }
  showModal('Local Folder', `
    <div class="local-head">
      <div><strong>${escapeHtml(info.path || 'No folder selected')}</strong><span>${info.missing ? 'Missing' : info.path ? 'Default local workspace' : 'Choose a folder to start'}</span></div>
      <div class="local-actions">
        <button data-local-folder-choose>Choose</button>
        <button data-local-folder-new ${info.path && !info.missing ? '' : 'disabled'}>New note</button>
        <button data-local-folder-canvas ${info.path && !info.missing ? '' : 'disabled'}>New canvas</button>
        <button data-local-folder-search ${info.path && !info.missing ? '' : 'disabled'}>Search</button>
        <button data-local-folder-clear ${info.path ? '' : 'disabled'} class="danger">Clear</button>
      </div>
    </div>
    ${content}
    <p class="local-note">This is a local-first folder layer only. It does not sync and does not build a persistent index.</p>
  `);
}

const TASK_LINE_RE = /^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)( |x|X)(\].*)$/;
const FENCE_LINE_RE = /^(\s*)(```|~~~)/;

function normalizePriority(raw) {
  if (!raw) return '';
  const v = raw.toLowerCase();
  if (v === 'h' || v === 'high') return 'high';
  if (v === 'm' || v === 'med' || v === 'medium') return 'med';
  if (v === 'l' || v === 'low') return 'low';
  return '';
}

function extractTaskTokens(text) {
  const due = (text.match(/\bdue:(\d{4}-\d{2}-\d{2})\b/) || [])[1] || '';
  const priority = normalizePriority((text.match(/!(high|h|med|medium|m|low|l)\b/i) || [])[1]);
  const waiting = /(^|\s)@waiting\b/i.test(text);
  const tags = [...text.matchAll(/(^|\s)#([A-Za-z0-9_/-]+)/g)].map(m => m[2]);
  const cleaned = text
    .replace(/\bdue:\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/!(high|h|med|medium|m|low|l)\b/ig, '')
    .replace(/(^|\s)@waiting\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { due, priority, waiting, tags, text: cleaned || text.trim() };
}

function parseTasksFromContent(note, content) {
  const lines = content.split('\n');
  const tasks = [];
  let inFence = false;
  let fenceMarker = '';
  let taskIndex = 0;
  let offset = 0;
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    const fence = line.match(FENCE_LINE_RE);
    if (fence) {
      const marker = fence[2];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ''; }
      offset += line.length + 1;
      continue;
    }
    if (!inFence) {
      const match = line.match(TASK_LINE_RE);
      if (match) {
        const tail = match[3].replace(/^\]\s*/, '');
        const tokens = extractTaskTokens(tail);
        tasks.push({
          id: `${note.id}:${taskIndex}`,
          noteId: note.id,
          noteTitle: note.path ? note.title : 'Untitled',
          path: note.path || 'Draft',
          index: taskIndex,
          line: lineNumber,
          offset,
          checked: match[2].toLowerCase() === 'x',
          raw: line,
          text: tokens.text,
          due: tokens.due,
          priority: tokens.priority,
          waiting: tokens.waiting,
          tags: tokens.tags,
        });
        taskIndex++;
      }
    }
    offset += line.length + 1;
  }
  return tasks;
}

async function collectLoadedTasks() {
  const tasks = [];
  const openPaths = new Set(cachedNotes.filter(note => note.path).map(note => note.path));
  for (const note of cachedNotes) {
    const type = getFileType(note.path, note.kind);
    if (isReadOnlyType(type)) continue;
    const content = note.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(note.id);
    tasks.push(...parseTasksFromContent(note, content));
  }
  if (window.go?.main?.App?.ListLocalFolderTasks) {
    try {
      const localTasks = await window.go.main.App.ListLocalFolderTasks(1000);
      for (const task of localTasks || []) {
        if (task.sourcePath && openPaths.has(task.sourcePath)) continue;
        tasks.push(normalizeLocalFolderTask(task));
      }
    } catch {}
  }
  latestTasks = tasks;
  return tasks;
}

function normalizeLocalFolderTask(task) {
  return {
    id: `local:${task.id}`,
    local: true,
    localId: task.id,
    noteId: '',
    noteTitle: task.relPath || task.title || 'Local task',
    path: task.sourcePath,
    index: task.index,
    line: task.line,
    offset: 0,
    checked: !!task.checked,
    raw: task.rawText,
    text: task.text,
    due: task.due,
    priority: task.priority,
    waiting: !!task.waiting,
    tags: task.tags || [],
  };
}

function taskStatus(task) {
  if (task.checked) return 'done';
  if (task.waiting) return 'waiting';
  if (!task.due) return 'today';
  const today = new Date().toISOString().slice(0, 10);
  return task.due <= today ? 'today' : 'upcoming';
}

function taskMeta(task) {
  const bits = [];
  bits.push(`<span class="task-pill">${escapeHtml(task.noteTitle)}</span>`);
  if (task.due) bits.push(`<span class="task-pill">due ${escapeHtml(task.due)}</span>`);
  if (task.priority) bits.push(`<span class="task-pill">!${escapeHtml(task.priority)}</span>`);
  if (task.waiting) bits.push('<span class="task-pill">@waiting</span>');
  task.tags.forEach(tag => bits.push(`<span class="task-pill">#${escapeHtml(tag)}</span>`));
  return bits.join('');
}

function renderTaskRow(task, compact) {
  return `
    <div class="task-row${task.checked ? ' done' : ''}">
      <button class="task-check" data-task-toggle="${escapeHtml(task.id)}" title="Toggle task">${task.checked ? '✓' : ''}</button>
      <div class="task-body">
        <div class="task-text">${escapeHtml(task.text)}</div>
        <div class="task-meta">${taskMeta(task)}</div>
      </div>
      ${compact ? '' : `<button class="task-open" data-task-open="${escapeHtml(task.id)}">Open</button>`}
    </div>`;
}

function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="task-empty">No Markdown tasks found in loaded files.</div>';
  return `<div class="task-list">${tasks.map(task => renderTaskRow(task)).join('')}</div>`;
}

function renderTaskBoard(tasks) {
  const columns = [
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
    ['waiting', 'Waiting'],
    ['done', 'Done'],
  ];
  return `<div class="task-board">${columns.map(([id, label]) => {
    const colTasks = tasks.filter(task => taskStatus(task) === id);
    return `<section class="task-col"><h4>${label} (${colTasks.length})</h4>${colTasks.length ? colTasks.map(task => renderTaskRow(task, true)).join('') : '<div class="task-empty">Empty</div>'}</section>`;
  }).join('')}</div>`;
}

function renderTaskCalendar(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = task.due || 'No due date';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'No due date') return 1;
    if (b === 'No due date') return -1;
    return a.localeCompare(b);
  });
  if (!keys.length) return '<div class="task-empty">No scheduled tasks found in loaded files.</div>';
  return `<div class="task-calendar">${keys.map(key => `<section class="task-day"><h4>${escapeHtml(key)}</h4>${groups.get(key).map(task => renderTaskRow(task)).join('')}</section>`).join('')}</div>`;
}

async function showTasksView(mode = taskViewMode) {
  taskViewMode = ['list', 'calendar', 'kanban'].includes(mode) ? mode : 'list';
  localStorage.setItem('markpad-task-view', taskViewMode);
  const tasks = await collectLoadedTasks();
  const openCount = tasks.filter(task => !task.checked).length;
  const body = taskViewMode === 'calendar' ? renderTaskCalendar(tasks)
    : taskViewMode === 'kanban' ? renderTaskBoard(tasks)
    : renderTaskList(tasks);
  showModal('Tasks', `
    <div class="task-view-tabs">
      <button class="task-tab${taskViewMode === 'list' ? ' active' : ''}" data-task-view="list">List</button>
      <button class="task-tab${taskViewMode === 'calendar' ? ' active' : ''}" data-task-view="calendar">Calendar</button>
      <button class="task-tab${taskViewMode === 'kanban' ? ' active' : ''}" data-task-view="kanban">Kanban</button>
      <button class="task-tab push" data-task-add>+ Task</button>
    </div>
    <div class="task-summary">${tasks.length} task${tasks.length === 1 ? '' : 's'} from loaded files · ${openCount} open · Markdown stays the source of truth.</div>
    ${body}
  `, true);
}

function findTaskTargetNote() {
  return cachedNotes.find(note => {
    const title = String(note.title || '').trim().toLowerCase();
    const name = basename(note.path || '').toLowerCase();
    return title === 'tasks' || title === 'task list' || name === 'tasks.md' || name === 'tasks.markdown';
  });
}

function formatTaskLine(raw) {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (/^[-+*]\s+\[[ xX]\]/.test(text) || /^\d+[.)]\s+\[[ xX]\]/.test(text)) return text;
  return `- [ ] ${text}`;
}

function appendTaskToMarkdown(content, line) {
  const body = String(content || '');
  const prefix = body.trim() ? body.replace(/\s*$/, '\n') : '# Tasks\n\n';
  return `${prefix}${line}\n`;
}

async function addQuickTask() {
  const raw = window.prompt('New task. You can add due:YYYY-MM-DD, !high, @waiting, #tag');
  const line = formatTaskLine(raw);
  if (!line) return;
  let target = findTaskTargetNote();
  if (!target) {
    renderSession(await window.go.main.App.NewNote());
    target = cachedNotes.find(note => note.id === activeId);
    const content = appendTaskToMarkdown('', line);
    await window.go.main.App.UpdateContent(activeId, content, true);
    loadContent(content);
    renderSession(await window.go.main.App.GetSession());
    setView('markdown');
    statusText.textContent = 'Created Tasks draft';
    await showTasksView(taskViewMode);
    return;
  }
  const content = target.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(target.id);
  const next = appendTaskToMarkdown(content, line);
  await window.go.main.App.UpdateContent(target.id, next, true);
  if (target.id === activeId) {
    currentContent = next;
    editor.value = next;
    if (viewMode !== 'markdown') renderViewer(currentContent, cachedNotes.find(n => n.id === activeId));
    updateStats();
    updateOutline();
  }
  renderSession(await window.go.main.App.GetSession());
  statusText.textContent = 'Task added to Tasks';
  await showTasksView(taskViewMode);
}

function toggleTaskAtIndex(markdown, taskIndex, checked) {
  const lines = markdown.split('\n');
  let current = 0;
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(FENCE_LINE_RE);
    if (fence) {
      const marker = fence[2];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ''; }
      continue;
    }
    if (inFence) continue;
    const match = lines[i].match(TASK_LINE_RE);
    if (!match) continue;
    if (current === taskIndex) {
      lines[i] = `${match[1]}${checked ? 'x' : ' '}${match[3]}`;
      return lines.join('\n');
    }
    current++;
  }
  return markdown;
}

async function toggleLoadedTask(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (task.local && window.go?.main?.App?.ToggleLocalFolderTask) {
    await window.go.main.App.ToggleLocalFolderTask(task.localId, !task.checked);
    await showTasksView(taskViewMode);
    return;
  }
  const content = task.noteId === activeId ? currentContent : await window.go.main.App.GetNoteContent(task.noteId);
  const next = toggleTaskAtIndex(content, task.index, !task.checked);
  if (task.noteId === activeId) {
    currentContent = next;
    editor.value = next;
    await window.go.main.App.UpdateContent(activeId, currentContent, true);
    if (viewMode !== 'markdown') renderViewer(currentContent, cachedNotes.find(n => n.id === activeId));
    updateStats();
    updateOutline();
  } else {
    await window.go.main.App.UpdateContent(task.noteId, next, true);
  }
  renderSession(await window.go.main.App.GetSession());
  await showTasksView(taskViewMode);
}

async function openLoadedTask(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (task.local) {
    if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
    try {
      renderSession(await window.go.main.App.OpenDroppedFile(task.path));
      loadContent(await window.go.main.App.GetActiveContent());
      modalOverlay.classList.add('hidden');
      setView('markdown');
      requestAnimationFrame(() => {
        editor.focus();
        const start = offsetForLine(editor.value, task.line);
        const end = Math.min(start + String(task.raw || '').length, editor.value.length);
        editor.setSelectionRange(start, end);
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
        editor.scrollTop = Math.max(0, task.line * lineHeight - editor.clientHeight * 0.35);
      });
    } catch (err) {
      statusText.textContent = 'Open task failed: ' + err;
    }
    return;
  }
  if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
  await window.go.main.App.SetActive(task.noteId);
  activeId = task.noteId;
  loadContent(await window.go.main.App.GetNoteContent(task.noteId));
  renderSession(await window.go.main.App.GetSession());
  modalOverlay.classList.add('hidden');
  setView('markdown');
  requestAnimationFrame(() => {
    editor.focus();
    const start = Math.min(task.offset, editor.value.length);
    const end = Math.min(start + task.raw.length, editor.value.length);
    editor.setSelectionRange(start, end);
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, task.line * lineHeight - editor.clientHeight * 0.35);
  });
}

function offsetForLine(content, lineNumber) {
  if (lineNumber <= 0) return 0;
  let line = 0;
  for (let i = 0; i < content.length; i++) {
    if (line === lineNumber) return i;
    if (content.charCodeAt(i) === 10) line++;
  }
  return content.length;
}

function newCanvasDoc() {
  return {
    type: 'markpad-canvas',
    version: 1,
    source: 'markpad',
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}

function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeCanvasDoc(input) {
  if (input && input.type === 'markpad-canvas' && Array.isArray(input.elements)) {
    return {
      type: 'markpad-canvas',
      version: 1,
      source: input.source || 'markpad',
      elements: input.elements.filter(Boolean),
      appState: input.appState || { viewBackgroundColor: '#ffffff' },
      files: input.files || {},
    };
  }
  if (input && Array.isArray(input.nodes)) {
    const elements = [];
    const byID = new Map();
    input.nodes.forEach((node) => {
      const x = Number(node.x || 0);
      const y = Number(node.y || 0);
      const w = Number(node.width || 260);
      const h = Number(node.height || 140);
      byID.set(node.id, { x, y, w, h });
      elements.push({ id: canvasId(), type: 'rect', x, y, w, h, stroke: '#6b6e68', width: 2 });
      const label = node.type === 'file' ? (node.file || 'File') : (node.text || node.label || 'Note');
      elements.push({ id: canvasId(), type: 'text', x: x + 14, y: y + 30, text: label, stroke: '#2f6f61', size: 16 });
    });
    (input.edges || []).forEach((edge) => {
      const from = byID.get(edge.fromNode);
      const to = byID.get(edge.toNode);
      if (!from || !to) return;
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h / 2;
      const x2 = to.x + to.w / 2;
      const y2 = to.y + to.h / 2;
      elements.push({ id: canvasId(), type: 'arrow', x: x1, y: y1, w: x2 - x1, h: y2 - y1, stroke: '#2f6f61', width: 2 });
    });
    return {
      type: 'markpad-canvas',
      version: 1,
      source: 'markpad-import-obsidian-canvas',
      elements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };
  }
  throw new Error('Unsupported canvas JSON');
}

function canvasElementBounds(el) {
  if (el.type === 'path' && el.points?.length) {
    const xs = el.points.map(p => p.x);
    const ys = el.points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (el.type === 'text') {
    const lines = String(el.text || '').split('\n');
    const size = el.size || 16;
    return { x: el.x, y: el.y - size, w: Math.max(...lines.map(line => line.length), 1) * size * .62, h: lines.length * size * 1.35 };
  }
  return {
    x: Math.min(el.x || 0, (el.x || 0) + (el.w || 0)),
    y: Math.min(el.y || 0, (el.y || 0) + (el.h || 0)),
    w: Math.abs(el.w || 0),
    h: Math.abs(el.h || 0),
  };
}

function updateCanvasStatus() {
  if (!canvasStatus || !canvasSession) return;
  const count = (canvasDoc?.elements || []).length;
  const zoom = Math.round((canvasSession.camera?.scale || 1) * 100);
  canvasStatus.textContent = `${count} element${count === 1 ? '' : 's'} · ${zoom}%`;
}

function fitCanvasToContent() {
  if (!canvasDoc || !canvasStage) return;
  const elements = canvasDoc.elements || [];
  if (!elements.length) {
    canvasSession.camera = { x: 0, y: 0, scale: 1 };
    saveCanvasState();
    renderCanvas();
    return;
  }
  const bounds = elements.map(canvasElementBounds);
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w));
  const maxY = Math.max(...bounds.map(b => b.y + b.h));
  const rect = canvasStage.getBoundingClientRect();
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const scale = Math.max(0.12, Math.min(2.5, Math.min((rect.width - 96) / contentW, (rect.height - 96) / contentH)));
  canvasSession.camera = {
    x: rect.width / 2 - (minX + contentW / 2) * scale,
    y: rect.height / 2 - (minY + contentH / 2) * scale,
    scale,
  };
  saveCanvasState();
  renderCanvas();
}

function canvasToSvg(doc) {
  const elements = doc?.elements || [];
  const bounds = elements.map(canvasElementBounds);
  const minX = bounds.length ? Math.min(...bounds.map(b => b.x)) - 32 : 0;
  const minY = bounds.length ? Math.min(...bounds.map(b => b.y)) - 32 : 0;
  const maxX = bounds.length ? Math.max(...bounds.map(b => b.x + b.w)) + 32 : 960;
  const maxY = bounds.length ? Math.max(...bounds.map(b => b.y + b.h)) + 32 : 540;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = elements.map((el) => {
    const stroke = esc(el.stroke || '#2f6f61');
    const width = Number(el.width || 3);
    if (el.type === 'path' && el.points?.length) {
      const d = el.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
      return `<path d="${esc(d)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (el.type === 'rect') return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="none" stroke="${stroke}" stroke-width="${width}" rx="6"/>`;
    if (el.type === 'ellipse') return `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${Math.abs(el.w / 2)}" ry="${Math.abs(el.h / 2)}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
    if (el.type === 'line') return `<line x1="${el.x}" y1="${el.y}" x2="${el.x + el.w}" y2="${el.y + el.h}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
    if (el.type === 'arrow') {
      const x2 = el.x + el.w;
      const y2 = el.y + el.h;
      const head = arrowHeadPoints(el.x, el.y, x2, y2, Math.max(10, width * 4));
      return `<path d="M ${el.x} ${el.y} L ${x2} ${y2} M ${head.left.x} ${head.left.y} L ${x2} ${y2} L ${head.right.x} ${head.right.y}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (el.type === 'text') {
      const size = Number(el.size || 16);
      return String(el.text || '').split('\n').map((line, i) => `<text x="${el.x}" y="${el.y + i * size * 1.35}" fill="${stroke}" font-size="${size}" font-family="monospace">${esc(line)}</text>`).join('');
    }
    return '';
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${Math.ceil(maxX - minX)}" height="${Math.ceil(maxY - minY)}">\n  <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${esc(doc?.appState?.viewBackgroundColor || '#ffffff')}"/>\n  ${body}\n</svg>\n`;
}

function loadCanvasState() {
  try { canvasDoc = JSON.parse(localStorage.getItem(CANVAS_DOC_KEY) || ''); } catch { canvasDoc = null; }
  try { canvasSession = JSON.parse(localStorage.getItem(CANVAS_SESSION_KEY) || ''); } catch { canvasSession = null; }
  if (!canvasDoc || !Array.isArray(canvasDoc.elements)) canvasDoc = newCanvasDoc();
  if (!canvasSession) canvasSession = { camera: { x: 0, y: 0, scale: 1 } };
  canvasHistory = [];
  canvasHistoryIndex = -1;
  rememberCanvasHistory(true);
}

function saveCanvasState() {
  if (!canvasDoc || !canvasSession) return;
  localStorage.setItem(CANVAS_DOC_KEY, JSON.stringify(canvasDoc));
  localStorage.setItem(CANVAS_SESSION_KEY, JSON.stringify(canvasSession));
}

function canvasDocSnapshot() {
  return JSON.stringify(canvasDoc || newCanvasDoc());
}

function updateCanvasHistoryButtons() {
  const undo = $('canvas-undo');
  const redo = $('canvas-redo');
  if (undo) undo.disabled = canvasHistoryIndex <= 0;
  if (redo) redo.disabled = canvasHistoryIndex < 0 || canvasHistoryIndex >= canvasHistory.length - 1;
}

function rememberCanvasHistory(force) {
  if (!canvasDoc) return;
  const snap = canvasDocSnapshot();
  if (snap.length > CANVAS_HISTORY_BYTES) {
    canvasHistory = [snap];
    canvasHistoryIndex = 0;
    updateCanvasHistoryButtons();
    return;
  }
  if (!force && canvasHistory[canvasHistoryIndex] === snap) return;
  if (canvasHistoryIndex < canvasHistory.length - 1) canvasHistory.splice(canvasHistoryIndex + 1);
  canvasHistory.push(snap);
  while (canvasHistory.length > CANVAS_HISTORY_LIMIT) canvasHistory.shift();
  canvasHistoryIndex = canvasHistory.length - 1;
  updateCanvasHistoryButtons();
}

function restoreCanvasHistory(index) {
  if (index < 0 || index >= canvasHistory.length) return;
  try {
    canvasDoc = normalizeCanvasDoc(JSON.parse(canvasHistory[index]));
    canvasHistoryIndex = index;
    saveCanvasState();
    renderCanvas();
    updateCanvasHistoryButtons();
  } catch {}
}

function undoCanvas() {
  restoreCanvasHistory(canvasHistoryIndex - 1);
}

function redoCanvas() {
  restoreCanvasHistory(canvasHistoryIndex + 1);
}

function canvasId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function canvasCamera() {
  if (!canvasSession) loadCanvasState();
  return canvasSession.camera;
}

function canvasScreenToWorld(clientX, clientY) {
  const rect = canvasStage.getBoundingClientRect();
  const camera = canvasCamera();
  return {
    x: (clientX - rect.left - camera.x) / camera.scale,
    y: (clientY - rect.top - camera.y) / camera.scale,
  };
}

function resizeCanvasStage() {
  if (!canvasStage) return;
  const rect = canvasStage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvasStage.width !== width || canvasStage.height !== height) {
    canvasStage.width = width;
    canvasStage.height = height;
  }
  renderCanvas();
}

function drawCanvasGrid(ctx, width, height) {
  const camera = canvasCamera();
  const step = Math.max(24, 48 * camera.scale);
  const startX = ((camera.x % step) + step) % step;
  const startY = ((camera.y % step) + step) % step;
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-soft').trim() || '#e8e6df';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.75;
  for (let x = startX; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = startY; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.restore();
}

function renderCanvasElement(ctx, el) {
  ctx.save();
  ctx.strokeStyle = el.stroke || '#2f6f61';
  ctx.fillStyle = el.fill || 'transparent';
  ctx.lineWidth = el.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.type === 'path') {
    if (!el.points || el.points.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (const point of el.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  } else if (el.type === 'rect') {
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  } else if (el.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === 'line' || el.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.w, el.y + el.h);
    ctx.stroke();
    if (el.type === 'arrow') {
      const head = arrowHeadPoints(el.x, el.y, el.x + el.w, el.y + el.h, Math.max(10, (el.width || 3) * 4));
      ctx.beginPath();
      ctx.moveTo(head.left.x, head.left.y);
      ctx.lineTo(el.x + el.w, el.y + el.h);
      ctx.lineTo(head.right.x, head.right.y);
      ctx.stroke();
    }
  } else if (el.type === 'text') {
    ctx.fillStyle = el.stroke || '#2f6f61';
    ctx.font = `${el.size || 16}px "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace`;
    const lines = String(el.text || '').split('\n');
    lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * ((el.size || 16) * 1.35)));
  }
  ctx.restore();
}

function arrowHeadPoints(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return {
    left: { x: x2 - Math.cos(angle - spread) * size, y: y2 - Math.sin(angle - spread) * size },
    right: { x: x2 - Math.cos(angle + spread) * size, y: y2 - Math.sin(angle + spread) * size },
  };
}

function renderCanvas() {
  updateCanvasStatus();
  if (!canvasStage || !canvasDoc || !canvasActive) return;
  const ctx = canvasStage.getContext('2d', { alpha: false });
  const rect = canvasStage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
  const width = canvasStage.width / dpr;
  const height = canvasStage.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = styles.getPropertyValue('--editor').trim() || '#fffffc';
  ctx.fillRect(0, 0, width, height);
  drawCanvasGrid(ctx, width, height);
  const camera = canvasCamera();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  const view = {
    x: -camera.x / camera.scale,
    y: -camera.y / camera.scale,
    w: rect.width / camera.scale,
    h: rect.height / camera.scale,
  };
  const visible = (el) => {
    if (el.type === 'path') return true;
    const x = Math.min(el.x, el.x + (el.w || 0));
    const y = Math.min(el.y, el.y + (el.h || 0));
    const w = Math.abs(el.w || 220);
    const h = Math.abs(el.h || 60);
    return x + w >= view.x - 100 && y + h >= view.y - 100 && x <= view.x + view.w + 100 && y <= view.y + view.h + 100;
  };
  canvasDoc.elements.filter(visible).forEach(el => renderCanvasElement(ctx, el));
  if (canvasDraftElement) renderCanvasElement(ctx, canvasDraftElement);
}

function setCanvasTool(tool) {
  canvasTool = tool;
  localStorage.setItem('markpad-canvas-tool', tool);
  document.querySelectorAll('[data-canvas-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.canvasTool === tool));
}

function openCanvas() {
  loadCanvasState();
  canvasActive = true;
  canvasOverlay.classList.remove('hidden');
  setCanvasTool(canvasTool);
  requestAnimationFrame(resizeCanvasStage);
}

function closeCanvas() {
  finishCanvasTextEdit();
  canvasActive = false;
  canvasOverlay.classList.add('hidden');
  saveCanvasState();
}

function canvasHitTest(point) {
  for (let i = canvasDoc.elements.length - 1; i >= 0; i--) {
    const el = canvasDoc.elements[i];
    if (el.type === 'path') {
      if ((el.points || []).some(p => Math.hypot(p.x - point.x, p.y - point.y) < 12 / canvasCamera().scale)) return i;
    } else if (el.type === 'text') {
      const lines = String(el.text || '').split('\n');
      const w = Math.max(...lines.map(line => line.length), 8) * ((el.size || 16) * .62);
      const h = lines.length * ((el.size || 16) * 1.35);
      if (point.x >= el.x && point.x <= el.x + w && point.y >= el.y - 18 && point.y <= el.y + h) return i;
    } else {
      const x = Math.min(el.x, el.x + (el.w || 0));
      const y = Math.min(el.y, el.y + (el.h || 0));
      const w = Math.abs(el.w || 0);
      const h = Math.abs(el.h || 0);
      if (point.x >= x - 6 && point.x <= x + w + 6 && point.y >= y - 6 && point.y <= y + h + 6) return i;
    }
  }
  return -1;
}

function startCanvasTextEdit(point, existingIndex = -1) {
  const camera = canvasCamera();
  canvasTextTarget = existingIndex >= 0 ? existingIndex : null;
  const existing = existingIndex >= 0 ? canvasDoc.elements[existingIndex] : null;
  canvasTextEditor.value = existing?.text || '';
  canvasTextEditor.style.left = `${(existing?.x ?? point.x) * camera.scale + camera.x}px`;
  canvasTextEditor.style.top = `${((existing?.y ?? point.y) - 18) * camera.scale + camera.y}px`;
  canvasTextEditor.style.width = existing ? `${Math.max(180, String(existing.text || '').length * 8)}px` : '220px';
  canvasTextEditor.classList.remove('hidden');
  requestAnimationFrame(() => canvasTextEditor.focus());
  canvasTextEditor.dataset.worldX = String(existing?.x ?? point.x);
  canvasTextEditor.dataset.worldY = String(existing?.y ?? point.y);
}

function finishCanvasTextEdit() {
  if (!canvasTextEditor || canvasTextEditor.classList.contains('hidden')) return;
  const text = canvasTextEditor.value.trim();
  if (text) {
    if (canvasTextTarget !== null) {
      canvasDoc.elements[canvasTextTarget].text = text;
    } else {
      canvasDoc.elements.push({
        id: canvasId(),
        type: 'text',
        x: Number(canvasTextEditor.dataset.worldX || 0),
        y: Number(canvasTextEditor.dataset.worldY || 0),
        text,
        stroke: canvasColor.value,
        size: 16,
      });
    }
    saveCanvasState();
    rememberCanvasHistory();
  }
  canvasTextTarget = null;
  canvasTextEditor.classList.add('hidden');
  renderCanvas();
}

canvasStage?.addEventListener('pointerdown', (e) => {
  if (!canvasActive) return;
  finishCanvasTextEdit();
  const point = canvasScreenToWorld(e.clientX, e.clientY);
  canvasStage.setPointerCapture(e.pointerId);
  if (canvasTool === 'pan') {
    const camera = canvasCamera();
    canvasPanStart = { x: e.clientX, y: e.clientY, cameraX: camera.x, cameraY: camera.y };
    return;
  }
  if (canvasTool === 'erase') {
    const idx = canvasHitTest(point);
    if (idx >= 0) {
      canvasDoc.elements.splice(idx, 1);
      saveCanvasState();
      rememberCanvasHistory();
      renderCanvas();
    }
    return;
  }
  if (canvasTool === 'text') {
    const idx = canvasHitTest(point);
    startCanvasTextEdit(point, idx >= 0 && canvasDoc.elements[idx].type === 'text' ? idx : -1);
    return;
  }
  const base = { id: canvasId(), stroke: canvasColor.value, width: Number(canvasWidth.value || 3) };
  if (canvasTool === 'pen') canvasDrawing = { ...base, type: 'path', points: [point] };
  else canvasDrawing = { ...base, type: canvasTool, x: point.x, y: point.y, w: 0, h: 0 };
});

canvasStage?.addEventListener('pointermove', (e) => {
  if (!canvasActive) return;
  if (canvasPanStart) {
    const camera = canvasCamera();
    camera.x = canvasPanStart.cameraX + (e.clientX - canvasPanStart.x);
    camera.y = canvasPanStart.cameraY + (e.clientY - canvasPanStart.y);
    renderCanvas();
    return;
  }
  if (!canvasDrawing) return;
  const point = canvasScreenToWorld(e.clientX, e.clientY);
  if (canvasDrawing.type === 'path') {
    const last = canvasDrawing.points[canvasDrawing.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) > 1.5) canvasDrawing.points.push(point);
  } else {
    canvasDrawing.w = point.x - canvasDrawing.x;
    canvasDrawing.h = point.y - canvasDrawing.y;
  }
  canvasDraftElement = canvasDrawing;
  renderCanvas();
});

canvasStage?.addEventListener('pointerup', () => {
  if (canvasPanStart) {
    canvasPanStart = null;
    saveCanvasState();
  }
  if (!canvasDrawing) return;
  if (canvasDrawing.type === 'path' ? canvasDrawing.points.length > 1 : Math.hypot(canvasDrawing.w, canvasDrawing.h) > 3) {
    canvasDoc.elements.push(canvasDrawing);
    saveCanvasState();
    rememberCanvasHistory();
  }
  canvasDrawing = null;
  canvasDraftElement = null;
  renderCanvas();
});

canvasStage?.addEventListener('wheel', (e) => {
  if (!canvasActive) return;
  e.preventDefault();
  const camera = canvasCamera();
  const rect = canvasStage.getBoundingClientRect();
  const before = canvasScreenToWorld(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? 1.08 : 0.925;
  camera.scale = Math.max(0.12, Math.min(4, camera.scale * factor));
  camera.x = e.clientX - rect.left - before.x * camera.scale;
  camera.y = e.clientY - rect.top - before.y * camera.scale;
  saveCanvasState();
  renderCanvas();
}, { passive: false });

canvasTextEditor?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    canvasTextEditor.classList.add('hidden');
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    finishCanvasTextEdit();
  }
});
canvasTextEditor?.addEventListener('blur', finishCanvasTextEdit);
window.addEventListener('resize', resizeCanvasStage);
$('canvas-close')?.addEventListener('click', closeCanvas);
$('canvas-undo')?.addEventListener('click', undoCanvas);
$('canvas-redo')?.addEventListener('click', redoCanvas);
$('canvas-reset-view')?.addEventListener('click', () => {
  canvasSession.camera = { x: 0, y: 0, scale: 1 };
  saveCanvasState();
  renderCanvas();
});
$('canvas-fit')?.addEventListener('click', fitCanvasToContent);
function exportCanvasJson() {
  const json = JSON.stringify(canvasDoc || newCanvasDoc(), null, 2);
  downloadText('markpad-canvas-draft.json', 'application/json', json);
  statusText.textContent = 'Canvas JSON exported';
}
function exportCanvasSvg() {
  if (!canvasDoc) loadCanvasState();
  downloadText('markpad-canvas-draft.svg', 'image/svg+xml', canvasToSvg(canvasDoc));
  statusText.textContent = 'Canvas SVG exported';
}
function loadCurrentDocumentIntoCanvas() {
  const text = String(currentContent || '').trim();
  if (!text) {
    statusText.textContent = 'Current document is empty';
    return;
  }
  try {
    canvasDoc = normalizeCanvasDoc(JSON.parse(text));
    canvasSession = { camera: { x: 0, y: 0, scale: 1 } };
    canvasHistory = [];
    canvasHistoryIndex = -1;
    saveCanvasState();
    rememberCanvasHistory(true);
    openCanvas();
    requestAnimationFrame(fitCanvasToContent);
    statusText.textContent = 'Current document loaded into canvas';
  } catch (err) {
    statusText.textContent = 'Canvas load failed: ' + (err.message || err);
  }
}
async function saveCanvasAsDraft() {
  finishCanvasTextEdit();
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasDoc || newCanvasDoc(), null, 2) + '\n';
  if (canvasActive) closeCanvas();
  renderSession(await window.go.main.App.NewNote());
  await window.go.main.App.UpdateContent(activeId, json, true);
  loadContent(json);
  renderSession(await window.go.main.App.GetSession());
  setView('markdown');
  editor.focus();
  statusText.textContent = 'Canvas JSON draft created. Use Save As for .canvas';
}
function importCanvasJson() {
  openCanvas();
  canvasImportFile?.click();
}
$('canvas-import')?.addEventListener('click', importCanvasJson);
$('canvas-export')?.addEventListener('click', exportCanvasJson);
$('canvas-export-svg')?.addEventListener('click', exportCanvasSvg);
$('canvas-save-draft')?.addEventListener('click', saveCanvasAsDraft);
canvasImportFile?.addEventListener('change', async () => {
  const file = canvasImportFile.files && canvasImportFile.files[0];
  canvasImportFile.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    canvasDoc = normalizeCanvasDoc(JSON.parse(text));
    canvasSession.camera = { x: 0, y: 0, scale: 1 };
    saveCanvasState();
    rememberCanvasHistory(true);
    renderCanvas();
    statusText.textContent = 'Canvas imported';
  } catch (err) {
    statusText.textContent = 'Canvas import failed: ' + (err.message || err);
  }
});
$('canvas-clear')?.addEventListener('click', () => {
  canvasDoc = newCanvasDoc();
  saveCanvasState();
  rememberCanvasHistory(true);
  renderCanvas();
});
document.querySelectorAll('[data-canvas-tool]').forEach(btn => {
  btn.addEventListener('click', () => setCanvasTool(btn.dataset.canvasTool));
});
function makeNoteRow(note) {
  const isActive = note.id === activeId;
  const canTrash = !note.path || (note.path && !note.dirty);
  const row = el('div', `group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-selected ring-1 ring-accent/30' : 'hover:bg-hover'}`);
  row.dataset.noteId = note.id;
  row.draggable = true;

  // Star on the left
  if (note.path) {
    const star = el('button', `text-sm border-none cursor-pointer px-0.5 flex-shrink-0 ${note.star ? 'text-star' : 'text-star-off opacity-0 group-hover:opacity-100 hover:text-star'} transition-opacity`);
    star.textContent = note.star ? '\u2605' : '\u2606';
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      renderSession(await window.go.main.App.ToggleStar(note.id));
    });
    row.appendChild(star);
  }

  const ico = el('span', 'file-badge');
  ico.textContent = fileIcon(note.path);
  row.appendChild(ico);

  const content = el('div', 'flex-1 min-w-0');
  const title = el('div', 'text-[13px] font-medium truncate');
  title.textContent = note.path ? note.title : 'Untitled';
  const status = el('div', `text-[11px] ${note.dirty ? 'text-unsaved font-semibold' : 'text-muted'}`);
  status.textContent = note.dirty ? 'NOT SAVED' : (note.path ? typeLabel(getFileType(note.path, note.kind)) : 'draft');
  content.append(title, status);
  row.appendChild(content);

  // Close on the right
  const close = el('button', 'row-icon opacity-0 group-hover:opacity-100 transition-opacity');
  close.appendChild(closeIcon());
  close.title = note.path ? 'Close file' : 'Close draft';
  close.addEventListener('click', async (e) => {
    e.stopPropagation();
    await requestCloseNote(note);
  });
  row.appendChild(close);

  row.addEventListener('click', async () => {
    if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
    await window.go.main.App.SetActive(note.id);
    activeId = note.id;
    loadContent(await window.go.main.App.GetNoteContent(note.id));
    renderSession(await window.go.main.App.GetSession());
    restoreNoteView();
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxNoteId = note.id;
    const hasPath = !!note.path;
    const starBtn = ctxMenu.querySelector('[data-ctx="star"]');
    starBtn.textContent = note.star ? 'Unstar' : 'Star';
    starBtn.style.display = hasPath ? '' : 'none';
    ctxMenu.querySelector('[data-ctx="info"]').style.display = '';
    ctxMenu.querySelector('[data-ctx="folder"]').style.display = hasPath ? '' : 'none';
    ctxMenu.querySelector('[data-ctx="copypath"]').style.display = hasPath ? '' : 'none';
    ctxMenu.querySelector('[data-ctx="close"]').style.display = '';
    ctxMenu.querySelector('[data-ctx="delete"]').style.display = canTrash ? '' : 'none';
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.classList.remove('hidden');
  });

  row.addEventListener('dragstart', () => { draggedNoteId = note.id; row.classList.add('note-dragging'); });
  row.addEventListener('dragend', () => { row.classList.remove('note-dragging'); draggedNoteId = null; });
  row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('note-dragover'); });
  row.addEventListener('dragleave', () => row.classList.remove('note-dragover'));
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('note-dragover');
    if (!draggedNoteId || draggedNoteId === note.id) return;
    const ids = cachedNotes.map(n => n.id);
    const fromIdx = ids.indexOf(draggedNoteId);
    const toIdx = ids.indexOf(note.id);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedNoteId);
    renderSession(await window.go.main.App.ReorderNotes(ids));
  });

  return row;
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

function saveScrollPos() {
  if (!activeId) return;
  const pos = {
    editor: editor.scrollTop,
    viewer: viewer.parentElement ? viewer.parentElement.scrollTop : 0,
    cursor: editor.selectionStart
  };
  noteScrollPos[activeId] = pos;
  if (window.go?.main?.App?.UpdateReadPosition) {
    window.go.main.App.UpdateReadPosition(activeId, pos.editor, pos.viewer, pos.cursor).catch(() => {});
  }
}

function restoreScrollPos() {
  if (!activeId) return;
  const pos = noteScrollPos[activeId];
  if (!pos) return;
  requestAnimationFrame(() => {
    editor.scrollTop = pos.editor || 0;
    if (viewer.parentElement) viewer.parentElement.scrollTop = pos.viewer || 0;
    editor.selectionStart = editor.selectionEnd = pos.cursor || 0;
  });
}

function queueReadPositionSave() {
  clearTimeout(readPosTimer);
  readPosTimer = setTimeout(saveScrollPos, 350);
}

function loadContent(content) {
  currentContent = content || '';
  committedContent = currentContent;
  editor.value = currentContent;
  
  const wrapper = $('content-area');
  if (wrapper) {
    wrapper.classList.remove('content-fade-in');
    void wrapper.offsetWidth;
    wrapper.classList.add('content-fade-in');
  }

  const existingHistory = editHistories.get(activeId);
  if (!existingHistory || existingHistory.states[existingHistory.index]?.content !== currentContent) {
    editHistories.set(activeId, {
      states: [{ content: currentContent, start: 0, end: 0 }],
      index: 0,
      chars: currentContent.length,
      lastAt: 0,
    });
  }
  updateHistoryButtons();
  const active = cachedNotes.find(n => n.id === activeId);
  committedDirty = !!active?.dirty;
  const ft = getFileType(active?.path, active?.kind);
  if (isReadOnlyType(ft)) dirtyInd.classList.add('hidden');
  if (viewMode !== 'markdown') renderViewer(currentContent, active);
  updateStats();
  if (historyOpen) renderHistory();
  restoreScrollPos();
  updateOutline();
}

function defaultViewForFileType(path, kind) {
  const ft = getFileType(path, kind);
  if (isReadOnlyType(ft)) return 'viewer';
  if (ft === 'md') return 'viewer';
  if (ft === 'code') return 'viewer';
  return 'markdown';
}

function restoreNoteView() {
  const active = cachedNotes.find(n => n.id === activeId);
  const ft = getFileType(active?.path, active?.kind);
  const saved = noteViewModes[activeId];
  if (isReadOnlyType(ft)) {
    setView('viewer');
  } else if (ft !== 'md') {
    setView(saved === 'markdown' ? 'markdown' : 'viewer');
  } else {
    setView(saved || 'viewer');
  }
}

function askCloseChoice(note) {
  closeMessage.textContent = `"${note.title || 'Untitled'}" has unsaved changes.`;
  closeOverlay.classList.remove('hidden');
  return new Promise(resolve => {
    const finish = (choice) => {
      closeOverlay.classList.add('hidden');
      closeOverlay.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve(choice);
    };
    const onClick = (e) => {
      const button = e.target.closest('[data-close-choice]');
      if (button) finish(button.dataset.closeChoice);
      else if (e.target === closeOverlay) finish('cancel');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish('cancel');
    };
    closeOverlay.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}

async function requestCloseNote(note) {
  if (!note) return false;
  const hasUnsavedEditorChanges = note.id === activeId && currentContent !== committedContent;
  let choice = 'discard';
  if (note.dirty || hasUnsavedEditorChanges) choice = await askCloseChoice(note);
  if (choice === 'cancel') return false;
  if (choice === 'save') {
    if (note.id !== activeId) {
      saveScrollPos();
      await window.go.main.App.SetActive(note.id);
      renderSession(await window.go.main.App.GetSession());
      loadContent(await window.go.main.App.GetNoteContent(note.id));
      restoreNoteView();
    }
    await doSave();
    const state = await window.go.main.App.GetSession();
    const saved = (state.notes || []).find(n => n.id === note.id);
    if (saved?.dirty) return false;
  }
  const wasActive = note.id === activeId;
  renderSession(await window.go.main.App.CloseNote(note.id));
  editHistories.delete(note.id);
  if (wasActive) loadContent(await window.go.main.App.GetActiveContent());
  restoreNoteView();
  statusText.textContent = choice === 'discard' && (note.dirty || hasUnsavedEditorChanges) ? 'Closed without saving' : 'Closed';
  return true;
}

// ── Context menu ─────────────────────────────────────────
document.addEventListener('click', () => ctxMenu.classList.add('hidden'));
ctxMenu.querySelector('[data-ctx="star"]').addEventListener('click', async () => {
  if (ctxNoteId) renderSession(await window.go.main.App.ToggleStar(ctxNoteId));
});
ctxMenu.querySelector('[data-ctx="info"]').addEventListener('click', async () => {
  if (ctxNoteId) {
    const prevId = activeId;
    if (ctxNoteId !== activeId) {
      await window.go.main.App.SetActive(ctxNoteId);
      activeId = ctxNoteId;
    }
    await showFileInfo();
    if (prevId !== ctxNoteId) {
      await window.go.main.App.SetActive(prevId);
      activeId = prevId;
    }
  }
});
ctxMenu.querySelector('[data-ctx="folder"]').addEventListener('click', () => {
  const note = cachedNotes.find(n => n.id === ctxNoteId);
  if (note && note.path) window.go.main.App.OpenContainingFolder(note.path);
  else statusText.textContent = 'No file path';
});
ctxMenu.querySelector('[data-ctx="copypath"]').addEventListener('click', () => {
  const note = cachedNotes.find(n => n.id === ctxNoteId);
  if (note && note.path) {
    navigator.clipboard.writeText(note.path).then(() => { statusText.textContent = 'Path copied'; });
  } else statusText.textContent = 'No file path to copy';
});
ctxMenu.querySelector('[data-ctx="close"]').addEventListener('click', async () => {
  if (!ctxNoteId) return;
  const note = cachedNotes.find(n => n.id === ctxNoteId);
  await requestCloseNote(note);
});
ctxMenu.querySelector('[data-ctx="delete"]').addEventListener('click', async () => {
  if (!ctxNoteId) return;
  const note = cachedNotes.find(n => n.id === ctxNoteId);
  if (!note) return;
  if (note.path) {
    if (note.dirty) { statusText.textContent = 'Save or discard changes before deleting this file'; return; }
    try {
      renderSession(await window.go.main.App.MoveFileToTrash(ctxNoteId));
      loadContent(await window.go.main.App.GetActiveContent());
      statusText.textContent = 'File moved to Trash for 30 days';
    } catch (err) {
      statusText.textContent = 'Trash failed: ' + err;
    }
    return;
  }
  await deleteDraftWithTrash(note);
});

// ── View mode (editor / split / viewer) ──────────────────
function setView(mode) {
  const active = cachedNotes.find(n => n.id === activeId);
  const ft = getFileType(active?.path, active?.kind);

  if (isReadOnlyType(ft)) mode = 'viewer';
  if (ft !== 'md' && mode === 'split') mode = 'viewer';

  viewMode = mode;
  if (activeId) noteViewModes[activeId] = mode;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
    if (b.dataset.mode === 'split') b.classList.toggle('hidden', ft !== 'md');
    if (b.dataset.mode === 'markdown') b.classList.toggle('hidden', isReadOnlyType(ft));
  });
  const showEditor = mode === 'markdown' || mode === 'split';
  const showViewer = mode === 'viewer' || mode === 'split';
  editorCont.classList.toggle('hidden', !showEditor);
  viewerCont.classList.toggle('hidden', !showViewer);
  divider.classList.toggle('hidden', mode !== 'split');
  // Hide formatting toolbar for non-md files
  toolbar.classList.toggle('hidden', !showEditor || ft !== 'md');
  editor.readOnly = isReadOnlyType(ft);
  saveBtn.disabled = isReadOnlyType(ft);
  saveBtn.classList.toggle('opacity-50', isReadOnlyType(ft));
  $('btn-cancel').classList.toggle('hidden', isReadOnlyType(ft));
  const viewerLabel = document.querySelector('[data-mode="viewer"] span');
  if (viewerLabel) viewerLabel.textContent = isReadOnlyType(ft) ? 'Document' : ft === 'code' ? 'Code View' : 'Preview';
  if (showViewer) {
    renderViewer(currentContent, active);
  }
  if (mode === 'split') {
    requestAnimationFrame(applySplitRatio);
  }
  if (mode !== 'split') {
    editorCont.style.flex = '';
    viewerCont.style.flex = '';
  }
  if (!showEditor && findOpen) toggleFind();
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.mode));
});
divider.addEventListener('dblclick', () => {
  splitRatio = 50;
  applySplitRatio();
  statusText.textContent = 'Split reset to 50/50';
});
divider.addEventListener('mouseup', rememberSplitRatio);
document.addEventListener('mouseup', rememberSplitRatio);

function cycleView() {
  const active = cachedNotes.find(n => n.id === activeId);
  const ft = getFileType(active?.path, active?.kind);
  const modes = isReadOnlyType(ft) ? ['viewer'] : ft === 'md' ? ['markdown', 'split', 'viewer'] : ['markdown', 'viewer'];
  setView(modes[(modes.indexOf(viewMode) + 1) % modes.length]);
}

// ── Resizable split divider ──────────────────────────────
let resizing = false;
divider.addEventListener('mousedown', (e) => {
  if (viewMode !== 'split') return;
  resizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const area = $('content-area');
  const rect = area.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  const clamped = Math.max(20, Math.min(80, pct));
  editorCont.style.flex = `0 0 ${clamped}%`;
  viewerCont.style.flex = `0 0 ${100 - clamped}%`;
});
document.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ── Sidebar ──────────────────────────────────────────────
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  const expanded = $('sidebar-expanded-content');
  const collapsed = $('sidebar-collapsed-content');
  if (sidebarCollapsed) {
    sidebar.style.width = '48px';
    sidebar.style.minWidth = '48px';
    if (expanded) {
      expanded.classList.replace('opacity-100', 'opacity-0');
      expanded.classList.add('pointer-events-none');
    }
    if (collapsed) {
      collapsed.classList.replace('opacity-0', 'opacity-100');
      collapsed.classList.remove('pointer-events-none');
    }
  } else {
    sidebar.style.width = '256px';
    sidebar.style.minWidth = '256px';
    if (expanded) {
      expanded.classList.replace('opacity-0', 'opacity-100');
      expanded.classList.remove('pointer-events-none');
    }
    if (collapsed) {
      collapsed.classList.replace('opacity-100', 'opacity-0');
      collapsed.classList.add('pointer-events-none');
    }
  }
}
$('btn-collapse').addEventListener('click', toggleSidebar);
$('btn-expand').addEventListener('click', toggleSidebar);

function applySectionState() {
  document.querySelectorAll('[data-section-toggle]').forEach(btn => {
    const key = btn.dataset.sectionToggle;
    const body = document.querySelector(`[data-section-body="${key}"]`);
    const collapsed = !!collapsedSections[key];
    if (body) body.classList.toggle('hidden', collapsed);
    btn.querySelector('[data-chevron]').textContent = '▾';
    btn.querySelector('[data-chevron]').classList.toggle('collapsed', collapsed);
  });
}
document.querySelectorAll('[data-section-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sectionToggle;
    collapsedSections[key] = !collapsedSections[key];
    localStorage.setItem('markpad-sections', JSON.stringify(collapsedSections));
    applySectionState();
  });
});

// ── Editor ───────────────────────────────────────────────
editor.addEventListener('scroll', queueReadPositionSave);
editor.addEventListener('keyup', queueReadPositionSave);
viewerCont.addEventListener('scroll', queueReadPositionSave);
window.addEventListener('beforeunload', saveScrollPos);

function updateHistoryButtons() {
  const history = editHistories.get(activeId);
  undoBtn.disabled = !history || history.index <= 0;
  redoBtn.disabled = !history || history.index >= history.states.length - 1;
}

function recordEditState(inputType) {
  if (!activeId || applyingEditHistory) return;
  let history = editHistories.get(activeId);
  if (!history) {
    history = { states: [], index: -1, chars: 0, lastAt: 0 };
    editHistories.set(activeId, history);
  }
  const state = { content: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
  const current = history.states[history.index];
  if (current?.content === state.content) return;
  if (history.index < history.states.length - 1) {
    history.states.splice(history.index + 1);
    history.chars = history.states.reduce((sum, item) => sum + item.content.length, 0);
  }
  const now = Date.now();
  const grouped = /^(insertText|deleteContent)/.test(inputType || '') && now - history.lastAt < 550 && history.index > 0;
  if (grouped) {
    history.chars += state.content.length - history.states[history.index].content.length;
    history.states[history.index] = state;
  } else {
    history.states.push(state);
    history.index++;
    history.chars += state.content.length;
  }
  history.lastAt = now;
  while (history.states.length > EDIT_HISTORY_LIMIT || (history.chars > EDIT_HISTORY_CHARS && history.states.length > 2)) {
    history.chars -= history.states[0].content.length;
    history.states.shift();
    history.index--;
  }
  updateHistoryButtons();
}

let lastHistoryStepAt = 0;
function stepEditHistory(direction) {
  const now = Date.now();
  if (now - lastHistoryStepAt < 50) return;
  lastHistoryStepAt = now;

  const history = editHistories.get(activeId);
  if (!history) return;
  const next = history.index + direction;
  if (next < 0 || next >= history.states.length) return;
  history.index = next;
  const state = history.states[next];
  applyingEditHistory = true;
  editor.value = state.content;
  editor.selectionStart = state.start;
  editor.selectionEnd = state.end;
  editor.dispatchEvent(new InputEvent('input', { inputType: direction < 0 ? 'historyUndo' : 'historyRedo' }));
  applyingEditHistory = false;
  editor.focus();
  updateHistoryButtons();
}

editor.addEventListener('input', (e) => {
  const active = cachedNotes.find(n => n.id === activeId);
  if (isReadOnlyType(getFileType(active?.path, active?.kind))) return;
  recordEditState(e.inputType);
  currentContent = editor.value;
  const dirty = committedDirty || currentContent !== committedContent;
  if (active && dirty && !active.dirty) {
    active.dirty = true;
    window.go.main.App.MarkDirty(activeId).catch(() => {});
  }
  if (active) active.dirty = dirty;
  updateStats();
  dirtyInd.classList.toggle('hidden', !dirty);

  clearTimeout(draftTimer);
  const editId = activeId;
  const editContent = currentContent;
  draftTimer = setTimeout(async () => {
    if (!editId) return;
    await window.go.main.App.UpdateContent(editId, editContent, dirty);
    renderSession(await window.go.main.App.GetSession());
  }, DRAFT_MS);

  if (viewMode !== 'markdown') {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const active = cachedNotes.find(n => n.id === activeId);
      renderViewer(currentContent, active);
    }, RENDER_MS);
  }
  updateOutline();
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.substring(0, s) + '    ' + editor.value.substring(en);
    editor.selectionStart = editor.selectionEnd = s + 4;
    editor.dispatchEvent(new Event('input'));
  }
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const pos = editor.selectionStart;
    const text = editor.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const line = text.substring(lineStart, pos);
    const ulMatch = line.match(/^(\s*)([-*])\s(.+)/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s(.+)/);
    const taskMatch = line.match(/^(\s*)- \[([ x])\]\s(.+)/);
    const emptyUl = line.match(/^(\s*)([-*])\s$/);
    const emptyOl = line.match(/^(\s*)(\d+)\.\s$/);
    const emptyTask = line.match(/^(\s*)- \[([ x])\]\s$/);
    if (emptyUl || emptyOl || emptyTask) {
      e.preventDefault();
      editor.value = text.substring(0, lineStart) + '\n' + text.substring(pos);
      editor.selectionStart = editor.selectionEnd = lineStart + 1;
      editor.dispatchEvent(new Event('input'));
    } else if (taskMatch) {
      e.preventDefault();
      const prefix = `\n${taskMatch[1]}- [ ] `;
      editor.value = text.substring(0, pos) + prefix + text.substring(pos);
      editor.selectionStart = editor.selectionEnd = pos + prefix.length;
      editor.dispatchEvent(new Event('input'));
    } else if (ulMatch) {
      e.preventDefault();
      const prefix = `\n${ulMatch[1]}${ulMatch[2]} `;
      editor.value = text.substring(0, pos) + prefix + text.substring(pos);
      editor.selectionStart = editor.selectionEnd = pos + prefix.length;
      editor.dispatchEvent(new Event('input'));
    } else if (olMatch) {
      e.preventDefault();
      const next = parseInt(olMatch[2]) + 1;
      const prefix = `\n${olMatch[1]}${next}. `;
      editor.value = text.substring(0, pos) + prefix + text.substring(pos);
      editor.selectionStart = editor.selectionEnd = pos + prefix.length;
      editor.dispatchEvent(new Event('input'));
    }
  }
});

function updateStats() {
  const active = cachedNotes.find(n => n.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  if (isReadOnlyType(type)) {
    statusStats.textContent = `${typeLabel(type)} \u00b7 ${active?.size ? formatBytes(active.size) : 'read-only'}`;
    return;
  }
  const t = currentContent;
  const lines = t ? t.split('\n').length : 0;
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.ceil(words / 200));
  const ext = active?.path ? fileExt(active.path) : '';
  const lang = ext ? ext.toUpperCase() : typeLabel(type);
  statusStats.textContent = `${lang} \u00b7 ${lines} ln \u00b7 ${words} w \u00b7 ${t.length} ch \u00b7 ~${readMin} min \u00b7 UTF-8`;
}

// ── Save animation ───────────────────────────────────────
function flashSave() {
  saveBtn.classList.add('save-flash');
  dirtyInd.classList.add('hidden');
  statusText.textContent = 'Saved';
  setTimeout(() => saveBtn.classList.remove('save-flash'), 800);
}

// ── History panel ────────────────────────────────────────
let historyViewingContent = null; // stash content of selected snapshot

async function toggleHistory() {
  historyOpen = !historyOpen;
  histPanel.classList.toggle('hidden', !historyOpen);
  if (historyOpen) histPanel.classList.add('flex');
  else histPanel.classList.remove('flex');
  if (historyOpen) {
    await renderHistory();
  } else {
    historyBackToCurrent();
  }
}

function historyBackToCurrent() {
  historySelectedTs = null;
  historyViewingContent = null;
  histActions.classList.add('hidden');
  histList.querySelectorAll('.hist-entry').forEach(e => e.classList.remove('active'));
  editor.value = currentContent;
  if (viewMode !== 'markdown') {
    const active = cachedNotes.find(n => n.id === activeId);
    renderViewer(currentContent, active);
  }
  statusText.textContent = 'Ready';
}

async function renderHistory() {
  if (!activeId) return;
  const entries = await window.go.main.App.GetHistory(activeId);
  histList.innerHTML = '';
  historySelectedTs = null;
  historyViewingContent = null;
  histActions.classList.add('hidden');
  histEmpty.classList.toggle('hidden', entries.length > 0);
  histList.classList.toggle('hidden', entries.length === 0);

  // Current marker
  if (entries.length > 0) {
    const cur = el('div', 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent');
    cur.textContent = 'Current';
    histList.appendChild(cur);
  }

  entries.forEach((entry, idx) => {
    const row = el('div', 'hist-entry');
    if (idx === 0) row.classList.add('first');

    const top = el('div', 'flex items-center justify-between gap-2');
    const badge = el('span', `hist-badge ${entry.source}`);
    badge.textContent = entry.source === 'save-as' ? 'save as' : entry.source;
    const ago = el('span', 'text-[10px] text-muted');
    ago.textContent = entry.timeAgo;
    top.append(badge, ago);

    const ts = el('div', 'text-[10px] text-muted/60 mt-0.5');
    ts.textContent = new Date(entry.timestamp).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const meta = el('div', 'text-[11px] text-muted mt-0.5');
    meta.textContent = `${entry.lines} lines · ${formatBytes(entry.bytes)}`;
    const preview = el('div', 'text-[11px] text-[#3d403e] truncate mt-0.5');
    preview.textContent = entry.preview;
    row.append(top, ts, meta, preview);

    row.addEventListener('click', async () => {
      historySelectedTs = entry.timestamp;
      histList.querySelectorAll('.hist-entry').forEach(e => e.classList.remove('active'));
      row.classList.add('active');
      histActions.classList.remove('hidden');
      histActions.classList.add('flex');
      const snapshotContent = await window.go.main.App.GetHistoryContent(activeId, entry.timestamp);
      historyViewingContent = snapshotContent;
      showDiff(snapshotContent, currentContent);
      statusText.textContent = `Viewing: ${entry.timeAgo} (${entry.source})`;
    });
    histList.appendChild(row);
  });
}

function simpleDiff(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

  const ac = a.slice(prefix, a.length - suffix);
  const bc = b.slice(prefix, b.length - suffix);
  const n = ac.length, m = bc.length;
  const result = a.slice(0, prefix).map(text => ({ type: 'ctx', text }));

  // LCS memory is quadratic. Bound it and use a predictable fallback for large rewrites.
  if (n * m > 2_000_000) {
    ac.forEach(text => result.push({ type: 'del', text }));
    bc.forEach(text => result.push({ type: 'add', text }));
    b.slice(b.length - suffix).forEach(text => result.push({ type: 'ctx', text }));
    return result;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = ac[i - 1] === bc[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const core = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ac[i - 1] === bc[j - 1]) {
      core.push({ type: 'ctx', text: ac[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      core.push({ type: 'add', text: bc[j - 1] });
      j--;
    } else {
      core.push({ type: 'del', text: ac[i - 1] });
      i--;
    }
  }
  core.reverse();
  result.push(...core);
  b.slice(b.length - suffix).forEach(text => result.push({ type: 'ctx', text }));
  return result;
}

function showDiff(currentText, snapshotText) {
  if (currentText === snapshotText) {
    viewer.innerHTML = '<div class="p-6 text-muted text-center text-sm">This version is identical to your current content.</div>';
    viewerCont.classList.remove('hidden');
    editorCont.classList.add('hidden');
    toolbar.classList.add('hidden');
    return;
  }
  const diff = simpleDiff(currentText, snapshotText);
  let addCount = 0, delCount = 0;
  diff.forEach(d => { if (d.type === 'add') addCount++; if (d.type === 'del') delCount++; });

  // Collapse long unchanged runs — show 3 lines of context around changes
  const CTX = 3;
  const changed = new Set();
  diff.forEach((d, i) => { if (d.type !== 'ctx') changed.add(i); });
  const visible = new Set();
  changed.forEach(i => { for (let j = Math.max(0, i - CTX); j <= Math.min(diff.length - 1, i + CTX); j++) visible.add(j); });

  let html = `<div class="diff-view"><div class="diff-hunk"><span style="color:#1a5928">+${addCount} added</span> &nbsp; <span style="color:#8b1a1a">−${delCount} removed</span> &nbsp; <span style="opacity:0.5">${diff.filter(d=>d.type==='ctx').length} unchanged</span></div>`;
  let lastShown = -1;
  let lineNum = 0;
  diff.forEach((d, i) => {
    if (!visible.has(i)) return;
    if (lastShown !== -1 && i - lastShown > 1) {
      const skipped = i - lastShown - 1;
      html += `<div class="diff-line diff-ctx" style="text-align:center;color:#a3b8b0;font-style:italic;">··· ${skipped} unchanged line${skipped > 1 ? 's' : ''} ···</div>`;
    }
    lineNum++;
    const escaped = d.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const prefix = d.type === 'add' ? '+' : d.type === 'del' ? '−' : ' ';
    html += `<div class="diff-line diff-${d.type}"><span class="diff-gutter">${prefix}</span> ${escaped}</div>`;
    lastShown = i;
  });
  html += '</div>';
  viewer.innerHTML = html;
  viewerCont.classList.remove('hidden');
  editorCont.classList.add('hidden');
  toolbar.classList.add('hidden');
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

$('btn-history').addEventListener('click', toggleHistory);
$('history-close').addEventListener('click', toggleHistory);
histBack.addEventListener('click', () => {
  historyBackToCurrent();
  setView(viewMode);
});
histRestore.addEventListener('click', async () => {
  if (!historySelectedTs) return;
  try {
    renderSession(await window.go.main.App.RestoreVersion(activeId, historySelectedTs));
    loadContent(await window.go.main.App.GetNoteContent(activeId));
    statusText.textContent = 'Version restored';
    setView(viewMode);
    await renderHistory();
  } catch (err) { statusText.textContent = 'Restore failed: ' + err; }
});

// ── Find bar (Ctrl+F) ───────────────────────────────────
function toggleFind() {
  findOpen = !findOpen;
  findBar.classList.toggle('hidden', !findOpen);
  if (findOpen) { findInput.value = ''; findInput.focus(); findInfo.textContent = ''; }
}

function doFind() {
  const q = findInput.value;
  if (!q) { findInfo.textContent = ''; return; }
  const text = editor.value;
  const idx = text.toLowerCase().indexOf(q.toLowerCase(), editor.selectionEnd);
  if (idx !== -1) {
    editor.focus();
    editor.setSelectionRange(idx, idx + q.length);
    findInfo.textContent = 'Found';
  } else {
    const first = text.toLowerCase().indexOf(q.toLowerCase());
    if (first !== -1) {
      editor.focus();
      editor.setSelectionRange(first, first + q.length);
      findInfo.textContent = 'Wrapped';
    } else {
      findInfo.textContent = 'Not found';
    }
  }
}

findInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); doFind(); }
  else if (e.key === 'Escape') { e.preventDefault(); toggleFind(); editor.focus(); }
});
$('find-close')?.addEventListener('click', () => { toggleFind(); editor.focus(); });

// ── Toolbar ──────────────────────────────────────────────
toolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) applyFormat(btn.dataset.action);
});

function applyFormat(action) {
  const s = editor.selectionStart, e = editor.selectionEnd;
  const sel = editor.value.substring(s, e);
  let ins = '', cur = 0;
  const wrap = (a, fb, b) => { ins = a + (sel || fb) + b; cur = sel ? ins.length : a.length; };
  const pre = (p, fb) => { ins = p + (sel || fb); cur = ins.length; };

  switch (action) {
    case 'bold':        wrap('**', 'bold', '**'); break;
    case 'italic':      wrap('*', 'italic', '*'); break;
    case 'strikethrough': wrap('~~', 'text', '~~'); break;
    case 'h1':          pre('# ', 'Heading'); break;
    case 'h2':          pre('## ', 'Heading'); break;
    case 'h3':          pre('### ', 'Heading'); break;
    case 'code':        wrap('`', 'code', '`'); break;
    case 'codeblock':   ins = '\n```\n' + (sel || 'code') + '\n```\n'; cur = 5; break;
    case 'link':        ins = `[${sel || 'text'}](url)`; cur = sel ? ins.length - 1 : 1; break;
    case 'image':       ins = `![${sel || 'alt'}](url)`; cur = sel ? ins.length - 1 : 2; break;
    case 'ul':          pre('- ', 'item'); break;
    case 'ol':          pre('1. ', 'item'); break;
    case 'task':        pre('- [ ] ', 'task'); break;
    case 'table':       ins = '\n| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n'; cur = ins.length; break;
    case 'hr':          ins = '\n---\n'; cur = ins.length; break;
    case 'quote':       pre('> ', 'quote'); break;
    default: return;
  }
  editor.value = editor.value.substring(0, s) + ins + editor.value.substring(e);
  editor.selectionStart = editor.selectionEnd = s + cur;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

// ── Shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', async (e) => {
  const ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, key = e.key;
  const inSearchInput = document.activeElement === searchInput;
  const inCommandInput = document.activeElement === commandInput;
  if (ctrl && shift && key.toLowerCase() === 'f') { e.preventDefault(); openSearchPalette(); }
  else if (ctrl && !shift && key.toLowerCase() === 'p') { e.preventDefault(); openCommandPalette(); }
  else if (canvasActive && ctrl && !shift && key.toLowerCase() === 'z') { e.preventDefault(); undoCanvas(); }
  else if (canvasActive && ctrl && (key.toLowerCase() === 'y' || (shift && key.toLowerCase() === 'z'))) { e.preventDefault(); redoCanvas(); }
  else if (ctrl && !shift && key.toLowerCase() === 'z' && document.activeElement === editor) { e.preventDefault(); stepEditHistory(-1); }
  else if (ctrl && (key.toLowerCase() === 'y' || (shift && key.toLowerCase() === 'z')) && document.activeElement === editor) { e.preventDefault(); stepEditHistory(1); }
  else if (ctrl && !shift && key === 's') { e.preventDefault(); await doSave(); }
  else if (ctrl && shift && key === 'S') { e.preventDefault(); await doSaveAs(); }
  else if (ctrl && !shift && key === 'n') { e.preventDefault(); await doNew(); }
  else if (ctrl && !shift && key === 'o') { e.preventDefault(); await doOpen(); }
  else if (ctrl && !shift && key.toLowerCase() === 'w') { e.preventDefault(); await requestCloseNote(cachedNotes.find(n => n.id === activeId)); }
  else if (ctrl && !shift && key.toLowerCase() === 'q') { e.preventDefault(); if (window.runtime && window.runtime.Quit) window.runtime.Quit(); }
  else if (ctrl && shift && key === 'E') { e.preventDefault(); cycleView(); }
  else if (ctrl && shift && key === 'B') { e.preventDefault(); toggleSidebar(); }
  else if (ctrl && shift && key.toLowerCase() === 'l') { e.preventDefault(); toggleFocusMode(); }
  else if (ctrl && !shift && key === 'h') { e.preventDefault(); toggleHistory(); }
  else if (ctrl && !shift && key === 'f') { e.preventDefault(); toggleFind(); }
  else if (ctrl && !shift && key.toLowerCase() === 'b' && document.activeElement !== findInput && !inSearchInput && !inCommandInput) { e.preventDefault(); applyFormat('bold'); }
  else if (ctrl && !shift && key.toLowerCase() === 'i' && document.activeElement !== findInput && !inSearchInput && !inCommandInput) { e.preventDefault(); applyFormat('italic'); }
  else if (ctrl && !shift && key.toLowerCase() === 'k' && document.activeElement !== findInput && !inSearchInput && !inCommandInput) { e.preventDefault(); applyFormat('link'); }
  else if (key === 'Escape') {
    if (canvasActive) closeCanvas();
    if (commandOpen) closeCommandPalette();
    if (searchOpen) closeSearchPalette();
    if (findOpen) toggleFind();
    if (historyOpen) toggleHistory();
    modalOverlay.classList.add('hidden');
    ctxMenu.classList.add('hidden');
  }
  else if (ctrl && (key === '=' || key === '+')) { e.preventDefault(); zoomIn(); }
  else if (ctrl && key === '-') { e.preventDefault(); zoomOut(); }
  else if (ctrl && key === '0') { e.preventDefault(); zoomReset(); }
  else if (key === 'Delete' && ctrl) {
    e.preventDefault();
    const note = cachedNotes.find(n => n.id === activeId);
    if (note && !note.path) {
      await deleteDraftWithTrash(note);
    } else if (note && note.path && !note.dirty && window.go?.main?.App?.MoveFileToTrash) {
      try {
        renderSession(await window.go.main.App.MoveFileToTrash(activeId));
        loadContent(await window.go.main.App.GetActiveContent());
        statusText.textContent = 'File moved to Trash for 30 days';
      } catch (err) {
        statusText.textContent = 'Trash failed: ' + err;
      }
    } else if (note && note.path && note.dirty) {
      statusText.textContent = 'Save or discard changes before deleting this file';
    }
  }
});

// Ctrl+scroll zoom
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey && (e.target.closest('#editor-container') || e.target.closest('#viewer-container'))) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  }
}, { passive: false });

// ── Actions ──────────────────────────────────────────────
async function doSave() {
  if (saving) return;
  saving = true;
  statusText.textContent = 'Saving...';
  try {
    const state = await window.go.main.App.SaveActive(currentContent);
    renderSession(state);
    const active = (state.notes || []).find(n => n.id === state.activeId);
    if (active?.dirty) {
      statusText.textContent = 'Save cancelled';
      return;
    }
    committedContent = currentContent;
    committedDirty = false;
    flashSave();
    if (historyOpen) await renderHistory();
  } catch (err) { statusText.textContent = 'Save failed: ' + err; }
  finally { saving = false; }
}

async function doSaveAs() {
  const active = cachedNotes.find(n => n.id === activeId);
  if (isReadOnlyType(getFileType(active?.path, active?.kind))) { statusText.textContent = 'Read-only document: open externally to edit'; return; }
  statusText.textContent = 'Save As...';
  try {
    const state = await window.go.main.App.SaveAsDialog(currentContent);
    renderSession(state);
    const saved = (state.notes || []).find(n => n.id === state.activeId);
    if (saved?.dirty) {
      statusText.textContent = 'Save As cancelled';
      return;
    }
    committedContent = currentContent;
    committedDirty = false;
    flashSave();
    if (historyOpen) await renderHistory();
  } catch (err) { statusText.textContent = 'Save As failed: ' + err; }
}

async function doNew() {
  if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
  try {
    renderSession(await window.go.main.App.NewNote());
    loadContent('');
    setView('markdown');
    editor.focus();
    statusText.textContent = 'New note';
  } catch (err) { statusText.textContent = 'Error: ' + err; }
}

async function doOpen() {
  if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
  try {
    renderSession(await window.go.main.App.OpenFileDialog());
    loadContent(await window.go.main.App.GetActiveContent());
    const active = cachedNotes.find(n => n.id === activeId);
    setView(defaultViewForFileType(active?.path, active?.kind));
    statusText.textContent = `Opened ${typeLabel(getFileType(active?.path, active?.kind))}`;
  } catch (err) { statusText.textContent = 'Open failed: ' + err; }
}

// ── Buttons ──────────────────────────────────────────────
$('btn-new').addEventListener('click', doNew);
$('btn-new-mini').addEventListener('click', doNew);
$('btn-fileinfo').addEventListener('click', showFileInfo);
$('btn-search-all').addEventListener('click', openSearchPalette);
$('btn-command').addEventListener('click', openCommandPalette);
$('btn-tasks').addEventListener('click', () => showTasksView());
$('btn-canvas').addEventListener('click', openCanvas);
$('btn-focus').addEventListener('click', toggleFocusMode);
saveBtn.addEventListener('click', doSave);
undoBtn.addEventListener('click', () => stepEditHistory(-1));
redoBtn.addEventListener('click', () => stepEditHistory(1));
$('btn-cancel').addEventListener('click', async () => {
  editor.value = committedContent; currentContent = committedContent;
  if (viewMode !== 'markdown') {
    const active = cachedNotes.find(n => n.id === activeId);
    renderViewer(currentContent, active);
  }
  dirtyInd.classList.add('hidden'); updateStats(); statusText.textContent = 'Reverted';
  if (activeId) {
    renderSession(await window.go.main.App.RevertContent(activeId, currentContent, committedDirty));
  }
});

viewer.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-open-external]');
  if (!btn) return;
  window.go.main.App.OpenExternalPath(btn.dataset.openExternal);
});

// ── Modal ────────────────────────────────────────────────
function showModal(t, html, wide) {
  modalTitle.textContent = t;
  modalBodyEl.innerHTML = html;
  modalOverlay.classList.toggle('tasks-modal', !!wide);
  modalOverlay.classList.remove('hidden');
}
$('modal-close').addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });
modalBodyEl.addEventListener('click', async (e) => {
  const folder = e.target.closest('[data-open-folder]');
  if (folder) window.go.main.App.OpenContainingFolder(folder.dataset.openFolder);
  const themeChoice = e.target.closest('[data-theme-choice]');
  if (themeChoice) {
    applyTheme(themeChoice.dataset.themeChoice);
    showPreferences();
  }
  const taskView = e.target.closest('[data-task-view]');
  if (taskView) await showTasksView(taskView.dataset.taskView);
  const taskAdd = e.target.closest('[data-task-add]');
  if (taskAdd) await addQuickTask();
  const taskToggle = e.target.closest('[data-task-toggle]');
  if (taskToggle) await toggleLoadedTask(taskToggle.dataset.taskToggle);
  const taskOpen = e.target.closest('[data-task-open]');
  if (taskOpen) await openLoadedTask(taskOpen.dataset.taskOpen);
  const trashRestore = e.target.closest('[data-trash-restore]');
  if (trashRestore) await restoreDraftTrash(trashRestore.dataset.trashRestore);
  const trashDelete = e.target.closest('[data-trash-delete]');
  if (trashDelete) await deleteDraftTrashItem(trashDelete.dataset.trashDelete);
  const fileTrashRestore = e.target.closest('[data-file-trash-restore]');
  if (fileTrashRestore && window.go?.main?.App?.RestoreFileTrash) {
    renderSession(await window.go.main.App.RestoreFileTrash(fileTrashRestore.dataset.fileTrashRestore));
    loadContent(await window.go.main.App.GetActiveContent());
    modalOverlay.classList.add('hidden');
    statusText.textContent = 'File restored from Trash';
  }
  const fileTrashDelete = e.target.closest('[data-file-trash-delete]');
  if (fileTrashDelete && window.go?.main?.App?.DeleteFileTrash) {
    await window.go.main.App.DeleteFileTrash(fileTrashDelete.dataset.fileTrashDelete);
    await showTrashView();
  }
  const trashEmpty = e.target.closest('[data-trash-empty]');
  if (trashEmpty && !trashEmpty.disabled) await emptyAllTrash();
  const localChoose = e.target.closest('[data-local-folder-choose]');
  if (localChoose) await chooseLocalFolder();
  const localClear = e.target.closest('[data-local-folder-clear]');
  if (localClear && !localClear.disabled && window.go?.main?.App?.ClearLocalFolder) {
    await window.go.main.App.ClearLocalFolder();
    await showLocalFolder();
  }
  const localNew = e.target.closest('[data-local-folder-new]');
  if (localNew && !localNew.disabled) await createLocalFolderNote();
  const localCanvas = e.target.closest('[data-local-folder-canvas]');
  if (localCanvas && !localCanvas.disabled) await createLocalFolderCanvas();
  const localSearch = e.target.closest('[data-local-folder-search]');
  if (localSearch && !localSearch.disabled) await searchLocalFolderPrompt();
  const localOpen = e.target.closest('[data-local-open]');
  if (localOpen) await openLocalFolderFile(localOpen.dataset.localOpen);
});


async function showFileInfo() {
  if (!activeId) return;
  const info = await window.go.main.App.GetFileInfo(activeId);
  const sizeStr = info.size ? formatBytes(info.size) : 'N/A';
  showModal('File Info', `
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:4px 8px;color:#6b6e68;white-space:nowrap;">Name</td><td style="padding:4px 8px;font-weight:600;">${info.name}</td></tr>
      <tr><td style="padding:4px 8px;color:#6b6e68;">Type</td><td style="padding:4px 8px;">${info.label}${info.readOnly ? ' <span style="color:#c54b33;font-size:11px;">(read-only)</span>' : ''}</td></tr>
      <tr><td style="padding:4px 8px;color:#6b6e68;">Size</td><td style="padding:4px 8px;">${sizeStr}</td></tr>
      <tr><td style="padding:4px 8px;color:#6b6e68;">Modified</td><td style="padding:4px 8px;">${info.modified || 'N/A'}</td></tr>
      <tr><td style="padding:4px 8px;color:#6b6e68;">Path</td><td style="padding:4px 8px;word-break:break-all;font-size:12px;">${info.path || 'Not saved'}</td></tr>
      <tr><td style="padding:4px 8px;color:#6b6e68;">Storage</td><td style="padding:4px 8px;word-break:break-all;font-size:11px;color:#6b6e68;">${await window.go.main.App.GetStoragePath()}</td></tr>
    </table>
    ${info.path ? '<div style="margin-top:12px;text-align:center;"><button data-open-folder="' + info.path.replace(/"/g, '&quot;') + '" style="border:none;background:#2f6f61;color:#fffffb;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Open Folder</button></div>' : ''}
  `);
}

async function showPreferences() {
  const storagePath = await window.go.main.App.GetStoragePath();
  const themeButtons = THEMES.map(theme => `<button data-theme-choice="${theme.id}" class="pref-theme${theme.id === currentTheme ? ' active' : ''}">${theme.label}</button>`).join('');
  showModal('Preferences', `
    <h3 style="margin-top:0;margin-bottom:8px;font-size:13px;font-weight:700;">Appearance</h3>
    <div class="pref-theme-grid">${themeButtons}</div>
    <p style="margin-top:8px;">Themes are CSS-variable only, so they add polish without images, icon fonts, or runtime dependencies.</p>
    <h3 style="margin-top:14px;margin-bottom:8px;font-size:13px;font-weight:700;">File Handling</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Markdown</td><td style="padding:4px 6px;">Editor, Split, Preview, formatting toolbar</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Code</td><td style="padding:4px 6px;">Editor + syntax-highlighted Code View</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Text</td><td style="padding:4px 6px;">Direct editor with line/word stats</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">PDF</td><td style="padding:4px 6px;">Rendered pages via pdf.js (read-only)</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Image</td><td style="padding:4px 6px;">Inline preview (read-only)</td></tr>
      <tr><td style="padding:4px 6px;font-weight:600;">Ebook/Office/Archive</td><td style="padding:4px 6px;">Info card + Open Externally</td></tr>
    </table>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Sidebar</h3>
    <p>Favorites, Open, and Recent are collapsible sections. Open files are reorderable tabs with close buttons. Right-click for context actions.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Single Instance</h3>
    <p>Only one Markpad window runs at a time. Opening a file while Markpad is running adds it to the existing window.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Storage</h3>
    <p style="font-size:11px;word-break:break-all;color:#6b6e68;">${storagePath}</p>
    <p>Session, drafts, and version history are stored locally. No cloud, no telemetry.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Performance</h3>
    <p>PDFs render page-by-page via pdf.js (~500 KB CDN). No full PDF engine bundled. Syntax highlighting caps at 5000 lines. Diffs cap at 5000 lines. This keeps the binary under 10 MB and memory low.</p>
  `);
}

function showChangelog() {
  showModal('Changelog', `
    <div style="font-size:12px;line-height:1.7;">
      <p><b>v0.8 Falguni</b> <span style="color:#6b6e68;">— Current</span></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Real-Time Sidebar Outline: Parses Markdown headings as you type and scroll-syncs both editor and preview to headings</li>
        <li>Active Memory Reclamation: Disabled WebKit JIT compiler and tuned Go GCPercent (20) to slash memory footprint</li>
        <li>UX & Animation Polish: Sleek transitions for sidebar width and workspace content fade-in</li>
        <li>Bypassed Close Prompt: Empty or welcome drafts no longer trigger dirty states or exit prompts</li>
        <li>Double Undo Fix: Deduplicated system and browser undo/redo inputs</li>
      </ul>
      <p><b>v0.7 Eklavya</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Scroll position memory: remembers where you left off in each note</li>
        <li>Extended syntax highlighting: lua, dart, toml, dockerfile, cmake, elixir, nim, zig + 20 more language mappings</li>
        <li>Fixed Open Folder: uses xdg-open/open/explorer (was broken on Linux)</li>
        <li>Fixed PDF dirty indicator: read-only files no longer show "NOT SAVED"</li>
        <li>Performance: pdf.js deferred, highlight.js extras deferred, faster cold start</li>
        <li>BUNDLE_BUDGET.md: tracks size/memory cost of every feature</li>
        <li>Comprehensive agents.md: strict guardrails for AI-assisted development</li>
      </ul>
      <p><b>v0.6 Dhruva</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Single instance: only one window, second launch opens files in existing</li>
        <li>PDF rendering via pdf.js (page-by-page, lazy, lightweight)</li>
        <li>Image inline preview for image files</li>
        <li>File info modal with path, size, type, modified date, open folder</li>
        <li>Rich right-click context menu on all sidebar sections</li>
        <li>Improved history diff contrast</li>
        <li>Real preferences panel with file handling table</li>
        <li>In-app changelog</li>
      </ul>
      <p><b>v0.5 Chitrakala</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>File verticals: markdown, code, text, PDF/ebook/office/image/archive</li>
        <li>Read-only document cards with Open Externally</li>
        <li>Collapsible sidebar sections, close buttons, remove recent</li>
        <li>Preferences menu, expanded file dialog categories</li>
      </ul>
      <p><b>v0.4 Balram</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Drag-and-drop file open from OS</li>
        <li>Smart view mode per file type</li>
        <li>Expanded file type icons and code extensions</li>
      </ul>
      <p><b>v0.3 Aaradhya</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Split view with resizable divider</li>
        <li>Formatting toolbar with SVG icons</li>
        <li>Drag-and-drop reorder, right-click context menu</li>
        <li>Syntax highlighting for code files</li>
        <li>3-section sidebar: Favorites / Open / Recent</li>
      </ul>
      <p><b>v0.2</b></p>
      <ul style="margin:4px 0 12px 16px;padding:0;list-style:disc;">
        <li>Version history with diffs</li>
        <li>Find bar, zoom, enhanced menus</li>
      </ul>
      <p><b>v0.1</b></p>
      <ul style="margin:4px 0 0 16px;padding:0;list-style:disc;">
        <li>Initial release: editor, session restore, favorites, autosaved drafts</li>
      </ul>
    </div>
  `);
}

// ── Wails events ─────────────────────────────────────────
function registerEvents() {
  if (!window.runtime) return;
  window.runtime.EventsOn('menu:new', doNew);
  window.runtime.EventsOn('menu:open', doOpen);
  window.runtime.EventsOn('menu:save', doSave);
  window.runtime.EventsOn('menu:saveas', doSaveAs);
  window.runtime.EventsOn('menu:close', () => requestCloseNote(cachedNotes.find(n => n.id === activeId)));
  window.runtime.EventsOn('menu:undo', () => stepEditHistory(-1));
  window.runtime.EventsOn('menu:redo', () => stepEditHistory(1));
  window.runtime.EventsOn('menu:toggleview', cycleView);
  window.runtime.EventsOn('menu:togglesidebar', toggleSidebar);
  window.runtime.EventsOn('menu:find', toggleFind);
  window.runtime.EventsOn('menu:history', toggleHistory);
  window.runtime.EventsOn('menu:zoomin', zoomIn);
  window.runtime.EventsOn('menu:zoomout', zoomOut);
  window.runtime.EventsOn('menu:zoomreset', zoomReset);
  window.runtime.EventsOn('menu:preferences', showPreferences);
  window.runtime.EventsOn('menu:fileinfo', showFileInfo);
  window.runtime.EventsOn('menu:changelog', showChangelog);
  window.runtime.EventsOn('secondInstance', async () => {
    renderSession(await window.go.main.App.GetSession());
    loadContent(await window.go.main.App.GetActiveContent());
    restoreNoteView();
    statusText.textContent = 'File opened from second instance';
  });
  window.runtime.EventsOn('menu:help', () => showModal('Help', `
    <p><b>Markpad</b> is a native Markdown notepad.</p>
    <p>Open Markdown, text, code, config, logs, PDFs, ebooks, and office documents.</p>
    <p>Star notes to pin them. Drag to reorder. Only unsaved drafts can be deleted.</p>
    <p>Lists auto-continue on Enter. Press Enter on an empty list item to end the list.</p>
    <h3 style="margin-top:12px;margin-bottom:4px;">Shortcuts</h3>
    <p><kbd>Ctrl+N</kbd> New &nbsp; <kbd>Ctrl+O</kbd> Open &nbsp; <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+W</kbd> Close</p>
    <p><kbd>Ctrl+Z</kbd> Undo &nbsp; <kbd>Ctrl+Shift+Z</kbd> Redo &nbsp; <kbd>Ctrl+Shift+S</kbd> Save As</p>
    <p><kbd>Ctrl+Shift+E</kbd> Cycle view (Editor / Split / Preview)</p>
    <p><kbd>Ctrl+P</kbd> Command palette &nbsp; <kbd>Ctrl+Shift+B</kbd> Toggle sidebar &nbsp; <kbd>Ctrl+Shift+L</kbd> Focus mode &nbsp; <kbd>Ctrl+F</kbd> Find in file &nbsp; <kbd>Ctrl+Shift+F</kbd> Search loaded files &nbsp; <kbd>Ctrl+H</kbd> History</p>
    <p><kbd>Ctrl+B</kbd> Bold &nbsp; <kbd>Ctrl+I</kbd> Italic &nbsp; <kbd>Ctrl+K</kbd> Link</p>
    <p><kbd>Ctrl+=</kbd> Zoom in &nbsp; <kbd>Ctrl+-</kbd> Zoom out &nbsp; <kbd>Ctrl+0</kbd> Reset zoom</p>
    <p><kbd>Ctrl+Del</kbd> Delete draft &nbsp; <kbd>Esc</kbd> Close modal/find</p>
  `));
  window.runtime.EventsOn('menu:about', () => showModal('About Markpad', `
    <p><b>Markpad</b> v0.7 <span style="opacity:0.6;font-style:italic;">Eklavya</span></p>
    <p style="margin-top:6px;">A tiny native notepad built with Go + Wails. No Electron, no cloud.</p>
    <p>Single instance, PDF rendering, image preview, scroll position memory, extended syntax highlighting, markdown split view, code view, version history with diffs, session restore, favorites, recent files, file info, and zoom. Under 10 MB.</p>
    <p style="margin-top:8px;">
      <a href="https://shreyam1008.github.io/markpad/" style="color:#2f6f61;text-decoration:underline;">Website</a> &middot;
      <a href="https://github.com/shreyam1008/markpad" style="color:#2f6f61;text-decoration:underline;">GitHub</a> &middot;
      MIT License &middot; by Shreyam Adhikari
    </p>
  `));
}

// ── Boot ─────────────────────────────────────────────────
async function loadApp() {
  try {
    renderSession(await window.go.main.App.GetSession());
    loadContent(await window.go.main.App.GetActiveContent());
    const active = cachedNotes.find(n => n.id === activeId);
    setView(defaultViewForFileType(active?.path, active?.kind));
    statusText.textContent = 'Ready';
  } catch (err) { statusText.textContent = 'Load error: ' + err; }
}

function boot() {
  if (window.go && window.go.main && window.go.main.App) {
    applyZoom(true);
    applyTheme(currentTheme, true);
    applyFocusMode(true);
    registerEvents();
    interceptLinks(viewer);

    // Drag-and-drop files from OS
    if (window.runtime && window.runtime.OnFileDrop) {
      window.runtime.OnFileDrop(async (x, y, paths) => {
        if (!paths || paths.length === 0) return;
        for (const path of paths) {
          try {
            renderSession(await window.go.main.App.OpenDroppedFile(path));
          } catch (err) { statusText.textContent = 'Drop error: ' + err; }
        }
        loadContent(await window.go.main.App.GetActiveContent());
        const active = cachedNotes.find(n => n.id === activeId);
        setView(defaultViewForFileType(active?.path, active?.kind));
        statusText.textContent = paths.length === 1 ? `Opened ${typeLabel(getFileType(active?.path, active?.kind))}` : `Opened ${paths.length} files`;
      }, true);
    }
    interceptLinks(modalBodyEl);
    loadApp();
  }
  else setTimeout(boot, 80);
}
boot();
