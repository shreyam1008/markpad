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
function makeNoteRow(note) {
  const isActive = note.id === activeId;
  const canDelete = !note.path;
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
    ctxMenu.querySelector('[data-ctx="delete"]').style.display = canDelete && !note.dirty ? '' : 'none';
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
  if (note && note.path) return;
  renderSession(await window.go.main.App.DeleteNote(ctxNoteId));
  if (ctxNoteId === activeId) loadContent(await window.go.main.App.GetActiveContent());
  statusText.textContent = 'Draft deleted';
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
  if (mode !== 'split') {
    editorCont.style.flex = '';
    viewerCont.style.flex = '';
  }
  if (!showEditor && findOpen) toggleFind();
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.mode));
});

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
  if (ctrl && !shift && key.toLowerCase() === 'z' && document.activeElement === editor) { e.preventDefault(); stepEditHistory(-1); }
  else if (ctrl && (key.toLowerCase() === 'y' || (shift && key.toLowerCase() === 'z')) && document.activeElement === editor) { e.preventDefault(); stepEditHistory(1); }
  else if (ctrl && !shift && key === 's') { e.preventDefault(); await doSave(); }
  else if (ctrl && shift && key === 'S') { e.preventDefault(); await doSaveAs(); }
  else if (ctrl && !shift && key === 'n') { e.preventDefault(); await doNew(); }
  else if (ctrl && !shift && key === 'o') { e.preventDefault(); await doOpen(); }
  else if (ctrl && !shift && key.toLowerCase() === 'w') { e.preventDefault(); await requestCloseNote(cachedNotes.find(n => n.id === activeId)); }
  else if (ctrl && !shift && key.toLowerCase() === 'q') { e.preventDefault(); if (window.runtime && window.runtime.Quit) window.runtime.Quit(); }
  else if (ctrl && shift && key === 'E') { e.preventDefault(); cycleView(); }
  else if (ctrl && shift && key === 'B') { e.preventDefault(); toggleSidebar(); }
  else if (ctrl && !shift && key === 'h') { e.preventDefault(); toggleHistory(); }
  else if (ctrl && !shift && key === 'f') { e.preventDefault(); toggleFind(); }
  else if (ctrl && !shift && key === 'b' && document.activeElement !== findInput) { e.preventDefault(); applyFormat('bold'); }
  else if (ctrl && !shift && key === 'i' && document.activeElement !== findInput) { e.preventDefault(); applyFormat('italic'); }
  else if (ctrl && !shift && key === 'k' && document.activeElement !== findInput) { e.preventDefault(); applyFormat('link'); }
  else if (key === 'Escape') {
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
      renderSession(await window.go.main.App.DeleteNote(activeId));
      loadContent(await window.go.main.App.GetActiveContent());
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
function showModal(t, html) { modalTitle.textContent = t; modalBodyEl.innerHTML = html; modalOverlay.classList.remove('hidden'); }
$('modal-close').addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });
modalBodyEl.addEventListener('click', (e) => {
  const folder = e.target.closest('[data-open-folder]');
  if (folder) window.go.main.App.OpenContainingFolder(folder.dataset.openFolder);
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
  showModal('Preferences', `
    <h3 style="margin-top:0;margin-bottom:8px;font-size:13px;font-weight:700;">File Handling</h3>
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
    <p><kbd>Ctrl+Shift+B</kbd> Toggle sidebar &nbsp; <kbd>Ctrl+F</kbd> Find &nbsp; <kbd>Ctrl+H</kbd> History</p>
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
