// Markpad — vanilla JS + Tailwind + Wails
// All file I/O via window.go.main.App.*

let viewMode = 'viewer'; // 'markdown' | 'split' | 'viewer'
let sidebarCollapsed = false;
let currentContent = '';
let committedContent = '';
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
const noteViewModes = {};
const DRAFT_MS = 300;
const RENDER_MS = 120;

const $ = (id) => document.getElementById(id);
const sidebar      = $('sidebar');
const sidebarCol   = $('sidebar-collapsed');
const notesList    = $('notes-list');
const favsList     = $('favorites-list');
const favsSection  = $('favorites-section');
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
const modalOverlay = $('modal-overlay');
const modalTitle   = $('modal-title');
const modalBodyEl  = $('modal-body');
const saveBtn      = $('btn-save');

// ── File type icons ──────────────────────────────────────
const FILE_ICONS = {
  md: '\ud83d\udcdd', markdown: '\ud83d\udcdd', mdx: '\ud83d\udcdd',
  txt: '\ud83d\udcc4', log: '\ud83d\udcc4', csv: '\ud83d\udcc4', tsv: '\ud83d\udcc4',
  json: '{ }', yaml: '\u2699', yml: '\u2699', xml: '\u2699', toml: '\u2699',
  py: '\ud83d\udc0d', js: 'JS', ts: 'TS', go: 'Go', rs: '\ud83e\udda0', rb: '\u2666',
  sh: '\ud83d\udcbb', bash: '\ud83d\udcbb', zsh: '\ud83d\udcbb',
  html: '\ud83c\udf10', htm: '\ud83c\udf10', css: '\ud83c\udfa8', svg: '\u25b3',
  lua: '\ud83c\udf19',
};
function fileIcon(path) {
  if (!path) return '\u270f';
  const ext = path.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || '\ud83d\udcc4';
}

// ── Markdown ─────────────────────────────────────────────
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
  return DOMPurify.sanitize(marked.parse(md || ''), {
    ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked', 'disabled']
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

  const hasFavs = state.favorites && state.favorites.length > 0;
  favsSection.classList.toggle('hidden', !hasFavs);
  if (hasFavs) state.favorites.forEach(f => favsList.appendChild(makeFavRow(f)));
  cachedNotes.forEach(n => notesList.appendChild(makeNoteRow(n)));

  const active = cachedNotes.find(n => n.id === activeId);
  noteTitle.textContent = active ? (active.path ? active.title : 'Untitled') : 'Untitled';
  dirtyInd.classList.toggle('hidden', !(active && active.dirty));

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
    try {
      renderSession(await window.go.main.App.OpenPathFromBookmark(fav.path));
      loadContent(await window.go.main.App.GetActiveContent());
      restoreNoteView();
    } catch {}
  });
  return row;
}

function makeNoteRow(note) {
  const isActive = note.id === activeId;
  const canDelete = !note.path;
  const row = el('div', `group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-selected ring-1 ring-accent/30' : 'hover:bg-hover'}`);
  row.dataset.noteId = note.id;
  row.draggable = true;

  const ico = el('span', 'text-[11px] flex-shrink-0 w-5 text-center opacity-60');
  ico.textContent = fileIcon(note.path);
  row.appendChild(ico);

  const content = el('div', 'flex-1 min-w-0');
  const title = el('div', 'text-[13px] font-medium truncate');
  title.textContent = note.path ? note.title : 'Untitled';
  const status = el('div', `text-[11px] ${note.dirty ? 'text-unsaved font-semibold' : 'text-muted'}`);
  status.textContent = note.dirty ? 'NOT SAVED' : (note.path ? 'saved' : 'draft');
  content.append(title, status);
  row.appendChild(content);

  const actions = el('div', 'flex items-center gap-0.5 flex-shrink-0');

  if (note.path) {
    const star = el('button', `text-sm border-none cursor-pointer px-0.5 ${note.star ? 'text-star' : 'text-star-off hover:text-star'}`);
    star.textContent = note.star ? '\u2605' : '\u2606';
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      renderSession(await window.go.main.App.ToggleStar(note.id));
    });
    actions.appendChild(star);
  }

  if (canDelete) {
    const del = el('button', 'text-[11px] border-none cursor-pointer px-1 text-muted opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity');
    del.textContent = '\u2715';
    del.title = 'Delete draft';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      renderSession(await window.go.main.App.DeleteNote(note.id));
      if (note.id === activeId) loadContent(await window.go.main.App.GetActiveContent());
      statusText.textContent = 'Draft deleted';
    });
    actions.appendChild(del);
  }

  row.appendChild(actions);

  row.addEventListener('click', async () => {
    if (activeId) noteViewModes[activeId] = viewMode;
    await window.go.main.App.SetActive(note.id);
    activeId = note.id;
    loadContent(await window.go.main.App.GetNoteContent(note.id));
    renderSession(await window.go.main.App.GetSession());
    restoreNoteView();
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxNoteId = note.id;
    const starBtn = ctxMenu.querySelector('[data-ctx="star"]');
    starBtn.textContent = note.star ? 'Unstar' : 'Star';
    starBtn.style.display = note.path ? '' : 'none';
    const delBtn = ctxMenu.querySelector('[data-ctx="delete"]');
    delBtn.style.display = canDelete ? '' : 'none';
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

function loadContent(content) {
  currentContent = content || '';
  committedContent = currentContent;
  editor.value = currentContent;
  if (viewMode !== 'markdown') viewer.innerHTML = renderMd(currentContent);
  updateStats();
  if (historyOpen) renderHistory();
}

function restoreNoteView() {
  const saved = noteViewModes[activeId];
  setView(saved || 'viewer');
}

// ── Context menu ─────────────────────────────────────────
document.addEventListener('click', () => ctxMenu.classList.add('hidden'));
ctxMenu.querySelector('[data-ctx="star"]').addEventListener('click', async () => {
  if (ctxNoteId) renderSession(await window.go.main.App.ToggleStar(ctxNoteId));
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
  viewMode = mode;
  if (activeId) noteViewModes[activeId] = mode;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const showEditor = mode === 'markdown' || mode === 'split';
  const showViewer = mode === 'viewer' || mode === 'split';
  editorCont.classList.toggle('hidden', !showEditor);
  viewerCont.classList.toggle('hidden', !showViewer);
  divider.classList.toggle('hidden', mode !== 'split');
  toolbar.classList.toggle('hidden', !showEditor);
  if (showViewer) viewer.innerHTML = renderMd(currentContent);
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
  const modes = ['markdown', 'split', 'viewer'];
  setView(modes[(modes.indexOf(viewMode) + 1) % 3]);
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
  sidebar.classList.toggle('hidden', sidebarCollapsed);
  sidebarCol.classList.toggle('hidden', !sidebarCollapsed);
  if (sidebarCollapsed) sidebarCol.classList.add('flex');
  else sidebarCol.classList.remove('flex');
}
$('btn-collapse').addEventListener('click', toggleSidebar);
$('btn-expand').addEventListener('click', toggleSidebar);

// ── Editor ───────────────────────────────────────────────
editor.addEventListener('input', () => {
  currentContent = editor.value;
  updateStats();
  dirtyInd.classList.remove('hidden');

  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    if (!activeId) return;
    await window.go.main.App.UpdateContent(activeId, currentContent);
    renderSession(await window.go.main.App.GetSession());
  }, DRAFT_MS);

  if (viewMode !== 'markdown') {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { viewer.innerHTML = renderMd(currentContent); }, RENDER_MS);
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
  const t = currentContent;
  const lines = t ? t.split('\n').length : 0;
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.ceil(words / 200));
  statusStats.textContent = `${lines} ln \u00b7 ${words} w \u00b7 ${t.length} ch \u00b7 ~${readMin} min read`;
}

// ── Save animation ───────────────────────────────────────
function flashSave() {
  saveBtn.classList.add('save-flash');
  dirtyInd.classList.add('hidden');
  statusText.textContent = 'Saved';
  setTimeout(() => saveBtn.classList.remove('save-flash'), 800);
}

// ── History panel ────────────────────────────────────────
async function toggleHistory() {
  historyOpen = !historyOpen;
  histPanel.classList.toggle('hidden', !historyOpen);
  if (historyOpen) histPanel.classList.add('flex');
  else histPanel.classList.remove('flex');
  if (historyOpen) await renderHistory();
}

async function renderHistory() {
  if (!activeId) return;
  const entries = await window.go.main.App.GetHistory(activeId);
  histList.innerHTML = '';
  historySelectedTs = null;
  histEmpty.classList.toggle('hidden', entries.length > 0);
  histList.classList.toggle('hidden', entries.length === 0);
  entries.forEach(entry => {
    const row = el('div', 'hist-entry');
    const top = el('div', 'flex items-center justify-between gap-2 mb-1');
    const badge = el('span', `hist-badge ${entry.source}`);
    badge.textContent = entry.source === 'save-as' ? 'save as' : entry.source;
    const ago = el('span', 'text-[10px] text-muted');
    ago.textContent = entry.timeAgo;
    top.append(badge, ago);
    const meta = el('div', 'text-[11px] text-muted');
    meta.textContent = `${entry.lines} lines \u00b7 ${formatBytes(entry.bytes)}`;
    const preview = el('div', 'text-[11px] text-[#3d403e] truncate mt-0.5');
    preview.textContent = entry.preview;
    row.append(top, meta, preview);
    row.addEventListener('click', async () => {
      historySelectedTs = entry.timestamp;
      histList.querySelectorAll('.hist-entry').forEach(e => e.classList.remove('active'));
      row.classList.add('active');
      const content = await window.go.main.App.GetHistoryContent(activeId, entry.timestamp);
      if (viewMode === 'markdown' || viewMode === 'split') {
        editor.value = content;
        editor.setSelectionRange(0, 0);
      }
      if (viewMode === 'viewer' || viewMode === 'split') {
        viewer.innerHTML = renderMd(content);
      }
      statusText.textContent = `Viewing: ${entry.timeAgo} (${entry.source})`;
    });
    const restoreBtn = el('button', 'mt-1 text-[10px] font-semibold text-accent hover:underline hidden');
    restoreBtn.textContent = 'Restore this version';
    row.appendChild(restoreBtn);
    row.addEventListener('mouseenter', () => restoreBtn.classList.remove('hidden'));
    row.addEventListener('mouseleave', () => { if (!row.classList.contains('active')) restoreBtn.classList.add('hidden'); });
    restoreBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        renderSession(await window.go.main.App.RestoreVersion(activeId, entry.timestamp));
        loadContent(await window.go.main.App.GetNoteContent(activeId));
        statusText.textContent = 'Version restored';
        await renderHistory();
      } catch (err) { statusText.textContent = 'Restore failed: ' + err; }
    });
    histList.appendChild(row);
  });
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

$('btn-history').addEventListener('click', toggleHistory);
$('history-close').addEventListener('click', toggleHistory);

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
  if (ctrl && !shift && key === 's') { e.preventDefault(); await doSave(); }
  else if (ctrl && shift && key === 'S') { e.preventDefault(); await doSaveAs(); }
  else if (ctrl && !shift && key === 'n') { e.preventDefault(); await doNew(); }
  else if (ctrl && !shift && key === 'o') { e.preventDefault(); await doOpen(); }
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
  else if (key === 'Delete' && ctrl) {
    e.preventDefault();
    const note = cachedNotes.find(n => n.id === activeId);
    if (note && !note.path) {
      renderSession(await window.go.main.App.DeleteNote(activeId));
      loadContent(await window.go.main.App.GetActiveContent());
    }
  }
});

// ── Actions ──────────────────────────────────────────────
async function doSave() {
  if (saving) return;
  saving = true;
  statusText.textContent = 'Saving...';
  try {
    renderSession(await window.go.main.App.SaveActive(currentContent));
    committedContent = currentContent;
    flashSave();
    if (historyOpen) await renderHistory();
  } catch (err) { statusText.textContent = 'Save failed: ' + err; }
  finally { saving = false; }
}

async function doSaveAs() {
  statusText.textContent = 'Save As...';
  try {
    renderSession(await window.go.main.App.SaveAsDialog(currentContent));
    committedContent = currentContent;
    flashSave();
    if (historyOpen) await renderHistory();
  } catch (err) { statusText.textContent = 'Save As failed: ' + err; }
}

async function doNew() {
  if (activeId) noteViewModes[activeId] = viewMode;
  try {
    renderSession(await window.go.main.App.NewNote());
    loadContent('');
    setView('markdown');
    editor.focus();
    statusText.textContent = 'New note';
  } catch (err) { statusText.textContent = 'Error: ' + err; }
}

async function doOpen() {
  if (activeId) noteViewModes[activeId] = viewMode;
  try {
    renderSession(await window.go.main.App.OpenFileDialog());
    loadContent(await window.go.main.App.GetActiveContent());
    setView('viewer');
    statusText.textContent = 'Opened';
  } catch (err) { statusText.textContent = 'Open failed: ' + err; }
}

// ── Buttons ──────────────────────────────────────────────
$('btn-new').addEventListener('click', doNew);
$('btn-new-mini').addEventListener('click', doNew);
saveBtn.addEventListener('click', doSave);
$('btn-cancel').addEventListener('click', async () => {
  editor.value = committedContent; currentContent = committedContent;
  if (viewMode !== 'markdown') viewer.innerHTML = renderMd(currentContent);
  dirtyInd.classList.add('hidden'); updateStats(); statusText.textContent = 'Reverted';
  if (activeId) {
    await window.go.main.App.UpdateContent(activeId, currentContent);
    renderSession(await window.go.main.App.GetSession());
  }
});

// ── Modal ────────────────────────────────────────────────
function showModal(t, html) { modalTitle.textContent = t; modalBodyEl.innerHTML = html; modalOverlay.classList.remove('hidden'); }
$('modal-close').addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

// ── Wails events ─────────────────────────────────────────
function registerEvents() {
  if (!window.runtime) return;
  window.runtime.EventsOn('menu:new', doNew);
  window.runtime.EventsOn('menu:open', doOpen);
  window.runtime.EventsOn('menu:save', doSave);
  window.runtime.EventsOn('menu:saveas', doSaveAs);
  window.runtime.EventsOn('menu:toggleview', cycleView);
  window.runtime.EventsOn('menu:togglesidebar', toggleSidebar);
  window.runtime.EventsOn('menu:help', () => showModal('Help', `
    <p><b>Markpad</b> is a native Markdown notepad.</p>
    <p>Open any text file: <code>.md</code>, <code>.txt</code>, <code>.json</code>, <code>.py</code>, <code>.go</code>, and more.</p>
    <p>Star notes to pin them. Drag to reorder. Only unsaved drafts can be deleted.</p>
    <p>Lists auto-continue on Enter. Press Enter on an empty list item to end the list.</p>
    <h3 style="margin-top:12px;margin-bottom:4px;">Shortcuts</h3>
    <p><kbd>Ctrl+N</kbd> New &nbsp; <kbd>Ctrl+O</kbd> Open &nbsp; <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+Shift+S</kbd> Save As</p>
    <p><kbd>Ctrl+Shift+E</kbd> Cycle view (Editor / Split / Preview)</p>
    <p><kbd>Ctrl+Shift+B</kbd> Toggle sidebar &nbsp; <kbd>Ctrl+F</kbd> Find &nbsp; <kbd>Ctrl+H</kbd> History</p>
    <p><kbd>Ctrl+B</kbd> Bold &nbsp; <kbd>Ctrl+I</kbd> Italic &nbsp; <kbd>Ctrl+K</kbd> Link</p>
    <p><kbd>Ctrl+Del</kbd> Delete draft &nbsp; <kbd>Esc</kbd> Close modal/find</p>
  `));
  window.runtime.EventsOn('menu:about', () => showModal('About Markpad', `
    <p><b>Markpad</b> v0.4.0</p>
    <p>A tiny native Markdown notepad built with Go + Wails.</p>
    <p>Split view, version history, session restore, find, formatting toolbar, favorites, drag-and-drop reorder. Under 10 MB.</p>
    <p style="margin-top:8px;"><a href="https://github.com/shreyam1008/markpad" style="color:#2f6f61;text-decoration:underline;">GitHub</a> &middot; MIT License &middot; by Shreyam Adhikari</p>
  `));
}

// ── Boot ─────────────────────────────────────────────────
async function loadApp() {
  try {
    renderSession(await window.go.main.App.GetSession());
    loadContent(await window.go.main.App.GetActiveContent());
    setView('viewer');
    statusText.textContent = 'Ready';
  } catch (err) { statusText.textContent = 'Load error: ' + err; }
}

function boot() {
  if (window.go && window.go.main && window.go.main.App) {
    registerEvents();
    interceptLinks(viewer);
    interceptLinks(modalBodyEl);
    loadApp();
  }
  else setTimeout(boot, 80);
}
boot();
