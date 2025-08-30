// Markpad frontend — vanilla JS + Tailwind + Wails bindings
// All file I/O goes through Go backend via window.go.main.App.*

let currentMode = 'markdown';
let sidebarCollapsed = false;
let currentContent = '';
let committedContent = '';
let activeId = '';
let draftTimer = null;
const DRAFT_DELAY = 300;
let renderTimer = null;
const RENDER_DELAY = 150;

// ── DOM refs ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const sidebar       = $('sidebar');
const sidebarCol    = $('sidebar-collapsed');
const notesList     = $('notes-list');
const favsList      = $('favorites-list');
const favsSection   = $('favorites-section');
const editor        = $('editor');
const editorCont    = $('editor-container');
const viewerCont    = $('viewer-container');
const viewer        = $('viewer');
const toolbar       = $('toolbar');
const noteTitle     = $('note-title');
const dirtyInd      = $('dirty-indicator');
const statusText    = $('status-text');
const statusStats   = $('status-stats');
const tabMd         = $('tab-markdown');
const tabView       = $('tab-viewer');
const modalOverlay  = $('modal-overlay');
const modalTitle    = $('modal-title');
const modalBodyEl   = $('modal-body');

// ── Markdown rendering ───────────────────────────────────
marked.setOptions({
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
  const html = marked.parse(md || '');
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled']
  });
}

// ── Session rendering ────────────────────────────────────
function renderSession(state) {
  if (!state) return;
  activeId = state.activeId || '';
  notesList.innerHTML = '';
  favsList.innerHTML = '';

  const hasFavs = state.favorites && state.favorites.length > 0;
  favsSection.classList.toggle('hidden', !hasFavs);

  if (hasFavs) {
    for (const fav of state.favorites) {
      favsList.appendChild(makeFavRow(fav));
    }
  }

  for (const note of (state.notes || [])) {
    notesList.appendChild(makeNoteRow(note));
  }

  const active = (state.notes || []).find(n => n.id === activeId);
  if (active) {
    const displayTitle = active.path ? active.title : 'Untitled';
    noteTitle.textContent = displayTitle;
    dirtyInd.classList.toggle('hidden', !active.dirty);
  } else {
    noteTitle.textContent = 'Untitled';
    dirtyInd.classList.add('hidden');
  }
}

function makeFavRow(fav) {
  const row = el('div', 'flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-hover select-none');
  const icon = el('span', 'text-star text-sm flex-shrink-0');
  icon.textContent = '\u2605';
  const title = el('span', 'text-[13px] font-medium truncate');
  title.textContent = fav.title || 'Untitled';
  row.append(icon, title);
  row.addEventListener('click', async () => {
    try {
      const s = await window.go.main.App.OpenPathFromBookmark(fav.path);
      renderSession(s);
      loadEditorContent(await window.go.main.App.GetActiveContent());
    } catch {}
  });
  return row;
}

function makeNoteRow(note) {
  const isActive = note.id === activeId;
  const row = el('div', `flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors select-none ${isActive ? 'bg-selected' : 'hover:bg-hover'}`);

  const content = el('div', 'flex-1 min-w-0');
  const title = el('div', 'text-[13px] font-medium truncate');
  title.textContent = note.path ? note.title : 'Untitled';
  const status = el('div', `text-[11px] ${note.dirty ? 'text-unsaved' : 'text-muted'}`);
  status.textContent = note.dirty ? 'not saved' : (note.path ? 'saved' : 'draft');
  content.append(title, status);
  row.appendChild(content);

  if (note.path) {
    const star = el('button', `flex-shrink-0 text-base bg-transparent border-none cursor-pointer transition-colors px-1 ${note.star ? 'text-star' : 'text-star-off hover:text-star'}`);
    star.textContent = note.star ? '\u2605' : '\u2606';
    star.title = note.star ? 'Unstar' : 'Star';
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      renderSession(await window.go.main.App.ToggleStar(note.id));
    });
    row.appendChild(star);
  }

  row.addEventListener('click', async () => {
    await window.go.main.App.SetActive(note.id);
    activeId = note.id;
    loadEditorContent(await window.go.main.App.GetNoteContent(note.id));
    renderSession(await window.go.main.App.GetSession());
  });

  return row;
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function loadEditorContent(content) {
  currentContent = content || '';
  committedContent = currentContent;
  editor.value = currentContent;
  if (currentMode === 'viewer') {
    viewer.innerHTML = renderMd(currentContent);
  }
  updateStats();
}

// ── Mode switching ───────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  const isMd = mode === 'markdown';
  editorCont.classList.toggle('hidden', !isMd);
  viewerCont.classList.toggle('hidden', isMd);
  toolbar.classList.toggle('hidden', !isMd);

  tabMd.className = `px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isMd ? 'bg-accent text-accent-text' : 'bg-hover text-muted hover:bg-border'}`;
  tabView.className = `px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!isMd ? 'bg-accent text-accent-text' : 'bg-hover text-muted hover:bg-border'}`;

  if (!isMd) {
    viewer.innerHTML = renderMd(currentContent);
  }
}

tabMd.addEventListener('click', () => setMode('markdown'));
tabView.addEventListener('click', () => setMode('viewer'));

// ── Sidebar toggle ───────────────────────────────────────
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('hidden', sidebarCollapsed);
  sidebarCol.classList.toggle('hidden', !sidebarCollapsed);
  if (!sidebarCollapsed) sidebarCol.classList.remove('flex');
  if (sidebarCollapsed) sidebarCol.classList.add('flex');
}

$('btn-collapse').addEventListener('click', toggleSidebar);
$('btn-expand').addEventListener('click', toggleSidebar);

// ── Editor events ────────────────────────────────────────
editor.addEventListener('input', () => {
  currentContent = editor.value;
  updateStats();
  dirtyInd.classList.remove('hidden');

  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    if (!activeId) return;
    await window.go.main.App.UpdateContent(activeId, currentContent);
    renderSession(await window.go.main.App.GetSession());
  }, DRAFT_DELAY);

  if (currentMode === 'viewer') {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      viewer.innerHTML = renderMd(currentContent);
    }, RENDER_DELAY);
  }
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.substring(0, s) + '    ' + editor.value.substring(en);
    editor.selectionStart = editor.selectionEnd = s + 4;
    editor.dispatchEvent(new Event('input'));
  }
});

function updateStats() {
  const t = currentContent;
  const lines = t ? t.split('\n').length : 0;
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  statusStats.textContent = `${lines} lines \u00b7 ${words} words \u00b7 ${t.length} chars`;
}

// ── Formatting toolbar ───────────────────────────────────
toolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) applyFormat(btn.dataset.action);
});

function applyFormat(action) {
  const s = editor.selectionStart, e = editor.selectionEnd;
  const sel = editor.value.substring(s, e);
  let ins = '', cur = 0;

  const wrap = (pre, fallback, post) => {
    ins = pre + (sel || fallback) + post;
    cur = sel ? ins.length : pre.length;
  };
  const prefix = (pre, fallback) => {
    ins = pre + (sel || fallback);
    cur = ins.length;
  };

  switch (action) {
    case 'bold':        wrap('**', 'bold text', '**'); break;
    case 'italic':      wrap('*', 'italic text', '*'); break;
    case 'strikethrough': wrap('~~', 'text', '~~'); break;
    case 'h1':          prefix('# ', 'Heading 1'); break;
    case 'h2':          prefix('## ', 'Heading 2'); break;
    case 'h3':          prefix('### ', 'Heading 3'); break;
    case 'code':        wrap('`', 'code', '`'); break;
    case 'codeblock':   ins = '\n```\n' + (sel || 'code') + '\n```\n'; cur = 5; break;
    case 'link':        ins = `[${sel || 'text'}](url)`; cur = sel ? ins.length - 1 : 1; break;
    case 'image':       ins = `![${sel || 'alt'}](url)`; cur = sel ? ins.length - 1 : 2; break;
    case 'ul':          prefix('- ', 'item'); break;
    case 'ol':          prefix('1. ', 'item'); break;
    case 'task':        prefix('- [ ] ', 'task'); break;
    case 'table':       ins = '\n| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n'; cur = ins.length; break;
    case 'hr':          ins = '\n---\n'; cur = ins.length; break;
    case 'quote':       prefix('> ', 'quote'); break;
    default: return;
  }

  editor.value = editor.value.substring(0, s) + ins + editor.value.substring(e);
  editor.selectionStart = editor.selectionEnd = s + cur;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

// ── Keyboard shortcuts ───────────────────────────────────
document.addEventListener('keydown', async (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const key = e.key;

  if (ctrl && !shift && key === 's') { e.preventDefault(); await doSave(); }
  else if (ctrl && shift && key === 'S') { e.preventDefault(); await doSaveAs(); }
  else if (ctrl && !shift && key === 'n') { e.preventDefault(); await doNew(); }
  else if (ctrl && !shift && key === 'o') { e.preventDefault(); await doOpen(); }
  else if (ctrl && shift && key === 'E') { e.preventDefault(); setMode(currentMode === 'markdown' ? 'viewer' : 'markdown'); }
  else if (ctrl && shift && key === 'B') { e.preventDefault(); toggleSidebar(); }
  else if (ctrl && !shift && key === 'b') { e.preventDefault(); applyFormat('bold'); }
  else if (ctrl && !shift && key === 'i') { e.preventDefault(); applyFormat('italic'); }
  else if (ctrl && !shift && key === 'k') { e.preventDefault(); applyFormat('link'); }
  else if (key === 'Escape') { modalOverlay.classList.add('hidden'); }
});

// ── Actions ──────────────────────────────────────────────
async function doSave() {
  statusText.textContent = 'Saving...';
  try {
    const s = await window.go.main.App.SaveActive(currentContent);
    renderSession(s);
    committedContent = currentContent;
    statusText.textContent = 'Saved';
  } catch (err) {
    statusText.textContent = 'Save failed: ' + err;
  }
}

async function doSaveAs() {
  statusText.textContent = 'Save As...';
  try {
    const s = await window.go.main.App.SaveAsDialog(currentContent);
    renderSession(s);
    committedContent = currentContent;
    statusText.textContent = 'Saved';
  } catch (err) {
    statusText.textContent = 'Save As failed: ' + err;
  }
}

async function doNew() {
  try {
    const s = await window.go.main.App.NewNote();
    renderSession(s);
    loadEditorContent('');
    setMode('markdown');
    editor.focus();
    statusText.textContent = 'New note';
  } catch (err) {
    statusText.textContent = 'Error: ' + err;
  }
}

async function doOpen() {
  try {
    const s = await window.go.main.App.OpenFileDialog();
    renderSession(s);
    loadEditorContent(await window.go.main.App.GetActiveContent());
    statusText.textContent = 'File opened';
  } catch (err) {
    statusText.textContent = 'Open failed: ' + err;
  }
}

// ── Button handlers ──────────────────────────────────────
$('btn-new').addEventListener('click', doNew);
$('btn-new-mini').addEventListener('click', doNew);
$('btn-save').addEventListener('click', doSave);
$('btn-cancel').addEventListener('click', () => {
  editor.value = committedContent;
  currentContent = committedContent;
  dirtyInd.classList.add('hidden');
  updateStats();
  statusText.textContent = 'Reverted';
});

// ── Modal ────────────────────────────────────────────────
function showModal(title, html) {
  modalTitle.textContent = title;
  modalBodyEl.innerHTML = html;
  modalOverlay.classList.remove('hidden');
}

$('modal-close').addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});

// ── Wails menu events ────────────────────────────────────
function registerEvents() {
  if (!window.runtime) return;
  window.runtime.EventsOn('menu:new', doNew);
  window.runtime.EventsOn('menu:open', doOpen);
  window.runtime.EventsOn('menu:save', doSave);
  window.runtime.EventsOn('menu:saveas', doSaveAs);
  window.runtime.EventsOn('menu:toggleview', () => setMode(currentMode === 'markdown' ? 'viewer' : 'markdown'));
  window.runtime.EventsOn('menu:togglesidebar', toggleSidebar);
  window.runtime.EventsOn('menu:help', () => {
    showModal('Help', `
      <p><b>Markpad</b> is a native Markdown notepad.</p>
      <p>Open <code>.md</code>, <code>.txt</code>, or text files.</p>
      <p>Star notes in the sidebar to pin them to Favorites.</p>
      <p>Use the formatting toolbar to insert Markdown syntax.</p>
      <h3 style="margin-top:12px;margin-bottom:4px;">Keyboard Shortcuts</h3>
      <p><kbd>Ctrl+N</kbd> New note &nbsp; <kbd>Ctrl+O</kbd> Open file</p>
      <p><kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+Shift+S</kbd> Save As</p>
      <p><kbd>Ctrl+Shift+E</kbd> Toggle Markdown / Viewer</p>
      <p><kbd>Ctrl+Shift+B</kbd> Toggle sidebar</p>
      <p><kbd>Ctrl+B</kbd> Bold &nbsp; <kbd>Ctrl+I</kbd> Italic &nbsp; <kbd>Ctrl+K</kbd> Link</p>
      <p><kbd>Tab</kbd> Insert spaces &nbsp; <kbd>Esc</kbd> Close modal</p>
    `);
  });
  window.runtime.EventsOn('menu:about', () => {
    showModal('About Markpad', `
      <p><b>Markpad</b> v0.2.0</p>
      <p>A tiny native Markdown notepad built with Go + Wails.</p>
      <p>System webview, under 8 MB, session restore, favorites.</p>
      <p style="margin-top:8px;"><a href="https://github.com/shreyam1008/markpad" style="color:#2f6f61;text-decoration:underline;">GitHub</a> &middot; MIT License</p>
    `);
  });
}

// ── Init ─────────────────────────────────────────────────
async function loadApp() {
  try {
    const s = await window.go.main.App.GetSession();
    renderSession(s);
    loadEditorContent(await window.go.main.App.GetActiveContent());
    setMode('markdown');
    statusText.textContent = 'Ready';
  } catch (err) {
    statusText.textContent = 'Load error: ' + err;
  }
}

function boot() {
  if (window.go && window.go.main && window.go.main.App) {
    registerEvents();
    loadApp();
  } else {
    setTimeout(boot, 80);
  }
}

boot();
