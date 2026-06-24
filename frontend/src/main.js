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
let searchLastResults = [];
let searchLastQuery = '';
let searchLastDedupe = { input: 0, output: 0, removed: 0 };
let searchLastTelemetry = { scope: 'loaded', elapsedMs: 0, backendElapsedMs: null, searched: 0, scanned: 0, skipped: 0, oversize: 0, capped: false, resultCount: 0 };
let searchRecentQueries = [];
let commandOpen = false;
let commandActiveIndex = 0;
let commandRecentIds = [];
let searchScope = localStorage.getItem('markpad-search-scope') || 'loaded';
let currentTheme = localStorage.getItem('markpad-theme') || 'paper';
let taskViewMode = localStorage.getItem('markpad-task-view') || 'list';
let taskFilter = localStorage.getItem('markpad-task-filter') || 'all';
let taskQuery = localStorage.getItem('markpad-task-query') || '';
let taskSourceFilter = normalizeTaskSourceFilter(localStorage.getItem('markpad-task-source-filter') || 'all');
let localFolderQuery = '';
let latestTasks = [];
let canvasTool = localStorage.getItem('markpad-canvas-tool') || 'pan';
let canvasGridVisible = localStorage.getItem('markpad-canvas-grid') !== '0';
let canvasSnapToGrid = localStorage.getItem('markpad-canvas-snap') === '1';
let canvasMinimapVisible = localStorage.getItem('markpad-canvas-minimap') !== '0';
let canvasGridSize = normalizeCanvasGridSize(localStorage.getItem('markpad-canvas-grid-size') || '24');
let focusMode = localStorage.getItem('markpad-focus') === '1';
let compactMode = localStorage.getItem('markpad-compact') === '1';
let splitRatio = parseFloat(localStorage.getItem('markpad-split-ratio') || '50');
let editorSoftWrap = localStorage.getItem('markpad-editor-wrap') === '1';
let editorReadingWidth = localStorage.getItem('markpad-editor-reading-width') === '1';
let canvasDoc = null;
let canvasSession = null;
let canvasActive = false;
let canvasDrawing = null;
let canvasDraftElement = null;
let canvasPanStart = null;
let canvasMoveStart = null;
let canvasSelectedIndex = -1;
let canvasClipboard = null;
let canvasStyleClipboard = null;
let canvasTextTarget = null;
let canvasHistory = [];
let canvasHistoryIndex = -1;
let canvasSaveTimer = null;
let loadedSearchCacheBytes = 0;
const loadedSearchCache = new Map();

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

function applyEditorWrap(silent) {
  editor.wrap = editorSoftWrap ? 'soft' : 'off';
  editor.classList.toggle('editor-soft-wrap', editorSoftWrap);
  $('btn-wrap')?.classList.toggle('active', editorSoftWrap);
  $('btn-wrap')?.setAttribute('aria-pressed', editorSoftWrap ? 'true' : 'false');
  localStorage.setItem('markpad-editor-wrap', editorSoftWrap ? '1' : '0');
  if (!silent && statusText) statusText.textContent = editorSoftWrap ? 'Soft wrap enabled' : 'Soft wrap disabled';
}

function toggleEditorWrap() {
  editorSoftWrap = !editorSoftWrap;
  applyEditorWrap();
}

function applyEditorReadingWidth(silent) {
  document.body.classList.toggle('editor-reading-width', editorReadingWidth);
  localStorage.setItem('markpad-editor-reading-width', editorReadingWidth ? '1' : '0');
  if (!silent && statusText) statusText.textContent = editorReadingWidth ? 'Reading width enabled' : 'Reading width disabled';
}

function toggleEditorReadingWidth() {
  editorReadingWidth = !editorReadingWidth;
  applyEditorReadingWidth();
}

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
const searchRecents = $('search-recents');
const commandOverlay = $('command-overlay');
const commandInput = $('command-input');
const commandResults = $('command-results');
const themeBtn     = $('btn-theme');
const focusBtn     = $('btn-focus');
const canvasOverlay = $('canvas-overlay');
const canvasStage  = $('canvas-stage');
const canvasMinimap = $('canvas-minimap');
const canvasTextEditor = $('canvas-text-editor');
const canvasColor  = $('canvas-color');
const canvasWidth  = $('canvas-width');
const canvasImportFile = $('canvas-import-file');
const canvasStatus = $('canvas-status');
const canvasHint = $('canvas-hint');

const THEMES = [
  { id: 'paper', label: 'Paper', mode: 'light', hint: 'Default low-glare writing surface' },
  { id: 'linen', label: 'Linen', mode: 'light', hint: 'Warm long-form writing surface' },
  { id: 'dawn', label: 'Dawn', mode: 'light', hint: 'Bright review and planning surface' },
  { id: 'mist', label: 'Mist', mode: 'light', hint: 'Cool low-contrast reading surface' },
  { id: 'sand', label: 'Sand', mode: 'light', hint: 'Planning, tasks, and canvas boards' },
  { id: 'ink', label: 'Ink', mode: 'dark', hint: 'Neutral dark focus surface' },
  { id: 'pine', label: 'Pine', mode: 'dark', hint: 'Green-black low-glare workspace' },
  { id: 'slate', label: 'Slate', mode: 'dark', hint: 'Cool dark technical review' },
  { id: 'ember', label: 'Ember', mode: 'dark', hint: 'Warm dark notes and review' },
  { id: 'midnight', label: 'Midnight', mode: 'dark', hint: 'Deep night writing surface' },
];
const THEME_RECIPES = [
  { id: 'writing', label: 'Warm writing', theme: 'linen', layout: 'soft wrap, reading width, 62/38 split', bestFor: 'Long-form Markdown drafting' },
  { id: 'planning', label: 'Planning board', theme: 'sand', layout: 'task kanban, canvas, compact controls', bestFor: 'Tasks, project planning, and canvas boards' },
  { id: 'review', label: 'Cool review', theme: 'mist', layout: 'reading width, balanced split', bestFor: 'Proofreading and rendered Markdown review' },
  { id: 'focus', label: 'Dark focus', theme: 'ink', layout: 'focus mode, editor-first split', bestFor: 'Low-distraction editing' },
  { id: 'night', label: 'Night notes', theme: 'midnight', layout: 'soft wrap, preview view, low brightness', bestFor: 'Late-session reading and edits' },
];
const LIGHT_THEMES = ['paper', 'linen', 'dawn', 'mist', 'sand'];
const DARK_THEMES = ['ink', 'pine', 'slate', 'ember', 'midnight'];
const THEME_COMPANIONS = {
  paper: 'ink',
  linen: 'ember',
  dawn: 'slate',
  mist: 'pine',
  sand: 'midnight',
  ink: 'paper',
  pine: 'mist',
  slate: 'dawn',
  ember: 'linen',
  midnight: 'sand',
};
const SEARCH_CONTENT_CAP = 2 * 1024 * 1024;
const SEARCH_CACHE_MAX_ENTRIES = 24;
const SEARCH_CACHE_MAX_BYTES = 6 * 1024 * 1024;
const SEARCH_RECENTS_KEY = 'markpad-search-recents-v1';
const SEARCH_RECENTS_LIMIT = 8;
const COMMAND_RECENTS_KEY = 'markpad-command-recents-v1';
const COMMAND_RECENTS_LIMIT = 8;
const LOCAL_SETTINGS_KEYS = [
  'markpad-theme',
  'markpad-search-scope',
  'markpad-search-recents-v1',
  'markpad-command-recents-v1',
  'markpad-task-view',
  'markpad-task-filter',
  'markpad-task-query',
  'markpad-task-source-filter',
  'markpad-canvas-tool',
  'markpad-canvas-grid',
  'markpad-canvas-snap',
  'markpad-canvas-minimap',
  'markpad-canvas-grid-size',
  'markpad-canvas-session',
  'markpad-focus',
  'markpad-compact',
  'markpad-split-ratio',
  'markpad-editor-wrap',
  'markpad-editor-reading-width',
  'markpad-zoom',
  'markpad-sections',
];
const CANVAS_DOC_KEY = 'markpad-canvas-draft';
const CANVAS_SESSION_KEY = 'markpad-canvas-session';
const MARKPAD_CANVAS_FORMAT = 'markpad-canvas-v1';
const MARKPAD_CANVAS_SCHEMA = 'https://markpad.local/schemas/canvas-v1.json';
const CANVAS_DPR_CAP = 1.5;
const CANVAS_HISTORY_LIMIT = 28;
const CANVAS_HISTORY_BYTES = 768 * 1024;
const CANVAS_SAVE_DEBOUNCE_MS = 220;
const CANVAS_ZOOM_MIN = 0.12;
const CANVAS_ZOOM_MAX = 4;
const DRAFT_TRASH_KEY = 'markpad-draft-trash-v1';
const DRAFT_TRASH_DAYS = 30;

function applyTheme(id, silent) {
  if (!THEMES.some(t => t.id === id)) id = 'paper';
  currentTheme = id;
  document.documentElement.dataset.theme = id;
  localStorage.setItem('markpad-theme', id);
  const theme = THEMES.find(t => t.id === id);
  if (themeBtn) {
    themeBtn.textContent = theme.label;
    themeBtn.dataset.themeMode = theme.mode;
    themeBtn.title = `${theme.label} (${theme.mode}) - ${theme.hint}`;
    themeBtn.setAttribute('aria-label', `Theme: ${theme.label}, ${theme.mode}. ${theme.hint}`);
  }
  if (!silent && statusText) statusText.textContent = `Theme: ${theme.label}`;
}

function cycleTheme() {
  const index = THEMES.findIndex(t => t.id === currentTheme);
  applyTheme(THEMES[(index + 1) % THEMES.length].id);
}

function cycleThemeGroup(ids) {
  const index = ids.indexOf(currentTheme);
  applyTheme(ids[(index + 1) % ids.length]);
}

function cycleLightTheme() {
  cycleThemeGroup(LIGHT_THEMES);
}

function cycleDarkTheme() {
  cycleThemeGroup(DARK_THEMES);
}

function themeById(id) {
  return THEMES.find(theme => theme.id === id) || THEMES[0];
}

function themeCompanionId(id = currentTheme) {
  return THEME_COMPANIONS[id] || (themeById(id).mode === 'dark' ? 'paper' : 'ink');
}

function themeCompanionFor(id = currentTheme) {
  return themeById(themeCompanionId(id));
}

function applyThemeCompanion() {
  const current = themeById(currentTheme);
  const companion = themeCompanionFor(current.id);
  applyTheme(companion.id, true);
  if (statusText) statusText.textContent = `Theme companion: ${current.label} to ${companion.label}`;
}

function themeCatalogSnapshot() {
  return {
    type: 'markpad-theme-catalog',
    version: 1,
    exportedAt: new Date().toISOString(),
    current: currentTheme,
    implementation: {
      engine: 'css-variables',
      assets: 'text glyphs, CSS, and existing inline SVG only',
      storage: 'localStorage:markpad-theme',
    },
    themes: THEMES.map(theme => {
      const companion = themeCompanionFor(theme.id);
      return {
        id: theme.id,
        label: theme.label,
        mode: theme.mode,
        hint: theme.hint,
        companion: companion.id,
        companionLabel: companion.label,
        active: theme.id === currentTheme,
      };
    }),
  };
}

function themeCatalogJson() {
  return JSON.stringify(themeCatalogSnapshot(), null, 2) + '\n';
}

function themeRecipeSnapshot() {
  return {
    type: 'markpad-theme-recipes',
    version: 1,
    exportedAt: new Date().toISOString(),
    current: currentTheme,
    implementation: {
      engine: 'css-variables',
      assets: 'no image packs, icon fonts, or runtime theme engine',
      storage: 'localStorage plus UI state JSON exports',
    },
    recipes: THEME_RECIPES.map(recipe => {
      const theme = THEMES.find(item => item.id === recipe.theme);
      return {
        id: recipe.id,
        label: recipe.label,
        theme: recipe.theme,
        themeLabel: theme?.label || recipe.theme,
        mode: theme?.mode || '',
        layout: recipe.layout,
        bestFor: recipe.bestFor,
        command: `Workspace preset: ${recipe.id}`,
      };
    }),
  };
}

function themeRecipesJson() {
  return JSON.stringify(themeRecipeSnapshot(), null, 2) + '\n';
}

function themeRecipesMarkdown() {
  const snapshot = themeRecipeSnapshot();
  return [
    '# Markpad Theme Recipes',
    '',
    `Exported: ${new Date(snapshot.exportedAt).toLocaleString()}`,
    `Current theme: ${snapshot.current}`,
    '',
    '| Recipe | Theme | Mode | Layout | Best for |',
    '| --- | --- | --- | --- | --- |',
    ...snapshot.recipes.map(recipe => `| ${recipe.label} | ${recipe.themeLabel} | ${recipe.mode} | ${markdownTableCell(recipe.layout)} | ${markdownTableCell(recipe.bestFor)} |`),
    '',
    'These recipes use built-in CSS-variable themes and local UI state only. They do not require image packs, icon fonts, or a runtime theme engine.',
    '',
  ].join('\n');
}

async function copyThemeRecipesJson() {
  await navigator.clipboard.writeText(themeRecipesJson());
  statusText.textContent = 'Theme recipes copied as JSON';
}

function exportThemeRecipesJson() {
  downloadText('markpad-theme-recipes.json', 'application/json', themeRecipesJson());
  statusText.textContent = 'Theme recipes exported as JSON';
}

async function copyThemeRecipesMarkdown() {
  await navigator.clipboard.writeText(themeRecipesMarkdown());
  statusText.textContent = 'Theme recipes copied as Markdown';
}

function exportThemeRecipesMarkdown() {
  downloadText('markpad-theme-recipes.md', 'text/markdown', themeRecipesMarkdown());
  statusText.textContent = 'Theme recipes exported as Markdown';
}

async function copyThemeCatalogJson() {
  await navigator.clipboard.writeText(themeCatalogJson());
  statusText.textContent = 'Theme catalog copied as JSON';
}

function exportThemeCatalogJson() {
  downloadText('markpad-theme-catalog.json', 'application/json', themeCatalogJson());
  statusText.textContent = 'Theme catalog exported as JSON';
}

function renderThemeLabCards(mode) {
  return THEMES
    .filter(theme => theme.mode === mode)
    .map(theme => `
      <button class="theme-lab-card${theme.id === currentTheme ? ' active' : ''}" data-theme-lab-choice="${theme.id}" type="button" aria-pressed="${theme.id === currentTheme ? 'true' : 'false'}">
        <span class="theme-lab-swatch" data-theme-swatch="${theme.id}">
          <i></i><i></i><i></i>
        </span>
        <strong>${escapeHtml(theme.label)}</strong>
        <small>${escapeHtml(theme.hint)}</small>
        <em>${theme.id === currentTheme ? 'Active' : 'Apply'}</em>
      </button>
    `).join('');
}

function renderThemeLabSummary() {
  const current = THEMES.find(theme => theme.id === currentTheme) || THEMES[0];
  const lightCount = THEMES.filter(theme => theme.mode === 'light').length;
  const darkCount = THEMES.filter(theme => theme.mode === 'dark').length;
  const recipes = THEME_RECIPES.filter(recipe => recipe.theme === current.id);
  const recipeText = recipes.map(recipe => recipe.label).join(', ') || 'No preset uses this theme directly';
  return `
    <div class="theme-lab-summary">
      <div class="theme-lab-stat">
        <strong>${escapeHtml(current.label)}</strong>
        <span>Current theme</span>
        <small>${escapeHtml(current.mode)} · ${escapeHtml(current.hint)}</small>
      </div>
      <div class="theme-lab-stat">
        <strong>${lightCount}/${darkCount}</strong>
        <span>Light / dark</span>
        <small>${THEMES.length} CSS-variable themes</small>
      </div>
      <div class="theme-lab-stat">
        <strong>${recipes.length}</strong>
        <span>Preset matches</span>
        <small>${escapeHtml(recipeText)}</small>
      </div>
      <div class="theme-lab-stat">
        <strong>0</strong>
        <span>Theme assets</span>
        <small>No image packs, icon fonts, or runtime engine</small>
      </div>
    </div>
  `;
}

function renderThemeCompanionPanel() {
  const current = themeById(currentTheme);
  const companion = themeCompanionFor(current.id);
  return `
    <div class="theme-lab-companion" aria-label="Recommended theme companion">
      <div class="theme-lab-companion-card">
        <span class="theme-lab-swatch" data-theme-swatch="${current.id}"><i></i><i></i><i></i></span>
        <strong>${escapeHtml(current.label)}</strong>
        <small>${escapeHtml(current.mode)} now</small>
      </div>
      <div class="theme-lab-companion-link">
        <span>pairs with</span>
        <button data-theme-lab-choice="${companion.id}" type="button">Switch to ${escapeHtml(companion.label)}</button>
      </div>
      <div class="theme-lab-companion-card">
        <span class="theme-lab-swatch" data-theme-swatch="${companion.id}"><i></i><i></i><i></i></span>
        <strong>${escapeHtml(companion.label)}</strong>
        <small>${escapeHtml(companion.mode)} companion</small>
      </div>
    </div>
  `;
}

function showThemeLab() {
  showModal('Theme Lab', `
    <div class="theme-lab-actions">
      <button data-copy-theme-catalog-json>Copy catalog JSON</button>
      <button data-export-theme-catalog-json>Export catalog JSON</button>
      <button data-copy-theme-recipes-md>Copy recipes MD</button>
      <button data-export-theme-recipes-md>Export recipes MD</button>
      <button data-theme-guide-open>Guide</button>
      <button data-workspace-preset="writing">Writing preset</button>
      <button data-workspace-preset="planning">Planning preset</button>
      <button data-workspace-preset="review">Review preset</button>
      <button data-workspace-preset="canvas">Canvas preset</button>
      <button data-workspace-preset="night">Night preset</button>
    </div>
    ${renderThemeLabSummary()}
    ${renderThemeCompanionPanel()}
    <h3 class="theme-lab-heading">Light themes</h3>
    <div class="theme-lab-grid">${renderThemeLabCards('light')}</div>
    <h3 class="theme-lab-heading">Dark themes</h3>
    <div class="theme-lab-grid">${renderThemeLabCards('dark')}</div>
    <p class="diag-note">Theme Lab compares the built-in CSS-variable themes and exports a small metadata catalog. It does not load images, icon fonts, or a runtime theme engine.</p>
  `);
}

function clearAllUndoHistories() {
  clearEditorUndoHistory();
  clearCanvasUndoHistory();
  statusText.textContent = 'Editor and canvas undo histories cleared';
}

async function applyWorkspacePreset(kind) {
  if (kind === 'writing') {
    applyTheme('linen', true);
    if (!editorSoftWrap) toggleEditorWrap();
    if (!editorReadingWidth) toggleEditorReadingWidth();
    setView('split');
    setSplitPreset(62);
    statusText.textContent = 'Writing workspace preset applied';
    return;
  }
  if (kind === 'planning') {
    applyTheme('sand', true);
    await showTasksPreset({ view: 'kanban', source: 'all', filter: 'open', query: '' });
    statusText.textContent = 'Planning workspace preset applied';
    return;
  }
  if (kind === 'review') {
    applyTheme('mist', true);
    if (!editorReadingWidth) toggleEditorReadingWidth();
    setView('split');
    setSplitPreset(50);
    statusText.textContent = 'Review workspace preset applied';
    return;
  }
  if (kind === 'canvas') {
    applyTheme('sand', true);
    openCanvas();
    setCanvasBackground('#f7ecd8', 'sand');
    applyCanvasDrawingPreset('arrow', '#2563eb', 3, 'connector');
    statusText.textContent = 'Canvas planning workspace preset applied';
    return;
  }
  if (kind === 'night') {
    applyTheme('midnight', true);
    if (!editorSoftWrap) toggleEditorWrap();
    if (!editorReadingWidth) toggleEditorReadingWidth();
    setView('viewer');
    statusText.textContent = 'Night reading workspace preset applied';
    return;
  }
  if (kind === 'low-memory') {
    if (!compactMode) toggleCompactMode();
    clearAllUndoHistories();
    clearLoadedSearchCache();
    statusText.textContent = 'Low-memory workspace preset applied; undo histories and search cache cleared';
    return;
  }
  if (kind === 'default') {
    applyTheme('paper', true);
    applyDefaultEditingPreset();
    statusText.textContent = 'Default workspace preset applied';
  }
}

async function runMemoryCleanupReport() {
  await applyWorkspacePreset('low-memory');
  await showLocalFootprint();
  statusText.textContent = 'Low-memory cleanup applied; footprint sampled';
}

function loadSearchRecentQueries() {
  try {
    const values = JSON.parse(localStorage.getItem(SEARCH_RECENTS_KEY) || '[]');
    return Array.isArray(values) ? values.filter(Boolean).slice(0, SEARCH_RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberSearchQuery(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return;
  searchRecentQueries = [q, ...searchRecentQueries.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, SEARCH_RECENTS_LIMIT);
  localStorage.setItem(SEARCH_RECENTS_KEY, JSON.stringify(searchRecentQueries));
  renderSearchRecents();
}

function renderSearchRecents() {
  if (!searchRecents) return;
  if (!searchRecentQueries.length) searchRecentQueries = loadSearchRecentQueries();
  if (!searchRecentQueries.length) {
    searchRecents.classList.add('hidden');
    searchRecents.innerHTML = '';
    return;
  }
  searchRecents.classList.remove('hidden');
  searchRecents.innerHTML = `
    <span>Recent</span>
    ${searchRecentQueries.map(query => `<button data-search-recent="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join('')}
    <button data-search-recents-copy>Copy</button>
    <button data-search-recents-export>Export</button>
    <button data-search-recents-restore>Restore JSON</button>
    <button data-search-recents-clear>Clear</button>
  `;
}

function currentSearchRecents() {
  if (!searchRecentQueries.length) searchRecentQueries = loadSearchRecentQueries();
  return searchRecentQueries.slice(0, SEARCH_RECENTS_LIMIT);
}

function searchRecentsMarkdown() {
  const recents = currentSearchRecents();
  return [
    '# Markpad Search Recents',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    `Count: ${recents.length}`,
    '',
    ...recents.map((query, index) => `${index + 1}. \`${query.replace(/`/g, '\\`')}\``),
  ].join('\n') + '\n';
}

function searchRecentsJson() {
  return JSON.stringify({
    type: 'markpad-search-recents',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: currentSearchRecents().length,
    queries: currentSearchRecents(),
  }, null, 2) + '\n';
}

function searchRecentsCsv() {
  const rows = [
    ['rank', 'query'],
    ...currentSearchRecents().map((query, index) => [index + 1, query]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copySearchRecentsMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchRecentsMarkdown());
  statusText.textContent = 'Search recents copied as Markdown';
}

async function copySearchRecentsJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchRecentsJson());
  statusText.textContent = 'Search recents copied as JSON';
}

async function copySearchRecentsCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchRecentsCsv());
  statusText.textContent = 'Search recents copied as CSV';
}

function exportSearchRecentsMarkdown() {
  downloadText('markpad-search-recents.md', 'text/markdown', searchRecentsMarkdown());
  statusText.textContent = 'Search recents exported as Markdown';
}

function exportSearchRecentsJson() {
  downloadText('markpad-search-recents.json', 'application/json', searchRecentsJson());
  statusText.textContent = 'Search recents exported as JSON';
}

function exportSearchRecentsCsv() {
  downloadText('markpad-search-recents.csv', 'text/csv', searchRecentsCsv());
  statusText.textContent = 'Search recents exported as CSV';
}

async function restoreSearchRecentsFromClipboard() {
  if (!navigator.clipboard?.readText) {
    statusText.textContent = 'Clipboard read unavailable';
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain search recents JSON';
    return;
  }
  if (!parsed || parsed.type !== 'markpad-search-recents' || !Array.isArray(parsed.queries)) {
    statusText.textContent = 'Clipboard JSON is not search recents';
    return;
  }
  searchRecentQueries = parsed.queries
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, SEARCH_RECENTS_LIMIT);
  localStorage.setItem(SEARCH_RECENTS_KEY, JSON.stringify(searchRecentQueries));
  renderSearchRecents();
  statusText.textContent = `${searchRecentQueries.length} search recent${searchRecentQueries.length === 1 ? '' : 's'} restored`;
}

function getSelectedSearchText() {
  const active = document.activeElement;
  if (active && typeof active.value === 'string' && typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number' && active.selectionStart !== active.selectionEnd) {
    const start = Math.min(active.selectionStart, active.selectionEnd);
    const end = Math.max(active.selectionStart, active.selectionEnd);
    return active.value.slice(start, end).trim();
  }
  return (window.getSelection?.().toString() || '').trim();
}

function searchSelectionEverywhere() {
  const selected = getSelectedSearchText().replace(/\s+/g, ' ').trim();
  if (!selected) {
    openSearchPaletteScope('all');
    statusText.textContent = 'Select text to search it everywhere';
    return;
  }
  const phrase = selected.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  openSearchPaletteQuery('all', `"${phrase}"`);
}

async function searchClipboardEverywhere() {
  if (!navigator.clipboard?.readText) {
    openSearchPaletteScope('all');
    statusText.textContent = 'Clipboard read unavailable';
    return;
  }
  try {
    searchPhraseEverywhere(await navigator.clipboard.readText(), 'Clipboard is empty');
  } catch {
    openSearchPaletteScope('all');
    statusText.textContent = 'Clipboard read blocked';
  }
}

function searchPhraseEverywhere(value, emptyMessage) {
  const phrase = String(value || '').replace(/\s+/g, ' ').trim();
  if (!phrase) {
    openSearchPaletteScope('all');
    statusText.textContent = emptyMessage;
    return;
  }
  openSearchPaletteQuery('all', `"${phrase.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
}

function searchActiveTitleEverywhere() {
  const note = cachedNotes.find(item => item.id === activeId) || {};
  searchPhraseEverywhere(note.title || sessionTitleFromContent(currentContent), 'No active title to search');
}

function searchActivePathEverywhere() {
  const note = cachedNotes.find(item => item.id === activeId) || {};
  searchPhraseEverywhere(note.path || basename(note.title || ''), 'No active path to search');
}

function activeFileContext() {
  const note = cachedNotes.find(item => item.id === activeId) || {};
  const title = note.title || sessionTitleFromContent(currentContent) || 'Untitled';
  const path = note.path || '';
  const kind = getFileType(path || title, note.kind);
  return {
    activeId: note.id || activeId || '',
    title,
    path,
    type: typeLabel(kind),
    kind,
    dirty: !!note.dirty,
    draft: !path,
    viewMode,
  };
}

function activeFileContextMarkdown(context = activeFileContext()) {
  return [
    '# Markpad Active File',
    '',
    `- Title: ${context.title}`,
    `- Path: ${context.path || '(draft)'}`,
    `- Type: ${context.type}`,
    `- Dirty: ${context.dirty ? 'yes' : 'no'}`,
    `- Draft: ${context.draft ? 'yes' : 'no'}`,
    `- View: ${context.viewMode || '(none)'}`,
    '',
  ].join('\n');
}

function activeFileContextJson(context = activeFileContext()) {
  return JSON.stringify({
    type: 'markpad-active-file',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...context,
  }, null, 2) + '\n';
}

function activeFileContextCsv(context = activeFileContext()) {
  const rows = [
    ['title', 'path', 'type', 'kind', 'dirty', 'draft', 'viewMode', 'activeId'],
    [context.title, context.path, context.type, context.kind, context.dirty ? 'true' : 'false', context.draft ? 'true' : 'false', context.viewMode || '', context.activeId || ''],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyActiveFilePath() {
  const context = activeFileContext();
  if (!context.path) {
    statusText.textContent = 'Active item is a draft without a saved path';
    return;
  }
  await navigator.clipboard.writeText(`${context.path}\n`);
  statusText.textContent = 'Active file path copied';
}

async function copyActiveFileContext() {
  await navigator.clipboard.writeText(activeFileContextMarkdown());
  statusText.textContent = 'Active file context copied';
}

function exportActiveFileContextMarkdown() {
  downloadText('markpad-active-file.md', 'text/markdown', activeFileContextMarkdown());
  statusText.textContent = 'Active file context exported as Markdown';
}

async function copyActiveFileContextJson() {
  await navigator.clipboard.writeText(activeFileContextJson());
  statusText.textContent = 'Active file context copied as JSON';
}

function exportActiveFileContextJson() {
  downloadText('markpad-active-file.json', 'application/json', activeFileContextJson());
  statusText.textContent = 'Active file context exported as JSON';
}

async function copyActiveFileContextCsv() {
  await navigator.clipboard.writeText(activeFileContextCsv());
  statusText.textContent = 'Active file context copied as CSV';
}

function exportActiveFileContextCsv() {
  downloadText('markpad-active-file.csv', 'text/csv', activeFileContextCsv());
  statusText.textContent = 'Active file context exported as CSV';
}

function loadedWorkspaceSnapshot() {
  const notes = cachedNotes.map((note, index) => {
    const title = note.title || (note.id === activeId ? sessionTitleFromContent(currentContent) : '') || 'Untitled';
    const path = note.path || '';
    const kind = getFileType(path || title, note.kind);
    return {
      index: index + 1,
      id: note.id || '',
      title,
      path,
      type: typeLabel(kind),
      kind,
      active: note.id === activeId,
      dirty: !!note.dirty,
      draft: !path,
      viewMode: note.id === activeId ? viewMode : (noteViewModes[note.id] || ''),
    };
  });
  return {
    type: 'markpad-loaded-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeId: activeId || '',
    count: notes.length,
    savedCount: notes.filter(note => !note.draft).length,
    draftCount: notes.filter(note => note.draft).length,
    dirtyCount: notes.filter(note => note.dirty).length,
    notes,
  };
}

function loadedWorkspaceMarkdown(snapshot = loadedWorkspaceSnapshot()) {
  const lines = [
    '# Markpad Loaded Workspace',
    '',
    `- Exported: ${new Date(snapshot.exportedAt).toLocaleString()}`,
    `- Open items: ${snapshot.count}`,
    `- Saved files: ${snapshot.savedCount}`,
    `- Drafts: ${snapshot.draftCount}`,
    `- Unsaved changes: ${snapshot.dirtyCount}`,
    '',
  ];
  if (!snapshot.notes.length) {
    lines.push('No loaded notes.');
  } else {
    snapshot.notes.forEach((note) => {
      lines.push(`${note.index}. ${note.active ? '**' : ''}${note.title}${note.active ? '**' : ''}`);
      lines.push(`   - Path: ${note.path || '(draft)'}`);
      lines.push(`   - Type: ${note.type}`);
      lines.push(`   - Dirty: ${note.dirty ? 'yes' : 'no'}`);
      if (note.viewMode) lines.push(`   - View: ${note.viewMode}`);
    });
  }
  return lines.join('\n') + '\n';
}

function loadedWorkspaceJson(snapshot = loadedWorkspaceSnapshot()) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function loadedWorkspaceCsv(snapshot = loadedWorkspaceSnapshot()) {
  const rows = [
    ['index', 'active', 'title', 'path', 'type', 'kind', 'dirty', 'draft', 'viewMode'],
    ...snapshot.notes.map(note => [
      note.index,
      note.active ? 'true' : 'false',
      note.title,
      note.path,
      note.type,
      note.kind,
      note.dirty ? 'true' : 'false',
      note.draft ? 'true' : 'false',
      note.viewMode || '',
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyLoadedWorkspaceMarkdown() {
  await navigator.clipboard.writeText(loadedWorkspaceMarkdown());
  statusText.textContent = 'Loaded workspace copied as Markdown';
}

function exportLoadedWorkspaceMarkdown() {
  downloadText('markpad-loaded-workspace.md', 'text/markdown', loadedWorkspaceMarkdown());
  statusText.textContent = 'Loaded workspace exported as Markdown';
}

async function copyLoadedWorkspaceJson() {
  await navigator.clipboard.writeText(loadedWorkspaceJson());
  statusText.textContent = 'Loaded workspace copied as JSON';
}

function exportLoadedWorkspaceJson() {
  downloadText('markpad-loaded-workspace.json', 'application/json', loadedWorkspaceJson());
  statusText.textContent = 'Loaded workspace exported as JSON';
}

async function copyLoadedWorkspaceCsv() {
  await navigator.clipboard.writeText(loadedWorkspaceCsv());
  statusText.textContent = 'Loaded workspace copied as CSV';
}

function exportLoadedWorkspaceCsv() {
  downloadText('markpad-loaded-workspace.csv', 'text/csv', loadedWorkspaceCsv());
  statusText.textContent = 'Loaded workspace exported as CSV';
}

function showLoadedWorkspaceInventory() {
  const snapshot = loadedWorkspaceSnapshot();
  const rows = snapshot.notes.length ? snapshot.notes.map(note => `
    <div class="local-row">
      <div>
        <strong>${escapeHtml(note.title)}</strong>
        <span>${escapeHtml(note.path || '(draft)')}</span>
      </div>
      <small>${note.active ? 'Active · ' : ''}${escapeHtml(note.type)} · ${note.dirty ? 'Unsaved' : 'Saved'}${note.viewMode ? ` · ${escapeHtml(note.viewMode)}` : ''}</small>
    </div>
  `).join('') : '<div class="local-empty">No open notes or files.</div>';
  showModal('Loaded Workspace', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${snapshot.count}</strong><span>Open items</span><small>Loaded in this session</small></div>
      <div class="diag-card"><strong>${snapshot.savedCount}</strong><span>Saved files</span><small>Have filesystem paths</small></div>
      <div class="diag-card"><strong>${snapshot.draftCount}</strong><span>Drafts</span><small>Local unsaved notes</small></div>
      <div class="diag-card"><strong>${snapshot.dirtyCount}</strong><span>Unsaved</span><small>Need save or discard</small></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
      <button data-copy-loaded-workspace-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
      <button data-export-loaded-workspace-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
      <button data-copy-loaded-workspace-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
      <button data-export-loaded-workspace-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
      <button data-copy-loaded-workspace-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy CSV</button>
      <button data-export-loaded-workspace-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export CSV</button>
    </div>
    <div class="local-list" style="margin-top:10px;">${rows}</div>
    <p class="diag-note">This manifest exports metadata only. It does not include document contents, draft text, or version history.</p>
  `);
}

function clearSearchRecents() {
  searchRecentQueries = [];
  localStorage.removeItem(SEARCH_RECENTS_KEY);
  renderSearchRecents();
  if (statusText) statusText.textContent = 'Search recents cleared';
}

function loadCommandRecentIds() {
  try {
    const values = JSON.parse(localStorage.getItem(COMMAND_RECENTS_KEY) || '[]');
    return Array.isArray(values) ? values.filter(Boolean).slice(0, COMMAND_RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberCommand(item) {
  if (!item?.id) return;
  commandRecentIds = [item.id, ...commandRecentIds.filter(id => id !== item.id)].slice(0, COMMAND_RECENTS_LIMIT);
  localStorage.setItem(COMMAND_RECENTS_KEY, JSON.stringify(commandRecentIds));
}

function clearCommandRecents() {
  commandRecentIds = [];
  localStorage.removeItem(COMMAND_RECENTS_KEY);
  if (commandOpen) renderCommandPalette();
  if (statusText) statusText.textContent = 'Command recents cleared';
}

function clearPaletteRecents() {
  clearSearchRecents();
  clearCommandRecents();
  if (statusText) statusText.textContent = 'Search and command recents cleared';
}

function currentCommandRecents() {
  if (!commandRecentIds.length) commandRecentIds = loadCommandRecentIds();
  return commandRecentIds.slice(0, COMMAND_RECENTS_LIMIT).map((id) => {
    const item = COMMAND_ITEMS.find(command => command.id === id);
    return {
      id,
      title: item?.title || id,
      hint: item?.hint || '',
    };
  });
}

function commandRecentsMarkdown() {
  const recents = currentCommandRecents();
  return [
    '# Markpad Command Recents',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    `Count: ${recents.length}`,
    '',
    ...recents.map((item, index) => `${index + 1}. **${item.title}** \`${item.id}\`${item.hint ? ` — ${item.hint}` : ''}`),
  ].join('\n') + '\n';
}

function commandRecentsJson() {
  const recents = currentCommandRecents();
  return JSON.stringify({
    type: 'markpad-command-recents',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: recents.length,
    commands: recents,
  }, null, 2) + '\n';
}

function commandRecentsCsv() {
  const rows = [
    ['rank', 'id', 'title', 'hint'],
    ...currentCommandRecents().map((item, index) => [index + 1, item.id, item.title, item.hint]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyCommandRecentsMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(commandRecentsMarkdown());
  statusText.textContent = 'Command recents copied as Markdown';
}

async function copyCommandRecentsJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(commandRecentsJson());
  statusText.textContent = 'Command recents copied as JSON';
}

async function copyCommandRecentsCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(commandRecentsCsv());
  statusText.textContent = 'Command recents copied as CSV';
}

function exportCommandRecentsMarkdown() {
  downloadText('markpad-command-recents.md', 'text/markdown', commandRecentsMarkdown());
  statusText.textContent = 'Command recents exported as Markdown';
}

function exportCommandRecentsJson() {
  downloadText('markpad-command-recents.json', 'application/json', commandRecentsJson());
  statusText.textContent = 'Command recents exported as JSON';
}

function exportCommandRecentsCsv() {
  downloadText('markpad-command-recents.csv', 'text/csv', commandRecentsCsv());
  statusText.textContent = 'Command recents exported as CSV';
}

async function restoreCommandRecentsFromClipboard() {
  if (!navigator.clipboard?.readText) {
    statusText.textContent = 'Clipboard read unavailable';
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain command recents JSON';
    return;
  }
  if (!parsed || parsed.type !== 'markpad-command-recents' || !Array.isArray(parsed.commands)) {
    statusText.textContent = 'Clipboard JSON is not command recents';
    return;
  }
  const known = new Set(COMMAND_ITEMS.map(item => item.id));
  commandRecentIds = parsed.commands
    .map(item => String(item?.id || '').trim())
    .filter(id => id && known.has(id))
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, COMMAND_RECENTS_LIMIT);
  localStorage.setItem(COMMAND_RECENTS_KEY, JSON.stringify(commandRecentIds));
  if (commandOpen) renderCommandPalette();
  statusText.textContent = `${commandRecentIds.length} command recent${commandRecentIds.length === 1 ? '' : 's'} restored`;
}

function commandRecentRank(id) {
  return commandRecentIds.indexOf(id);
}

function isRecentCommand(id) {
  return commandRecentRank(id) >= 0;
}

searchRecentQueries = loadSearchRecentQueries();
commandRecentIds = loadCommandRecentIds();

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

function applyCompactMode(silent) {
  document.body.classList.toggle('markpad-compact', compactMode);
  localStorage.setItem('markpad-compact', compactMode ? '1' : '0');
  if (!silent && statusText) statusText.textContent = compactMode ? 'Compact mode on' : 'Compact mode off';
}

function toggleCompactMode() {
  compactMode = !compactMode;
  applyCompactMode();
}

function layoutProfileSnapshot() {
  const active = cachedNotes.find(note => note.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  const zoomPercent = Math.round(fontSize / ZOOM_DEFAULT * 100);
  return {
    type: 'markpad-layout-profile',
    version: 1,
    sampledAt: new Date().toISOString(),
    activeFile: {
      title: active?.title || '',
      path: active?.path || '',
      type,
      readOnly: isReadOnlyType(type),
      markdownSplitAvailable: type === 'md',
    },
    view: {
      mode: viewMode,
      splitRatio: Math.round(splitRatio * 10) / 10,
      splitLabel: splitRatioText(),
      editorVisible: viewMode === 'markdown' || viewMode === 'split',
      previewVisible: viewMode === 'viewer' || viewMode === 'split',
      editorShare: viewMode === 'viewer' ? 0 : viewMode === 'split' ? Math.round(splitRatio * 10) / 10 : 100,
      previewShare: viewMode === 'markdown' ? 0 : viewMode === 'split' ? Math.round((100 - splitRatio) * 10) / 10 : 100,
    },
    splitControls: {
      role: 'separator',
      summary: 'Arrow keys resize, Shift+Arrow resizes faster, Home/End jump to extremes, Enter/Space resets to 50/50.',
      persistedAs: 'localStorage:markpad-split-ratio',
      documentWrites: false,
    },
    editor: {
      softWrap: !!editorSoftWrap,
      readingWidth: !!editorReadingWidth,
      fontSize,
      zoomPercent,
      zoomMin: Math.round(ZOOM_MIN / ZOOM_DEFAULT * 100),
      zoomMax: Math.round(ZOOM_MAX / ZOOM_DEFAULT * 100),
    },
    chrome: {
      focusMode: !!focusMode,
      compactMode: !!compactMode,
      sidebarCollapsed: !!sidebarCollapsed,
      historyOpen: !!historyOpen,
      findOpen: !!findOpen,
    },
    storage: {
      splitRatio: 'localStorage:markpad-split-ratio',
      focusMode: 'localStorage:markpad-focus',
      compactMode: 'localStorage:markpad-compact',
      softWrap: 'localStorage:markpad-editor-wrap',
      readingWidth: 'localStorage:markpad-editor-reading-width',
      zoom: 'localStorage:markpad-zoom',
    },
    note: 'Layout Profile samples current local UI state only; it does not scan files or write document content.',
  };
}

function layoutProfileMarkdown(snapshot = layoutProfileSnapshot()) {
  return [
    '# Markpad Layout Profile',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    '',
    '## Active file',
    '',
    `- Title: ${snapshot.activeFile.title || '(none)'}`,
    `- Type: ${snapshot.activeFile.type || '(unknown)'}`,
    `- Read-only: ${snapshot.activeFile.readOnly ? 'yes' : 'no'}`,
    `- Markdown split available: ${snapshot.activeFile.markdownSplitAvailable ? 'yes' : 'no'}`,
    '',
    '## View',
    '',
    `- Mode: ${snapshot.view.mode}`,
    `- Split: ${snapshot.view.splitLabel}`,
    `- Editor visible: ${snapshot.view.editorVisible ? 'yes' : 'no'}`,
    `- Preview visible: ${snapshot.view.previewVisible ? 'yes' : 'no'}`,
    `- Editor share: ${snapshot.view.editorShare}%`,
    `- Preview share: ${snapshot.view.previewShare}%`,
    '',
    '## Editor',
    '',
    `- Soft wrap: ${snapshot.editor.softWrap ? 'on' : 'off'}`,
    `- Reading width: ${snapshot.editor.readingWidth ? 'on' : 'off'}`,
    `- Font size: ${snapshot.editor.fontSize}px`,
    `- Zoom: ${snapshot.editor.zoomPercent}%`,
    '',
    '## Chrome',
    '',
    `- Focus mode: ${snapshot.chrome.focusMode ? 'on' : 'off'}`,
    `- Compact mode: ${snapshot.chrome.compactMode ? 'on' : 'off'}`,
    `- Sidebar collapsed: ${snapshot.chrome.sidebarCollapsed ? 'yes' : 'no'}`,
    `- History open: ${snapshot.chrome.historyOpen ? 'yes' : 'no'}`,
    `- Find open: ${snapshot.chrome.findOpen ? 'yes' : 'no'}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function layoutProfileJson(snapshot = layoutProfileSnapshot()) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function layoutProfileCsv(snapshot = layoutProfileSnapshot()) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['active_title', snapshot.activeFile.title || ''],
    ['active_type', snapshot.activeFile.type || ''],
    ['active_readonly', snapshot.activeFile.readOnly ? 'true' : 'false'],
    ['markdown_split_available', snapshot.activeFile.markdownSplitAvailable ? 'true' : 'false'],
    ['view_mode', snapshot.view.mode],
    ['split_ratio', Number(snapshot.view.splitRatio || 0)],
    ['split_label', snapshot.view.splitLabel],
    ['split_keyboard_controls', snapshot.splitControls?.summary || ''],
    ['split_document_writes', snapshot.splitControls?.documentWrites ? 'true' : 'false'],
    ['editor_visible', snapshot.view.editorVisible ? 'true' : 'false'],
    ['preview_visible', snapshot.view.previewVisible ? 'true' : 'false'],
    ['editor_share', Number(snapshot.view.editorShare || 0)],
    ['preview_share', Number(snapshot.view.previewShare || 0)],
    ['soft_wrap', snapshot.editor.softWrap ? 'true' : 'false'],
    ['reading_width', snapshot.editor.readingWidth ? 'true' : 'false'],
    ['font_size', Number(snapshot.editor.fontSize || 0)],
    ['zoom_percent', Number(snapshot.editor.zoomPercent || 0)],
    ['focus_mode', snapshot.chrome.focusMode ? 'true' : 'false'],
    ['compact_mode', snapshot.chrome.compactMode ? 'true' : 'false'],
    ['sidebar_collapsed', snapshot.chrome.sidebarCollapsed ? 'true' : 'false'],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function layoutLaneMeter(snapshot) {
  const editorShare = Math.max(0, Math.min(100, Number(snapshot.view.editorShare || 0)));
  const previewShare = Math.max(0, Math.min(100, Number(snapshot.view.previewShare || 0)));
  const editorLabel = snapshot.view.editorVisible ? `${Math.round(editorShare)}% editor` : 'editor hidden';
  const previewLabel = snapshot.view.previewVisible ? `${Math.round(previewShare)}% preview` : 'preview hidden';
  return `
    <div class="layout-lane-meter" aria-label="Editor and preview layout share">
      <div class="layout-lane-top">
        <strong>${escapeHtml(snapshot.view.mode)}</strong>
        <span>${escapeHtml(snapshot.view.splitLabel)} · ${snapshot.editor.softWrap ? 'wrap' : 'no wrap'} · ${snapshot.editor.readingWidth ? 'reading width' : 'full width'}</span>
      </div>
      <div class="layout-lane-track">
        ${editorShare ? `<span class="layout-lane-segment editor" style="width:${editorShare}%;">${escapeHtml(editorLabel)}</span>` : ''}
        ${previewShare ? `<span class="layout-lane-segment preview" style="width:${previewShare}%;">${escapeHtml(previewLabel)}</span>` : ''}
        ${!editorShare && !previewShare ? '<span class="layout-lane-segment empty" style="width:100%;">no lane</span>' : ''}
      </div>
      <div class="layout-lane-legend">
        <span><strong>${Math.round(editorShare)}%</strong> editor</span>
        <span><strong>${Math.round(previewShare)}%</strong> preview</span>
        <span><strong>${snapshot.editor.zoomPercent}%</strong> zoom</span>
        <span><strong>${snapshot.chrome.focusMode ? 'on' : 'off'}</strong> focus</span>
      </div>
    </div>
  `;
}

function showLayoutProfile() {
  const snapshot = layoutProfileSnapshot();
  showModal('Layout Profile', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${escapeHtml(snapshot.view.mode)}</strong><span>View mode</span><small>${snapshot.view.editorVisible ? 'editor' : 'no editor'} · ${snapshot.view.previewVisible ? 'preview' : 'no preview'}</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.view.splitLabel)}</strong><span>Split ratio</span><small>${snapshot.activeFile.markdownSplitAvailable ? 'Markdown split available' : 'Split unavailable for active type'}</small></div>
      <div class="diag-card"><strong>keys</strong><span>Split keyboard</span><small>Arrows resize · Shift+arrows jump · Enter resets</small></div>
      <div class="diag-card"><strong>${snapshot.editor.zoomPercent}%</strong><span>Editor zoom</span><small>${snapshot.editor.fontSize}px · ${snapshot.editor.softWrap ? 'wrap' : 'no wrap'}</small></div>
      <div class="diag-card"><strong>${snapshot.editor.readingWidth ? 'on' : 'off'}</strong><span>Reading width</span><small>Constrained editor and preview lane</small></div>
      <div class="diag-card"><strong>${snapshot.chrome.focusMode ? 'on' : 'off'}</strong><span>Focus mode</span><small>${snapshot.chrome.compactMode ? 'compact on' : 'compact off'}</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.activeFile.type || 'none')}</strong><span>Active type</span><small>${snapshot.activeFile.readOnly ? 'read-only' : 'editable'}</small></div>
    </div>
    ${layoutLaneMeter(snapshot)}
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-layout-profile-md>Copy MD</button>
      <button data-export-layout-profile-md>Export MD</button>
      <button data-copy-layout-profile-json>Copy JSON</button>
      <button data-export-layout-profile-json>Export JSON</button>
      <button data-copy-layout-profile-csv>Copy CSV</button>
      <button data-export-layout-profile-csv>Export CSV</button>
      <button data-split-preset="50">50/50</button>
      <button data-split-preset="62">62/38</button>
      <button data-split-swap-guide>Swap Split</button>
      <button data-layout-guide-open>Layout Guide</button>
      <button data-split-workflow-open>Split Guide</button>
    </div>
    <p class="diag-note">${escapeHtml(snapshot.note)}</p>
  `);
}

async function copyLayoutProfileMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(layoutProfileMarkdown());
  statusText.textContent = 'Layout profile copied as Markdown';
}

function exportLayoutProfileMarkdown() {
  downloadText('markpad-layout-profile.md', 'text/markdown', layoutProfileMarkdown());
  statusText.textContent = 'Layout profile exported as Markdown';
}

async function copyLayoutProfileJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(layoutProfileJson());
  statusText.textContent = 'Layout profile copied as JSON';
}

function exportLayoutProfileJson() {
  downloadText('markpad-layout-profile.json', 'application/json', layoutProfileJson());
  statusText.textContent = 'Layout profile exported as JSON';
}

async function copyLayoutProfileCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(layoutProfileCsv());
  statusText.textContent = 'Layout profile copied as CSV';
}

function exportLayoutProfileCsv() {
  downloadText('markpad-layout-profile.csv', 'text/csv', layoutProfileCsv());
  statusText.textContent = 'Layout profile exported as CSV';
}

function applyWritingFocusPreset() {
  focusMode = true;
  compactMode = true;
  editorSoftWrap = true;
  editorReadingWidth = true;
  applyEditorWrap(true);
  applyEditorReadingWidth(true);
  applyCompactMode(true);
  applyFocusMode(true);
  setView('split');
  setSplitPreset(62);
  statusText.textContent = 'Writing focus preset applied';
}

function applyReviewSplitPreset() {
  focusMode = false;
  compactMode = false;
  editorSoftWrap = true;
  editorReadingWidth = false;
  applyEditorWrap(true);
  applyEditorReadingWidth(true);
  applyCompactMode(true);
  applyFocusMode(true);
  setView('split');
  setSplitPreset(50);
  statusText.textContent = 'Review split preset applied';
}

function applyDefaultEditingPreset() {
  focusMode = false;
  compactMode = false;
  editorSoftWrap = false;
  editorReadingWidth = false;
  applyEditorWrap(true);
  applyEditorReadingWidth(true);
  applyCompactMode(true);
  applyFocusMode(true);
  setView('split');
  setSplitPreset(50);
  statusText.textContent = 'Default editing preset applied';
}

function showUiStateSummary() {
  const theme = THEMES.find(item => item.id === currentTheme)?.label || currentTheme;
  const canvasZoom = canvasSession?.camera?.scale ? `${Math.round(canvasSession.camera.scale * 100)}%` : '100%';
  const canvasBg = canvasDoc?.appState?.viewBackgroundColor || '#ffffff';
  showModal('UI State', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${escapeHtml(theme)}</strong><span>Theme</span><small>${escapeHtml(currentTheme)}</small></div>
      <div class="diag-card"><strong>${escapeHtml(viewMode)}</strong><span>View</span><small>${Math.round(splitRatio)}/${Math.round(100 - splitRatio)} split</small></div>
      <div class="diag-card"><strong>${focusMode ? 'On' : 'Off'} / ${compactMode ? 'On' : 'Off'}</strong><span>Focus / Compact</span><small>local UI chrome</small></div>
      <div class="diag-card"><strong>${editorSoftWrap ? 'Wrap' : 'No wrap'}</strong><span>Editor</span><small>${editorReadingWidth ? 'reading width' : 'full width'} · ${Math.round(fontSize / ZOOM_DEFAULT * 100)}% zoom</small></div>
      <div class="diag-card"><strong>${escapeHtml(searchScope)}</strong><span>Search scope</span><small>${searchLastResults.length} results · ${escapeHtml(searchTelemetrySummary())}</small></div>
      <div class="diag-card"><strong>${escapeHtml(taskViewMode)}</strong><span>Tasks</span><small>${escapeHtml(taskSourceFilter)} · ${escapeHtml(taskFilter)}${taskQuery ? ` · ${escapeHtml(taskQuery)}` : ''}</small></div>
      <div class="diag-card"><strong>${escapeHtml(canvasTool)}</strong><span>Canvas tool</span><small>${canvasZoom} · grid ${canvasGridVisible ? `${canvasGridSize}px` : 'off'} · snap ${canvasSnapToGrid ? 'on' : 'off'}</small></div>
      <div class="diag-card"><strong>${escapeHtml(canvasBg)}</strong><span>Canvas background</span><small>stored with canvas exports</small></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
      <button data-copy-ui-state-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
      <button data-export-ui-state-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
      <button data-copy-ui-state-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
      <button data-export-ui-state-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
      <button data-restore-ui-state-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Restore JSON</button>
    </div>
    <p class="diag-note">All values are local-only UI preferences or active in-memory canvas settings. No workspace scan is performed.</p>
  `);
}

function uiStateSummaryMarkdown() {
  const theme = THEMES.find(item => item.id === currentTheme)?.label || currentTheme;
  const canvasZoom = canvasSession?.camera?.scale ? `${Math.round(canvasSession.camera.scale * 100)}%` : '100%';
  const canvasBg = canvasDoc?.appState?.viewBackgroundColor || '#ffffff';
  return [
    '# Markpad UI State',
    '',
    `- Theme: ${theme} (${currentTheme})`,
    `- View: ${viewMode} (${Math.round(splitRatio)}/${Math.round(100 - splitRatio)} split)`,
    `- Focus: ${focusMode ? 'on' : 'off'}`,
    `- Compact: ${compactMode ? 'on' : 'off'}`,
    `- Editor: ${editorSoftWrap ? 'soft wrap' : 'no wrap'}, ${editorReadingWidth ? 'reading width' : 'full width'}, ${Math.round(fontSize / ZOOM_DEFAULT * 100)}% zoom`,
    `- Search scope: ${searchScope} (${searchLastResults.length} results, ${searchTelemetrySummary()})`,
    `- Tasks: ${taskViewMode}, ${taskSourceFilter}, ${taskFilter}${taskQuery ? `, ${taskQuery}` : ''}`,
    `- Canvas: ${canvasTool}, ${canvasZoom}, grid ${canvasGridVisible ? `${canvasGridSize}px` : 'off'}, snap ${canvasSnapToGrid ? 'on' : 'off'}, background ${canvasBg}`,
    '',
  ].join('\n');
}

function uiStateSummaryJson() {
  const theme = THEMES.find(item => item.id === currentTheme)?.label || currentTheme;
  return JSON.stringify({
    type: 'markpad-ui-state',
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: {
      id: currentTheme,
      label: theme,
    },
    layout: {
      viewMode,
      splitRatio: Math.round(splitRatio * 10) / 10,
      focusMode,
      compactMode,
      sidebarCollapsed,
    },
    editor: {
      softWrap: editorSoftWrap,
      readingWidth: editorReadingWidth,
      zoomPercent: Math.round(fontSize / ZOOM_DEFAULT * 100),
    },
    search: {
      scope: searchScope,
      lastQuery: searchLastQuery || '',
      resultCount: searchLastResults.length,
      diagnostics: { ...searchLastTelemetry },
    },
    tasks: {
      viewMode: taskViewMode,
      sourceFilter: taskSourceFilter,
      filter: taskFilter,
      query: taskQuery,
    },
    canvas: {
      tool: canvasTool,
      zoomPercent: canvasSession?.camera?.scale ? Math.round(canvasSession.camera.scale * 100) : 100,
      gridVisible: canvasGridVisible,
      gridSize: canvasGridSize,
      snapToGrid: canvasSnapToGrid,
      minimapVisible: canvasMinimapVisible,
      background: canvasDoc?.appState?.viewBackgroundColor || '#ffffff',
      elementCount: (canvasDoc?.elements || []).length,
    },
  }, null, 2) + '\n';
}

async function copyUiStateSummary() {
  await navigator.clipboard.writeText(uiStateSummaryMarkdown());
  statusText.textContent = 'UI state copied as Markdown';
}

function exportUiStateSummary() {
  downloadText('markpad-ui-state.md', 'text/markdown', uiStateSummaryMarkdown());
  statusText.textContent = 'UI state exported as Markdown';
}

async function copyUiStateJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(uiStateSummaryJson());
  statusText.textContent = 'UI state copied as JSON';
}

function exportUiStateJson() {
  downloadText('markpad-ui-state.json', 'application/json', uiStateSummaryJson());
  statusText.textContent = 'UI state exported as JSON';
}

async function restoreUiStateJsonFromClipboard() {
  if (!navigator.clipboard?.readText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch (_) {
    statusText.textContent = 'Clipboard does not contain UI state JSON';
    return;
  }
  if (!parsed || parsed.type !== 'markpad-ui-state') {
    statusText.textContent = 'Clipboard JSON is not Markpad UI state';
    return;
  }

  let applied = 0;
  const layout = parsed.layout || {};
  const editorState = parsed.editor || {};
  const searchState = parsed.search || {};
  const taskState = parsed.tasks || {};
  const canvasState = parsed.canvas || {};

  if (typeof parsed.theme?.id === 'string' && THEMES.some(theme => theme.id === parsed.theme.id)) {
    applyTheme(parsed.theme.id, true);
    applied++;
  }

  if (typeof layout.focusMode === 'boolean') {
    focusMode = layout.focusMode;
    localStorage.setItem('markpad-focus', focusMode ? '1' : '0');
    applyFocusMode(true);
    applied++;
  }
  if (typeof layout.compactMode === 'boolean') {
    compactMode = layout.compactMode;
    localStorage.setItem('markpad-compact', compactMode ? '1' : '0');
    applyCompactMode(true);
    applied++;
  }
  if (typeof layout.viewMode === 'string' && ['editor', 'split', 'viewer'].includes(layout.viewMode)) {
    setView(layout.viewMode);
    applied++;
  }
  if (Number.isFinite(Number(layout.splitRatio))) {
    splitRatio = normalizeSplitRatio(Number(layout.splitRatio));
    localStorage.setItem('markpad-split-ratio', String(Math.round(splitRatio * 10) / 10));
    if (viewMode === 'split') applySplitRatio();
    updateSplitPresetButtons();
    applied++;
  }

  if (typeof editorState.softWrap === 'boolean') {
    editorSoftWrap = editorState.softWrap;
    applyEditorWrap(true);
    applied++;
  }
  if (typeof editorState.readingWidth === 'boolean') {
    editorReadingWidth = editorState.readingWidth;
    applyEditorReadingWidth(true);
    applied++;
  }
  if (Number.isFinite(Number(editorState.zoomPercent))) {
    fontSize = Math.round((Number(editorState.zoomPercent) / 100) * ZOOM_DEFAULT);
    fontSize = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fontSize));
    applyZoom(true);
    applied++;
  }

  if (typeof searchState.scope === 'string' && ['loaded', 'local', 'all'].includes(searchState.scope)) {
    setSearchScope(searchState.scope);
    applied++;
  }
  if (typeof searchState.lastQuery === 'string') {
    searchLastQuery = searchState.lastQuery;
    if (searchInput) searchInput.value = searchState.lastQuery;
    applied++;
  }

  if (typeof taskState.viewMode === 'string' && ['list', 'calendar', 'kanban'].includes(taskState.viewMode)) {
    taskViewMode = taskState.viewMode;
    localStorage.setItem('markpad-task-view', taskViewMode);
    applied++;
  }
  if (typeof taskState.sourceFilter === 'string') {
    setTaskSourceFilter(taskState.sourceFilter);
    applied++;
  }
  if (typeof taskState.filter === 'string') {
    setTaskStatusFilter(taskState.filter);
    applied++;
  }
  if (typeof taskState.query === 'string') {
    taskQuery = taskState.query.trim();
    localStorage.setItem('markpad-task-query', taskQuery);
    applied++;
  }

  if (typeof canvasState.tool === 'string') {
    setCanvasTool(canvasState.tool);
    applied++;
  }
  if (typeof canvasState.gridVisible === 'boolean') {
    canvasGridVisible = canvasState.gridVisible;
    localStorage.setItem('markpad-canvas-grid', canvasGridVisible ? '1' : '0');
    applied++;
  }
  if (Number.isFinite(Number(canvasState.gridSize))) {
    canvasGridSize = normalizeCanvasGridSize(canvasState.gridSize);
    localStorage.setItem('markpad-canvas-grid-size', String(canvasGridSize));
    applied++;
  }
  if (typeof canvasState.snapToGrid === 'boolean') {
    canvasSnapToGrid = canvasState.snapToGrid;
    localStorage.setItem('markpad-canvas-snap', canvasSnapToGrid ? '1' : '0');
    applied++;
  }
  if (typeof canvasState.minimapVisible === 'boolean') {
    canvasMinimapVisible = canvasState.minimapVisible;
    localStorage.setItem('markpad-canvas-minimap', canvasMinimapVisible ? '1' : '0');
    applied++;
  }
  if (typeof canvasState.background === 'string' && canvasState.background.trim() && canvasDoc) {
    canvasDoc.appState = canvasDoc.appState || {};
    canvasDoc.appState.viewBackgroundColor = canvasState.background.trim();
    saveCanvasState();
    applied++;
  }

  updateSearchScopeButtons();
  updateCanvasOptionButtons();
  if (canvasActive) {
    renderCanvas();
    updateCanvasStatus();
  }
  statusText.textContent = applied ? `UI state restored from clipboard (${applied} preferences)` : 'No UI state preferences restored';
}

function normalizeSplitRatio(value) {
  return Math.max(28, Math.min(72, Number.isFinite(value) ? value : 50));
}

function splitRatioText(value = splitRatio) {
  const ratio = normalizeSplitRatio(value);
  return `${Math.round(ratio)}/${Math.round(100 - ratio)}`;
}

function updateSplitRatioBadge(value = splitRatio) {
  if (!divider) return;
  const text = splitRatioText(value);
  const ratio = normalizeSplitRatio(value);
  const liveChip = $('split-live-chip');
  divider.dataset.splitLabel = text;
  divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  divider.setAttribute('aria-valuetext', text);
  divider.setAttribute('aria-label', `Resize split view, editor preview ratio ${text}`);
  divider.setAttribute('title', `Split ${text}. Drag, use arrow keys, or double-click for 50/50.`);
  if (liveChip) {
    liveChip.textContent = text;
    liveChip.setAttribute('title', `Current split ratio ${text}`);
  }
}

function applySplitRatio() {
  if (viewMode !== 'split') return;
  splitRatio = normalizeSplitRatio(splitRatio);
  editorCont.style.flex = `0 0 ${splitRatio}%`;
  viewerCont.style.flex = '1 1 0';
  localStorage.setItem('markpad-split-ratio', String(Math.round(splitRatio * 10) / 10));
  updateSplitRatioBadge();
  updateSplitPresetButtons();
}

function rememberSplitRatio() {
  if (viewMode !== 'split') return;
  const total = editorCont.parentElement?.getBoundingClientRect().width || 0;
  const width = editorCont.getBoundingClientRect().width;
  if (total > 0 && width > 0) {
    splitRatio = normalizeSplitRatio((width / total) * 100);
    localStorage.setItem('markpad-split-ratio', String(Math.round(splitRatio * 10) / 10));
    updateSplitRatioBadge();
    updateSplitPresetButtons();
  }
}

function updateSplitPresetButtons() {
  const group = $('split-preset-group');
  if (!group) return;
  group.querySelectorAll('[data-split-ratio]').forEach((button) => {
    const ratio = Number(button.dataset.splitRatio || 50);
    const pressed = Math.abs(normalizeSplitRatio(ratio) - splitRatio) < 3;
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
  group.querySelector('[data-split-swap]')?.setAttribute('aria-pressed', 'false');
}

function setSplitPreset(value) {
  splitRatio = normalizeSplitRatio(Number(value));
  if (viewMode !== 'split') setView('split');
  if (viewMode !== 'split') {
    statusText.textContent = 'Split presets are available for Markdown files';
    return;
  }
  applySplitRatio();
  statusText.textContent = `Split set to ${splitRatioText()}`;
}

function adjustSplitRatio(delta) {
  if (viewMode !== 'split') setView('split');
  if (viewMode !== 'split') {
    statusText.textContent = 'Split sizing is available for Markdown files';
    return;
  }
  splitRatio = normalizeSplitRatio(splitRatio + Number(delta || 0));
  applySplitRatio();
  statusText.textContent = `Split adjusted to ${splitRatioText()}`;
}

function swapSplitRatio() {
  if (viewMode !== 'split') setView('split');
  if (viewMode !== 'split') {
    statusText.textContent = 'Split swap is available for Markdown files';
    return;
  }
  splitRatio = normalizeSplitRatio(100 - splitRatio);
  applySplitRatio();
  statusText.textContent = `Split swapped to ${splitRatioText()}`;
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
  clearLoadedSearchCache();
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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardAnchorTerm(value) {
  return String(value || '')
    .split('*')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';
}

function wildcardRegex(value) {
  const pattern = String(value || '').toLowerCase();
  if (!pattern.includes('*')) return null;
  const body = pattern.split('*').map(escapeRegex).join('[^\\s]*');
  try {
    return new RegExp(body, 'i');
  } catch (_) {
    return null;
  }
}

function wildcardMatch(text, value) {
  const pattern = String(value || '').toLowerCase();
  if (!pattern) return false;
  if (!pattern.includes('*')) return String(text || '').toLowerCase().includes(pattern);
  const re = wildcardRegex(pattern);
  return re ? re.test(String(text || '')) : false;
}

function firstWildcardMatchIndex(text, values) {
  const source = String(text || '');
  for (const value of values || []) {
    const pattern = String(value || '').toLowerCase();
    if (!pattern) continue;
    if (!pattern.includes('*')) {
      const idx = source.toLowerCase().indexOf(pattern);
      if (idx >= 0) return { index: idx, length: pattern.length };
      continue;
    }
    const re = wildcardRegex(pattern);
    if (!re) continue;
    const match = re.exec(source);
    if (match) return { index: match.index, length: match[0].length };
  }
  return { index: -1, length: 0 };
}

function fuzzySearchMatch(value, pattern) {
  const text = String(value || '').toLowerCase();
  const needle = String(pattern || '').toLowerCase().replace(/\s+/g, '');
  if (needle.length < 2 || !text) return { matched: false, index: -1, length: 0, score: 0 };
  let start = -1;
  let last = -1;
  let cursor = 0;
  let streak = 0;
  let bestStreak = 0;
  let gaps = 0;
  for (let i = 0; i < text.length && cursor < needle.length; i++) {
    if (text[i] !== needle[cursor]) continue;
    if (start < 0) start = i;
    if (last >= 0 && i !== last + 1) {
      gaps += i - last - 1;
      streak = 0;
    }
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    last = i;
    cursor += 1;
  }
  if (cursor !== needle.length) return { matched: false, index: -1, length: 0, score: 0 };
  const length = Math.max(1, last - start + 1);
  const density = needle.length / length;
  const score = Math.round((density * 36) + (bestStreak * 4) - Math.min(18, gaps / 3));
  return { matched: true, index: start, length, score };
}

function fuzzyTextMatch(value, pattern) {
  return fuzzySearchMatch(value, pattern).matched;
}

function bestFuzzyMatchIndex(value, patterns) {
  let best = { matched: false, index: -1, length: 0, score: -Infinity };
  for (const pattern of patterns || []) {
    const match = fuzzySearchMatch(value, pattern);
    if (match.matched && match.score > best.score) best = match;
  }
  return best.matched ? { index: best.index, length: best.length } : { index: -1, length: 0 };
}

function parseSearchQuery(query) {
  const raw = String(query || '').trim();
  const parts = raw.match(/-?"[^"]+"|\S+/g) || [];
  const filters = { path: [], title: [], type: [], tag: [], task: [] };
  const excludes = { path: [], title: [], type: [], tag: [], task: [] };
  const textParts = [];
  const excludeTerms = [];
  const phrases = [];
  const excludePhrases = [];
  const wildcards = [];
  const excludeWildcards = [];
  const fuzzyTerms = [];
  const excludeFuzzyTerms = [];
  parts.forEach((part) => {
    const negated = part.startsWith('-') && part.length > 1;
    const rawToken = negated ? part.slice(1) : part;
    const quoted = /^".*"$/.test(rawToken);
    const clean = rawToken.replace(/^"|"$/g, '').trim();
    if (!clean) return;
    if (quoted) {
      if (negated) excludePhrases.push(clean.toLowerCase());
      else phrases.push(clean.toLowerCase());
      return;
    }
    const token = clean;
    const targetFilters = negated ? excludes : filters;
    const match = token.match(/^(path|title|type|kind|tag|task):(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase() === 'kind' ? 'type' : match[1].toLowerCase();
      const value = match[2].replace(/^#/, '').toLowerCase().trim();
      if (value) targetFilters[key].push(value);
      return;
    }
    if (token.includes('*') && wildcardAnchorTerm(token).length >= 2) {
      const wildcard = token.toLowerCase();
      if (negated) excludeWildcards.push(wildcard);
      else {
        wildcards.push(wildcard);
        textParts.push(wildcardAnchorTerm(wildcard));
      }
      return;
    }
    if (/^#[A-Za-z0-9_/-]+$/.test(token)) {
      targetFilters.tag.push(token.slice(1).toLowerCase());
      return;
    }
    if (token.startsWith('~') && token.length > 2) {
      const fuzzy = token.slice(1).toLowerCase().trim();
      if (negated) excludeFuzzyTerms.push(fuzzy);
      else fuzzyTerms.push(fuzzy);
      return;
    }
    if (negated) {
      excludeTerms.push(token.toLowerCase());
      return;
    }
    textParts.push(token);
  });
  const text = textParts.join(' ').trim();
  const lower = text.toLowerCase();
  const hasFilters = Object.values(filters).some(values => values.length > 0);
  const hasExcludes = excludeTerms.length > 0 || excludePhrases.length > 0 || excludeWildcards.length > 0 || excludeFuzzyTerms.length > 0 || Object.values(excludes).some(values => values.length > 0);
  return {
    raw,
    text,
    lower,
    terms: lower.split(/\s+/).filter(Boolean).slice(0, 8),
    phrases: phrases.slice(0, 8),
    wildcards: wildcards.slice(0, 6),
    filters,
    excludes,
    excludeTerms: excludeTerms.filter(Boolean).slice(0, 8),
    excludePhrases: excludePhrases.slice(0, 8),
    excludeWildcards: excludeWildcards.slice(0, 6),
    fuzzyTerms: fuzzyTerms.filter(Boolean).slice(0, 6),
    excludeFuzzyTerms: excludeFuzzyTerms.filter(Boolean).slice(0, 6),
    backendQuery: [text, ...phrases.map(phrase => `"${phrase}"`)].filter(Boolean).join(' ').trim(),
    hasFilters,
    hasExcludes,
    hasPhrases: phrases.length > 0,
    hasWildcards: wildcards.length > 0 || excludeWildcards.length > 0,
    hasFuzzy: fuzzyTerms.length > 0 || excludeFuzzyTerms.length > 0,
    needsContentFilter: filters.tag.length > 0 || filters.task.length > 0,
  };
}

function searchCandidateMatchesPlan(note, content, plan) {
  if (!plan || (!plan.hasFilters && !plan.hasExcludes && !plan.hasFuzzy)) return true;
  const title = String(note.path ? (note.title || basename(note.path)) : (note.title || 'Untitled')).toLowerCase();
  const path = String(note.path || 'Draft').toLowerCase();
  const kind = String(getFileType(note.path, note.kind) || '').toLowerCase();
  const typeText = `${kind} ${typeLabel(kind)} ${path.split('.').pop() || ''}`.toLowerCase();
  const body = String(content || '').toLowerCase();
  const haystack = `${title}\n${path}\n${body}`;
  const exclude = plan.excludes || { path: [], title: [], type: [], tag: [], task: [] };
  if (plan.filters.path.some(value => !path.includes(value))) return false;
  if (plan.filters.title.some(value => !title.includes(value))) return false;
  if (plan.filters.type.some(value => !typeText.includes(value))) return false;
  if (plan.filters.tag.some(value => !body.includes(`#${value}`))) return false;
  if (!searchContentMatchesTaskFilters(content, plan.filters.task)) return false;
  if (exclude.path.some(value => path.includes(value))) return false;
  if (exclude.title.some(value => title.includes(value))) return false;
  if (exclude.type.some(value => typeText.includes(value))) return false;
  if (exclude.tag.some(value => body.includes(`#${value}`))) return false;
  if (exclude.task.length && searchContentMatchesTaskFilters(content, exclude.task)) return false;
  if ((plan.wildcards || []).some(value => !wildcardMatch(haystack, value))) return false;
  if ((plan.excludeWildcards || []).some(value => wildcardMatch(haystack, value))) return false;
  if ((plan.fuzzyTerms || []).some(value => !fuzzyTextMatch(haystack, value))) return false;
  if ((plan.excludeFuzzyTerms || []).some(value => fuzzyTextMatch(haystack, value))) return false;
  return true;
}

function searchResultMatchesPlan(result, plan) {
  if (!plan || (!plan.hasFilters && !plan.hasExcludes && !plan.hasFuzzy)) return true;
  const title = String(result.title || basename(result.path) || 'Untitled').toLowerCase();
  const path = String(result.path || '').toLowerCase();
  const kind = String(result.kind || result.type || getFileType(result.path, result.kind) || '').toLowerCase();
  const typeText = `${kind} ${typeLabel(kind)} ${path.split('.').pop() || ''}`.toLowerCase();
  const snippet = String(result.snippet || '').toLowerCase();
  const haystack = `${title}\n${path}\n${snippet}`;
  const resultBody = searchResultFilterText(result);
  const snippetOnlyLocal = result.source === 'local' && result.partialContent;
  const exclude = plan.excludes || { path: [], title: [], type: [], tag: [], task: [] };
  if (plan.filters.path.some(value => !path.includes(value))) return false;
  if (plan.filters.title.some(value => !title.includes(value))) return false;
  if (plan.filters.type.some(value => !typeText.includes(value))) return false;
  if (!snippetOnlyLocal && plan.filters.tag.some(value => !resultBody.includes(`#${value}`))) return false;
  if (!snippetOnlyLocal && !searchResultMatchesTaskFilters(result, plan.filters.task)) return false;
  if (exclude.path.some(value => path.includes(value))) return false;
  if (exclude.title.some(value => title.includes(value))) return false;
  if (exclude.type.some(value => typeText.includes(value))) return false;
  if (exclude.tag.some(value => resultBody.includes(`#${value}`))) return false;
  if (exclude.task.length && searchResultMatchesTaskFilters(result, exclude.task)) return false;
  if ((plan.excludeTerms || []).some(value => haystack.includes(value))) return false;
  if ((plan.excludePhrases || []).some(value => haystack.includes(value))) return false;
  if ((plan.wildcards || []).some(value => !wildcardMatch(haystack, value))) return false;
  if ((plan.excludeWildcards || []).some(value => wildcardMatch(haystack, value))) return false;
  if ((plan.fuzzyTerms || []).some(value => !fuzzyTextMatch(haystack, value))) return false;
  if ((plan.excludeFuzzyTerms || []).some(value => fuzzyTextMatch(haystack, value))) return false;
  return true;
}

function searchPlanMetaSuffix(query) {
  const plan = parseSearchQuery(query);
  const includeParts = [];
  const excludeParts = [];
  Object.entries(plan.filters).forEach(([key, values]) => {
    values.forEach(value => includeParts.push(`${key}:${value}`));
  });
  Object.entries(plan.excludes).forEach(([key, values]) => {
    values.forEach(value => excludeParts.push(`-${key}:${value}`));
  });
  (plan.wildcards || []).forEach(value => includeParts.push(`wildcard:${value}`));
  (plan.fuzzyTerms || []).forEach(value => includeParts.push(`~${value}`));
  (plan.excludeTerms || []).forEach(value => excludeParts.push(`-${value}`));
  (plan.excludePhrases || []).forEach(value => excludeParts.push(`-"${value}"`));
  (plan.excludeWildcards || []).forEach(value => excludeParts.push(`-${value}`));
  (plan.excludeFuzzyTerms || []).forEach(value => excludeParts.push(`-~${value}`));
  const compact = (items) => items.length > 3 ? `${items.slice(0, 3).join(', ')} +${items.length - 3}` : items.join(', ');
  const parts = [];
  if (includeParts.length) parts.push(`including ${compact(includeParts)}`);
  if (excludeParts.length) parts.push(`excluding ${compact(excludeParts)}`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function searchQueryChipItems(query) {
  const plan = parseSearchQuery(query || '');
  const chips = [];
  (plan.terms || []).forEach(value => chips.push({ kind: 'term', label: value }));
  (plan.phrases || []).forEach(value => chips.push({ kind: 'phrase', label: `"${value}"` }));
  Object.entries(plan.filters || {}).forEach(([key, values]) => {
    (values || []).forEach(value => chips.push({ kind: 'filter', label: `${key}:${value}` }));
  });
  (plan.wildcards || []).forEach(value => chips.push({ kind: 'wildcard', label: value }));
  (plan.fuzzyTerms || []).forEach(value => chips.push({ kind: 'fuzzy', label: `~${value}` }));
  (plan.excludeTerms || []).forEach(value => chips.push({ kind: 'exclude', label: `-${value}` }));
  (plan.excludePhrases || []).forEach(value => chips.push({ kind: 'exclude', label: `-"${value}"` }));
  Object.entries(plan.excludes || {}).forEach(([key, values]) => {
    (values || []).forEach(value => chips.push({ kind: 'exclude', label: `-${key}:${value}` }));
  });
  (plan.excludeWildcards || []).forEach(value => chips.push({ kind: 'exclude', label: `-${value}` }));
  (plan.excludeFuzzyTerms || []).forEach(value => chips.push({ kind: 'exclude', label: `-~${value}` }));
  return chips.slice(0, 12);
}

function renderSearchQueryChips(query) {
  const chips = searchQueryChipItems(query);
  if (!chips.length) return '';
  const buttons = chips.map((chip) => {
    const labelAttr = escapeAttr(chip.label);
    const kindAttr = escapeAttr(chip.kind);
    return `<button type="button" data-search-chip="${labelAttr}" class="${kindAttr}" title="Add ${labelAttr}">${escapeHtml(chip.label)}</button>`;
  }).join('');
  return `
    <div class="search-query-chips" aria-label="Parsed search query">
      <span>Query plan</span>
      ${buttons}
    </div>
  `;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function searchContentMatchesTaskFilters(content, filters) {
  if (!filters.length) return true;
  const lines = String(content || '').split('\n');
  return filters.every((filter) => {
    if (['open', 'todo', 'unchecked'].includes(filter)) {
      return lines.some(line => /^\s*[-*+]\s+\[\s\]\s+/.test(line));
    }
    if (['done', 'closed', 'checked'].includes(filter)) {
      return lines.some(line => /^\s*[-*+]\s+\[[xX]\]\s+/.test(line));
    }
    return lines.some(line => /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line) && line.toLowerCase().includes(filter));
  });
}

function searchResultFilterText(result) {
  return [
    result?.snippet,
    result?.text,
    result?.raw,
    result?.title,
    result?.path,
  ].map(value => String(value || '').toLowerCase()).join('\n');
}

function searchResultMatchesTaskFilters(result, filters) {
  if (!filters.length) return true;
  const text = searchResultFilterText(result);
  return filters.every((filter) => {
    if (['open', 'todo', 'unchecked'].includes(filter)) return /\[[\s]\]/.test(text);
    if (['done', 'closed', 'checked'].includes(filter)) return /\[[x]\]/i.test(text);
    return /\[[\sx]\]/i.test(text) && text.includes(filter);
  });
}

function localSearchBackendQuery(plan, rawQuery) {
  const anchors = [];
  const backend = String(plan?.backendQuery || '').trim();
  if (backend) anchors.push(backend);
  const tagFilters = plan?.filters?.tag || [];
  anchors.push(...tagFilters.map(tag => `#${tag}`));
  const taskFilters = plan?.filters?.task || [];
  taskFilters.forEach((task) => {
    if (['open', 'todo', 'unchecked'].includes(task)) anchors.push('[ ]');
    else if (['done', 'closed', 'checked'].includes(task)) anchors.push('[x]');
    else if (task) anchors.push(task);
  });
  if (anchors.length) return anchors.join(' ');
  if (plan?.hasFilters || plan?.hasExcludes) return '';
  return String(rawQuery || '').trim();
}

function scoreSearch(note, content, plan) {
  const query = plan.lower;
  const terms = plan.terms;
  const phrases = plan.phrases || [];
  const fuzzyTerms = plan.fuzzyTerms || [];
  const title = note.path ? (note.title || basename(note.path)) : 'Untitled';
  const path = note.path || 'Draft';
  const titleLower = title.toLowerCase();
  const pathLower = path.toLowerCase();
  const body = content || '';
  const bodyLower = body.toLowerCase();
  const haystack = `${titleLower}\n${pathLower}\n${bodyLower}`;
  if (!searchCandidateMatchesPlan(note, body, plan)) return null;
  if ((plan.excludeTerms || []).some(term => haystack.includes(term))) return null;
  if ((plan.excludePhrases || []).some(phrase => haystack.includes(phrase))) return null;
  if ((plan.excludeWildcards || []).some(value => wildcardMatch(haystack, value))) return null;
  if ((plan.excludeFuzzyTerms || []).some(term => fuzzyTextMatch(haystack, term))) return null;
  if (terms.length && !terms.every(term => haystack.includes(term))) return null;
  if (phrases.length && !phrases.every(phrase => haystack.includes(phrase))) return null;
  if ((plan.wildcards || []).length && !plan.wildcards.every(value => wildcardMatch(haystack, value))) return null;
  if (fuzzyTerms.length && !fuzzyTerms.every(term => fuzzyTextMatch(haystack, term))) return null;

  let score = 0;
  if (!query && !phrases.length) score = note.id === activeId ? 20 : 1;
  if (plan.hasFilters) score += 25;
  if (phrases.length) score += 28;
  if ((plan.wildcards || []).length) score += 18;
  if (fuzzyTerms.length) score += 14;
  if (query && titleLower.includes(query)) score += 120;
  if (query && pathLower.includes(query)) score += 70;
  for (const phrase of phrases) {
    if (titleLower.includes(phrase)) score += 90;
    if (pathLower.includes(phrase)) score += 48;
    if (bodyLower.includes(phrase)) score += 24;
  }
  for (const wildcard of plan.wildcards || []) {
    if (wildcardMatch(titleLower, wildcard)) score += 38;
    if (wildcardMatch(pathLower, wildcard)) score += 24;
    if (wildcardMatch(bodyLower, wildcard)) score += 10;
  }
  let match = firstMatchIndex(body, query, [...phrases, ...terms]);
  if (match.index < 0 && (plan.wildcards || []).length) match = firstWildcardMatchIndex(body, plan.wildcards);
  if (match.index >= 0) score += 40 + Math.max(0, 30 - Math.floor(match.index / 4000));
  for (const term of terms) {
    if (titleLower.includes(term)) score += 18;
    if (pathLower.includes(term)) score += 10;
    if (bodyLower.includes(term)) score += 4;
  }
  for (const term of fuzzyTerms) {
    const titleMatch = fuzzySearchMatch(titleLower, term);
    const pathMatch = fuzzySearchMatch(pathLower, term);
    const bodyMatch = fuzzySearchMatch(bodyLower, term);
    if (titleMatch.matched) score += 26 + titleMatch.score;
    if (pathMatch.matched) score += 16 + pathMatch.score;
    if (bodyMatch.matched) score += 6 + Math.max(0, Math.floor(bodyMatch.score / 2));
  }
  if (match.index < 0 && fuzzyTerms.length) match = bestFuzzyMatchIndex(bodyLower, fuzzyTerms);
  if (score <= 0 && (terms.length || fuzzyTerms.length)) return null;

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
  const startedAt = performance.now();
  const plan = parseSearchQuery(query);
  const scopeLabel = searchScope === 'local' ? 'local folder' : searchScope === 'all' ? 'loaded and local files' : 'loaded files';
  searchLastDedupe = { input: 0, output: 0, removed: 0 };
  searchResults.innerHTML = `<div class="search-empty">Searching ${scopeLabel}...</div>`;
  updateSearchScopeButtons();
  if (searchScope === 'local') {
    await runLocalFolderSearch(query, token);
    return;
  }
  if (searchScope === 'all') {
    await runAllSearch(query, token);
    return;
  }
  const results = await collectLoadedSearchResults(query, token, 40);
  if (token !== searchToken) return;
  setSearchTelemetry({ scope: 'loaded', startedAt, searched: cachedNotes.length, scanned: cachedNotes.length, resultCount: results.length, capped: results.length >= 40 });
  renderSearchResults(results, query);
}

function clearLoadedSearchCache() {
  loadedSearchCache.clear();
  loadedSearchCacheBytes = 0;
}

function clearLoadedSearchCacheAction() {
  clearLoadedSearchCache();
  statusText.textContent = 'Loaded search cache cleared';
}

function showSearchPerformanceGuide() {
  showModal('Search Performance Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>loaded files</strong><span>Fast current scope</span><small>Searches open/loaded Markdown without scanning the whole workspace on each keypress</small></div>
      <div class="diag-card"><strong>bounded cache</strong><span>${SEARCH_CACHE_MAX_ENTRIES} entries</span><small>Cached loaded-note text is capped at ${formatBytes(SEARCH_CACHE_MAX_BYTES)}</small></div>
      <div class="diag-card"><strong>manual release</strong><span>Clear cache</span><small>Use the command palette action when you want to free cached text immediately</small></div>
      <div class="diag-card"><strong>footprint</strong><span>Measured locally</span><small>Local Footprint reports search cache bytes with runtime and undo memory</small></div>
      <div class="diag-card"><strong>next backend</strong><span>Streaming workspace search</span><small>Bounded Go workers, cancellation, and Markdown-first results</small></div>
      <div class="diag-card"><strong>later index</strong><span>Optional FTS</span><small>Only as a rebuildable index over local Markdown, not a new source of truth</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-open-local-footprint>Open Local Footprint</button>
      <button data-clear-loaded-search-cache>Clear Search Cache</button>
      <button data-search-profile-open>Search Profile</button>
      <button data-workspace-search-plan>Workspace Search Plan</button>
    </div>
    <p class="diag-note">Search should stay local-first and memory-bounded. The current loaded-file path is intentionally small; broader workspace search should stream from disk and expose its cache/index cost in diagnostics.</p>
  `);
}

function showWorkspaceSearchPlan() {
  showModal('Workspace Search Plan', `
    <div class="diag-grid">
      <div class="diag-card"><strong>bounded</strong><span>Worker pool</span><small>Use a conservative Go worker count instead of unbounded goroutines</small></div>
      <div class="diag-card"><strong>cancel</strong><span>Query tokens</span><small>Stop older workspace searches when the user keeps typing</small></div>
      <div class="diag-card"><strong>stream</strong><span>Batch results</span><small>Return normalized hits without holding full file contents in memory</small></div>
      <div class="diag-card"><strong>skip</strong><span>Safe folders</span><small>Reuse local folder skip rules and file-size caps</small></div>
      <div class="diag-card"><strong>diagnose</strong><span>Counts + timing</span><small>Expose searched, skipped, elapsed time, and any cache/index cost</small></div>
      <div class="diag-card"><strong>optional</strong><span>FTS later</span><small>Only add an index after measurements show the standard path is not enough</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-search-performance-open>Search Performance</button>
      <button data-search-profile-open>Search Profile</button>
      <button data-open-local-footprint>Local Footprint</button>
      <button data-local-workspace-setup>Workspace Setup</button>
    </div>
    <p class="diag-note">Workspace search should remain local, cancellable, measurable, and derived from files. Current-file and loaded-file search stay as zero-index fast paths.</p>
  `);
}

function searchResultPageFootprint(results = searchLastResults) {
  const items = Array.isArray(results) ? results : [];
  const compact = items.map(result => ({
    title: result.title || '',
    path: result.path || '',
    source: result.source || 'loaded',
    line: Number.isFinite(Number(result.line)) ? Number(result.line) : null,
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
    kind: result.kind || result.type || '',
    match: searchResultMatchLabel(result),
    snippet: result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
  }));
  const bytes = byteSize(JSON.stringify(compact));
  const snippetBytes = compact.reduce((sum, item) => sum + byteSize(item.snippet || ''), 0);
  return {
    count: compact.length,
    bytes,
    snippetBytes,
    metadataBytes: Math.max(0, bytes - snippetBytes),
    averageBytes: compact.length ? Math.round(bytes / compact.length) : 0,
  };
}

function searchElapsedMs(startedAt, fallback) {
  const value = Number(fallback);
  if (Number.isFinite(value) && value >= 0) return Math.round(value);
  if (Number.isFinite(Number(startedAt))) return Math.max(0, Math.round(performance.now() - startedAt));
  return 0;
}

function setSearchTelemetry(stats = {}) {
  const backendElapsedMs = Number.isFinite(Number(stats.elapsedMs)) ? Math.max(0, Math.round(Number(stats.elapsedMs))) : null;
  searchLastTelemetry = {
    scope: stats.scope || searchScope,
    elapsedMs: Number.isFinite(Number(stats.startedAt)) ? searchElapsedMs(stats.startedAt) : searchElapsedMs(null, stats.elapsedMs),
    backendElapsedMs,
    searched: Math.max(0, Number(stats.searched ?? stats.searchable ?? 0)),
    scanned: Math.max(0, Number(stats.scanned ?? stats.searched ?? stats.searchable ?? 0)),
    skipped: Math.max(0, Number(stats.skipped || 0)),
    oversize: Math.max(0, Number(stats.oversize || 0)),
    capped: !!stats.capped,
    resultCount: Math.max(0, Number(stats.resultCount || 0)),
  };
  return searchLastTelemetry;
}

function searchTelemetrySummary(telemetry = searchLastTelemetry) {
  const stats = telemetry || {};
  const skipped = Number(stats.skipped || 0) + Number(stats.oversize || 0);
  const parts = [`${Number(stats.elapsedMs || 0)} ms`];
  if (Number.isFinite(Number(stats.backendElapsedMs)) && Number(stats.backendElapsedMs) !== Number(stats.elapsedMs || 0)) {
    parts.push(`${Number(stats.backendElapsedMs)} ms backend`);
  }
  if (Number(stats.searched || 0)) parts.push(`${Number(stats.searched || 0)} searched`);
  if (Number(stats.scanned || 0) && Number(stats.scanned || 0) !== Number(stats.searched || 0)) parts.push(`${Number(stats.scanned || 0)} scanned`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (stats.capped) parts.push('capped');
  return parts.join(' · ');
}

function searchProfileSnapshot(query = searchLastQuery, results = searchLastResults) {
  const plan = parseSearchQuery(query || '');
  const resultItems = Array.isArray(results) ? results : [];
  const sources = resultItems.reduce((acc, result) => {
    const source = result.source || 'loaded';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  return {
    type: 'markpad-search-profile',
    version: 1,
    sampledAt: new Date().toISOString(),
    scope: searchScope,
    query: plan.raw,
    backendQuery: plan.backendQuery || '',
    resultCount: resultItems.length,
    sources,
    diagnostics: { ...searchLastTelemetry },
    dedupe: searchScope === 'all' ? searchLastDedupe : { input: resultItems.length, output: resultItems.length, removed: 0 },
    operators: {
      terms: plan.terms || [],
      phrases: plan.phrases || [],
      wildcards: plan.wildcards || [],
      fuzzyTerms: plan.fuzzyTerms || [],
      filters: plan.filters,
      excludes: plan.excludes,
      excludeTerms: plan.excludeTerms || [],
      excludePhrases: plan.excludePhrases || [],
      excludeWildcards: plan.excludeWildcards || [],
      excludeFuzzyTerms: plan.excludeFuzzyTerms || [],
    },
    capabilities: {
      loadedBackend: !!window.go?.main?.App?.SearchLoadedDocuments,
      localFolderSearch: !!window.go?.main?.App?.SearchLocalFolder,
      plannedSidecar: 'SQLite FTS5 rebuildable cache',
      currentIndex: 'none',
      sourceOfTruth: 'local files and loaded editor buffers',
    },
    cache: loadedSearchCacheFootprint(),
    resultPage: searchResultPageFootprint(resultItems),
    limits: {
      loadedCacheMaxEntries: SEARCH_CACHE_MAX_ENTRIES,
      loadedCacheMaxBytes: SEARCH_CACHE_MAX_BYTES,
      contentCapBytes: SEARCH_CONTENT_CAP,
    },
    note: 'Profile samples current search state only; it does not scan files or build an index.',
  };
}

function searchProfileMarkdown(snapshot = searchProfileSnapshot()) {
  const sources = Object.entries(snapshot.sources || {}).map(([source, count]) => `${source}: ${count}`).join(', ') || 'none';
  const filters = Object.entries(snapshot.operators.filters || {})
    .flatMap(([key, values]) => (values || []).map(value => `${key}:${value}`));
  const excludes = [
    ...Object.entries(snapshot.operators.excludes || {}).flatMap(([key, values]) => (values || []).map(value => `-${key}:${value}`)),
    ...(snapshot.operators.excludeTerms || []).map(value => `-${value}`),
    ...(snapshot.operators.excludePhrases || []).map(value => `-"${value}"`),
    ...(snapshot.operators.excludeWildcards || []).map(value => `-${value}`),
    ...(snapshot.operators.excludeFuzzyTerms || []).map(value => `-~${value}`),
  ];
  return [
    '# Markpad Search Profile',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    `Scope: ${snapshot.scope}`,
    `Query: ${snapshot.query || '(empty)'}`,
    `Backend query: ${snapshot.backendQuery || '(none)'}`,
    `Results: ${snapshot.resultCount}`,
    `Sources: ${sources}`,
    `De-duplicated: ${snapshot.dedupe?.removed || 0} removed from ${snapshot.dedupe?.input || snapshot.resultCount} merged hits`,
    '',
    '## Operators',
    '',
    `- Terms: ${(snapshot.operators.terms || []).join(', ') || 'none'}`,
    `- Phrases: ${(snapshot.operators.phrases || []).join(', ') || 'none'}`,
    `- Wildcards: ${(snapshot.operators.wildcards || []).join(', ') || 'none'}`,
    `- Fuzzy: ${(snapshot.operators.fuzzyTerms || []).map(value => `~${value}`).join(', ') || 'none'}`,
    `- Filters: ${filters.join(', ') || 'none'}`,
    `- Excludes: ${excludes.join(', ') || 'none'}`,
    '',
    '## Local performance',
    '',
    `- Last run: ${searchTelemetrySummary(snapshot.diagnostics)}`,
    `- Loaded search cache: ${formatBytes(snapshot.cache.bytes || 0)} (${snapshot.cache.entries || 0}/${snapshot.cache.maxEntries || SEARCH_CACHE_MAX_ENTRIES} entries)`,
    `- Current result page: ${formatBytes(snapshot.resultPage?.bytes || 0)} (${snapshot.resultPage?.count || 0} results, ${formatBytes(snapshot.resultPage?.snippetBytes || 0)} snippets)`,
    `- Cache cap: ${formatBytes(snapshot.cache.maxBytes || SEARCH_CACHE_MAX_BYTES)}`,
    `- Per-file content cap: ${formatBytes(snapshot.limits.contentCapBytes || SEARCH_CONTENT_CAP)}`,
    `- Loaded backend bridge: ${snapshot.capabilities.loadedBackend ? 'available' : 'unavailable'}`,
    `- Local folder search bridge: ${snapshot.capabilities.localFolderSearch ? 'available' : 'unavailable'}`,
    `- Planned index: ${snapshot.capabilities.plannedSidecar}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function searchProfileJson(snapshot = searchProfileSnapshot()) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function searchProfileCsv(snapshot = searchProfileSnapshot()) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['scope', snapshot.scope],
    ['query', snapshot.query || ''],
    ['backend_query', snapshot.backendQuery || ''],
    ['result_count', Number(snapshot.resultCount || 0)],
    ['dedupe_input', Number(snapshot.dedupe?.input || 0)],
    ['dedupe_output', Number(snapshot.dedupe?.output || 0)],
    ['dedupe_removed', Number(snapshot.dedupe?.removed || 0)],
    ['last_run_elapsed_ms', Number(snapshot.diagnostics?.elapsedMs || 0)],
    ['last_run_backend_elapsed_ms', snapshot.diagnostics?.backendElapsedMs ?? ''],
    ['last_run_searched', Number(snapshot.diagnostics?.searched || 0)],
    ['last_run_scanned', Number(snapshot.diagnostics?.scanned || 0)],
    ['last_run_skipped', Number(snapshot.diagnostics?.skipped || 0)],
    ['last_run_oversize', Number(snapshot.diagnostics?.oversize || 0)],
    ['last_run_capped', snapshot.diagnostics?.capped ? 'true' : 'false'],
    ['result_page_bytes', Number(snapshot.resultPage?.bytes || 0)],
    ['result_page_snippet_bytes', Number(snapshot.resultPage?.snippetBytes || 0)],
    ['result_page_metadata_bytes', Number(snapshot.resultPage?.metadataBytes || 0)],
    ['result_page_average_bytes', Number(snapshot.resultPage?.averageBytes || 0)],
    ['cache_bytes', Number(snapshot.cache.bytes || 0)],
    ['cache_entries', Number(snapshot.cache.entries || 0)],
    ['cache_max_bytes', Number(snapshot.cache.maxBytes || SEARCH_CACHE_MAX_BYTES)],
    ['cache_max_entries', Number(snapshot.cache.maxEntries || SEARCH_CACHE_MAX_ENTRIES)],
    ['content_cap_bytes', Number(snapshot.limits.contentCapBytes || SEARCH_CONTENT_CAP)],
    ['loaded_backend_available', snapshot.capabilities.loadedBackend ? 'true' : 'false'],
    ['local_folder_search_available', snapshot.capabilities.localFolderSearch ? 'true' : 'false'],
    ['planned_index', snapshot.capabilities.plannedSidecar],
    ['current_index', snapshot.capabilities.currentIndex],
  ];
  Object.entries(snapshot.sources || {}).forEach(([source, count]) => rows.push([`source_${source}`, Number(count || 0)]));
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function showSearchProfile() {
  const snapshot = searchProfileSnapshot();
  const sourceText = Object.entries(snapshot.sources || {}).map(([source, count]) => `${source} ${count}`).join(' · ') || 'No results yet';
  showModal('Search Profile', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${escapeHtml(snapshot.scope)}</strong><span>Scope</span><small>loaded / local / all</small></div>
      <div class="diag-card"><strong>${snapshot.resultCount}</strong><span>Current results</span><small>${escapeHtml(sourceText)}</small></div>
      <div class="diag-card"><strong>${Number(snapshot.diagnostics?.elapsedMs || 0)} ms</strong><span>Last run</span><small>${escapeHtml(searchTelemetrySummary(snapshot.diagnostics))}</small></div>
      <div class="diag-card"><strong>${snapshot.dedupe.removed || 0}</strong><span>De-duplicated</span><small>${snapshot.dedupe.input || snapshot.resultCount} merged hits</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.resultPage.bytes || 0)}</strong><span>Result page</span><small>${formatBytes(snapshot.resultPage.snippetBytes || 0)} snippets · avg ${formatBytes(snapshot.resultPage.averageBytes || 0)}</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.cache.bytes || 0)}</strong><span>Loaded cache</span><small>${snapshot.cache.entries || 0}/${snapshot.cache.maxEntries || SEARCH_CACHE_MAX_ENTRIES} entries</small></div>
      <div class="diag-card"><strong>${(snapshot.operators.terms || []).length}</strong><span>Text terms</span><small>${escapeHtml((snapshot.operators.terms || []).join(', ') || 'none')}</small></div>
      <div class="diag-card"><strong>${(snapshot.operators.phrases || []).length}</strong><span>Phrases</span><small>${escapeHtml((snapshot.operators.phrases || []).join(', ') || 'none')}</small></div>
      <div class="diag-card"><strong>${(snapshot.operators.wildcards || []).length}</strong><span>Wildcards</span><small>${escapeHtml((snapshot.operators.wildcards || []).join(', ') || 'none')}</small></div>
      <div class="diag-card"><strong>${(snapshot.operators.fuzzyTerms || []).length}</strong><span>Fuzzy terms</span><small>${escapeHtml((snapshot.operators.fuzzyTerms || []).map(value => `~${value}`).join(', ') || 'none')}</small></div>
      <div class="diag-card"><strong>${snapshot.capabilities.loadedBackend ? 'yes' : 'no'}</strong><span>Loaded bridge</span><small>Go search fast path</small></div>
      <div class="diag-card"><strong>${snapshot.capabilities.localFolderSearch ? 'yes' : 'no'}</strong><span>Local bridge</span><small>Current folder search path</small></div>
      <div class="diag-card"><strong>pending</strong><span>Loaded cap</span><small>Cap large notes before Wails bridge</small></div>
      <div class="diag-card"><strong>pending</strong><span>Scan cancel</span><small>Serialize or cancel older folder scans</small></div>
      <div class="diag-card"><strong>planned</strong><span>SQLite FTS5 sidecar</span><small>Rebuildable cache, not source of truth</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-search-profile-md>Copy MD</button>
      <button data-export-search-profile-md>Export MD</button>
      <button data-copy-search-profile-json>Copy JSON</button>
      <button data-export-search-profile-json>Export JSON</button>
      <button data-copy-search-profile-csv>Copy CSV</button>
      <button data-export-search-profile-csv>Export CSV</button>
      <button data-clear-loaded-search-cache>Clear Search Cache</button>
      <button data-workspace-search-plan>Workspace Search Plan</button>
    </div>
    <p class="diag-note">${escapeHtml(snapshot.note)}</p>
  `);
}

function renderSearchResultStrip(results, query) {
  const snapshot = searchProfileSnapshot(query, results);
  const sources = snapshot.sources || {};
  const loadedCount = Number(sources.loaded || 0);
  const localCount = Number(sources.local || 0);
  const otherCount = Math.max(0, Number(snapshot.resultCount || 0) - loadedCount - localCount);
  const total = Math.max(1, Number(snapshot.resultCount || 0));
  const sourceSlices = [
    ['loaded', 'Loaded', loadedCount],
    ['local', 'Local', localCount],
    ['other', 'Other', otherCount],
  ].filter(([, , count]) => count > 0).map(([className, label, count]) => {
    const width = Math.round((count / total) * 1000) / 10;
    return `<span class="search-source-slice ${className}" style="width:${width}%;" title="${escapeHtml(`${label}: ${count}`)}"></span>`;
  }).join('');
  const filters = Object.values(snapshot.operators.filters || {}).reduce((sum, values) => sum + (values || []).length, 0);
  const excludes = Object.values(snapshot.operators.excludes || {}).reduce((sum, values) => sum + (values || []).length, 0)
    + (snapshot.operators.excludeTerms || []).length
    + (snapshot.operators.excludePhrases || []).length
    + (snapshot.operators.excludeWildcards || []).length
    + (snapshot.operators.excludeFuzzyTerms || []).length;
  const termCount = (snapshot.operators.terms || []).length
    + (snapshot.operators.phrases || []).length
    + (snapshot.operators.wildcards || []).length
    + (snapshot.operators.fuzzyTerms || []).length;
  const dedupe = snapshot.dedupe || { input: snapshot.resultCount, output: snapshot.resultCount, removed: 0 };
  const telemetry = snapshot.diagnostics || {};
  const skipped = Number(telemetry.skipped || 0) + Number(telemetry.oversize || 0);
  const dedupeCard = snapshot.scope === 'all'
    ? `<div class="search-result-card">
        <strong>${Number(dedupe.removed || 0)}</strong>
        <span>Deduped</span>
        <small>${Number(dedupe.input || snapshot.resultCount)} merged hits</small>
      </div>`
    : '';
  return `
    <div class="search-result-strip" aria-label="Search result source summary">
      <div class="search-result-card">
        <strong>${snapshot.resultCount}</strong>
        <span>Results</span>
        <small>${escapeHtml(snapshot.scope)} scope</small>
      </div>
      <div class="search-result-card">
        <strong>${Number(telemetry.elapsedMs || 0)} ms</strong>
        <span>Last run</span>
        <small>${Number(telemetry.searched || 0)} searched${skipped ? ` · ${skipped} skipped` : ''}${telemetry.capped ? ' · capped' : ''}</small>
      </div>
      ${dedupeCard}
      <div class="search-result-card">
        <strong>${loadedCount}</strong>
        <span>Loaded</span>
        <small>Open/session files</small>
      </div>
      <div class="search-result-card">
        <strong>${localCount}</strong>
        <span>Local folder</span>
        <small>Bounded disk scan</small>
      </div>
      <div class="search-result-card">
        <strong>${termCount}</strong>
        <span>Terms</span>
        <small>${filters} filters · ${excludes} excludes</small>
      </div>
      <div class="search-source-meter">
        <div class="search-source-track">${sourceSlices || '<span class="search-source-slice empty" style="width:100%;"></span>'}</div>
        <div class="search-source-legend">
          <span><strong>${loadedCount}</strong> loaded</span>
          <span><strong>${localCount}</strong> local</span>
          <span><strong>${otherCount}</strong> other</span>
        </div>
      </div>
    </div>
  `;
}

function searchEmptyHtml(message, query = searchLastQuery) {
  const scopeButtons = [
    ['loaded', 'Loaded'],
    ['local', 'Local folder'],
    ['all', 'All local'],
  ].map(([scope, label]) => `<button type="button" class="search-empty-chip${searchScope === scope ? ' active' : ''}" data-search-empty-scope="${scope}">${label}</button>`)
    .join('');
  const actionButtons = [
    ['profile', 'Search Profile'],
    ['inspector', 'Query Inspector'],
    ['guide', 'Search Guide'],
    ['current', 'Current File'],
    ['cache', 'Clear Cache'],
  ].map(([action, label]) => `<button type="button" class="search-empty-chip action" data-search-empty-action="${action}">${label}</button>`)
    .join('');
  const queryLine = query ? `<span>Query: <code>${escapeHtml(query)}</code></span>` : '<span>Try a phrase, type:md, tag:idea, task:open, or a wider scope.</span>';
  const queryPlan = query ? renderSearchQueryChips(query) : '';
  return `
    <div class="search-empty">
      <strong>${escapeHtml(message)}</strong>
      ${queryLine}
      ${queryPlan}
      <div class="search-empty-actions">${scopeButtons}</div>
      <div class="search-empty-actions">${actionButtons}</div>
    </div>
  `;
}

async function copySearchProfileMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(searchProfileMarkdown());
    statusText.textContent = 'Search profile copied as Markdown';
  } catch {
    statusText.textContent = 'Clipboard write failed';
  }
}

function exportSearchProfileMarkdown() {
  downloadText('markpad-search-profile.md', 'text/markdown', searchProfileMarkdown());
  statusText.textContent = 'Search profile exported as Markdown';
}

async function copySearchProfileJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(searchProfileJson());
    statusText.textContent = 'Search profile copied as JSON';
  } catch {
    statusText.textContent = 'Clipboard write failed';
  }
}

function exportSearchProfileJson() {
  downloadText('markpad-search-profile.json', 'application/json', searchProfileJson());
  statusText.textContent = 'Search profile exported as JSON';
}

async function copySearchProfileCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(searchProfileCsv());
    statusText.textContent = 'Search profile copied as CSV';
  } catch {
    statusText.textContent = 'Clipboard write failed';
  }
}

function exportSearchProfileCsv() {
  downloadText('markpad-search-profile.csv', 'text/csv', searchProfileCsv());
  statusText.textContent = 'Search profile exported as CSV';
}

function currentFileSearchDefaultQuery() {
  return getSelectedSearchText().replace(/\s+/g, ' ').trim()
    || (findInput?.value || '').trim()
    || (searchInput?.value || '').trim()
    || (searchLastQuery || '').trim();
}

function currentFileSearchMatches(query, limit = 120) {
  const text = String(currentContent || '');
  const needle = String(query || '').trim();
  if (!needle) return { matches: [], total: 0, truncated: false };
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  const matches = [];
  let total = 0;
  let lineCursor = 0;
  let index = haystack.indexOf(target);
  while (index !== -1) {
    total += 1;
    if (matches.length < limit) {
      while (lineCursor + 1 < lineStarts.length && lineStarts[lineCursor + 1] <= index) lineCursor += 1;
      const lineStart = lineStarts[lineCursor];
      const nextLineStart = lineStarts[lineCursor + 1] ?? text.length + 1;
      const lineEnd = Math.max(lineStart, nextLineStart - 1);
      const lineText = text.slice(lineStart, lineEnd).replace(/\r$/, '');
      matches.push({
        offset: index,
        length: needle.length,
        line: lineCursor + 1,
        column: index - lineStart + 1,
        text: lineText.length > 260 ? `${lineText.slice(0, 257)}...` : lineText,
      });
    }
    index = haystack.indexOf(target, index + Math.max(1, target.length));
  }
  return { matches, total, truncated: total > matches.length };
}

function activeFileSearchTitle() {
  const note = cachedNotes.find(item => item.id === activeId) || {};
  return note.title || basename(note.path || '') || sessionTitleFromContent(currentContent) || 'Active file';
}

function currentFileSearchMarkdown(query) {
  const pack = currentFileSearchMatches(query, 500);
  const lines = [
    '# Markpad Current File Search',
    '',
    `File: ${activeFileSearchTitle()}`,
    `Query: ${query}`,
    `Matches: ${pack.total}${pack.truncated ? ` (${pack.matches.length} listed)` : ''}`,
    '',
  ];
  if (!pack.matches.length) {
    lines.push('No matches.', '');
    return lines.join('\n');
  }
  pack.matches.forEach(match => {
    lines.push(`- L${match.line}:C${match.column} ${match.text.replace(/\s+/g, ' ').trim()}`);
  });
  lines.push('');
  return lines.join('\n');
}

function currentFileSearchJson(query) {
  const pack = currentFileSearchMatches(query, 500);
  const note = cachedNotes.find(item => item.id === activeId) || {};
  return JSON.stringify({
    type: 'markpad-current-file-search',
    version: 1,
    generatedAt: new Date().toISOString(),
    file: {
      id: activeId || '',
      title: activeFileSearchTitle(),
      path: note.path || '',
      kind: note.kind || '',
    },
    query: String(query || ''),
    totalMatches: pack.total,
    listedMatches: pack.matches.length,
    truncated: pack.truncated,
    matches: pack.matches.map(match => ({
      line: match.line,
      column: match.column,
      offset: match.offset,
      length: match.length,
      text: match.text,
    })),
  }, null, 2) + '\n';
}

function currentFileSearchCsv(query) {
  const pack = currentFileSearchMatches(query, 500);
  const rows = [
    ['file', 'query', 'line', 'column', 'offset', 'text'],
    ...pack.matches.map(match => [activeFileSearchTitle(), query, match.line, match.column, match.offset, match.text]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function renderCurrentFileSearchRows(matches) {
  if (!matches.length) return '<div class="local-empty">No matches in the active file.</div>';
  return `<div class="local-list">${matches.map(match => `
    <button class="local-row" data-current-file-search-jump="${match.offset}" data-current-file-search-length="${match.length}">
      <strong>L${match.line}:C${match.column}</strong>
      <span>${escapeHtml(match.text || '')}</span>
    </button>
  `).join('')}</div>`;
}

function currentFileSearchMatchCardText(match) {
  const text = String(match?.text || '').replace(/\s+/g, ' ').trim();
  return text.length > 58 ? `${text.slice(0, 55)}...` : text;
}

function insertCurrentFileSearchCanvasBoard(query = currentFileSearchDefaultQuery()) {
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text before sending current-file search to canvas';
    return;
  }
  const pack = currentFileSearchMatches(q, 80);
  if (!pack.matches.length) {
    statusText.textContent = 'No current-file matches to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = pack.matches.slice(0, 24);
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `Current file search: ${q} · ${visible.length}${pack.total > visible.length ? ` of ${pack.total}` : ''} match${visible.length === 1 ? '' : 'es'}`, 18, '#2f6f61'),
    canvasTemplateText(origin.x, origin.y - 6, activeFileSearchTitle(), 12, '#6b6e68'),
  ];
  visible.forEach((match, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = origin.x + col * 260;
    const y = origin.y + row * 112 + 28;
    const stroke = index % 2 === 0 ? '#2563eb' : '#2f6f61';
    elements.push({ id: canvasId(), type: 'rect', x, y, w: 230, h: 86, stroke, width: 2 });
    elements.push(canvasTemplateText(x + 14, y + 28, `L${match.line}:C${match.column}`, 15, stroke));
    elements.push(canvasTemplateText(x + 14, y + 50, currentFileSearchMatchCardText(match), 10, '#1f2937'));
    elements.push(canvasTemplateText(x + 14, y + 70, `offset ${match.offset}`, 9, '#6b6e68'));
  });
  if (pack.total > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + 930, `${pack.total - visible.length} additional matches omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} current-file search match${visible.length === 1 ? '' : 'es'} sent to canvas`;
}

function showCurrentFileSearch(query = currentFileSearchDefaultQuery()) {
  if (!activeId) {
    showModal('Current File Search', '<div class="local-empty">Open an editable file before searching the current file.</div>');
    return;
  }
  const q = String(query || '').trim();
  const pack = q ? currentFileSearchMatches(q) : { matches: [], total: 0, truncated: false };
  showModal('Current File Search', `
    <div class="task-search-row">
      <input data-current-file-search-input value="${escapeHtml(q)}" placeholder="Find literal text in the active file..." />
      <button data-current-file-search-apply>Search</button>
      <button data-current-file-search-clear ${q ? '' : 'disabled'}>Clear</button>
    </div>
    <div class="local-summary">${q ? `${pack.total} match${pack.total === 1 ? '' : 'es'} in ${escapeHtml(activeFileSearchTitle())}${pack.truncated ? ` · first ${pack.matches.length} shown` : ''}` : `Search ${escapeHtml(activeFileSearchTitle())} without scanning other files.`}</div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-current-file-search-md ${q ? '' : 'disabled'}>Copy MD</button>
      <button data-copy-current-file-search-json ${q ? '' : 'disabled'}>Copy JSON</button>
      <button data-copy-current-file-search-csv ${q ? '' : 'disabled'}>Copy CSV</button>
      <button data-export-current-file-search-md ${q ? '' : 'disabled'}>Export MD</button>
      <button data-export-current-file-search-json ${q ? '' : 'disabled'}>Export JSON</button>
      <button data-export-current-file-search-csv ${q ? '' : 'disabled'}>Export CSV</button>
      <button data-current-file-search-canvas ${q && pack.matches.length ? '' : 'disabled'}>Send to Canvas</button>
    </div>
    ${q ? renderCurrentFileSearchRows(pack.matches) : '<div class="local-empty">Enter text and press Search.</div>'}
    <p class="diag-note">Current-file search reads the active editor buffer only. It is exact, case-insensitive, and does not allocate an index or touch the workspace.</p>
  `, true);
  requestAnimationFrame(() => modalBodyEl.querySelector('[data-current-file-search-input]')?.focus());
}

async function copyCurrentFileSearchMarkdown(query = currentFileSearchDefaultQuery()) {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to copy current-file search results';
    return;
  }
  await navigator.clipboard.writeText(currentFileSearchMarkdown(q));
  statusText.textContent = 'Current-file search copied as Markdown';
}

async function copyCurrentFileSearchJson(query = currentFileSearchDefaultQuery()) {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to copy current-file search JSON';
    return;
  }
  await navigator.clipboard.writeText(currentFileSearchJson(q));
  statusText.textContent = 'Current-file search copied as JSON';
}

async function copyCurrentFileSearchCsv(query = currentFileSearchDefaultQuery()) {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to copy current-file search CSV';
    return;
  }
  await navigator.clipboard.writeText(currentFileSearchCsv(q));
  statusText.textContent = 'Current-file search copied as CSV';
}

function exportCurrentFileSearchMarkdown(query = currentFileSearchDefaultQuery()) {
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to export current-file search results';
    return;
  }
  downloadText('markpad-current-file-search.md', 'text/markdown', currentFileSearchMarkdown(q));
  statusText.textContent = 'Current-file search exported as Markdown';
}

function exportCurrentFileSearchJson(query = currentFileSearchDefaultQuery()) {
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to export current-file search JSON';
    return;
  }
  downloadText('markpad-current-file-search.json', 'application/json', currentFileSearchJson(q));
  statusText.textContent = 'Current-file search exported as JSON';
}

function exportCurrentFileSearchCsv(query = currentFileSearchDefaultQuery()) {
  const q = String(query || '').trim();
  if (!q) {
    statusText.textContent = 'Enter text to export current-file search results';
    return;
  }
  downloadText('markpad-current-file-search.csv', 'text/csv', currentFileSearchCsv(q));
  statusText.textContent = 'Current-file search exported as CSV';
}

function jumpToCurrentFileSearchMatch(offset, length) {
  const start = Math.max(0, Math.min(Number(offset || 0), currentContent.length));
  const end = Math.max(start, Math.min(start + Math.max(1, Number(length || 1)), currentContent.length));
  if (typeof closeModal === 'function') closeModal();
  else modalOverlay?.classList.add('hidden');
  editor.focus();
  editor.setSelectionRange(start, end);
  const before = currentContent.slice(0, start);
  const line = before.split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 18;
  editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight * 0.35);
}

function deleteLoadedSearchCache(id) {
  const existing = loadedSearchCache.get(id);
  if (!existing) return;
  loadedSearchCache.delete(id);
  loadedSearchCacheBytes -= existing.bytes || 0;
}

function setLoadedSearchCache(id, content) {
  if (!id) return;
  const text = String(content || '').slice(0, SEARCH_CONTENT_CAP);
  const bytes = text.length * 2;
  const existing = loadedSearchCache.get(id);
  if (existing) loadedSearchCacheBytes -= existing.bytes;
  loadedSearchCache.set(id, { content: text, bytes, at: Date.now() });
  loadedSearchCacheBytes += bytes;
  while (loadedSearchCache.size > SEARCH_CACHE_MAX_ENTRIES || loadedSearchCacheBytes > SEARCH_CACHE_MAX_BYTES) {
    const firstKey = loadedSearchCache.keys().next().value;
    if (!firstKey) break;
    const removed = loadedSearchCache.get(firstKey);
    loadedSearchCache.delete(firstKey);
    loadedSearchCacheBytes -= removed?.bytes || 0;
  }
}

async function getLoadedSearchContent(note) {
  if (!note?.id) return '';
  if (note.id === activeId) return String(currentContent || '').slice(0, SEARCH_CONTENT_CAP);
  const cached = loadedSearchCache.get(note.id);
  if (cached) {
    cached.at = Date.now();
    loadedSearchCache.delete(note.id);
    loadedSearchCache.set(note.id, cached);
    return cached.content;
  }
  const content = await window.go.main.App.GetNoteContent(note.id);
  const text = String(content || '').slice(0, SEARCH_CONTENT_CAP);
  setLoadedSearchCache(note.id, text);
  return text;
}

async function collectLoadedSearchResults(query, token, limit) {
  const plan = parseSearchQuery(query);
  if (window.go?.main?.App?.SearchLoadedDocuments && !plan.hasFilters && !plan.hasPhrases && !plan.hasExcludes && !plan.hasWildcards && !plan.hasFuzzy) {
    try {
      const results = await window.go.main.App.SearchLoadedDocuments(query, activeId, currentContent, limit || 40);
      if (token !== searchToken) return [];
      return (results || []).map(result => ({ ...result, source: result.source || 'loaded' }));
    } catch {}
  }
  const results = [];
  for (const note of cachedNotes) {
    const type = getFileType(note.path, note.kind);
    let content = '';
    if (!isReadOnlyType(type)) {
      content = await getLoadedSearchContent(note);
    }
    if (token !== searchToken) return [];
    const result = scoreSearch(note, content, plan);
    if (result) results.push({ ...result, source: 'loaded' });
  }
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, limit || 40);
}

function searchResultDedupeKey(result) {
  const path = String(result?.path || result?.title || 'draft').replace(/\\/g, '/').toLowerCase();
  const line = Number.isFinite(Number(result?.line)) ? Number(result.line) : -1;
  const snippet = String(result?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 96).toLowerCase();
  return `${path}:${line}:${snippet}`;
}

function searchResultSourceWeight(result) {
  return result?.source === 'local' ? 1 : 2;
}

function dedupeSearchResults(results) {
  const byKey = new Map();
  (Array.isArray(results) ? results : []).forEach((result) => {
    const key = searchResultDedupeKey(result);
    const current = byKey.get(key);
    if (!current
      || searchResultSourceWeight(result) > searchResultSourceWeight(current)
      || Number(result?.score || 0) > Number(current?.score || 0)) {
      byKey.set(key, result);
    }
  });
  return [...byKey.values()];
}

async function runAllSearch(query, token) {
  const startedAt = performance.now();
  const plan = parseSearchQuery(query);
  const loadedLimit = 35;
  const [loaded, localPack] = await Promise.all([
    collectLoadedSearchResults(query, token, loadedLimit),
    collectLocalSearchResults(query, token, 35),
  ]);
  if (token !== searchToken) return;
  const local = (localPack.results || []).filter(result => searchResultMatchesPlan(result, plan));
  const merged = [...loaded, ...local];
  const deduped = dedupeSearchResults(merged);
  searchLastDedupe = {
    input: merged.length,
    output: deduped.length,
    removed: Math.max(0, merged.length - deduped.length),
  };
  const results = deduped
    .sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.title || '').localeCompare(String(b.title || '')))
    .slice(0, 70);
  setSearchTelemetry({
    scope: 'all',
    startedAt,
    searched: cachedNotes.length + Number(localPack.stats?.searched ?? localPack.stats?.searchable ?? 0),
    scanned: cachedNotes.length + Number(localPack.stats?.scanned ?? 0),
    skipped: Number(localPack.stats?.skipped || 0),
    oversize: Number(localPack.stats?.oversize || 0),
    capped: loaded.length >= loadedLimit || !!localPack.stats?.capped || results.length >= 70,
    resultCount: results.length,
  });
  renderSearchResults(results, query);
}

function updateSearchScopeButtons() {
  document.querySelectorAll('[data-search-scope]').forEach(btn => {
    const active = btn.dataset.searchScope === searchScope;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (searchInput) {
    searchInput.placeholder = searchScope === 'local'
      ? 'Search the configured local folder with type:md plan* ~pln -archive...'
      : searchScope === 'all'
        ? 'Search all with type:md tag:idea plan* ~pln -"old draft"...'
        : 'Search loaded files with type:md path:notes tag:idea task:open plan* ~pln...';
  }
  if (searchMeta) {
    const metaText = searchScope === 'local'
      ? 'Local folder search supports phrases, wildcards, fuzzy ~term, exclusions, and type:, path:, title:, tag:, task: filters. Ctrl+1/2/3 switches scope.'
      : 'Filters: type:, path:, title:, tag:, task:open/task:done. Add phrases, wildcards like plan*, fuzzy ~term, or exclusions like -archive.';
    searchMeta.innerHTML = `<span>${escapeHtml(metaText)}</span>${renderSearchQueryChips(searchInput?.value || searchLastQuery || '')}`;
  }
}

function appendSearchExample(example) {
  if (!searchInput) return;
  const current = searchInput.value.trim();
  searchInput.value = current ? `${current} ${example}` : example;
  searchInput.focus();
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSearchScope(scope) {
  if (!['loaded', 'local', 'all'].includes(scope)) return;
  searchScope = scope;
  localStorage.setItem('markpad-search-scope', searchScope);
  updateSearchScopeButtons();
}

function showLocalFirstGuide() {
  showModal('Local-First Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>local now</strong><span>No cloud sync</span><small>Files, drafts, UI state, tasks, canvas, and Trash stay on this computer</small></div>
      <div class="diag-card"><strong>default folder</strong><span>Search + tasks</span><small>Choose one local folder for fast local scans</small></div>
      <div class="diag-card"><strong>portable data</strong><span>Markdown / JSON / CSV / ICS</span><small>Exports avoid vendor lock-in</small></div>
      <div class="diag-card"><strong>manifests</strong><span>Active file + loaded workspace</span><small>Export metadata without file contents</small></div>
      <div class="diag-card"><strong>workspace map</strong><span>Loaded items to canvas</span><small>Visualize open files and drafts locally</small></div>
      <div class="diag-card"><strong>backlinks</strong><span>Active note to canvas</span><small>Map local references without cloud services</small></div>
      <div class="diag-card"><strong>canvas</strong><span>.canvas / JSON</span><small>Lightweight local scene data, not a bundled drawing engine</small></div>
      <div class="diag-card"><strong>Trash</strong><span>${DRAFT_TRASH_DAYS}-day retention</span><small>Restore first, clean expired later</small></div>
      <div class="diag-card"><strong>low memory</strong><span>Footprint + undo cleanup</span><small>Inspect heap/storage and release undo snapshots from commands</small></div>
      <div class="diag-card"><strong>upgrade map</strong><span>One local dashboard</span><small>Search, tasks, canvas, Trash, themes, footprint, and sync-later boundaries</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-local-upgrade-map>Upgrade Map</button>
      <button data-local-workspace-setup>Workspace Setup</button>
      <button data-task-file-setup>Task File</button>
      <button data-search-performance-open>Search Performance</button>
      <button data-open-local-footprint>Local Footprint</button>
      <button data-trash-guide>Trash Guide</button>
    </div>
    <p class="diag-note">Sync is intentionally a later layer. The current app should remain useful offline, transparent about where data lives, and easy to export before any cloud account or sync engine exists.</p>
  `);
}

function showLowMemoryGuide() {
  showModal('Low-Memory Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>measure</strong><span>Runtime stats</span><small>Sample RSS, Go heap, goroutines, uptime, and binary size</small></div>
      <div class="diag-card"><strong>inspect</strong><span>Local footprint</span><small>Estimate loaded text, canvas, Trash, localStorage, and undo bytes</small></div>
      <div class="diag-card"><strong>release</strong><span>Undo + search cache</span><small>Drop editor/canvas undo snapshots and loaded-note search cache when memory matters</small></div>
      <div class="diag-card"><strong>one step</strong><span>Cleanup + footprint</span><small>Apply low-memory preset and immediately sample footprint</small></div>
      <div class="diag-card"><strong>preset</strong><span>Workspace low memory</span><small>Enable compact mode and release undo snapshots plus search cache together</small></div>
      <div class="diag-card"><strong>canvas</strong><span>bounded bridges</span><small>Task, search, outline, workspace, and backlink maps cap inserted cards</small></div>
      <div class="diag-card"><strong>assets</strong><span>text icons + CSS themes</span><small>No icon font packs, image theme bundles, or heavy drawing runtime</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-run-memory-cleanup-report>Cleanup + Footprint</button>
      <button data-open-local-footprint>Open Footprint</button>
      <button data-clear-all-undo-history>Clear Undo</button>
      <button data-clear-loaded-search-cache>Clear Search Cache</button>
      <button data-workspace-preset="low-memory">Apply Low-Memory Preset</button>
    </div>
    <p class="diag-note">Markpad keeps diagnostics explicit. Use reports before cleanup when you want evidence, then clear undo histories/search cache or switch workspace presets when responsiveness matters more than undo depth.</p>
  `);
}

function showLayoutGuide() {
  showModal('Layout Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>Editor</strong><span>Write-only lane</span><small>Use for plain text edits and low visual noise</small></div>
      <div class="diag-card"><strong>Split</strong><span>Live Markdown preview</span><small>50/50, editor focus, or preview focus presets</small></div>
      <div class="diag-card"><strong>Swap</strong><span>Flip the ratio</span><small>Turn editor-wide into preview-wide without dragging</small></div>
      <div class="diag-card"><strong>Preview</strong><span>Read-only review</span><small>Best for proofreading rendered Markdown and documents</small></div>
      <div class="diag-card"><strong>Outline</strong><span>Headings to canvas</span><small>Map active Markdown structure as local canvas cards</small></div>
      <div class="diag-card"><strong>Reading width</strong><span>Constrained text</span><small>Improves long-form editing and preview scanning</small></div>
      <div class="diag-card"><strong>Focus + compact</strong><span>Less chrome</span><small>Hide secondary UI and tighten controls</small></div>
      <div class="diag-card"><strong>Low memory</strong><span>Release undo</span><small>Workspace low-memory clears editor and canvas undo snapshots</small></div>
    </div>
    <p class="diag-note">Split ratios are local UI state only. Use the command palette for exact presets or nudge commands when the drag handle is not precise enough.</p>
  `);
}

function showSplitWorkflowGuide() {
  showModal('Split Workflow Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>50/50</strong><span>Balanced review</span><small>Equal editor and preview lanes</small></div>
      <div class="diag-card"><strong>62/38</strong><span>Editor wide</span><small>More room for writing with live preview visible</small></div>
      <div class="diag-card"><strong>72/28</strong><span>Editor focus</span><small>Minimal rendered preview while drafting</small></div>
      <div class="diag-card"><strong>38/62</strong><span>Preview wide</span><small>Review rendered Markdown without leaving edit mode</small></div>
      <div class="diag-card"><strong>Swap</strong><span>Flip current ratio</span><small>Switch editor/preview emphasis without dragging</small></div>
      <div class="diag-card"><strong>Nudge</strong><span>5% steps</span><small>Fine tune from the command palette</small></div>
      <div class="diag-card"><strong>${escapeHtml(splitRatioText())}</strong><span>Live badge</span><small>Divider shows the current editor/preview ratio</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-view-mode="markdown">Editor</button>
      <button data-view-mode="split">Split</button>
      <button data-view-mode="viewer">Preview</button>
      <button data-split-preset="50">50/50</button>
      <button data-split-preset="62">62/38</button>
      <button data-split-preset="72">72/28</button>
      <button data-split-preset="38">38/62</button>
      <button data-split-swap-guide>Swap</button>
      <button data-split-nudge="5">+ Editor</button>
      <button data-split-nudge="-5">+ Preview</button>
    </div>
    <p class="diag-note">Split ratio is local UI state. It is saved per machine, exported through UI state JSON, and never written into Markdown files.</p>
  `);
}

function showThemeGuide() {
  showModal('Theme Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>Light</strong><span>Paper, Linen, Dawn, Mist, Sand</span><small>Low-glare writing and planning surfaces</small></div>
      <div class="diag-card"><strong>Dark</strong><span>Ink, Pine, Slate, Ember, Midnight</span><small>Late-session editing without heavy assets</small></div>
      <div class="diag-card"><strong>Presets</strong><span>Writing, planning, review, night</span><small>Apply theme plus layout choices together</small></div>
      <div class="diag-card"><strong>Portable</strong><span>UI state JSON</span><small>Copy/export and restore local theme preferences</small></div>
      <div class="diag-card"><strong>Lightweight</strong><span>CSS variables only</span><small>No icon fonts, image packs, or runtime theme engine</small></div>
      <div class="diag-card"><strong>Fast switch</strong><span>Command palette</span><small>Cycle all themes or only light/dark groups</small></div>
      <div class="diag-card"><strong>Theme Lab</strong><span>Compare + export</span><small>Apply themes and copy a small local JSON catalog</small></div>
      <div class="diag-card"><strong>Recipes</strong><span>Writing, planning, review, focus, night</span><small>Export lightweight Markdown/JSON guidance</small></div>
      <div class="diag-card"><strong>Companions</strong><span>Matched light/dark pairs</span><small>Switch day/night tone without changing workflow</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-theme-choice="paper" aria-pressed="${currentTheme === 'paper' ? 'true' : 'false'}">Paper</button>
      <button data-theme-choice="linen" aria-pressed="${currentTheme === 'linen' ? 'true' : 'false'}">Linen</button>
      <button data-theme-choice="mist" aria-pressed="${currentTheme === 'mist' ? 'true' : 'false'}">Mist</button>
      <button data-theme-choice="ink" aria-pressed="${currentTheme === 'ink' ? 'true' : 'false'}">Ink</button>
      <button data-theme-choice="pine" aria-pressed="${currentTheme === 'pine' ? 'true' : 'false'}">Pine</button>
      <button data-theme-choice="midnight" aria-pressed="${currentTheme === 'midnight' ? 'true' : 'false'}">Midnight</button>
      <button data-theme-lab-open>Theme Lab</button>
      <button data-theme-lab-choice="${themeCompanionId(currentTheme)}">Companion: ${escapeHtml(themeCompanionFor(currentTheme).label)}</button>
      <button data-asset-report-open>Asset Report</button>
      <button data-copy-theme-recipes-md>Copy recipes MD</button>
      <button data-export-theme-recipes-json>Export recipes JSON</button>
    </div>
    <p class="diag-note">Themes intentionally reuse the same DOM and text icons. This keeps memory and binary size stable while giving each workspace mode a distinct feel.</p>
  `);
}

function showSearchSyntaxHelp() {
  showModal('Search Syntax', `
    <div class="diag-grid">
      <div class="diag-card"><strong>phrase</strong><span>"release notes"</span><small>Find exact words together</small></div>
      <div class="diag-card"><strong>wildcard</strong><span>plan*</span><small>Prefix, suffix, or middle matching</small></div>
      <div class="diag-card"><strong>fuzzy</strong><span>~pln -~tmp</span><small>Opt-in approximate matching without a heavy index</small></div>
      <div class="diag-card"><strong>exclude</strong><span>-archive -"old draft"</span><small>Hide noisy matches</small></div>
      <div class="diag-card"><strong>type</strong><span>type:md type:canvas</span><small>Limit results by file kind</small></div>
      <div class="diag-card"><strong>path/title</strong><span>path:work title:idea</span><small>Focus a folder or note name</small></div>
      <div class="diag-card"><strong>tasks/tags</strong><span>task:open #urgent</span><small>Find Markdown checkboxes and tags</small></div>
      <div class="diag-card"><strong>canvas</strong><span>Send results</span><small>Turn current results into a canvas board</small></div>
      <div class="diag-card"><strong>inspect</strong><span>Query plan</span><small>Show parsed terms, filters, exclusions, fuzzy, and anchors</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-search-current-file-open>Current File</button>
      <button data-search-query-inspector-open>Query Inspector</button>
      <button data-search-performance-open>Performance</button>
      <button data-search-results-canvas ${searchLastResults.length ? '' : 'disabled'}>Results to Canvas</button>
    </div>
    <p class="diag-note">Search is local-first and dependency-free. Loaded-file search filters in memory with a bounded content cache; local-folder search uses the Go backend for anchors, then the UI applies filters, phrases, exclusions, wildcards, and explicit fuzzy terms. Pure fuzzy local searches match file names and paths without opening every file.</p>
    <p class="diag-note">Search Profile shows local diagnostics only. It does not send telemetry; backend follow-ups should cap loaded content before it crosses the Wails bridge and make folder scans cancellable or serialized.</p>
    <p class="diag-note">Shortcuts: Ctrl+Shift+F opens search, Ctrl+1 searches loaded files, Ctrl+2 searches the local folder, and Ctrl+3 searches all local sources.</p>
  `);
}

function searchInspectorList(values, empty = 'none') {
  const list = (values || []).filter(Boolean);
  return list.length ? list.map(value => escapeHtml(value)).join(', ') : empty;
}

function searchInspectorFilters(filters) {
  const rows = Object.entries(filters || {})
    .filter(([, values]) => values?.length)
    .map(([key, values]) => `${key}:${searchInspectorList(values)}`);
  return rows.length ? rows.join(' · ') : 'none';
}

function showSearchQueryInspector() {
  const query = (searchInput?.value || searchLastQuery || '').trim();
  const plan = parseSearchQuery(query);
  showModal('Search Query Inspector', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${escapeHtml(searchScope)}</strong><span>Scope</span><small>Loaded, local folder, or all local sources</small></div>
      <div class="diag-card"><strong>${searchLastResults.length}</strong><span>Last results</span><small>From the latest rendered search</small></div>
      <div class="diag-card"><strong>${plan.terms.length}</strong><span>Terms</span><small>${searchInspectorList(plan.terms)}</small></div>
      <div class="diag-card"><strong>${plan.phrases.length}</strong><span>Phrases</span><small>${searchInspectorList(plan.phrases)}</small></div>
      <div class="diag-card"><strong>${plan.wildcards.length}</strong><span>Wildcards</span><small>${searchInspectorList(plan.wildcards)}</small></div>
      <div class="diag-card"><strong>${plan.fuzzyTerms.length}</strong><span>Fuzzy</span><small>${searchInspectorList(plan.fuzzyTerms)}</small></div>
      <div class="diag-card"><strong>${plan.hasFilters ? 'yes' : 'no'}</strong><span>Filters</span><small>${escapeHtml(searchInspectorFilters(plan.filters))}</small></div>
      <div class="diag-card"><strong>${plan.hasExcludes ? 'yes' : 'no'}</strong><span>Exclusions</span><small>${escapeHtml(searchInspectorFilters(plan.excludes))}</small></div>
    </div>
    <pre class="diag-code">${escapeHtml(query || '(empty query)')}</pre>
    <p class="diag-note">Backend anchor query: ${escapeHtml(plan.backendQuery || '(none)')}. Tag and task filters are applied in the UI so local-folder search can stay bounded and dependency-free.</p>
  `);
}

$('search-filter-hints')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-search-example]');
  if (!btn) return;
  appendSearchExample(btn.dataset.searchExample || '');
});
searchMeta?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-search-chip]');
  if (!btn) return;
  appendSearchExample(btn.dataset.searchChip || '');
});

async function runLocalFolderSearch(query, token) {
  const startedAt = performance.now();
  let pack;
  try {
    pack = await collectLocalSearchResults(query, token, 60);
  } catch (err) {
    pack = {
      results: [],
      message: 'Local folder search failed.',
      meta: `Local search failed: ${err?.message || err}`,
      stats: { searched: 0, scanned: 0, skipped: 0, oversize: 0, capped: false, resultCount: 0 },
    };
  }
  if (token !== searchToken) return;
  setSearchTelemetry({ ...(pack.stats || {}), scope: 'local', startedAt, resultCount: (pack.results || []).length });
  if (pack.message) {
    searchLastResults = [];
    searchLastQuery = String(query || '').trim();
    searchActiveIndex = 0;
    searchInput?.removeAttribute('aria-activedescendant');
    searchResults.innerHTML = searchEmptyHtml(pack.message, query);
    searchMeta.textContent = pack.meta || 'Local folder search unavailable';
    return;
  }
  searchMeta.textContent = `${pack.meta || `${pack.results.length} local result${pack.results.length === 1 ? '' : 's'}`}${searchPlanMetaSuffix(query)}`;
  renderSearchResults(pack.results, query);
}

async function collectLocalSearchResults(query, token, limit) {
  if (!window.go?.main?.App?.GetLocalFolder) {
    return { results: [], message: 'Local folder backend unavailable.', meta: 'Local folder search unavailable' };
  }
  const plan = parseSearchQuery(query);
  const info = await window.go.main.App.GetLocalFolder();
  if (token !== searchToken) return { results: [] };
  if (!info.path || info.missing) {
    return {
      results: [],
      message: 'Choose a local folder first from the command palette.',
      meta: info.missing ? 'Saved local folder is missing' : 'No local folder set',
    };
  }
  const q = localSearchBackendQuery(plan, query);
  if (!q) {
    const max = limit || 60;
    const files = await window.go.main.App.ListLocalFolderFiles(max);
    if (token !== searchToken) return { results: [] };
    const results = (files || []).map(file => ({
      source: 'local',
      path: file.path,
      title: file.relPath || file.title,
      kind: file.kind,
      dirty: false,
      matchIndex: -1,
      matchLength: 0,
      line: 0,
      snippet: `${typeLabel(getFileType(file.path, file.kind))} · ${formatBytes(file.size || 0)}${file.modified ? ' · ' + file.modified : ''}`,
    })).filter(result => searchResultMatchesPlan(result, plan));
    const capped = (files || []).length >= max;
    return {
      results,
      meta: `${results.length} local file${results.length === 1 ? '' : 's'}${capped ? ' · top files shown' : ''} from ${info.path}`,
      stats: { searched: results.length, scanned: (files || []).length, resultCount: results.length, capped },
    };
  }
  let hits = [];
  let diagnostics = null;
  if (window.go.main.App.SearchLocalFolderWithStats) {
    diagnostics = await window.go.main.App.SearchLocalFolderWithStats(q, limit || 60);
    hits = diagnostics?.hits || [];
  } else {
    hits = await window.go.main.App.SearchLocalFolder(q, limit || 60);
  }
  if (token !== searchToken) return { results: [] };
  const results = (hits || []).map(hit => ({
    source: 'local',
    path: hit.path,
    title: hit.relPath || hit.title,
    kind: hit.kind,
    dirty: false,
    score: hit.score,
    matchKind: hit.matchKind || '',
    matchIndex: -1,
    matchLength: 0,
    line: hit.line || 0,
    snippet: hit.snippet || '',
    partialContent: true,
  })).filter(result => searchResultMatchesPlan(result, plan));
  const metaParts = [`${results.length} local hit${results.length === 1 ? '' : 's'}`];
  if (diagnostics) {
    metaParts.push(`${Number(diagnostics.searchable || 0)} searched`);
    metaParts.push(`${Number(diagnostics.scanned || 0)} scanned`);
    if (Number.isFinite(Number(diagnostics.elapsedMs))) metaParts.push(`${Number(diagnostics.elapsedMs || 0)} ms`);
    if (Number(diagnostics.oversize || 0)) metaParts.push(`${Number(diagnostics.oversize || 0)} large skipped`);
    if (Number(diagnostics.skipped || 0)) metaParts.push(`${Number(diagnostics.skipped || 0)} skipped`);
    if (diagnostics.capped) metaParts.push('top matches shown');
  }
  return {
    results,
    meta: `${metaParts.join(' · ')} from ${info.path}`,
    stats: diagnostics ? {
      searched: Number(diagnostics.searchable || 0),
      searchable: Number(diagnostics.searchable || 0),
      scanned: Number(diagnostics.scanned || 0),
      elapsedMs: Number(diagnostics.elapsedMs || 0),
      oversize: Number(diagnostics.oversize || 0),
      skipped: Number(diagnostics.skipped || 0),
      capped: !!diagnostics.capped,
      resultCount: results.length,
    } : { searched: results.length, scanned: results.length, resultCount: results.length },
  };
}

function searchHighlightTerms(query) {
  const plan = parseSearchQuery(query);
  const values = [
    ...plan.phrases,
    ...plan.terms,
    ...plan.fuzzyTerms,
    ...plan.filters.path,
    ...plan.filters.title,
    ...plan.filters.tag,
    ...plan.filters.task,
  ];
  if (!plan.hasFilters && !plan.terms.length) {
    values.push(...String(query || '').toLowerCase().split(/\s+/));
  }
  (plan.wildcards || []).forEach(value => values.push(wildcardAnchorTerm(value)));
  const seen = new Set();
  return values
    .map(value => String(value || '').replace(/^#/, '').trim().toLowerCase())
    .filter(value => value.length >= 2 && !seen.has(value) && seen.add(value))
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
}

function highlightSearchText(value, terms) {
  const text = String(value || '');
  if (!text || !terms.length) return escapeHtml(text);
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    let index = lower.indexOf(term);
    while (index >= 0) {
      const end = index + term.length;
      if (!ranges.some(range => index < range.end && end > range.start)) {
        ranges.push({ start: index, end });
      }
      index = lower.indexOf(term, end);
    }
  }
  if (!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a.start - b.start);
  let html = '';
  let offset = 0;
  for (const range of ranges) {
    html += escapeHtml(text.slice(offset, range.start));
    html += `<mark>${escapeHtml(text.slice(range.start, range.end))}</mark>`;
    offset = range.end;
  }
  html += escapeHtml(text.slice(offset));
  return html;
}

function renderSearchResults(results, query) {
  const trimmedQuery = String(query || '').trim();
  const highlightTerms = searchHighlightTerms(trimmedQuery);
  const planMeta = searchPlanMetaSuffix(trimmedQuery);
  searchLastResults = Array.isArray(results) ? results : [];
  searchLastQuery = trimmedQuery;
  searchResults.innerHTML = renderSearchResultStrip(results, trimmedQuery);
  searchActiveIndex = Math.min(searchActiveIndex, Math.max(0, results.length - 1));
  if (searchScope === 'all') {
    const loadedCount = results.filter(result => result.source !== 'local').length;
    const localCount = results.length - loadedCount;
    searchMeta.textContent = trimmedQuery
      ? `${results.length} result${results.length === 1 ? '' : 's'}${planMeta} · ${loadedCount} loaded · ${localCount} local`
      : `${results.length} item${results.length === 1 ? '' : 's'} · ${loadedCount} loaded · ${localCount} local`;
  } else if (searchScope !== 'local') {
    searchMeta.textContent = trimmedQuery
      ? `${results.length} result${results.length === 1 ? '' : 's'} across loaded files${planMeta}`
      : 'Type to search content. Empty state lists loaded files.';
  }
  if (!results.length) {
    searchInput?.removeAttribute('aria-activedescendant');
    searchResults.insertAdjacentHTML('beforeend', searchEmptyHtml(searchScope === 'local' ? 'No local folder results.' : searchScope === 'all' ? 'No loaded or local files matched.' : 'No loaded files matched. Open more files or use exact text from the current document.', trimmedQuery));
    return;
  }
  searchResults.setAttribute('role', 'listbox');
  results.forEach((result, index) => {
    const row = el('button', `search-row${index === searchActiveIndex ? ' active' : ''}`);
    const matchLabel = searchResultMatchLabel(result);
    const rowLabel = searchResultKeyboardLabel(result, index, results.length);
    row.type = 'button';
    row.id = `search-result-${index}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', index === searchActiveIndex ? 'true' : 'false');
    row.setAttribute('aria-label', rowLabel);
    row.title = rowLabel;
    row.dataset.searchId = result.id;
    row.dataset.matchIndex = String(result.matchIndex);
    row.dataset.matchLength = String(result.matchLength);
    row.innerHTML = `
      <span class="search-badge">${escapeHtml(fileIcon(result.path))}</span>
      <span class="search-body">
        <span class="search-title-line">
          <strong>${highlightSearchText(result.title, highlightTerms)}</strong>
          ${result.dirty ? '<em>Unsaved</em>' : ''}
          ${result.source === 'local' ? '<em>Local</em>' : searchScope === 'all' ? '<em>Loaded</em>' : ''}
          ${matchLabel ? `<em>${escapeHtml(matchLabel)}</em>` : ''}
          ${result.matchIndex >= 0 ? `<small>Line ${result.line + 1}</small>` : ''}
        </span>
        <span class="search-path">${highlightSearchText(result.path, highlightTerms)}</span>
        ${result.snippet ? `<span class="search-snippet">${highlightSearchText(result.snippet, highlightTerms)}</span>` : ''}
      </span>`;
    row.addEventListener('mousemove', () => setSearchActive(index));
    row.addEventListener('click', () => openSearchResult(result));
    searchResults.appendChild(row);
  });
  setSearchActive(searchActiveIndex);
}

function searchResultsToMarkdown(results, query) {
  const snapshot = searchProfileSnapshot(query, results);
  const dedupeLines = snapshot.scope === 'all'
    ? [
      `Merged hits: ${snapshot.dedupe?.input || results.length}`,
      `Duplicates removed: ${snapshot.dedupe?.removed || 0}`,
    ]
    : [];
  const lines = [
    '# Markpad Search Results',
    '',
    `Query: ${query || '(empty)'}`,
    `Scope: ${searchScope}`,
    `Count: ${results.length}`,
    ...dedupeLines,
    `Exported: ${new Date().toLocaleString()}`,
    '',
  ];
  results.forEach((result, index) => {
    const line = Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : 1;
    lines.push(`${index + 1}. ${result.title || basename(result.path) || 'Untitled'}`);
    lines.push(`   - Source: ${result.source === 'local' ? 'Local' : 'Loaded'}`);
    lines.push(`   - Path: ${result.path || 'Draft'}`);
    const matchLabel = searchResultMatchLabel(result);
    if (matchLabel) lines.push(`   - Match: ${matchLabel}`);
    if (Number.isFinite(Number(result.score))) lines.push(`   - Score: ${Number(result.score)}`);
    if (result.snippet) lines.push(`   - Snippet: ${String(result.snippet).replace(/\s+/g, ' ').trim()}`);
    if (result.matchIndex >= 0 || result.source === 'local') lines.push(`   - Line: ${line}`);
  });
  return lines.join('\n') + '\n';
}

function searchResultsToJson(results, query) {
  const snapshot = searchProfileSnapshot(query, results);
  return JSON.stringify({
    type: 'markpad-search-results',
    version: 1,
    exportedAt: new Date().toISOString(),
    query: query || '',
    scope: searchScope,
    count: results.length,
    dedupe: snapshot.scope === 'all' ? snapshot.dedupe : { input: results.length, output: results.length, removed: 0 },
    results: results.map(result => ({
      title: result.title || basename(result.path) || 'Untitled',
      path: result.path || '',
      source: result.source || 'loaded',
      type: typeLabel(getFileType(result.path, result.kind)),
      match: searchResultMatchLabel(result),
      line: Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : null,
      matchIndex: Number.isFinite(Number(result.matchIndex)) ? Number(result.matchIndex) : null,
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      snippet: result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
    })),
  }, null, 2) + '\n';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function searchResultsToCsv(results, query) {
  const snapshot = searchProfileSnapshot(query, results);
  const dedupe = snapshot.scope === 'all' ? snapshot.dedupe : { input: results.length, output: results.length, removed: 0 };
  const rows = [
    ['query', 'scope', 'dedupeInput', 'dedupeRemoved', 'rank', 'title', 'path', 'source', 'type', 'match', 'line', 'score', 'snippet'],
    ...results.map((result, index) => [
      query || '',
      searchScope,
      Number(dedupe?.input || results.length),
      Number(dedupe?.removed || 0),
      index + 1,
      result.title || basename(result.path) || 'Untitled',
      result.path || '',
      result.source || 'loaded',
      typeLabel(getFileType(result.path, result.kind)),
      searchResultMatchLabel(result),
      Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '',
      Number.isFinite(Number(result.score)) ? Number(result.score) : '',
      result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copySearchResultsMarkdown() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchResultsToMarkdown(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} copied as Markdown`;
}

function exportSearchResultsMarkdown() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to export';
    return;
  }
  downloadText('markpad-search-results.md', 'text/markdown', searchResultsToMarkdown(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} exported as Markdown`;
}

async function copySearchResultsJson() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchResultsToJson(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} copied as JSON`;
}

function exportSearchResultsJson() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to export';
    return;
  }
  downloadText('markpad-search-results.json', 'application/json', searchResultsToJson(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} exported as JSON`;
}

async function copySearchResultsCsv() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(searchResultsToCsv(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} copied as CSV`;
}

function exportSearchResultsCsv() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to export';
    return;
  }
  downloadText('markpad-search-results.csv', 'text/csv', searchResultsToCsv(searchLastResults, searchLastQuery));
  statusText.textContent = `${searchLastResults.length} search result${searchLastResults.length === 1 ? '' : 's'} exported as CSV`;
}

async function copySearchResultPaths() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search result paths to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const lines = searchLastResults.map((result) => {
    const path = result.path || 'Draft';
    const line = Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : 0;
    return line > 0 ? `${path}:${line}` : path;
  });
  await navigator.clipboard.writeText(lines.join('\n') + '\n');
  statusText.textContent = `${lines.length} search result path${lines.length === 1 ? '' : 's'} copied`;
}

async function copyActiveSearchResultMarkdown() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const line = Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '';
  const lines = [
    '# Markpad Search Result',
    '',
    `- Title: ${result.title || basename(result.path) || 'Untitled'}`,
    `- Path: ${result.path || 'Draft'}${line ? `:${line}` : ''}`,
    `- Scope: ${searchScope}`,
    `- Match: ${searchResultMatchLabel(result)}`,
    result.snippet ? `- Snippet: ${String(result.snippet).replace(/\s+/g, ' ').trim()}` : '',
  ].filter(Boolean);
  await navigator.clipboard.writeText(lines.join('\n') + '\n');
  statusText.textContent = 'Active search result copied as Markdown';
}

async function copyActiveSearchResultJson() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify({
    type: 'markpad-search-result',
    version: 1,
    exportedAt: new Date().toISOString(),
    query: searchLastQuery || '',
    scope: searchScope,
    result: {
      title: result.title || basename(result.path) || 'Untitled',
      path: result.path || '',
      source: result.source || '',
      type: result.kind || result.type || getFileType(result.path, result.kind) || '',
      match: searchResultMatchLabel(result),
      line: Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : null,
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      snippet: result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
    },
  }, null, 2) + '\n');
  statusText.textContent = 'Active search result copied as JSON';
}

async function copyActiveSearchResultCsv() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const row = [
    searchLastQuery || '',
    searchScope,
    result.title || basename(result.path) || 'Untitled',
    result.path || '',
    result.source || '',
    result.kind || result.type || getFileType(result.path, result.kind) || '',
    searchResultMatchLabel(result),
    Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '',
    Number.isFinite(Number(result.score)) ? Number(result.score) : '',
    result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
  ];
  await navigator.clipboard.writeText([
    ['query', 'scope', 'title', 'path', 'source', 'type', 'match', 'line', 'score', 'snippet'],
    row,
  ].map(values => values.map(csvCell).join(',')).join('\n') + '\n');
  statusText.textContent = 'Active search result copied as CSV';
}

function exportActiveSearchResultMarkdown() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to export';
    return;
  }
  const line = Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '';
  const lines = [
    '# Markpad Search Result',
    '',
    `- Title: ${result.title || basename(result.path) || 'Untitled'}`,
    `- Path: ${result.path || 'Draft'}${line ? `:${line}` : ''}`,
    `- Scope: ${searchScope}`,
    `- Match: ${searchResultMatchLabel(result)}`,
    result.snippet ? `- Snippet: ${String(result.snippet).replace(/\s+/g, ' ').trim()}` : '',
  ].filter(Boolean);
  downloadText('markpad-search-result.md', 'text/markdown', lines.join('\n') + '\n');
  statusText.textContent = 'Active search result exported as Markdown';
}

function exportActiveSearchResultJson() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to export';
    return;
  }
  downloadText('markpad-search-result.json', 'application/json', JSON.stringify({
    type: 'markpad-search-result',
    version: 1,
    exportedAt: new Date().toISOString(),
    query: searchLastQuery || '',
    scope: searchScope,
    result: {
      title: result.title || basename(result.path) || 'Untitled',
      path: result.path || '',
      source: result.source || '',
      type: result.kind || result.type || getFileType(result.path, result.kind) || '',
      match: searchResultMatchLabel(result),
      line: Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : null,
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      snippet: result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
    },
  }, null, 2) + '\n');
  statusText.textContent = 'Active search result exported as JSON';
}

function exportActiveSearchResultCsv() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to export';
    return;
  }
  const rows = [
    ['query', 'scope', 'title', 'path', 'source', 'type', 'match', 'line', 'score', 'snippet'],
    [
      searchLastQuery || '',
      searchScope,
      result.title || basename(result.path) || 'Untitled',
      result.path || '',
      result.source || '',
      result.kind || result.type || getFileType(result.path, result.kind) || '',
      searchResultMatchLabel(result),
      Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '',
      Number.isFinite(Number(result.score)) ? Number(result.score) : '',
      result.snippet ? String(result.snippet).replace(/\s+/g, ' ').trim() : '',
    ],
  ];
  downloadText('markpad-search-result.csv', 'text/csv', rows.map(values => values.map(csvCell).join(',')).join('\n') + '\n');
  statusText.textContent = 'Active search result exported as CSV';
}

async function openActiveSearchResult() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result to open';
    return;
  }
  await openSearchResult(result);
}

async function copyActiveSearchResultPath() {
  const result = searchLastResults[searchActiveIndex] || searchLastResults[0];
  if (!result) {
    statusText.textContent = 'No active search result path to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const line = Number.isFinite(Number(result.line)) ? Number(result.line) + 1 : '';
  await navigator.clipboard.writeText(`${result.path || 'Draft'}${line ? `:${line}` : ''}\n`);
  statusText.textContent = 'Active search result path copied';
}

async function copySearchQuerySummary() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText([
    '# Markpad Search Query',
    '',
    `- Query: ${searchLastQuery || '(empty)'}`,
    `- Scope: ${searchScope}`,
    `- Results: ${searchLastResults.length}`,
    '',
  ].join('\n'));
  statusText.textContent = 'Search query copied';
}

function searchResultMatchLabel(result) {
  if (result.source !== 'local') return '';
  switch (result.matchKind) {
    case 'path':
      return 'Path match';
    case 'filter':
      return 'Filter match';
    case 'content':
      return `Line ${Number(result.line || 0) + 1}`;
    default:
      return '';
  }
}

function searchResultKeyboardLabel(result, index, total) {
  const parts = [
    `Result ${index + 1} of ${total}`,
    result.source === 'local' ? 'local folder' : 'loaded file',
    result.title || basename(result.path) || 'Untitled',
  ];
  if (Number.isFinite(Number(result.line))) parts.push(`line ${Number(result.line) + 1}`);
  const matchLabel = searchResultMatchLabel(result);
  if (matchLabel) parts.push(matchLabel);
  if (Number.isFinite(Number(result.score))) parts.push(`score ${Number(result.score)}`);
  if (result.path) parts.push(result.path);
  return parts.join(' · ');
}

function searchActiveMetaLine(result, index, total) {
  const source = result.source === 'local' ? 'local' : 'loaded';
  const line = Number.isFinite(Number(result.line)) ? ` · line ${Number(result.line) + 1}` : '';
  const score = Number.isFinite(Number(result.score)) ? ` · score ${Number(result.score)}` : '';
  const path = String(result.path || 'Draft').replace(/\s+/g, ' ').trim();
  const compactPath = path.length > 54 ? `...${path.slice(-51)}` : path;
  return `${index + 1}/${total} · ${source}${line}${score} · ${compactPath} · Enter opens`;
}

function setSearchActive(index, options = {}) {
  const rows = [...searchResults.querySelectorAll('.search-row')];
  if (!rows.length) {
    searchActiveIndex = 0;
    searchInput?.removeAttribute('aria-activedescendant');
    return;
  }
  searchActiveIndex = Math.max(0, Math.min(rows.length - 1, Number(index) || 0));
  let activeRow = null;
  rows.forEach((row, i) => {
    const active = i === searchActiveIndex;
    row.classList.toggle('active', active);
    row.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) activeRow = row;
  });
  if (activeRow) {
    searchInput?.setAttribute('aria-activedescendant', activeRow.id);
    if (options.scroll) activeRow.scrollIntoView({ block: 'nearest' });
  }
  const activeResult = searchLastResults[searchActiveIndex];
  if (activeResult && searchMeta) {
    searchMeta.textContent = searchActiveMetaLine(activeResult, searchActiveIndex, searchLastResults.length);
  }
}

searchResults?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-search-chip]');
  if (chip) {
    appendSearchExample(chip.dataset.searchChip || '');
    return;
  }
  const scope = event.target.closest('[data-search-empty-scope]');
  if (scope) {
    openSearchPaletteScope(scope.dataset.searchEmptyScope || 'loaded');
    return;
  }
  const action = event.target.closest('[data-search-empty-action]');
  if (!action) return;
  switch (action.dataset.searchEmptyAction) {
    case 'profile':
      showSearchProfile();
      break;
    case 'inspector':
      showSearchQueryInspector();
      break;
    case 'guide':
      showSearchPerformanceGuide();
      break;
    case 'current':
      showCurrentFileSearch(searchLastQuery || '');
      break;
    case 'cache':
      clearLoadedSearchCacheAction();
      break;
  }
});

function queueLoadedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runLoadedSearch(searchInput.value), 80);
}

function openSearchPalette() {
  searchOpen = true;
  searchOverlay.classList.remove('hidden');
  searchInput.value = '';
  searchActiveIndex = 0;
  renderSearchRecents();
  runLoadedSearch('');
  requestAnimationFrame(() => searchInput.focus());
}

function openSearchPaletteScope(scope) {
  setSearchScope(scope);
  openSearchPalette();
}

function openSearchPaletteQuery(scope, query) {
  setSearchScope(scope);
  openSearchPalette();
  searchInput.value = query;
  searchActiveIndex = 0;
  runLoadedSearch(query);
}

function closeSearchPalette() {
  searchOpen = false;
  searchOverlay.classList.add('hidden');
  searchInput.blur();
}

async function openSearchResult(result) {
  if (!result) return;
  rememberSearchQuery(searchInput.value);
  if (result.source === 'local') {
    if (activeId) { noteViewModes[activeId] = viewMode; saveScrollPos(); }
    try {
      renderSession(await window.go.main.App.OpenDroppedFile(result.path));
      loadContent(await window.go.main.App.GetActiveContent());
      const active = cachedNotes.find(n => n.id === activeId);
      closeSearchPalette();
      setView(defaultViewForFileType(active?.path, active?.kind));
      const localLine = Number(result.line || 0);
      if (searchInput.value.trim() && localLine >= 0 && !isReadOnlyType(getFileType(active?.path, active?.kind))) {
        setView('markdown');
        requestAnimationFrame(() => {
          const start = offsetForLine(editor.value, localLine);
          const end = Math.min(editor.value.length, start + 160);
          editor.focus();
          editor.setSelectionRange(start, end);
          const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
          editor.scrollTop = Math.max(0, localLine * lineHeight - editor.clientHeight * 0.35);
        });
      }
      statusText.textContent = 'Opened local search result';
    } catch (err) {
      statusText.textContent = 'Open failed: ' + err;
    }
    return;
  }
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
  if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    const scope = e.key === '1' ? 'loaded' : e.key === '2' ? 'local' : 'all';
    setSearchScope(scope);
    searchActiveIndex = 0;
    runLoadedSearch(searchInput.value);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSearchActive(Math.min(rows.length - 1, searchActiveIndex + 1), { scroll: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSearchActive(Math.max(0, searchActiveIndex - 1), { scroll: true });
  } else if (e.key === 'PageDown') {
    e.preventDefault();
    setSearchActive(Math.min(rows.length - 1, searchActiveIndex + 5), { scroll: true });
  } else if (e.key === 'PageUp') {
    e.preventDefault();
    setSearchActive(Math.max(0, searchActiveIndex - 5), { scroll: true });
  } else if (e.key === 'Home') {
    e.preventDefault();
    setSearchActive(0, { scroll: true });
  } else if (e.key === 'End') {
    e.preventDefault();
    setSearchActive(rows.length - 1, { scroll: true });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    rows[searchActiveIndex]?.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearchPalette();
  }
});
document.querySelectorAll('[data-search-scope]').forEach(btn => {
  btn.addEventListener('click', () => {
    setSearchScope(btn.dataset.searchScope || 'loaded');
    searchActiveIndex = 0;
    runLoadedSearch(searchInput.value);
  });
});
searchRecents?.addEventListener('click', (e) => {
  const recent = e.target.closest('[data-search-recent]');
  if (recent) {
    searchInput.value = recent.dataset.searchRecent || '';
    searchInput.focus();
    searchActiveIndex = 0;
    runLoadedSearch(searchInput.value);
    return;
  }
  const clear = e.target.closest('[data-search-recents-clear]');
  if (clear) {
    clearSearchRecents();
  }
  const copy = e.target.closest('[data-search-recents-copy]');
  if (copy) {
    copySearchRecentsMarkdown();
  }
  const exportBtn = e.target.closest('[data-search-recents-export]');
  if (exportBtn) {
    exportSearchRecentsMarkdown();
  }
  const restore = e.target.closest('[data-search-recents-restore]');
  if (restore) {
    restoreSearchRecentsFromClipboard();
  }
});
$('search-close')?.addEventListener('click', closeSearchPalette);
searchOverlay?.addEventListener('click', (e) => { if (e.target === searchOverlay) closeSearchPalette(); });
themeBtn?.addEventListener('click', cycleTheme);

function showHelpModal() {
  showModal('Help', `
    <p><b>Markpad</b> is a native Markdown notepad.</p>
    <p>Open Markdown, text, code, config, logs, PDFs, images, ebooks, office files, JSON, and .canvas files. Session, drafts, trash, history, tasks, search state, and canvas drafts stay local.</p>
    <h3 style="margin-top:12px;margin-bottom:4px;">Core workflow</h3>
    <p>Use <b>Local folder</b> to set a default workspace. From there you can create notes, daily/weekly notes, canvases, quick tasks, recent-file lists, tag/link views, backlinks, and a local links canvas map.</p>
    <p><b>Search</b> supports Loaded, Local folder, and All scopes. Recent search chips are stored locally and can be cleared from the search palette.</p>
    <p><b>Trash</b> keeps deleted drafts and saved files for 30 days. Restore, permanently delete, or empty trash from the Trash view.</p>
    <p><b>Tasks</b> are plain Markdown checkboxes. The task view can show List, Calendar, or Kanban, with filters for open, due, overdue, waiting, high priority, and done. Export ICS creates a portable calendar todo file.</p>
    <p><b>Canvas</b> uses lightweight local JSON. Select moves elements, color/width edit selected shapes, grid/snap/minimap help alignment, and Write updates the active .markcanvas.json/.canvas/JSON/draft document. Import/export supports native Markpad JSON, Obsidian/JSON Canvas, Excalidraw scenes, SVG, PNG viewport/full export, and Markdown summaries.</p>
    <h3 style="margin-top:12px;margin-bottom:4px;">Shortcuts</h3>
    <p><kbd>Ctrl+P</kbd> Command palette &nbsp; <kbd>Ctrl+N</kbd> New &nbsp; <kbd>Ctrl+O</kbd> Open &nbsp; <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+W</kbd> Close</p>
    <p><kbd>Ctrl+Z</kbd> Undo &nbsp; <kbd>Ctrl+Shift+Z</kbd> Redo &nbsp; <kbd>Ctrl+Shift+S</kbd> Save As</p>
    <p><kbd>Ctrl+Shift+E</kbd> Cycle view (Editor / Split / Preview)</p>
    <p><kbd>Ctrl+Shift+B</kbd> Toggle sidebar &nbsp; <kbd>Ctrl+Shift+L</kbd> Focus mode &nbsp; <kbd>Ctrl+F</kbd> Find in file &nbsp; <kbd>Ctrl+Shift+F</kbd> Search palette &nbsp; <kbd>Ctrl+H</kbd> History</p>
    <p><kbd>Ctrl+B</kbd> Bold &nbsp; <kbd>Ctrl+I</kbd> Italic &nbsp; <kbd>Ctrl+K</kbd> Link</p>
    <p><kbd>Ctrl+=</kbd> Zoom in &nbsp; <kbd>Ctrl+-</kbd> Zoom out &nbsp; <kbd>Ctrl+0</kbd> Reset zoom</p>
    <p><kbd>Ctrl+Del</kbd> Move current draft/file to Trash when safe &nbsp; <kbd>Esc</kbd> Close modal/find/canvas</p>
    <h3 style="margin-top:12px;margin-bottom:4px;">Canvas shortcuts</h3>
    <p><kbd>Ctrl+Z</kbd> Undo canvas &nbsp; <kbd>Ctrl+Y</kbd> Redo canvas &nbsp; <kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd> Copy/paste selected element &nbsp; <kbd>Ctrl+D</kbd> Duplicate</p>
    <p><kbd>Arrow keys</kbd> Nudge selected element &nbsp; <kbd>Shift+Arrow</kbd> Nudge by 10 &nbsp; <kbd>Delete</kbd> Remove selected element</p>
  `);
}

async function upgradeMapSnapshot() {
  const active = cachedNotes.find(note => note.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  const theme = THEMES.find(item => item.id === currentTheme) || THEMES[0];
  const draftTrash = loadDraftTrash();
  const fileTrash = await loadFileTrash();
  const trashAudit = trashRetentionAuditSnapshot(draftTrash, fileTrash);
  if (!canvasDoc || !canvasSession) loadCanvasState();
  const canvasElements = (canvasDoc?.elements || []).length;
  const canvasBytes = byteSize(localStorage.getItem(CANVAS_DOC_KEY) || '');
  const canvasElementTypes = (canvasDoc?.elements || []).reduce((acc, element) => {
    const key = String(element?.type || 'element');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const canvasCamera = canvasSession?.camera || { x: 0, y: 0, scale: 1 };
  const searchCache = loadedSearchCacheFootprint();
  const undoFootprint = undoHistoryFootprint();
  const markpadLocalStorageBytes = localStorageMarkpadBytes();
  const canvasSessionBytes = byteSize(localStorage.getItem(CANVAS_SESSION_KEY) || '');
  const currentBufferBytes = byteSize(currentContent || '');
  const loadedReadOnlyCount = cachedNotes.filter(note => isReadOnlyType(getFileType(note.path, note.kind))).length;
  const loadedEditableCount = Math.max(0, cachedNotes.length - loadedReadOnlyCount);
  const estimatedUiBytes = markpadLocalStorageBytes
    + searchCache.bytes
    + undoFootprint.editorBytes
    + undoFootprint.canvasBytes
    + currentBufferBytes;
  const loadedResults = searchLastResults.filter(result => result.source !== 'local').length;
  const localResults = searchLastResults.length - loadedResults;
  const searchPlan = parseSearchQuery(searchLastQuery || '');
  const searchFilterCount = Object.values(searchPlan.filters || {}).reduce((sum, values) => sum + (values || []).length, 0);
  const searchExcludeCount = Object.values(searchPlan.excludes || {}).reduce((sum, values) => sum + (values || []).length, 0)
    + (searchPlan.excludeTerms || []).length
    + (searchPlan.excludePhrases || []).length
    + (searchPlan.excludeWildcards || []).length
    + (searchPlan.excludeFuzzyTerms || []).length;
  const searchOperatorCount = (searchPlan.terms || []).length
    + (searchPlan.phrases || []).length
    + (searchPlan.wildcards || []).length
    + (searchPlan.fuzzyTerms || []).length
    + searchFilterCount
    + searchExcludeCount;
  const commandIcons = commandIconMetrics();
  const activeThemeRecipes = THEME_RECIPES.filter(recipe => recipe.theme === currentTheme);
  const domImages = document.images?.length || 0;
  const inlineSvg = document.querySelectorAll('svg').length;
  const canvasSurfaces = document.querySelectorAll('canvas').length;
  const taskItems = Array.isArray(latestTasks) ? latestTasks : [];
  const visibleTaskItems = visibleTasksForView(taskItems);
  const taskDueBuckets = taskItems.reduce((acc, task) => {
    const bucket = taskDueBucket(task);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, unscheduled: 0, done: 0 });
  const taskSourceCounts = taskItems.reduce((acc, task) => {
    acc[task.local ? 'local' : 'loaded'] += 1;
    return acc;
  }, { loaded: 0, local: 0 });
  const loadedFileCount = cachedNotes.filter(note => !!note.path).length;
  const draftCount = Math.max(0, cachedNotes.length - loadedFileCount);
  const dirtyCount = cachedNotes.filter(note => !!note.dirty).length;
  const upgradeStatus = {
    overall: 'local-ready',
    search: searchLastQuery ? 'query parsed' : 'idle',
    tasks: taskItems.length ? 'current parse' : 'open Tasks to sample',
    canvas: canvasElements ? 'active board' : 'empty draft',
    trash: trashAudit.total ? 'retaining items' : 'empty',
    footprint: estimatedUiBytes ? 'sampled' : 'empty',
    sync: 'planned later',
  };
  return {
    type: 'markpad-upgrade-map',
    version: 1,
    sampledAt: new Date().toISOString(),
    activeFile: {
      title: active?.title || '',
      path: active?.path || '',
      type,
      readOnly: isReadOnlyType(type),
    },
    localFirst: {
      sourceOfTruth: 'local files, drafts, tasks, canvas, Trash, and UI state',
      syncPhase: 'not enabled in this local-only phase',
    },
    status: upgradeStatus,
    syncReadiness: {
      phase: 'local-only now, sync-later planned',
      loadedFiles: loadedFileCount,
      drafts: draftCount,
      dirtyItems: dirtyCount,
      localFolderConfigured: !!(typeof localInfo !== 'undefined' && localInfo?.path),
      portableNow: [
        'files on disk',
        'Markdown tasks',
        'native .markcanvas.json',
        'Obsidian .canvas export',
        'Excalidraw export',
        'UI state JSON export',
        'metadata reports',
      ],
      deviceLocal: [
        'search cache',
        'UI preferences',
        'canvas session camera',
        'undo history',
        'Trash retention manifests',
        'search and command recents',
      ],
      later: 'future sync should transfer files and metadata, not caches, indexes, undo snapshots, or rendered assets',
    },
    search: {
      scope: searchScope,
      results: searchLastResults.length,
      loadedResults,
      localResults,
      cacheBytes: searchCache.bytes || 0,
      cacheEntries: searchCache.entries || 0,
      query: searchPlan.raw || '',
      backendQuery: searchPlan.backendQuery || '',
      operators: {
        total: searchOperatorCount,
        terms: (searchPlan.terms || []).length,
        phrases: (searchPlan.phrases || []).length,
        wildcards: (searchPlan.wildcards || []).length,
        fuzzyTerms: (searchPlan.fuzzyTerms || []).length,
        filters: searchFilterCount,
        excludes: searchExcludeCount,
        typeFilters: (searchPlan.filters?.type || []).length,
        pathFilters: (searchPlan.filters?.path || []).length,
        titleFilters: (searchPlan.filters?.title || []).length,
        tagFilters: (searchPlan.filters?.tag || []).length,
        taskFilters: (searchPlan.filters?.task || []).length,
      },
      plannedIndex: 'SQLite FTS5 sidecar, rebuildable later',
    },
    footprint: {
      estimatedUiBytes,
      localStorageBytes: markpadLocalStorageBytes,
      searchCacheBytes: searchCache.bytes,
      searchCacheEntries: searchCache.entries,
      searchCacheMaxBytes: searchCache.maxBytes,
      searchCacheMaxEntries: searchCache.maxEntries,
      currentBufferBytes,
      loadedNotes: cachedNotes.length,
      loadedEditable: loadedEditableCount,
      loadedReadOnly: loadedReadOnlyCount,
      editorUndoStates: undoFootprint.editorStates,
      editorUndoBytes: undoFootprint.editorBytes,
      canvasUndoStates: undoFootprint.canvasStates,
      canvasUndoBytes: undoFootprint.canvasBytes,
      canvasDocumentBytes: canvasBytes,
      canvasSessionBytes,
      runtimeStatsAvailable: !!window.go?.main?.App?.GetRuntimeStats,
    },
    theme: {
      id: currentTheme,
      label: theme.label,
      mode: theme.mode,
      totalThemes: THEMES.length,
      lightThemes: LIGHT_THEMES.length,
      darkThemes: DARK_THEMES.length,
      recipes: THEME_RECIPES.length,
      activeRecipes: activeThemeRecipes.length,
      activeRecipeLabels: activeThemeRecipes.map(recipe => recipe.label),
      catalogBytes: byteSize(JSON.stringify(THEMES)),
      recipeBytes: byteSize(JSON.stringify(THEME_RECIPES)),
      implementation: 'CSS variables, no image packs',
    },
    layout: {
      viewMode,
      splitLabel: splitRatioText(),
      splitRatio: Math.round(splitRatio * 10) / 10,
      softWrap: !!editorSoftWrap,
      readingWidth: !!editorReadingWidth,
      focusMode: !!focusMode,
      compactMode: !!compactMode,
    },
    trash: {
      retentionDays: DRAFT_TRASH_DAYS,
      retainedDrafts: draftTrash.length,
      retainedFiles: fileTrash.length,
      draftBytes: trashAudit.draftBytes,
      fileBytes: trashAudit.fileBytes,
      totalBytes: trashAudit.totalBytes,
      urgent: trashAudit.urgent,
      soon: trashAudit.soon,
      safe: trashAudit.safe,
      nextExpiry: trashAudit.nextExpiry,
      nextTitle: trashAudit.nextTitle,
      fileTrashBridge: !!window.go?.main?.App?.ListFileTrash,
    },
    tasks: {
      viewMode: taskViewMode,
      sourceFilter: taskSourceFilter,
      filter: taskFilter,
      query: taskQuery || '',
      known: taskItems.length,
      visible: visibleTaskItems.length,
      open: taskItems.filter(task => !task.checked).length,
      done: taskItems.filter(task => task.checked).length,
      waiting: taskItems.filter(task => !task.checked && task.waiting).length,
      high: taskItems.filter(isHighPriorityTask).length,
      loaded: taskSourceCounts.loaded,
      local: taskSourceCounts.local,
      dueBuckets: taskDueBuckets,
      sourceState: taskItems.length ? 'current in-memory task parse' : 'open Tasks to populate current task metadata',
      sourceOfTruth: 'Markdown checkbox lines',
    },
    canvas: {
      elements: canvasElements,
      elementTypes: canvasElementTypes,
      elementTypeCount: Object.keys(canvasElementTypes).length,
      bytes: canvasBytes,
      background: canvasDoc?.appState?.viewBackgroundColor || '#ffffff',
      tool: canvasTool,
      gridVisible: !!canvasGridVisible,
      gridSize: canvasGridSize,
      snapToGrid: !!canvasSnapToGrid,
      minimapVisible: !!canvasMinimapVisible,
      camera: {
        x: Math.round(Number(canvasCamera.x || 0)),
        y: Math.round(Number(canvasCamera.y || 0)),
        zoomPercent: Math.round(Number(canvasCamera.scale || 1) * 100),
      },
      undoSnapshots: canvasHistory.length,
      undoLimit: CANVAS_HISTORY_LIMIT,
      format: MARKPAD_CANVAS_FORMAT,
    },
    assets: {
      commandTextIcons: commandIcons.total,
      uniqueCommandTextIcons: commandIcons.unique,
      domImages,
      inlineSvg,
      canvasSurfaces,
      iconFonts: false,
      imageThemePacks: false,
      runtimeThemeEngine: false,
    },
    note: 'Upgrade Map samples existing local metadata only; it does not scan workspaces, load assets, or create a new source of truth.',
  };
}

function upgradeMapMarkdown(snapshot) {
  return [
    '# Markpad Upgrade Map',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    `Active file: ${snapshot.activeFile.title || '(none)'} (${snapshot.activeFile.type || 'unknown'})`,
    '',
    '## Local-first',
    '',
    `- Source of truth: ${snapshot.localFirst.sourceOfTruth}`,
    `- Sync phase: ${snapshot.localFirst.syncPhase}`,
    `- Status: ${snapshot.status.overall}; search ${snapshot.status.search}; tasks ${snapshot.status.tasks}; canvas ${snapshot.status.canvas}; trash ${snapshot.status.trash}; footprint ${snapshot.status.footprint}; sync ${snapshot.status.sync}`,
    `- Sync readiness: ${snapshot.syncReadiness.phase}, ${snapshot.syncReadiness.loadedFiles} loaded files / ${snapshot.syncReadiness.drafts} drafts, ${snapshot.syncReadiness.dirtyItems} dirty, local folder ${snapshot.syncReadiness.localFolderConfigured ? 'configured' : 'not configured'}`,
    `- Portable now: ${(snapshot.syncReadiness.portableNow || []).join(', ')}`,
    `- Device-local: ${(snapshot.syncReadiness.deviceLocal || []).join(', ')}`,
    '',
    '## Feature coverage',
    '',
    `- Search: ${snapshot.search.scope}, ${snapshot.search.results} results (${snapshot.search.loadedResults} loaded, ${snapshot.search.localResults} local), ${formatBytes(snapshot.search.cacheBytes)} cache, ${snapshot.search.operators?.total || 0} query operators (${snapshot.search.operators?.filters || 0} filters, ${snapshot.search.operators?.excludes || 0} excludes)`,
    `- Footprint: ${formatBytes(snapshot.footprint.estimatedUiBytes || 0)} sampled UI estimate, ${formatBytes(snapshot.footprint.localStorageBytes || 0)} Markpad localStorage, ${snapshot.footprint.editorUndoStates} editor undo / ${snapshot.footprint.canvasUndoStates} canvas undo states, ${snapshot.footprint.loadedNotes} loaded notes`,
    `- Themes: ${snapshot.theme.label} (${snapshot.theme.mode}), ${snapshot.theme.totalThemes} CSS themes (${snapshot.theme.lightThemes} light / ${snapshot.theme.darkThemes} dark), ${snapshot.theme.recipes} recipes (${snapshot.theme.activeRecipes} active), catalog ${formatBytes(snapshot.theme.catalogBytes || 0)}, ${snapshot.theme.implementation}`,
    `- Split/edit: ${snapshot.layout.viewMode}, ${snapshot.layout.splitLabel}, ${snapshot.layout.softWrap ? 'wrap' : 'no wrap'}, ${snapshot.layout.readingWidth ? 'reading width' : 'full width'}`,
    `- Trash: ${snapshot.trash.retentionDays} days, ${snapshot.trash.retainedDrafts} drafts / ${snapshot.trash.retainedFiles} files, ${formatBytes(snapshot.trash.totalBytes || 0)} retained, ${snapshot.trash.urgent} today / ${snapshot.trash.soon} soon / ${snapshot.trash.safe} safe, next ${snapshot.trash.nextExpiry || 'None'}, file bridge ${snapshot.trash.fileTrashBridge ? 'on' : 'off'}`,
    `- Tasks: ${snapshot.tasks.viewMode}, ${snapshot.tasks.visible}/${snapshot.tasks.known} visible, ${snapshot.tasks.open} open / ${snapshot.tasks.done} done, ${snapshot.tasks.loaded} loaded / ${snapshot.tasks.local} local, due today ${snapshot.tasks.dueBuckets?.today || 0}, overdue ${snapshot.tasks.dueBuckets?.overdue || 0}, ${snapshot.tasks.sourceOfTruth}`,
    `- Canvas: ${snapshot.canvas.elements} elements (${canvasElementTypeSummary(snapshot.canvas.elementTypes)}), ${formatBytes(snapshot.canvas.bytes)}, ${snapshot.canvas.tool}, zoom ${snapshot.canvas.camera?.zoomPercent || 100}%, grid ${snapshot.canvas.gridVisible ? `${snapshot.canvas.gridSize}px` : 'off'}, snap ${snapshot.canvas.snapToGrid ? 'on' : 'off'}, minimap ${snapshot.canvas.minimapVisible ? 'on' : 'off'}, ${snapshot.canvas.undoSnapshots}/${snapshot.canvas.undoLimit} undo, ${snapshot.canvas.format}`,
    `- Assets: ${snapshot.assets.commandTextIcons} command text icons (${snapshot.assets.uniqueCommandTextIcons} unique), ${snapshot.assets.domImages} DOM images, ${snapshot.assets.inlineSvg} inline SVG, ${snapshot.assets.canvasSurfaces} canvas surfaces, icon fonts ${snapshot.assets.iconFonts ? 'yes' : 'no'}, image theme packs ${snapshot.assets.imageThemePacks ? 'yes' : 'no'}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function upgradeMapJson(snapshot) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function upgradeMapCsv(snapshot) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['active_title', snapshot.activeFile.title || ''],
    ['active_type', snapshot.activeFile.type || ''],
    ['status_overall', snapshot.status.overall],
    ['status_search', snapshot.status.search],
    ['status_tasks', snapshot.status.tasks],
    ['status_canvas', snapshot.status.canvas],
    ['status_trash', snapshot.status.trash],
    ['status_footprint', snapshot.status.footprint],
    ['status_sync', snapshot.status.sync],
    ['sync_phase', snapshot.syncReadiness.phase],
    ['sync_loaded_files', Number(snapshot.syncReadiness.loadedFiles || 0)],
    ['sync_drafts', Number(snapshot.syncReadiness.drafts || 0)],
    ['sync_dirty_items', Number(snapshot.syncReadiness.dirtyItems || 0)],
    ['sync_local_folder_configured', snapshot.syncReadiness.localFolderConfigured ? 'true' : 'false'],
    ['sync_portable_targets', (snapshot.syncReadiness.portableNow || []).join('; ')],
    ['sync_device_local_state', (snapshot.syncReadiness.deviceLocal || []).join('; ')],
    ['search_scope', snapshot.search.scope],
    ['search_results', Number(snapshot.search.results || 0)],
    ['search_loaded_results', Number(snapshot.search.loadedResults || 0)],
    ['search_local_results', Number(snapshot.search.localResults || 0)],
    ['search_cache_bytes', Number(snapshot.search.cacheBytes || 0)],
    ['search_query', snapshot.search.query || ''],
    ['search_backend_query', snapshot.search.backendQuery || ''],
    ['search_operator_total', Number(snapshot.search.operators?.total || 0)],
    ['search_operator_terms', Number(snapshot.search.operators?.terms || 0)],
    ['search_operator_phrases', Number(snapshot.search.operators?.phrases || 0)],
    ['search_operator_wildcards', Number(snapshot.search.operators?.wildcards || 0)],
    ['search_operator_fuzzy_terms', Number(snapshot.search.operators?.fuzzyTerms || 0)],
    ['search_operator_filters', Number(snapshot.search.operators?.filters || 0)],
    ['search_operator_excludes', Number(snapshot.search.operators?.excludes || 0)],
    ['search_filter_type', Number(snapshot.search.operators?.typeFilters || 0)],
    ['search_filter_path', Number(snapshot.search.operators?.pathFilters || 0)],
    ['search_filter_title', Number(snapshot.search.operators?.titleFilters || 0)],
    ['search_filter_tag', Number(snapshot.search.operators?.tagFilters || 0)],
    ['search_filter_task', Number(snapshot.search.operators?.taskFilters || 0)],
    ['footprint_estimated_ui_bytes', Number(snapshot.footprint.estimatedUiBytes || 0)],
    ['footprint_localstorage_bytes', Number(snapshot.footprint.localStorageBytes || 0)],
    ['footprint_current_buffer_bytes', Number(snapshot.footprint.currentBufferBytes || 0)],
    ['footprint_loaded_notes', Number(snapshot.footprint.loadedNotes || 0)],
    ['footprint_loaded_editable', Number(snapshot.footprint.loadedEditable || 0)],
    ['footprint_loaded_readonly', Number(snapshot.footprint.loadedReadOnly || 0)],
    ['footprint_editor_undo_states', Number(snapshot.footprint.editorUndoStates || 0)],
    ['footprint_editor_undo_bytes', Number(snapshot.footprint.editorUndoBytes || 0)],
    ['footprint_canvas_undo_states', Number(snapshot.footprint.canvasUndoStates || 0)],
    ['footprint_canvas_undo_bytes', Number(snapshot.footprint.canvasUndoBytes || 0)],
    ['footprint_canvas_document_bytes', Number(snapshot.footprint.canvasDocumentBytes || 0)],
    ['footprint_canvas_session_bytes', Number(snapshot.footprint.canvasSessionBytes || 0)],
    ['footprint_runtime_stats_available', snapshot.footprint.runtimeStatsAvailable ? 'true' : 'false'],
    ['theme_id', snapshot.theme.id],
    ['theme_mode', snapshot.theme.mode],
    ['theme_total', Number(snapshot.theme.totalThemes || 0)],
    ['theme_light', Number(snapshot.theme.lightThemes || 0)],
    ['theme_dark', Number(snapshot.theme.darkThemes || 0)],
    ['theme_recipes', Number(snapshot.theme.recipes || 0)],
    ['theme_active_recipes', Number(snapshot.theme.activeRecipes || 0)],
    ['theme_catalog_bytes', Number(snapshot.theme.catalogBytes || 0)],
    ['theme_recipe_bytes', Number(snapshot.theme.recipeBytes || 0)],
    ['layout_view_mode', snapshot.layout.viewMode],
    ['layout_split_ratio', Number(snapshot.layout.splitRatio || 0)],
    ['layout_soft_wrap', snapshot.layout.softWrap ? 'true' : 'false'],
    ['layout_reading_width', snapshot.layout.readingWidth ? 'true' : 'false'],
    ['trash_retention_days', Number(snapshot.trash.retentionDays || 0)],
    ['trash_retained_drafts', Number(snapshot.trash.retainedDrafts || 0)],
    ['trash_retained_files', Number(snapshot.trash.retainedFiles || 0)],
    ['trash_draft_bytes', Number(snapshot.trash.draftBytes || 0)],
    ['trash_file_bytes', Number(snapshot.trash.fileBytes || 0)],
    ['trash_total_bytes', Number(snapshot.trash.totalBytes || 0)],
    ['trash_urgent', Number(snapshot.trash.urgent || 0)],
    ['trash_soon', Number(snapshot.trash.soon || 0)],
    ['trash_safe', Number(snapshot.trash.safe || 0)],
    ['trash_next_expiry', snapshot.trash.nextExpiry || ''],
    ['trash_next_title', snapshot.trash.nextTitle || ''],
    ['task_view_mode', snapshot.tasks.viewMode],
    ['task_source_filter', snapshot.tasks.sourceFilter],
    ['task_filter', snapshot.tasks.filter],
    ['task_known', Number(snapshot.tasks.known || 0)],
    ['task_visible', Number(snapshot.tasks.visible || 0)],
    ['task_open', Number(snapshot.tasks.open || 0)],
    ['task_done', Number(snapshot.tasks.done || 0)],
    ['task_waiting', Number(snapshot.tasks.waiting || 0)],
    ['task_high', Number(snapshot.tasks.high || 0)],
    ['task_loaded', Number(snapshot.tasks.loaded || 0)],
    ['task_local', Number(snapshot.tasks.local || 0)],
    ['task_due_overdue', Number(snapshot.tasks.dueBuckets?.overdue || 0)],
    ['task_due_today', Number(snapshot.tasks.dueBuckets?.today || 0)],
    ['task_due_tomorrow', Number(snapshot.tasks.dueBuckets?.tomorrow || 0)],
    ['task_due_week', Number(snapshot.tasks.dueBuckets?.week || 0)],
    ['task_due_later', Number(snapshot.tasks.dueBuckets?.later || 0)],
    ['task_due_unscheduled', Number(snapshot.tasks.dueBuckets?.unscheduled || 0)],
    ['canvas_elements', Number(snapshot.canvas.elements || 0)],
    ['canvas_element_type_count', Number(snapshot.canvas.elementTypeCount || 0)],
    ['canvas_bytes', Number(snapshot.canvas.bytes || 0)],
    ['canvas_background', snapshot.canvas.background || ''],
    ['canvas_tool', snapshot.canvas.tool || ''],
    ['canvas_grid_visible', snapshot.canvas.gridVisible ? 'true' : 'false'],
    ['canvas_grid_size', Number(snapshot.canvas.gridSize || 0)],
    ['canvas_snap_to_grid', snapshot.canvas.snapToGrid ? 'true' : 'false'],
    ['canvas_minimap_visible', snapshot.canvas.minimapVisible ? 'true' : 'false'],
    ['canvas_camera_x', Number(snapshot.canvas.camera?.x || 0)],
    ['canvas_camera_y', Number(snapshot.canvas.camera?.y || 0)],
    ['canvas_camera_zoom_percent', Number(snapshot.canvas.camera?.zoomPercent || 100)],
    ['canvas_undo_snapshots', Number(snapshot.canvas.undoSnapshots || 0)],
    ['command_text_icons', Number(snapshot.assets.commandTextIcons || 0)],
    ['unique_command_text_icons', Number(snapshot.assets.uniqueCommandTextIcons || 0)],
    ['asset_dom_images', Number(snapshot.assets.domImages || 0)],
    ['asset_inline_svg', Number(snapshot.assets.inlineSvg || 0)],
    ['asset_canvas_surfaces', Number(snapshot.assets.canvasSurfaces || 0)],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyUpgradeMapMarkdown() {
  await navigator.clipboard.writeText(upgradeMapMarkdown(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map copied as Markdown';
}

async function exportUpgradeMapMarkdown() {
  downloadText('markpad-upgrade-map.md', 'text/markdown', upgradeMapMarkdown(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map exported as Markdown';
}

async function copyUpgradeMapJson() {
  await navigator.clipboard.writeText(upgradeMapJson(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map copied as JSON';
}

async function exportUpgradeMapJson() {
  downloadText('markpad-upgrade-map.json', 'application/json', upgradeMapJson(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map exported as JSON';
}

async function copyUpgradeMapCsv() {
  await navigator.clipboard.writeText(upgradeMapCsv(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map copied as CSV';
}

async function exportUpgradeMapCsv() {
  downloadText('markpad-upgrade-map.csv', 'text/csv', upgradeMapCsv(await upgradeMapSnapshot()));
  statusText.textContent = 'Upgrade Map exported as CSV';
}

function upgradeMapStatusChips(snapshot) {
  const trashTotal = Number(snapshot.trash.retainedDrafts || 0) + Number(snapshot.trash.retainedFiles || 0);
  const chips = [
    ['Local', snapshot.status.overall, 'ready'],
    ['Search', snapshot.status.search, snapshot.search.operators?.total ? 'active' : 'idle'],
    ['Tasks', snapshot.status.tasks, snapshot.tasks.known ? 'active' : 'idle'],
    ['Canvas', snapshot.status.canvas, snapshot.canvas.elements ? 'active' : 'idle'],
    ['Trash', snapshot.status.trash, trashTotal ? 'warn' : 'idle'],
    ['Footprint', snapshot.status.footprint, 'ready'],
    ['Sync', snapshot.status.sync, 'planned'],
  ];
  return `
    <div class="upgrade-map-chips" aria-label="Upgrade Map status">
      ${chips.map(([label, value, tone]) => `
        <span class="upgrade-map-chip ${tone}">
          <strong>${escapeHtml(label)}</strong>
          ${escapeHtml(value)}
        </span>
      `).join('')}
    </div>
  `;
}

async function showUpgradeMap() {
  const snapshot = await upgradeMapSnapshot();
  showModal('Upgrade Map', `
    <div class="upgrade-map-shell">
    ${upgradeMapStatusChips(snapshot)}
    <div class="diag-grid upgrade-map-grid">
      <div class="diag-card"><strong>local</strong><span>Source of truth</span><small>Files, drafts, tasks, canvas, Trash, and UI state stay on this computer</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.status.overall)}</strong><span>Upgrade status</span><small>search ${escapeHtml(snapshot.status.search)} · tasks ${escapeHtml(snapshot.status.tasks)} · canvas ${escapeHtml(snapshot.status.canvas)}</small></div>
      <div class="diag-card"><strong>later</strong><span>Sync readiness</span><small>${snapshot.syncReadiness.loadedFiles} files · ${snapshot.syncReadiness.drafts} drafts · ${snapshot.syncReadiness.dirtyItems} dirty · folder ${snapshot.syncReadiness.localFolderConfigured ? 'set' : 'unset'}</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.search.scope)}</strong><span>Search</span><small>${snapshot.search.results} results · ${snapshot.search.loadedResults} loaded · ${snapshot.search.localResults} local · ${snapshot.search.operators.total} ops · ${formatBytes(snapshot.search.cacheBytes || 0)} cache</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.footprint.estimatedUiBytes || 0)}</strong><span>UI footprint</span><small>${formatBytes(snapshot.footprint.localStorageBytes || 0)} localStorage · ${snapshot.footprint.loadedNotes} loaded notes</small></div>
      <div class="diag-card"><strong>${snapshot.footprint.editorUndoStates}/${snapshot.footprint.canvasUndoStates}</strong><span>Undo states</span><small>${formatBytes((snapshot.footprint.editorUndoBytes || 0) + (snapshot.footprint.canvasUndoBytes || 0))} undo bytes · runtime ${snapshot.footprint.runtimeStatsAvailable ? 'available' : 'unavailable'}</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.theme.label)}</strong><span>Themes</span><small>${snapshot.theme.totalThemes} CSS themes · ${snapshot.theme.recipes} recipes · ${snapshot.theme.activeRecipes} active</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.layout.splitLabel)}</strong><span>Split/edit</span><small>${snapshot.layout.softWrap ? 'wrap' : 'no wrap'} · ${snapshot.layout.readingWidth ? 'reading width' : 'full width'} · ${snapshot.layout.focusMode ? 'focus' : 'standard'}</small></div>
      <div class="diag-card"><strong>${snapshot.trash.retentionDays}d</strong><span>Trash</span><small>${snapshot.trash.retainedDrafts} drafts · ${snapshot.trash.retainedFiles} files · ${formatBytes(snapshot.trash.totalBytes || 0)}</small></div>
      <div class="diag-card"><strong>${snapshot.trash.urgent}</strong><span>Trash expiry</span><small>${snapshot.trash.soon} soon · ${snapshot.trash.safe} safe · next ${escapeHtml(snapshot.trash.nextExpiry || 'None')}</small></div>
      <div class="diag-card"><strong>${snapshot.tasks.visible}/${snapshot.tasks.known}</strong><span>Tasks</span><small>${snapshot.tasks.open} open · ${snapshot.tasks.done} done · ${snapshot.tasks.loaded} loaded/${snapshot.tasks.local} local</small></div>
      <div class="diag-card"><strong>${snapshot.tasks.dueBuckets.today || 0}</strong><span>Task due today</span><small>${snapshot.tasks.dueBuckets.overdue || 0} overdue · ${snapshot.tasks.dueBuckets.week || 0} this week · ${escapeHtml(snapshot.tasks.sourceState)}</small></div>
      <div class="diag-card"><strong>${snapshot.canvas.elements}</strong><span>Canvas</span><small>${snapshot.canvas.elementTypeCount} types · ${formatBytes(snapshot.canvas.bytes)} native JSON · ${snapshot.canvas.undoSnapshots}/${snapshot.canvas.undoLimit} undo</small></div>
      <div class="diag-card"><strong>${snapshot.canvas.camera.zoomPercent}%</strong><span>Canvas view</span><small>${escapeHtml(snapshot.canvas.tool)} · grid ${snapshot.canvas.gridVisible ? `${snapshot.canvas.gridSize}px` : 'off'} · snap ${snapshot.canvas.snapToGrid ? 'on' : 'off'} · minimap ${snapshot.canvas.minimapVisible ? 'on' : 'off'}</small></div>
      <div class="diag-card"><strong>${snapshot.assets.commandTextIcons}</strong><span>Command icons</span><small>${snapshot.assets.uniqueCommandTextIcons} unique text labels · no icon font</small></div>
      <div class="diag-card"><strong>${snapshot.assets.domImages}</strong><span>Rendered assets</span><small>${snapshot.assets.inlineSvg} inline SVG · ${snapshot.assets.canvasSurfaces} canvas · no theme packs</small></div>
    </div>
    <div class="local-actions upgrade-map-actions" style="margin-top:10px;">
      <button data-copy-upgrade-map-md>Copy MD</button>
      <button data-export-upgrade-map-md>Export MD</button>
      <button data-copy-upgrade-map-json>Copy JSON</button>
      <button data-export-upgrade-map-json>Export JSON</button>
      <button data-copy-upgrade-map-csv>Copy CSV</button>
      <button data-export-upgrade-map-csv>Export CSV</button>
      <button data-search-profile-open>Search Profile</button>
      <button data-theme-lab-open>Theme Lab</button>
      <button data-trash-guide>Trash Guide</button>
      <button data-task-source-profile>Task Source</button>
      <button data-canvas-storage-profile-open>Canvas Storage</button>
      <button data-open-local-footprint>Local Footprint</button>
      <button data-run-memory-cleanup-report>Cleanup + Footprint</button>
      <button data-clear-loaded-search-cache>Clear Search Cache</button>
      <button data-clear-all-undo-history>Clear Undo</button>
      <button data-workspace-search-plan>Search Plan</button>
    </div>
    <p class="diag-note">${escapeHtml(snapshot.note)}</p>
    </div>
  `);
}

function themeCommandItems() {
  return THEMES.map(theme => ({
    id: `theme-${theme.id}`,
    icon: 'TH',
    title: `Theme: ${theme.label}`,
    hint: `Apply the ${theme.label} CSS-variable theme`,
    run: () => applyTheme(theme.id),
  }));
}

function themePresetCommandItems() {
  return [
    { id: 'theme-preset-writing', icon: 'TW', title: 'Theme preset: Warm writing', hint: 'Apply Linen for long-form writing with a soft light surface', theme: 'linen' },
    { id: 'theme-preset-review', icon: 'TRV', title: 'Theme preset: Review mode', hint: 'Apply Mist for low-glare document review', theme: 'mist' },
    { id: 'theme-preset-planning', icon: 'TPL', title: 'Theme preset: Planning board', hint: 'Apply Sand for tasks, kanban, and canvas planning', theme: 'sand' },
    { id: 'theme-preset-focus', icon: 'TF', title: 'Theme preset: Dark focus', hint: 'Apply Ink for distraction-light editing', theme: 'ink' },
    { id: 'theme-preset-night', icon: 'TN', title: 'Theme preset: Night notes', hint: 'Apply Midnight for late-session reading and editing', theme: 'midnight' },
  ].map(item => ({
    id: item.id,
    icon: item.icon,
    title: item.title,
    hint: item.hint,
    run: () => applyTheme(item.theme),
  }));
}

function showLocalSearchLimits() {
  showModal('Local Search Limits', `
    <div style="display:grid;gap:12px;font-size:12px;line-height:1.65;color:var(--text);">
      <p style="margin:0;color:var(--muted);">Local folder search is intentionally bounded so Markpad stays responsive and light on RAM.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;font-weight:800;">Source</td><td style="padding:5px 8px;color:var(--muted);">Files are read directly from the configured local folder. No cloud service is contacted.</td></tr>
        <tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;font-weight:800;">Large files</td><td style="padding:5px 8px;color:var(--muted);">Very large files are skipped during scan to avoid loading heavy content into memory.</td></tr>
        <tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;font-weight:800;">Binary files</td><td style="padding:5px 8px;color:var(--muted);">Archives and read-only binary previews are excluded from text search.</td></tr>
        <tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;font-weight:800;">Vendor folders</td><td style="padding:5px 8px;color:var(--muted);">Hidden, cache, build, dist, vendor, node_modules, and VCS folders are skipped.</td></tr>
        <tr><td style="padding:5px 8px;font-weight:800;">Ranking</td><td style="padding:5px 8px;color:var(--muted);">The scan keeps a bounded top-match pool, then sorts by score so late high-quality matches can still win.</td></tr>
      </table>
      <p style="margin:0;color:var(--muted);">The search footer reports scanned, searched, skipped, and capped counts when the backend provides diagnostics.</p>
    </div>
  `);
}

function formatRuntimeDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function runtimeStatsText(stats) {
  const rss = stats.processRssAvailable ? formatBytes(Number(stats.processRssBytes || 0)) : 'Unavailable';
  return [
    'Markpad Runtime Stats',
    `Process RSS: ${rss}`,
    `Go heap alloc: ${formatBytes(Number(stats.goAllocBytes || 0))}`,
    `Go heap in use: ${formatBytes(Number(stats.goHeapInuseBytes || 0))}`,
    `Go heap idle: ${formatBytes(Number(stats.goHeapIdleBytes || 0))}`,
    `Go heap released: ${formatBytes(Number(stats.goHeapReleasedBytes || 0))}`,
    `Go runtime sys: ${formatBytes(Number(stats.goSysBytes || 0))}`,
    `Executable size: ${stats.executableSizeBytes ? formatBytes(Number(stats.executableSizeBytes || 0)) : 'Unavailable'}`,
    `Go objects: ${Number(stats.goObjects || 0).toLocaleString()}`,
    `Goroutines: ${Number(stats.goroutines || 0).toLocaleString()}`,
    `Uptime: ${formatRuntimeDuration(stats.uptimeSeconds)}`,
    `Platform: ${stats.os || 'unknown'}/${stats.arch || 'unknown'}`,
  ].join('\n');
}

async function copyRuntimeStats() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(runtimeStatsText(await getter()));
    statusText.textContent = 'Runtime stats copied';
  } catch (err) {
    statusText.textContent = 'Runtime stats copy failed: ' + err;
  }
}

async function exportRuntimeStatsText() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  try {
    downloadText('markpad-runtime-stats.txt', 'text/plain', runtimeStatsText(await getter()) + '\n');
    statusText.textContent = 'Runtime stats exported as text';
  } catch (err) {
    statusText.textContent = 'Runtime stats text export failed: ' + err;
  }
}

function runtimeStatsJson(stats) {
  return JSON.stringify({
    type: 'markpad-runtime-stats',
    version: 1,
    sampledAt: new Date().toISOString(),
    process: {
      rssAvailable: !!stats.processRssAvailable,
      rssBytes: Number(stats.processRssBytes || 0),
    },
    go: {
      allocBytes: Number(stats.goAllocBytes || 0),
      heapInuseBytes: Number(stats.goHeapInuseBytes || 0),
      heapIdleBytes: Number(stats.goHeapIdleBytes || 0),
      heapReleasedBytes: Number(stats.goHeapReleasedBytes || 0),
      sysBytes: Number(stats.goSysBytes || 0),
      objects: Number(stats.goObjects || 0),
      goroutines: Number(stats.goroutines || 0),
    },
    app: {
      executableSizeBytes: Number(stats.executableSizeBytes || 0),
      uptimeSeconds: Number(stats.uptimeSeconds || 0),
      os: stats.os || 'unknown',
      arch: stats.arch || 'unknown',
    },
  }, null, 2) + '\n';
}

async function copyRuntimeStatsJson() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(runtimeStatsJson(await getter()));
    statusText.textContent = 'Runtime stats copied as JSON';
  } catch (err) {
    statusText.textContent = 'Runtime stats JSON copy failed: ' + err;
  }
}

async function exportRuntimeStatsJson() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  try {
    downloadText('markpad-runtime-stats.json', 'application/json', runtimeStatsJson(await getter()));
    statusText.textContent = 'Runtime stats exported as JSON';
  } catch (err) {
    statusText.textContent = 'Runtime stats JSON export failed: ' + err;
  }
}

function runtimeStatsMarkdown(stats) {
  return [
    '# Markpad Runtime Stats',
    '',
    `Sampled: ${new Date().toISOString()}`,
    '',
    '## Process',
    '',
    `- RSS: ${stats.processRssAvailable ? formatBytes(Number(stats.processRssBytes || 0)) : 'Unavailable'}`,
    `- Executable size: ${stats.executableSizeBytes ? formatBytes(Number(stats.executableSizeBytes || 0)) : 'Unavailable'}`,
    `- Uptime: ${formatRuntimeDuration(stats.uptimeSeconds)}`,
    `- Platform: ${stats.os || 'unknown'}/${stats.arch || 'unknown'}`,
    '',
    '## Go Runtime',
    '',
    `- Heap alloc: ${formatBytes(Number(stats.goAllocBytes || 0))}`,
    `- Heap in use: ${formatBytes(Number(stats.goHeapInuseBytes || 0))}`,
    `- Heap idle: ${formatBytes(Number(stats.goHeapIdleBytes || 0))}`,
    `- Heap released: ${formatBytes(Number(stats.goHeapReleasedBytes || 0))}`,
    `- Runtime sys: ${formatBytes(Number(stats.goSysBytes || 0))}`,
    `- Objects: ${Number(stats.goObjects || 0).toLocaleString()}`,
    `- Goroutines: ${Number(stats.goroutines || 0).toLocaleString()}`,
    '',
  ].join('\n');
}

function runtimeStatsCsv(stats) {
  const rows = [
    ['metric', 'value'],
    ['process_rss_available', stats.processRssAvailable ? 'true' : 'false'],
    ['process_rss_bytes', Number(stats.processRssBytes || 0)],
    ['executable_size_bytes', Number(stats.executableSizeBytes || 0)],
    ['uptime_seconds', Number(stats.uptimeSeconds || 0)],
    ['os', stats.os || 'unknown'],
    ['arch', stats.arch || 'unknown'],
    ['go_alloc_bytes', Number(stats.goAllocBytes || 0)],
    ['go_heap_inuse_bytes', Number(stats.goHeapInuseBytes || 0)],
    ['go_heap_idle_bytes', Number(stats.goHeapIdleBytes || 0)],
    ['go_heap_released_bytes', Number(stats.goHeapReleasedBytes || 0)],
    ['go_sys_bytes', Number(stats.goSysBytes || 0)],
    ['go_objects', Number(stats.goObjects || 0)],
    ['goroutines', Number(stats.goroutines || 0)],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function exportRuntimeStatsMarkdown() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  try {
    downloadText('markpad-runtime-stats.md', 'text/markdown', runtimeStatsMarkdown(await getter()));
    statusText.textContent = 'Runtime stats exported as Markdown';
  } catch (err) {
    statusText.textContent = 'Runtime stats Markdown export failed: ' + err;
  }
}

async function copyRuntimeStatsMarkdown() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(runtimeStatsMarkdown(await getter()));
    statusText.textContent = 'Runtime stats copied as Markdown';
  } catch (err) {
    statusText.textContent = 'Runtime stats Markdown copy failed: ' + err;
  }
}

async function copyRuntimeStatsCsv() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await navigator.clipboard.writeText(runtimeStatsCsv(await getter()));
    statusText.textContent = 'Runtime stats copied as CSV';
  } catch (err) {
    statusText.textContent = 'Runtime stats CSV copy failed: ' + err;
  }
}

async function exportRuntimeStatsCsv() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }
  try {
    downloadText('markpad-runtime-stats.csv', 'text/csv', runtimeStatsCsv(await getter()));
    statusText.textContent = 'Runtime stats exported as CSV';
  } catch (err) {
    statusText.textContent = 'Runtime stats CSV export failed: ' + err;
  }
}

function lightweightAssetSnapshot() {
  const images = [...document.images].map(img => ({
    src: img.currentSrc || img.src || '',
    width: img.naturalWidth || 0,
    height: img.naturalHeight || 0,
    loading: img.loading || '',
  }));
  const imagePixels = images.reduce((sum, image) => sum + Math.max(0, Number(image.width || 0) * Number(image.height || 0)), 0);
  const remoteImages = images.filter(image => /^https?:\/\//i.test(image.src || '')).length;
  const embeddedImages = images.filter(image => /^data:/i.test(image.src || '')).length;
  const estimatedDecodedImageBytes = imagePixels * 4;
  const budget = {
    status: images.length <= 8 && estimatedDecodedImageBytes <= 16 * 1024 * 1024 ? 'ok' : 'review',
    domImageLimit: 8,
    decodedImageByteLimit: 16 * 1024 * 1024,
    domImagesWithinBudget: images.length <= 8,
    decodedImagesWithinBudget: estimatedDecodedImageBytes <= 16 * 1024 * 1024,
  };
  const commandIcons = commandIconMetrics();
  return {
    type: 'markpad-lightweight-assets',
    version: 1,
    generatedAt: new Date().toISOString(),
    strategy: {
      icons: 'text glyphs and inline SVG',
      commandIcons: commandIcons.strategy,
      themes: 'CSS variables',
      polish: 'CSS transitions and layout refinements',
      workspacePresets: 'theme/layout state only',
      imageThemes: false,
      iconFonts: false,
      runtimeThemeEngine: false,
    },
    counts: {
      themes: THEMES.length,
      lightThemes: LIGHT_THEMES.length,
      darkThemes: DARK_THEMES.length,
      domImages: images.length,
      remoteImages,
      embeddedImages,
      imagePixels,
      estimatedDecodedImageBytes,
      inlineSvg: document.querySelectorAll('svg').length,
      canvasElements: document.querySelectorAll('canvas').length,
      stylesheets: document.styleSheets.length,
      commandTextIcons: commandIcons.total,
      uniqueCommandTextIcons: commandIcons.unique,
      longCommandTextIcons: commandIcons.longLabels,
      commandCategories: Object.keys(commandIcons.categories).length,
    },
    budget,
    commandIcons,
    images: images.slice(0, 20),
    notes: [
      'DOM image count reflects the current rendered view only.',
      'Decoded image bytes are estimated from rendered image natural dimensions at 4 bytes per pixel.',
      'Inline SVG count reflects visible toolbar/document icons in the current view.',
      'Command icons are measured as short text labels instead of font or bitmap assets.',
      'Themes are built-in CSS-variable themes and do not load image packs.',
      'Workspace presets apply existing CSS variables and local layout preferences.',
    ],
  };
}

function commandIconCategorySummary(categories = {}) {
  const entries = Object.entries(categories);
  if (!entries.length) return 'none';
  return entries.map(([label, count]) => `${label} ${count}`).join(', ');
}

function lightweightAssetMarkdown(snapshot = lightweightAssetSnapshot()) {
  return [
    '# Markpad Lightweight Asset Report',
    '',
    `- Generated: ${snapshot.generatedAt}`,
    `- Themes: ${snapshot.counts.themes} (${snapshot.counts.lightThemes} light, ${snapshot.counts.darkThemes} dark)`,
    `- DOM images: ${snapshot.counts.domImages} (${snapshot.counts.remoteImages} remote, ${snapshot.counts.embeddedImages} embedded)`,
    `- Estimated decoded image bytes: ${formatBytes(snapshot.counts.estimatedDecodedImageBytes || 0)}`,
    `- Current-view asset budget: ${snapshot.budget.status}${snapshot.budget.status === 'ok' ? '' : ` (limit ${snapshot.budget.domImageLimit} images / ${formatBytes(snapshot.budget.decodedImageByteLimit)})`}`,
    `- Inline SVG elements: ${snapshot.counts.inlineSvg}`,
    `- Canvas elements: ${snapshot.counts.canvasElements}`,
    `- Stylesheets: ${snapshot.counts.stylesheets}`,
    `- Command text icons: ${snapshot.commandIcons.total} (${snapshot.commandIcons.unique} unique)`,
    `- Long command icon labels: ${snapshot.commandIcons.longLabels}`,
    `- Command categories: ${commandIconCategorySummary(snapshot.commandIcons.categories)}`,
    '',
    '## Strategy',
    '',
    `- Icons: ${snapshot.strategy.icons}`,
    `- Command icons: ${snapshot.strategy.commandIcons}`,
    `- Themes: ${snapshot.strategy.themes}`,
    `- UI polish: ${snapshot.strategy.polish}`,
    `- Workspace presets: ${snapshot.strategy.workspacePresets}`,
    `- Icon fonts: ${snapshot.strategy.iconFonts ? 'yes' : 'no'}`,
    `- Image theme packs: ${snapshot.strategy.imageThemes ? 'yes' : 'no'}`,
    `- Runtime theme engine: ${snapshot.strategy.runtimeThemeEngine ? 'yes' : 'no'}`,
    '',
    '## Notes',
    '',
    ...snapshot.notes.map(note => `- ${note}`),
  ].join('\n') + '\n';
}

async function copyLightweightAssetReportJson() {
  await navigator.clipboard.writeText(JSON.stringify(lightweightAssetSnapshot(), null, 2) + '\n');
  statusText.textContent = 'Lightweight asset report copied as JSON';
}

function exportLightweightAssetReportJson() {
  downloadText('markpad-lightweight-assets.json', 'application/json', JSON.stringify(lightweightAssetSnapshot(), null, 2) + '\n');
  statusText.textContent = 'Lightweight asset report exported as JSON';
}

async function copyLightweightAssetReportMarkdown() {
  await navigator.clipboard.writeText(lightweightAssetMarkdown());
  statusText.textContent = 'Lightweight asset report copied as Markdown';
}

function exportLightweightAssetReportMarkdown() {
  downloadText('markpad-lightweight-assets.md', 'text/markdown', lightweightAssetMarkdown());
  statusText.textContent = 'Lightweight asset report exported as Markdown';
}

function showLightweightAssetReport() {
  const snapshot = lightweightAssetSnapshot();
  showModal('Lightweight Assets', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${snapshot.counts.themes}</strong><span>CSS themes</span><small>${snapshot.counts.lightThemes} light · ${snapshot.counts.darkThemes} dark</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.budget.status)}</strong><span>Asset budget</span><small>${snapshot.budget.domImagesWithinBudget ? 'image count ok' : 'image count review'} · ${snapshot.budget.decodedImagesWithinBudget ? 'decode ok' : 'decode review'}</small></div>
      <div class="diag-card"><strong>${snapshot.counts.domImages}</strong><span>DOM images</span><small>${snapshot.counts.remoteImages} remote · ${snapshot.counts.embeddedImages} embedded</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.counts.estimatedDecodedImageBytes || 0)}</strong><span>Image decode est.</span><small>${snapshot.counts.imagePixels} rendered pixels</small></div>
      <div class="diag-card"><strong>${snapshot.counts.inlineSvg}</strong><span>Inline SVG</span><small>Current toolbar/document DOM</small></div>
      <div class="diag-card"><strong>${snapshot.counts.canvasElements}</strong><span>Canvas elements</span><small>Preview, PDF, or drawing surfaces</small></div>
      <div class="diag-card"><strong>${snapshot.commandIcons.total}</strong><span>Command text icons</span><small>${snapshot.commandIcons.unique} unique labels</small></div>
      <div class="diag-card"><strong>${snapshot.commandIcons.longLabels}</strong><span>Long icon labels</span><small>Text labels, no font pack</small></div>
      <div class="diag-card"><strong>no</strong><span>Icon fonts</span><small>Text glyphs and inline SVG instead</small></div>
      <div class="diag-card"><strong>no</strong><span>Image theme packs</span><small>CSS variables only</small></div>
      <div class="diag-card"><strong>CSS</strong><span>UI polish</span><small>No bitmap skins or runtime theme engine</small></div>
      <div class="diag-card"><strong>state</strong><span>Workspace presets</span><small>Theme/layout preferences, not assets</small></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
      <button data-copy-asset-report-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
      <button data-export-asset-report-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
      <button data-copy-asset-report-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
      <button data-export-asset-report-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
    </div>
    <p class="diag-note">This report is local and current-view only. It is meant to keep UI polish honest: avoid icon fonts, large raster assets, image theme packs, and heavy runtime theme engines.</p>
  `);
}

async function showRuntimeStats() {
  const getter = window.go?.main?.App?.GetRuntimeStats;
  if (!getter) {
    statusText.textContent = 'Runtime stats unavailable';
    return;
  }

  try {
    const stats = await getter();
    const rssAvailable = Boolean(stats.processRssAvailable);
    const rss = rssAvailable ? formatBytes(Number(stats.processRssBytes || 0)) : 'Unavailable on this OS';
    const rows = [
      ['Process RSS', rss],
      ['Go heap alloc', formatBytes(Number(stats.goAllocBytes || 0))],
      ['Go heap in use', formatBytes(Number(stats.goHeapInuseBytes || 0))],
      ['Go heap idle', formatBytes(Number(stats.goHeapIdleBytes || 0))],
      ['Go heap released', formatBytes(Number(stats.goHeapReleasedBytes || 0))],
      ['Go runtime sys', formatBytes(Number(stats.goSysBytes || 0))],
      ['Executable size', stats.executableSizeBytes ? formatBytes(Number(stats.executableSizeBytes || 0)) : 'Unavailable'],
      ['Go objects', Number(stats.goObjects || 0).toLocaleString()],
      ['Goroutines', Number(stats.goroutines || 0).toLocaleString()],
      ['Uptime', formatRuntimeDuration(stats.uptimeSeconds)],
      ['Platform', `${escapeHtml(stats.os || 'unknown')}/${escapeHtml(stats.arch || 'unknown')}`],
    ];

    showModal('Runtime Stats', `
      <div style="display:grid;gap:12px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
          <div style="border:1px solid var(--border);background:var(--editor);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">Process RSS</div>
            <div style="font-size:20px;font-weight:900;color:var(--text);">${escapeHtml(rss)}</div>
          </div>
          <div style="border:1px solid var(--border);background:var(--editor);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">Go heap</div>
            <div style="font-size:20px;font-weight:900;color:var(--text);">${formatBytes(Number(stats.goAllocBytes || 0))}</div>
          </div>
          <div style="border:1px solid var(--border);background:var(--editor);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">Goroutines</div>
            <div style="font-size:20px;font-weight:900;color:var(--text);">${Number(stats.goroutines || 0).toLocaleString()}</div>
          </div>
          <div style="border:1px solid var(--border);background:var(--editor);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">Executable</div>
            <div style="font-size:20px;font-weight:900;color:var(--text);">${stats.executableSizeBytes ? formatBytes(Number(stats.executableSizeBytes || 0)) : 'n/a'}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">
          ${rows.map(([label, value]) => `<tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;color:var(--muted);font-weight:750;">${escapeHtml(label)}</td><td style="padding:5px 8px;text-align:right;font-weight:850;">${escapeHtml(value)}</td></tr>`).join('')}
        </table>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button data-copy-runtime-text style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy Text</button>
          <button data-export-runtime-text style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export Text</button>
          <button data-copy-runtime-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
          <button data-export-runtime-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
          <button data-copy-runtime-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
          <button data-export-runtime-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
          <button data-copy-runtime-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy CSV</button>
          <button data-export-runtime-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export CSV</button>
        </div>
        <p style="margin:0;color:var(--muted);font-size:11px;line-height:1.55;">RSS is the resident memory reported by the OS for the Markpad process when available. Go heap is runtime memory inside the backend only, so it will be lower than total desktop app memory.</p>
      </div>
    `);
    statusText.textContent = 'Runtime stats updated';
  } catch (err) {
    statusText.textContent = 'Runtime stats failed: ' + err;
  }
}

function showCommandWorkflowGuide() {
  const items = commandItems();
  const categories = ['Search', 'Tasks', 'Canvas', 'Local', 'Layout', 'Theme', 'Trash', 'Diagnostics'];
  const counts = categories.map(category => ({
    category,
    count: items.filter(item => commandCategory(item) === category).length,
  }));
  showModal('Command Workflow Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>Ctrl+P</strong><span>Command palette</span><small>${items.length} local actions, no plugins or cloud calls</small></div>
      <div class="diag-card"><strong>type category</strong><span>Search, Tasks, Canvas...</span><small>Category names filter the palette directly</small></div>
      <div class="diag-card"><strong>${currentCommandRecents().length}</strong><span>Recent commands</span><small>Stored locally and exportable as MD / JSON / CSV</small></div>
      <div class="diag-card"><strong>bridges</strong><span>Search / Tasks / Canvas</span><small>Send results, tasks, outlines, workspace, and backlinks to canvas</small></div>
      <div class="diag-card"><strong>diagnostics</strong><span>Runtime + footprint</span><small>Inspect memory, asset, and local storage reports</small></div>
      <div class="diag-card"><strong>keyboard-first</strong><span>Menu without weight</span><small>Detailed actions without adding nested heavy UI panels</small></div>
    </div>
    <div class="diag-heap">
      ${counts.map(item => `<span>${escapeHtml(item.category)} ${item.count}</span>`).join('')}
    </div>
    <p class="diag-note">Command categories are generated from the live command list. The palette favors lightweight text icons, local recents, and direct actions over heavyweight nested menus.</p>
  `);
}

function commandItems() {
  return [
    { id: 'new', icon: '+', title: 'New note', hint: 'Create an empty draft', kbd: 'Ctrl+N', run: doNew },
    { id: 'open', icon: 'O', title: 'Open file', hint: 'Open a local file', kbd: 'Ctrl+O', run: doOpen },
    { id: 'save', icon: 'S', title: 'Save', hint: 'Save the active document', kbd: 'Ctrl+S', run: doSave },
    { id: 'saveas', icon: 'A', title: 'Save as', hint: 'Choose a save path', kbd: 'Ctrl+Shift+S', run: doSaveAs },
    { id: 'commands-search', icon: 'CMD', title: 'Show Search commands', hint: 'Filter the command palette to Search actions', run: () => openCommandPaletteQuery('Search') },
    { id: 'commands-tasks', icon: 'CMD', title: 'Show Task commands', hint: 'Filter the command palette to Tasks actions', run: () => openCommandPaletteQuery('Tasks') },
    { id: 'commands-canvas', icon: 'CMD', title: 'Show Canvas commands', hint: 'Filter the command palette to Canvas actions', run: () => openCommandPaletteQuery('Canvas') },
    { id: 'commands-local', icon: 'CMD', title: 'Show Local commands', hint: 'Filter the command palette to Local workspace actions', run: () => openCommandPaletteQuery('Local') },
    { id: 'commands-layout', icon: 'CMD', title: 'Show Layout commands', hint: 'Filter the command palette to layout and editor view actions', run: () => openCommandPaletteQuery('Layout') },
    { id: 'commands-diagnostics', icon: 'CMD', title: 'Show Diagnostics commands', hint: 'Filter the command palette to memory, footprint, and runtime actions', run: () => openCommandPaletteQuery('Diagnostics') },
    { id: 'commands-theme', icon: 'CMD', title: 'Show Theme commands', hint: 'Filter the command palette to lightweight theme and appearance actions', run: () => openCommandPaletteQuery('Theme') },
    { id: 'commands-trash', icon: 'CMD', title: 'Show Trash commands', hint: 'Filter the command palette to local Trash, restore, cleanup, and report actions', run: () => openCommandPaletteQuery('Trash') },
    { id: 'command-guide', icon: 'CG', title: 'Command workflow guide', hint: 'Show categories, recents, bridges, and diagnostics in the command palette', run: showCommandWorkflowGuide },
    { id: 'local-first-guide', icon: 'LF', title: 'Local-first guide', hint: 'Show local storage, export, Trash, memory, and sync-later design notes', run: showLocalFirstGuide },
    { id: 'local-upgrade-map', icon: 'UP', title: 'Local upgrade map', hint: 'Show local-first feature coverage, footprint budget, and diagnostic shortcuts', run: showUpgradeMap },
    { id: 'copy-upgrade-map-md', icon: 'CUP', title: 'Copy Upgrade Map Markdown', hint: 'Copy local-first feature coverage and footprint budget as Markdown', run: copyUpgradeMapMarkdown },
    { id: 'export-upgrade-map-md', icon: 'EUP', title: 'Export Upgrade Map Markdown', hint: 'Download local-first feature coverage and footprint budget as Markdown', run: exportUpgradeMapMarkdown },
    { id: 'copy-upgrade-map-json', icon: 'CUJ', title: 'Copy Upgrade Map JSON', hint: 'Copy local-first feature coverage and footprint budget as JSON', run: copyUpgradeMapJson },
    { id: 'export-upgrade-map-json', icon: 'EUJ', title: 'Export Upgrade Map JSON', hint: 'Download local-first feature coverage and footprint budget as JSON', run: exportUpgradeMapJson },
    { id: 'copy-upgrade-map-csv', icon: 'CUC', title: 'Copy Upgrade Map CSV', hint: 'Copy local-first feature coverage and footprint budget as CSV', run: copyUpgradeMapCsv },
    { id: 'export-upgrade-map-csv', icon: 'EUC', title: 'Export Upgrade Map CSV', hint: 'Download local-first feature coverage and footprint budget as CSV', run: exportUpgradeMapCsv },
    { id: 'search', icon: '/', title: 'Search loaded files', hint: 'Search currently loaded documents', kbd: 'Ctrl+Shift+F', run: openSearchPalette },
    { id: 'search-loaded', icon: 'SL', title: 'Search loaded scope', hint: 'Open search limited to currently loaded files', run: () => openSearchPaletteScope('loaded') },
    { id: 'search-local', icon: 'SF', title: 'Search local folder scope', hint: 'Open search for the configured local folder', run: () => openSearchPaletteScope('local') },
    { id: 'search-all', icon: 'SA', title: 'Search all scope', hint: 'Open search across loaded files and the local folder', run: () => openSearchPaletteScope('all') },
    { id: 'search-markdown', icon: 'SM', title: 'Search Markdown files', hint: 'Open all-source search with type:md prefilled', run: () => openSearchPaletteQuery('all', 'type:md ') },
    { id: 'search-canvas-files', icon: 'SC', title: 'Search canvas files', hint: 'Open all-source search with type:canvas prefilled', run: () => openSearchPaletteQuery('all', 'type:canvas ') },
    { id: 'search-text-files', icon: 'ST', title: 'Search text files', hint: 'Open all-source search with type:txt prefilled', run: () => openSearchPaletteQuery('all', 'type:txt ') },
    { id: 'search-json-files', icon: 'SJ', title: 'Search JSON files', hint: 'Open all-source search with type:json prefilled', run: () => openSearchPaletteQuery('all', 'type:json ') },
    { id: 'search-pdf-files', icon: 'SP', title: 'Search PDF files', hint: 'Open all-source search with type:pdf prefilled', run: () => openSearchPaletteQuery('all', 'type:pdf ') },
    { id: 'search-image-files', icon: 'SI', title: 'Search image files', hint: 'Open all-source search with type:image prefilled', run: () => openSearchPaletteQuery('all', 'type:image ') },
    { id: 'search-title-filter', icon: 'STI', title: 'Search by title', hint: 'Open all-source search with title: prefilled', run: () => openSearchPaletteQuery('all', 'title:') },
    { id: 'search-path-filter', icon: 'SPA', title: 'Search by path', hint: 'Open all-source search with path: prefilled', run: () => openSearchPaletteQuery('all', 'path:') },
    { id: 'search-tag-filter', icon: '#', title: 'Search by tag', hint: 'Open all-source search with tag: prefilled', run: () => openSearchPaletteQuery('all', 'tag:') },
    { id: 'search-exclude-path-filter', icon: '-P', title: 'Search excluding path', hint: 'Open all-source search with -path: prefilled', run: () => openSearchPaletteQuery('all', '-path:') },
    { id: 'search-exclude-title-filter', icon: '-T', title: 'Search excluding title', hint: 'Open all-source search with -title: prefilled', run: () => openSearchPaletteQuery('all', '-title:') },
    { id: 'search-exclude-type-filter', icon: '-Y', title: 'Search excluding type', hint: 'Open all-source search with -type: prefilled', run: () => openSearchPaletteQuery('all', '-type:') },
    { id: 'search-exclude-tag-filter', icon: '-#', title: 'Search excluding tag', hint: 'Open all-source search with -tag: prefilled', run: () => openSearchPaletteQuery('all', '-tag:') },
    { id: 'search-exclude-archive', icon: '-A', title: 'Search outside archive', hint: 'Open all-source search excluding archive paths', run: () => openSearchPaletteQuery('all', '-path:archive ') },
    { id: 'search-exclude-done-tasks', icon: '-D', title: 'Search without completed tasks', hint: 'Open all-source search excluding task:done', run: () => openSearchPaletteQuery('all', '-task:done ') },
    { id: 'search-active-title', icon: 'SAT', title: 'Search active title everywhere', hint: 'Search loaded files and the local folder for the active title as an exact phrase', run: searchActiveTitleEverywhere },
    { id: 'search-active-path', icon: 'SAP', title: 'Search active path everywhere', hint: 'Search loaded files and the local folder for the active path as an exact phrase', run: searchActivePathEverywhere },
    { id: 'search-open-tasks', icon: 'SO', title: 'Search open tasks', hint: 'Open all-source search with task:open prefilled', run: () => openSearchPaletteQuery('all', 'task:open ') },
    { id: 'search-done-tasks', icon: 'SD', title: 'Search completed tasks', hint: 'Open all-source search with task:done prefilled', run: () => openSearchPaletteQuery('all', 'task:done ') },
    { id: 'search-selection-all', icon: 'SS', title: 'Search selection everywhere', hint: 'Search loaded files and the local folder for selected text as an exact phrase', run: searchSelectionEverywhere },
    { id: 'search-clipboard-all', icon: 'SCB', title: 'Search clipboard everywhere', hint: 'Search loaded files and the local folder for clipboard text as an exact phrase', run: searchClipboardEverywhere },
    { id: 'search-scope-loaded', icon: 'SL', title: 'Search scope: loaded files', hint: 'Search only files currently open in Markpad', run: () => setSearchScope('loaded') },
    { id: 'search-scope-local', icon: 'SF', title: 'Search scope: local folder', hint: 'Search the configured local folder without opening every file', run: () => setSearchScope('local') },
    { id: 'search-scope-all', icon: 'SA', title: 'Search scope: loaded + local', hint: 'Search open files and the configured local folder together', run: () => setSearchScope('all') },
    { id: 'search-syntax-help', icon: 'SH', title: 'Search syntax help', hint: 'Show phrases, wildcards, exclusions, and filter examples', run: showSearchSyntaxHelp },
    { id: 'clear-search-recents', icon: 'SR', title: 'Clear search recents', hint: 'Remove locally stored search palette recent queries', run: clearSearchRecents },
    { id: 'copy-search-recents', icon: 'CSR', title: 'Copy search recents', hint: 'Copy locally stored search palette recents as Markdown', run: copySearchRecentsMarkdown },
    { id: 'copy-search-recents-json', icon: 'CSJ', title: 'Copy search recents JSON', hint: 'Copy locally stored search palette recents as JSON', run: copySearchRecentsJson },
    { id: 'copy-search-recents-csv', icon: 'CSV', title: 'Copy search recents CSV', hint: 'Copy locally stored search palette recents as CSV', run: copySearchRecentsCsv },
    { id: 'export-search-recents', icon: 'ESR', title: 'Export search recents', hint: 'Download locally stored search palette recents as Markdown', run: exportSearchRecentsMarkdown },
    { id: 'export-search-recents-json', icon: 'ESJ', title: 'Export search recents JSON', hint: 'Download locally stored search palette recents as JSON', run: exportSearchRecentsJson },
    { id: 'export-search-recents-csv', icon: 'ESV', title: 'Export search recents CSV', hint: 'Download locally stored search palette recents as CSV', run: exportSearchRecentsCsv },
    { id: 'restore-search-recents-json', icon: 'RSJ', title: 'Restore search recents JSON', hint: 'Restore locally stored search palette recents from clipboard JSON', run: restoreSearchRecentsFromClipboard },
    { id: 'clear-command-recents', icon: 'CR', title: 'Clear command recents', hint: 'Remove locally stored command palette recent actions', run: clearCommandRecents },
    { id: 'clear-palette-recents', icon: 'CPR', title: 'Clear palette recents', hint: 'Remove locally stored search and command palette recents', run: clearPaletteRecents },
    { id: 'copy-command-recents', icon: 'CCR', title: 'Copy command recents', hint: 'Copy locally stored command palette recents as Markdown', run: copyCommandRecentsMarkdown },
    { id: 'copy-command-recents-json', icon: 'CCJ', title: 'Copy command recents JSON', hint: 'Copy locally stored command palette recents as JSON', run: copyCommandRecentsJson },
    { id: 'copy-command-recents-csv', icon: 'CCV', title: 'Copy command recents CSV', hint: 'Copy locally stored command palette recents as CSV', run: copyCommandRecentsCsv },
    { id: 'export-command-recents', icon: 'ECR', title: 'Export command recents', hint: 'Download locally stored command palette recents as Markdown', run: exportCommandRecentsMarkdown },
    { id: 'export-command-recents-json', icon: 'ECJ', title: 'Export command recents JSON', hint: 'Download locally stored command palette recents as JSON', run: exportCommandRecentsJson },
    { id: 'export-command-recents-csv', icon: 'ECV', title: 'Export command recents CSV', hint: 'Download locally stored command palette recents as CSV', run: exportCommandRecentsCsv },
    { id: 'restore-command-recents-json', icon: 'RCJ', title: 'Restore command recents JSON', hint: 'Restore locally stored command palette recents from clipboard JSON', run: restoreCommandRecentsFromClipboard },
    { id: 'copy-search-results', icon: 'CS', title: 'Copy search results Markdown', hint: 'Copy the current search result list as Markdown links and snippets', run: copySearchResultsMarkdown },
    { id: 'export-search-results', icon: 'ES', title: 'Export search results Markdown', hint: 'Download the current search result list as a Markdown report', run: exportSearchResultsMarkdown },
    { id: 'copy-search-results-json', icon: 'CJ', title: 'Copy search results JSON', hint: 'Copy the current search result list as portable JSON', run: copySearchResultsJson },
    { id: 'export-search-results-json', icon: 'EJ', title: 'Export search results JSON', hint: 'Download the current search result list as portable JSON', run: exportSearchResultsJson },
    { id: 'copy-search-results-csv', icon: 'CCSV', title: 'Copy search results CSV', hint: 'Copy the current search result list as CSV rows', run: copySearchResultsCsv },
    { id: 'export-search-results-csv', icon: 'ECSV', title: 'Export search results CSV', hint: 'Download the current search result list as CSV rows', run: exportSearchResultsCsv },
    { id: 'copy-search-result-paths', icon: 'CP', title: 'Copy search result paths', hint: 'Copy current search result paths and line numbers as plain text', run: copySearchResultPaths },
    { id: 'search-results-to-canvas', icon: 'S2C', title: 'Send search results to canvas', hint: 'Append the current search results as a lightweight local canvas board', run: insertSearchResultsCanvasBoard },
    { id: 'search-open-active-result', icon: 'OAR', title: 'Open active search result', hint: 'Open the highlighted search result from the latest search palette state', run: openActiveSearchResult },
    { id: 'search-copy-active-path', icon: 'CAP', title: 'Copy active search result path', hint: 'Copy the highlighted search result path and line number', run: copyActiveSearchResultPath },
    { id: 'search-copy-active-result', icon: 'CAR', title: 'Copy active search result', hint: 'Copy the highlighted search result as a Markdown reference', run: copyActiveSearchResultMarkdown },
    { id: 'search-copy-active-result-json', icon: 'CAJ', title: 'Copy active search result JSON', hint: 'Copy the highlighted search result as portable JSON', run: copyActiveSearchResultJson },
    { id: 'search-copy-active-result-csv', icon: 'CAC', title: 'Copy active search result CSV', hint: 'Copy the highlighted search result as one CSV row', run: copyActiveSearchResultCsv },
    { id: 'search-export-active-result', icon: 'EAR', title: 'Export active search result', hint: 'Download the highlighted search result as Markdown', run: exportActiveSearchResultMarkdown },
    { id: 'search-export-active-result-json', icon: 'EAJ', title: 'Export active search result JSON', hint: 'Download the highlighted search result as JSON', run: exportActiveSearchResultJson },
    { id: 'search-export-active-result-csv', icon: 'EAC', title: 'Export active search result CSV', hint: 'Download the highlighted search result as CSV', run: exportActiveSearchResultCsv },
    { id: 'search-profile', icon: 'SP', title: 'Search profile', hint: 'Show current query operators, result sources, cache footprint, and index readiness', run: showSearchProfile },
    { id: 'copy-search-profile', icon: 'SPM', title: 'Copy search profile Markdown', hint: 'Copy current search diagnostics as Markdown', run: copySearchProfileMarkdown },
    { id: 'export-search-profile', icon: 'SPE', title: 'Export search profile Markdown', hint: 'Download current search diagnostics as Markdown', run: exportSearchProfileMarkdown },
    { id: 'copy-search-profile-json', icon: 'SPJ', title: 'Copy search profile JSON', hint: 'Copy current search diagnostics as JSON', run: copySearchProfileJson },
    { id: 'export-search-profile-json', icon: 'SEJ', title: 'Export search profile JSON', hint: 'Download current search diagnostics as JSON', run: exportSearchProfileJson },
    { id: 'copy-search-query', icon: 'CQ', title: 'Copy search query', hint: 'Copy the current search query, scope, and result count as Markdown', run: copySearchQuerySummary },
    { id: 'search-query-inspector', icon: 'SQI', title: 'Search query inspector', hint: 'Show parsed search terms, filters, exclusions, wildcards, fuzzy terms, and backend anchor query', run: showSearchQueryInspector },
    { id: 'find', icon: 'F', title: 'Find in current file', hint: 'Open inline find bar', kbd: 'Ctrl+F', run: toggleFind },
    { id: 'find-selection', icon: 'FS', title: 'Find selection in current file', hint: 'Search the active editor for the selected text', run: findSelectionInCurrentFile },
    { id: 'find-from-top', icon: 'FT', title: 'Find from top', hint: 'Restart the current inline find from the start of the file', run: findFromTop },
    { id: 'find-clear', icon: 'FC', title: 'Clear current find', hint: 'Clear the inline find query without closing the editor', run: clearCurrentFind },
    { id: 'search-help', icon: '?', title: 'Search syntax help', hint: 'Show local search operators, phrase search, and task filters', run: showSearchSyntaxHelp },
    { id: 'search-limits', icon: 'SLM', title: 'Local search limits', hint: 'Show the RAM-safe local folder search rules and skipped paths', run: showLocalSearchLimits },
    { id: 'low-memory-guide', icon: 'LM', title: 'Low-memory guide', hint: 'Show runtime, footprint, undo/search-cache cleanup, compact preset, and bounded canvas map notes', run: showLowMemoryGuide },
    { id: 'memory-cleanup-report', icon: 'MCR', title: 'Memory cleanup + footprint', hint: 'Apply low-memory preset, release undo/search cache, and open the local footprint report', run: runMemoryCleanupReport },
    { id: 'runtime-stats', icon: 'RAM', title: 'Runtime stats', hint: 'Show Go heap, process RSS, goroutines, and uptime', run: showRuntimeStats },
    { id: 'asset-report', icon: 'AS', title: 'Lightweight asset report', hint: 'Show current DOM image, inline SVG, canvas, and theme counts', run: showLightweightAssetReport },
    { id: 'copy-asset-report-json', icon: 'ASJ', title: 'Copy asset report JSON', hint: 'Copy lightweight asset counts and strategy as JSON', run: copyLightweightAssetReportJson },
    { id: 'export-asset-report-json', icon: 'AEJ', title: 'Export asset report JSON', hint: 'Download lightweight asset counts and strategy as JSON', run: exportLightweightAssetReportJson },
    { id: 'copy-asset-report-md', icon: 'ASM', title: 'Copy asset report Markdown', hint: 'Copy lightweight asset counts and strategy as Markdown', run: copyLightweightAssetReportMarkdown },
    { id: 'export-asset-report-md', icon: 'AEM', title: 'Export asset report Markdown', hint: 'Download lightweight asset counts and strategy as Markdown', run: exportLightweightAssetReportMarkdown },
    { id: 'copy-runtime-stats', icon: 'CR', title: 'Copy runtime stats', hint: 'Copy memory, binary size, goroutine, and uptime stats as text', run: copyRuntimeStats },
    { id: 'export-runtime-stats-text', icon: 'ERT', title: 'Export runtime stats text', hint: 'Download memory, binary size, goroutine, and uptime stats as plain text', run: exportRuntimeStatsText },
    { id: 'copy-runtime-stats-json', icon: 'CRJ', title: 'Copy runtime stats JSON', hint: 'Copy memory, binary size, goroutine, and uptime stats as JSON', run: copyRuntimeStatsJson },
    { id: 'export-runtime-stats-json', icon: 'ERJ', title: 'Export runtime stats JSON', hint: 'Download memory, binary size, goroutine, and uptime stats as JSON', run: exportRuntimeStatsJson },
    { id: 'copy-runtime-stats-md', icon: 'CRM', title: 'Copy runtime stats Markdown', hint: 'Copy memory, binary size, goroutine, and uptime stats as Markdown', run: copyRuntimeStatsMarkdown },
    { id: 'export-runtime-stats-md', icon: 'ERM', title: 'Export runtime stats Markdown', hint: 'Download memory, binary size, goroutine, and uptime stats as Markdown', run: exportRuntimeStatsMarkdown },
    { id: 'copy-runtime-stats-csv', icon: 'RCSV', title: 'Copy runtime stats CSV', hint: 'Copy memory, binary size, goroutine, and uptime stats as CSV', run: copyRuntimeStatsCsv },
    { id: 'export-runtime-stats-csv', icon: 'ERSV', title: 'Export runtime stats CSV', hint: 'Download memory, binary size, goroutine, and uptime stats as CSV', run: exportRuntimeStatsCsv },
    { id: 'clear-editor-undo-history', icon: 'EU', title: 'Clear editor undo history', hint: 'Release in-memory editor undo snapshots for open documents', run: clearEditorUndoHistory },
    { id: 'clear-all-undo-history', icon: 'AU', title: 'Clear all undo histories', hint: 'Release editor and canvas undo snapshots to reduce memory pressure', run: clearAllUndoHistories },
    { id: 'outline', icon: 'TOC', title: 'Document outline', hint: 'Jump to Markdown headings in the active document', run: showDocumentOutline },
    { id: 'copy-outline-md', icon: 'CO', title: 'Copy outline Markdown', hint: 'Copy the active document heading outline as Markdown links', run: copyDocumentOutlineMarkdown },
    { id: 'canvas-document-map', icon: 'O2C', title: 'Send document outline to canvas', hint: 'Append active Markdown headings as a lightweight canvas hierarchy map', run: insertDocumentOutlineCanvasMap },
    { id: 'tasks', icon: 'T', title: 'Tasks', hint: 'List, calendar, and kanban from loaded Markdown tasks', run: () => showTasksView() },
    { id: 'tasks-list', icon: 'TL', title: 'Tasks list view', hint: 'Open Markdown tasks as a sortable list', run: () => showTasksView('list') },
    { id: 'tasks-calendar', icon: 'TC', title: 'Tasks calendar view', hint: 'Open Markdown tasks grouped by due date', run: () => showTasksView('calendar') },
    { id: 'tasks-kanban', icon: 'TK', title: 'Tasks kanban view', hint: 'Open Markdown tasks as a priority-grouped board', run: () => showTasksView('kanban') },
  { id: 'tasks-agenda', icon: 'TAG', title: 'Task agenda', hint: 'Show overdue, due today, waiting, and high-priority Markdown tasks', run: showTaskAgenda },
  { id: 'tasks-agenda-copy', icon: 'MD', title: 'Copy task agenda as Markdown', hint: 'Copy the current Markdown-derived agenda for use outside Markpad', run: copyTaskAgendaMarkdown },
  { id: 'tasks-agenda-copy-json', icon: 'AJ', title: 'Copy task agenda JSON', hint: 'Copy the current Markdown-derived agenda as structured JSON', run: copyTaskAgendaJson },
  { id: 'tasks-agenda-copy-csv', icon: 'AC', title: 'Copy task agenda CSV', hint: 'Copy the current Markdown-derived agenda as CSV rows', run: copyTaskAgendaCsv },
  { id: 'tasks-agenda-copy-ics', icon: 'AIC', title: 'Copy task agenda ICS', hint: 'Copy agenda tasks as portable calendar todos', run: copyTaskAgendaIcs },
  { id: 'tasks-agenda-copy-todo', icon: 'ATX', title: 'Copy task agenda Todo.txt', hint: 'Copy agenda tasks as portable Todo.txt lines', run: copyTaskAgendaTodoTxt },
  { id: 'tasks-agenda-export', icon: 'TMD', title: 'Export task agenda as Markdown', hint: 'Download the current Markdown-derived agenda as a portable file', run: exportTaskAgendaMarkdown },
  { id: 'tasks-agenda-export-json', icon: 'EAJ', title: 'Export task agenda JSON', hint: 'Download the current Markdown-derived agenda as structured JSON', run: exportTaskAgendaJson },
  { id: 'tasks-agenda-export-csv', icon: 'EAC', title: 'Export task agenda CSV', hint: 'Download the current Markdown-derived agenda as CSV rows', run: exportTaskAgendaCsv },
  { id: 'tasks-agenda-export-ics', icon: 'EAI', title: 'Export task agenda ICS', hint: 'Download agenda tasks as portable calendar todos', run: exportTaskAgendaIcs },
  { id: 'tasks-agenda-export-todo', icon: 'EAT', title: 'Export task agenda Todo.txt', hint: 'Download agenda tasks as portable Todo.txt lines', run: exportTaskAgendaTodoTxt },
  { id: 'search-cache-clear', icon: 'RAM', title: 'Clear loaded search cache', hint: 'Release cached loaded-note text used by search', run: clearLoadedSearchCacheAction },
  { id: 'search-performance-guide', icon: 'SPG', title: 'Search performance guide', hint: 'Explain loaded search, cache caps, footprint metrics, and the local-first index path', run: showSearchPerformanceGuide },
  { id: 'search-profile-open', icon: 'SP', title: 'Search profile', hint: 'Show query operators, result sources, cache footprint, and index readiness', run: showSearchProfile },
  { id: 'workspace-search-plan', icon: 'WSP', title: 'Workspace search plan', hint: 'Show bounded worker, cancellation, diagnostics, and optional-index design notes', run: showWorkspaceSearchPlan },
  { id: 'search-current-file', icon: 'CFS', title: 'Search current file', hint: 'Show all exact matches in the active editor buffer with line and column jumps', run: () => showCurrentFileSearch() },
  { id: 'current-file-search-to-canvas', icon: 'F2C', title: 'Send current-file search to canvas', hint: 'Create a lightweight canvas board from active-file search matches', run: () => insertCurrentFileSearchCanvasBoard() },
  { id: 'copy-current-file-search-json', icon: 'CFJ', title: 'Copy current-file search JSON', hint: 'Copy the current active-file search report as structured JSON', run: () => copyCurrentFileSearchJson() },
  { id: 'copy-current-file-search-csv', icon: 'CFC', title: 'Copy current-file search CSV', hint: 'Copy the current active-file search report as CSV rows', run: () => copyCurrentFileSearchCsv() },
  { id: 'export-current-file-search-md', icon: 'FSM', title: 'Export current-file search Markdown', hint: 'Download the current active-file search report as Markdown', run: () => exportCurrentFileSearchMarkdown() },
  { id: 'export-current-file-search-json', icon: 'FSJ', title: 'Export current-file search JSON', hint: 'Download the current active-file search report as structured JSON', run: () => exportCurrentFileSearchJson() },
  { id: 'export-current-file-search-csv', icon: 'FSC', title: 'Export current-file search CSV', hint: 'Download the current active-file search report as CSV rows', run: () => exportCurrentFileSearchCsv() },
    { id: 'tasks-format-guide', icon: 'TFG', title: 'Task format guide', hint: 'Show the portable Markdown task contract and export formats', run: showTaskSyntaxHelp },
    { id: 'tasks-syntax-help', icon: 'TSH', title: 'Task syntax help', hint: 'Show Markdown task tokens for due dates, priority, waiting, and tags', run: showTaskSyntaxHelp },
    { id: 'tasks-preset-today-calendar', icon: 'TDC', title: 'Task preset: today calendar', hint: 'Show today\\'s tasks in calendar view across all sources', run: () => showTasksPreset({ view: 'calendar', source: 'all', filter: 'all', query: 'due:today' }) },
    { id: 'tasks-preset-open-kanban', icon: 'TOK', title: 'Task preset: open kanban', hint: 'Show open tasks as a kanban board across all sources', run: () => showTasksPreset({ view: 'kanban', source: 'all', filter: 'open', query: '' }) },
    { id: 'tasks-preset-local-kanban', icon: 'TLK', title: 'Task preset: local kanban', hint: 'Show open local-folder tasks as a kanban board', run: () => showTasksPreset({ view: 'kanban', source: 'local', filter: 'open', query: '' }) },
    { id: 'tasks-preset-waiting-list', icon: 'TWL', title: 'Task preset: waiting list', hint: 'Show waiting tasks in list view across all sources', run: () => showTasksPreset({ view: 'list', source: 'all', filter: 'waiting', query: '' }) },
    { id: 'tasks-preset-overdue-list', icon: 'TOL', title: 'Task preset: overdue list', hint: 'Show overdue tasks in list view across all sources', run: () => showTasksPreset({ view: 'list', source: 'all', filter: 'overdue', query: '' }) },
    { id: 'tasks-preset-high-kanban', icon: 'THK', title: 'Task preset: high-priority kanban', hint: 'Show high-priority tasks as a kanban board', run: () => showTasksPreset({ view: 'kanban', source: 'all', filter: 'high', query: '' }) },
    { id: 'tasks-source-all', icon: 'TSA', title: 'Tasks all sources', hint: 'Show loaded and local Markdown tasks together', run: () => showTasksForSource('all') },
    { id: 'tasks-source-loaded', icon: 'TSL', title: 'Tasks loaded source', hint: 'Show tasks from currently loaded documents only', run: () => showTasksForSource('loaded') },
    { id: 'tasks-source-local', icon: 'TSF', title: 'Tasks local source', hint: 'Show tasks from the configured local folder only', run: () => showTasksForSource('local') },
    { id: 'tasks-open', icon: 'TOP', title: 'Open tasks', hint: 'Show unchecked Markdown tasks in the current task view', run: () => showTasksForFilter('open') },
    { id: 'tasks-done-filter', icon: 'TDN', title: 'Completed tasks', hint: 'Show checked Markdown tasks in the current task view', run: () => showTasksForFilter('done') },
    { id: 'tasks-due-today', icon: 'TD', title: 'Tasks due today', hint: 'Filter tasks with due:today', run: () => showTasksForQuery('due:today') },
    { id: 'tasks-due-tomorrow', icon: 'TT', title: 'Tasks due tomorrow', hint: 'Filter tasks with due:tomorrow', run: () => showTasksForQuery('due:tomorrow') },
    { id: 'tasks-due-week', icon: 'TWK', title: 'Tasks due this week', hint: 'Filter tasks due within the next 7 days', run: () => showTasksForQuery('due:week') },
    { id: 'tasks-unscheduled', icon: 'TND', title: 'Tasks without due date', hint: 'Filter tasks with no due date token', run: () => showTasksForQuery('due:none') },
    { id: 'tasks-overdue', icon: 'TO', title: 'Overdue tasks', hint: 'Filter tasks with due:overdue', run: () => showTasksForQuery('due:overdue') },
    { id: 'tasks-high-priority', icon: 'TH', title: 'High priority tasks', hint: 'Filter tasks with !high', run: () => showTasksForQuery('!high') },
    { id: 'tasks-medium-priority', icon: 'TM', title: 'Medium priority tasks', hint: 'Filter tasks with !medium', run: () => showTasksForQuery('!medium') },
    { id: 'tasks-low-priority', icon: 'TLW', title: 'Low priority tasks', hint: 'Filter tasks with !low', run: () => showTasksForQuery('!low') },
    { id: 'tasks-waiting', icon: 'TW', title: 'Waiting tasks', hint: 'Filter tasks tagged with @waiting', run: () => showTasksForQuery('@waiting') },
    { id: 'tasks-not-waiting', icon: 'TNW', title: 'Tasks not waiting', hint: 'Filter out tasks tagged with @waiting', run: () => showTasksForQuery('-@waiting') },
    { id: 'tasks-clear-query', icon: 'T0', title: 'Clear task query', hint: 'Clear the task text and operator filter', run: () => showTasksForQuery('') },
    { id: 'tasks-reset-filters', icon: 'TRF', title: 'Reset task filters', hint: 'Show all task sources, filters, and queries again', run: resetTaskViewFilters },
    { id: 'add-task', icon: '+T', title: 'Add task', hint: 'Append a Markdown task to Tasks.md or a Tasks draft', run: addQuickTask },
    { id: 'add-task-today', icon: '+D', title: 'Add task due today', hint: 'Append a Markdown task tagged with today\\'s due date', run: () => addTaskTemplate(`due:${todayKey()}`) },
    { id: 'add-task-tomorrow', icon: '+M', title: 'Add task due tomorrow', hint: 'Append a Markdown task tagged with tomorrow\\'s due date', run: () => addTaskTemplate(`due:${tomorrowKey()}`) },
    { id: 'add-task-high-today', icon: '+HT', title: 'Add high priority task due today', hint: 'Append a Markdown task tagged !high and due today', run: () => addTaskTemplate(`!high due:${todayKey()}`) },
    { id: 'add-task-high', icon: '+H', title: 'Add high priority task', hint: 'Append a Markdown task with !high priority', run: () => addTaskTemplate('!high') },
    { id: 'add-task-medium', icon: '+ME', title: 'Add medium priority task', hint: 'Append a Markdown task with !medium priority', run: () => addTaskTemplate('!medium') },
    { id: 'add-task-low', icon: '+L', title: 'Add low priority task', hint: 'Append a Markdown task with !low priority', run: () => addTaskTemplate('!low') },
    { id: 'add-task-waiting', icon: '+W', title: 'Add waiting task', hint: 'Append a Markdown task with @waiting context', run: () => addTaskTemplate('@waiting') },
    { id: 'add-task-high-waiting', icon: '+HW', title: 'Add high waiting task', hint: 'Append a Markdown task tagged !high and @waiting', run: () => addTaskTemplate('!high @waiting') },
    { id: 'task-file-setup', icon: 'TFS', title: 'Task file setup', hint: 'Create or use a contained portable Tasks.md workflow', run: showTaskFileSetup },
    { id: 'tasks-starter-inbox', icon: 'TSI', title: 'Task starter: inbox', hint: 'Create or append a portable Markdown inbox task file starter', run: () => addTaskStarterTemplate('inbox', 'Inbox') },
    { id: 'tasks-starter-project', icon: 'TSP', title: 'Task starter: project kickoff', hint: 'Append a portable Markdown project kickoff checklist', run: () => addTaskStarterTemplate('project', 'Project kickoff') },
    { id: 'tasks-starter-weekly', icon: 'TSW', title: 'Task starter: weekly plan', hint: 'Append a portable Markdown weekly planning checklist', run: () => addTaskStarterTemplate('weekly', 'Weekly plan') },
    { id: 'tasks-starter-review', icon: 'TSR', title: 'Task starter: review queue', hint: 'Append a portable Markdown review checklist', run: () => addTaskStarterTemplate('review', 'Review queue') },
    { id: 'tasks-copy-source-md', icon: 'CSM', title: 'Copy task source Markdown', hint: 'Copy visible tasks as a clean editable tasks.md source file', run: copyVisibleTasksSourceMarkdown },
    { id: 'tasks-export-source-md', icon: 'ESM', title: 'Export task source Markdown', hint: 'Download visible tasks as a clean editable tasks.md source file', run: exportTasksSourceMarkdown },
    { id: 'tasks-copy-starter-md', icon: 'CSF', title: 'Copy tasks.md starter', hint: 'Copy a portable Markdown task-file starter', run: copyTaskFileStarterMarkdown },
    { id: 'tasks-export-starter-md', icon: 'ESF', title: 'Export tasks.md starter', hint: 'Download a portable Markdown task-file starter', run: exportTaskFileStarterMarkdown },
    { id: 'tasks-source-profile', icon: 'TSP', title: 'Task source profile', hint: 'Show task source counts, filters, due buckets, and portable export readiness', run: showTaskSourceProfile },
    { id: 'tasks-copy-source-profile', icon: 'TDM', title: 'Copy task source profile', hint: 'Copy task source diagnostics as Markdown', run: copyTaskSourceProfileMarkdown },
    { id: 'tasks-export-source-profile', icon: 'TEM', title: 'Export task source profile', hint: 'Download task source diagnostics as Markdown', run: exportTaskSourceProfileMarkdown },
    { id: 'tasks-export-source-profile-json', icon: 'TEJ', title: 'Export task source profile JSON', hint: 'Download task source diagnostics as JSON', run: exportTaskSourceProfileJson },
    { id: 'tasks-to-canvas', icon: 'T2C', title: 'Send visible tasks to canvas', hint: 'Append the current filtered task view as a lightweight canvas board', run: insertVisibleTasksCanvasBoard },
    { id: 'task-agenda-to-canvas', icon: 'A2C', title: 'Send task agenda to canvas', hint: 'Append overdue, today, waiting, and high-priority tasks as a lightweight canvas board', run: insertTaskAgendaCanvasBoard },
    { id: 'tasks-to-canvas-guide', icon: 'TCG', title: 'Task canvas guide', hint: 'Explain task-to-canvas filters, 24-task cap, local JSON cards, and Markdown source of truth', run: showTaskCanvasGuide },
    { id: 'export-tasks-ics', icon: 'ICS', title: 'Export tasks ICS', hint: 'Download Markdown tasks as a portable calendar todo file', run: exportTasksIcs },
    { id: 'copy-tasks-ics', icon: 'CIC', title: 'Copy visible tasks ICS', hint: 'Copy the current filtered task view as portable calendar text', run: copyVisibleTasksIcs },
    { id: 'export-tasks-md', icon: 'MDT', title: 'Export visible tasks Markdown', hint: 'Download the current filtered task view as portable Markdown', run: exportTasksMarkdown },
    { id: 'copy-tasks-md', icon: 'CT', title: 'Copy visible tasks Markdown', hint: 'Copy the current filtered task view as Markdown text', run: copyVisibleTasksMarkdown },
    { id: 'export-tasks-json', icon: 'JT', title: 'Export visible tasks JSON', hint: 'Download the current filtered task view as portable JSON', run: exportTasksJson },
    { id: 'copy-tasks-json', icon: 'CJ', title: 'Copy visible tasks JSON', hint: 'Copy the current filtered task view as portable JSON', run: copyVisibleTasksJson },
    { id: 'export-tasks-csv', icon: 'TCV', title: 'Export visible tasks CSV', hint: 'Download the current filtered task view as CSV rows', run: exportTasksCsv },
    { id: 'copy-tasks-csv', icon: 'CCV', title: 'Copy visible tasks CSV', hint: 'Copy the current filtered task view as CSV rows', run: copyVisibleTasksCsv },
    { id: 'export-tasks-todo', icon: 'TTX', title: 'Export visible tasks Todo.txt', hint: 'Download the current filtered task view as portable Todo.txt', run: exportTasksTodoTxt },
    { id: 'copy-tasks-todo', icon: 'CTT', title: 'Copy visible tasks Todo.txt', hint: 'Copy the current filtered task view as portable Todo.txt', run: copyVisibleTasksTodoTxt },
    { id: 'copy-task-view-summary', icon: 'CTS', title: 'Copy task view summary', hint: 'Copy current task view filters and counts as Markdown', run: copyTaskViewSummary },
    { id: 'copy-task-view-summary-json', icon: 'CTJ', title: 'Copy task view summary JSON', hint: 'Copy current task view filters and counts as portable JSON', run: copyTaskViewSummaryJson },
    { id: 'copy-task-view-summary-csv', icon: 'CTV', title: 'Copy task view summary CSV', hint: 'Copy current task view filters and counts as one CSV row', run: copyTaskViewSummaryCsv },
    { id: 'export-task-view-summary', icon: 'ETS', title: 'Export task view summary', hint: 'Download current task view filters and counts as Markdown', run: exportTaskViewSummaryMarkdown },
    { id: 'export-task-view-summary-json', icon: 'ETJ', title: 'Export task view summary JSON', hint: 'Download current task view filters and counts as JSON', run: exportTaskViewSummaryJson },
    { id: 'export-task-view-summary-csv', icon: 'ETV', title: 'Export task view summary CSV', hint: 'Download current task view filters and counts as CSV', run: exportTaskViewSummaryCsv },
    { id: 'trash', icon: 'X', title: 'Trash', hint: 'Restore deleted drafts kept for 30 days', run: showTrashView },
    { id: 'trash-retention-audit', icon: 'TA', title: 'Trash retention audit', hint: 'Show retained items, expiry buckets, size, and next cleanup date', run: showTrashRetentionAudit },
    { id: 'trash-cleanup-profile', icon: 'TCP', title: 'Trash cleanup profile', hint: 'Show expired candidates, retained bytes, backend cleanup support, and safe cleanup paths', run: showTrashCleanupProfile },
    { id: 'copy-trash-cleanup-profile', icon: 'TCM', title: 'Copy Trash cleanup profile', hint: 'Copy local Trash cleanup readiness as Markdown', run: copyTrashCleanupProfileMarkdown },
    { id: 'export-trash-cleanup-profile', icon: 'TEM', title: 'Export Trash cleanup profile', hint: 'Download local Trash cleanup readiness as Markdown', run: exportTrashCleanupProfileMarkdown },
    { id: 'trash-guide', icon: 'TG', title: 'Trash guide', hint: 'Show retention, restore, cleanup, and report behavior for local Trash', run: showTrashGuide },
    { id: 'copy-trash-report', icon: 'CTR', title: 'Copy Trash report', hint: 'Copy retained Trash items and expiry dates as Markdown', run: copyTrashReportMarkdown },
    { id: 'export-trash-report', icon: 'ETR', title: 'Export Trash report', hint: 'Download retained Trash items and expiry dates as Markdown', run: exportTrashReportMarkdown },
    { id: 'copy-trash-report-csv', icon: 'CTC', title: 'Copy Trash report CSV', hint: 'Copy retained Trash items and expiry dates as CSV rows', run: copyTrashReportCsv },
    { id: 'export-trash-report-csv', icon: 'ETC', title: 'Export Trash report CSV', hint: 'Download retained Trash items and expiry dates as CSV rows', run: exportTrashReportCsv },
    { id: 'copy-trash-report-json', icon: 'CTJ', title: 'Copy Trash report JSON', hint: 'Copy retained Trash items and expiry dates as metadata JSON', run: copyTrashReportJson },
    { id: 'export-trash-report-json', icon: 'ETJ', title: 'Export Trash report JSON', hint: 'Download retained Trash items and expiry dates as metadata JSON', run: exportTrashReportJson },
    { id: 'trash-clean-expired', icon: 'TX', title: 'Clean expired Trash', hint: 'Permanently remove draft and file trash older than 30 days', run: cleanupExpiredTrash },
    { id: 'canvas', icon: 'C', title: 'Canvas draft', hint: 'Open the local infinite canvas draft', run: openCanvas },
    { id: 'canvas-guide', icon: 'CGD', title: 'Canvas guide', hint: 'Show tools, local formats, exports, view state, and memory notes', run: showCanvasHelp },
    { id: 'canvas-shortcuts-guide', icon: 'CSG', title: 'Canvas shortcuts guide', hint: 'Show canvas copy, duplicate, nudge, undo, redo, and delete shortcuts', run: showCanvasShortcutsGuide },
    { id: 'canvas-map-guide', icon: 'CMG', title: 'Canvas map guide', hint: 'Show task, search, outline, workspace, and backlink canvas bridge limits', run: showCanvasMapGuide },
    { id: 'canvas-select', icon: 'CS', title: 'Canvas select tool', hint: 'Select and move existing canvas elements', run: () => { openCanvas(); setCanvasTool('select'); } },
    { id: 'canvas-pan-tool', icon: 'CPN', title: 'Canvas pan tool', hint: 'Move around the infinite canvas without editing elements', run: () => { openCanvas(); setCanvasTool('pan'); } },
    { id: 'canvas-pen-tool', icon: 'PEN', title: 'Canvas pen tool', hint: 'Draw freehand paths on the canvas', run: () => { openCanvas(); setCanvasTool('pen'); } },
    { id: 'canvas-text-tool', icon: 'TXT', title: 'Canvas text tool', hint: 'Place or edit canvas text', run: () => { openCanvas(); setCanvasTool('text'); } },
    { id: 'canvas-sticky-tool', icon: 'STK', title: 'Canvas sticky note tool', hint: 'Place a local sticky note card and edit its text immediately', run: () => { openCanvas(); setCanvasTool('sticky'); } },
    { id: 'canvas-sticky-yellow', icon: 'SNY', title: 'Canvas sticky: yellow', hint: 'Use a warm yellow sticky note preset', run: () => setCanvasStickyPreset('#8a6f00', 'yellow') },
    { id: 'canvas-sticky-blue', icon: 'SNB', title: 'Canvas sticky: blue', hint: 'Use a cool blue sticky note preset', run: () => setCanvasStickyPreset('#2563eb', 'blue') },
    { id: 'canvas-sticky-green', icon: 'SNG', title: 'Canvas sticky: green', hint: 'Use a green sticky note preset', run: () => setCanvasStickyPreset('#16a34a', 'green') },
    { id: 'canvas-sticky-red', icon: 'SNR', title: 'Canvas sticky: red', hint: 'Use a red sticky note preset', run: () => setCanvasStickyPreset('#dc2626', 'red') },
    { id: 'canvas-rect-tool', icon: 'BOX', title: 'Canvas rectangle tool', hint: 'Draw lightweight rectangle shapes', run: () => { openCanvas(); setCanvasTool('rect'); } },
    { id: 'canvas-ellipse-tool', icon: 'ELL', title: 'Canvas ellipse tool', hint: 'Draw lightweight ellipse shapes', run: () => { openCanvas(); setCanvasTool('ellipse'); } },
    { id: 'canvas-line-tool', icon: 'LIN', title: 'Canvas line tool', hint: 'Draw straight line connectors', run: () => { openCanvas(); setCanvasTool('line'); } },
    { id: 'canvas-arrow-tool', icon: 'ARR', title: 'Canvas arrow tool', hint: 'Draw arrow connectors', run: () => { openCanvas(); setCanvasTool('arrow'); } },
    { id: 'canvas-erase-tool', icon: 'ERS', title: 'Canvas erase tool', hint: 'Remove clicked canvas elements', run: () => { openCanvas(); setCanvasTool('erase'); } },
    { id: 'canvas-color-ink', icon: 'CIK', title: 'Canvas stroke ink', hint: 'Use a neutral ink stroke for new or selected canvas elements', run: () => setCanvasStrokePreset('#1f2937', 'ink') },
    { id: 'canvas-color-red', icon: 'CRD', title: 'Canvas stroke red', hint: 'Use a clear red stroke for emphasis', run: () => setCanvasStrokePreset('#dc2626', 'red') },
    { id: 'canvas-color-blue', icon: 'CBL', title: 'Canvas stroke blue', hint: 'Use a blue stroke for structure and links', run: () => setCanvasStrokePreset('#2563eb', 'blue') },
    { id: 'canvas-color-green', icon: 'CGR', title: 'Canvas stroke green', hint: 'Use a green stroke for done or positive states', run: () => setCanvasStrokePreset('#16a34a', 'green') },
    { id: 'canvas-color-amber', icon: 'CAM', title: 'Canvas stroke amber', hint: 'Use an amber stroke for warnings and active ideas', run: () => setCanvasStrokePreset('#d97706', 'amber') },
    { id: 'canvas-width-fine', icon: 'W1', title: 'Canvas stroke fine', hint: 'Use a 1px stroke for details and connectors', run: () => setCanvasStrokeWidthPreset(1) },
    { id: 'canvas-width-normal', icon: 'W3', title: 'Canvas stroke normal', hint: 'Use a 3px stroke for general drawing', run: () => setCanvasStrokeWidthPreset(3) },
    { id: 'canvas-width-bold', icon: 'W6', title: 'Canvas stroke bold', hint: 'Use a 6px stroke for emphasis', run: () => setCanvasStrokeWidthPreset(6) },
    { id: 'canvas-width-heavy', icon: 'W9', title: 'Canvas stroke heavy', hint: 'Use a 9px stroke for strong emphasis', run: () => setCanvasStrokeWidthPreset(9) },
    { id: 'canvas-preset-sketch', icon: 'SK', title: 'Canvas preset: sketch', hint: 'Pen tool with neutral ink and normal stroke width', run: () => applyCanvasDrawingPreset('pen', '#1f2937', 3, 'sketch') },
    { id: 'canvas-preset-connector', icon: 'CN', title: 'Canvas preset: connector', hint: 'Arrow tool with blue stroke for linking ideas', run: () => applyCanvasDrawingPreset('arrow', '#2563eb', 3, 'connector') },
    { id: 'canvas-preset-note', icon: 'NT', title: 'Canvas preset: note text', hint: 'Text tool with amber stroke for annotations', run: () => applyCanvasDrawingPreset('text', '#d97706', 3, 'note') },
    { id: 'canvas-preset-review', icon: 'RV', title: 'Canvas preset: review mark', hint: 'Rectangle tool with bold red stroke for review callouts', run: () => applyCanvasDrawingPreset('rect', '#dc2626', 6, 'review mark') },
    { id: 'canvas-template-mindmap', icon: 'MM', title: 'Canvas starter: mind map', hint: 'Insert a lightweight local JSON mind map template near the current view', run: () => insertCanvasStarterTemplate('mindmap', 'Mind map') },
    { id: 'canvas-template-kanban', icon: 'KB', title: 'Canvas starter: kanban board', hint: 'Insert a three-column local JSON kanban board template', run: () => insertCanvasStarterTemplate('kanban', 'Kanban') },
    { id: 'canvas-template-timeline', icon: 'TL', title: 'Canvas starter: timeline', hint: 'Insert a lightweight milestone timeline template', run: () => insertCanvasStarterTemplate('timeline', 'Timeline') },
    { id: 'canvas-fit', icon: 'CF', title: 'Fit canvas content', hint: 'Center all canvas elements in view', run: () => { openCanvas(); fitCanvasToContent(); } },
    { id: 'canvas-fit-selection', icon: 'FS', title: 'Fit selected canvas element', hint: 'Zoom and pan to the selected canvas element', run: () => { openCanvas(); fitCanvasToSelection(); } },
    { id: 'canvas-grid', icon: 'CG', title: canvasGridVisible ? 'Hide canvas grid' : 'Show canvas grid', hint: 'Toggle the lightweight canvas alignment grid', run: () => { openCanvas(); toggleCanvasGrid(); } },
    { id: 'canvas-snap', icon: 'CSN', title: canvasSnapToGrid ? 'Disable canvas snap' : 'Enable canvas snap', hint: 'Snap new shape and text points to the canvas grid', run: () => { openCanvas(); toggleCanvasSnap(); } },
    { id: 'canvas-grid-12', icon: 'G12', title: 'Canvas grid 12px', hint: 'Use a fine 12px grid for precise drawing and snap', run: () => { openCanvas(); setCanvasGridSize(12); } },
    { id: 'canvas-grid-16', icon: 'G16', title: 'Canvas grid 16px', hint: 'Use a compact 16px grid for drawing and snap', run: () => { openCanvas(); setCanvasGridSize(16); } },
    { id: 'canvas-grid-24', icon: 'G24', title: 'Canvas grid 24px', hint: 'Use the default 24px grid for drawing and snap', run: () => { openCanvas(); setCanvasGridSize(24); } },
    { id: 'canvas-grid-32', icon: 'G32', title: 'Canvas grid 32px', hint: 'Use a roomy 32px grid for drawing and snap', run: () => { openCanvas(); setCanvasGridSize(32); } },
    { id: 'canvas-grid-48', icon: 'G48', title: 'Canvas grid 48px', hint: 'Use a broad 48px grid for coarse layout and snap', run: () => { openCanvas(); setCanvasGridSize(48); } },
    { id: 'canvas-snap-selected', icon: 'S2G', title: 'Snap selected canvas element to grid', hint: 'Align the selected element to the current canvas grid', run: snapSelectedCanvasElementToGrid },
    { id: 'canvas-bg-white', icon: 'BW', title: 'Canvas background white', hint: 'Set canvas background to plain white for exports', run: () => setCanvasBackground('#ffffff', 'white') },
    { id: 'canvas-bg-paper', icon: 'BP', title: 'Canvas background paper', hint: 'Set canvas background to warm paper', run: () => setCanvasBackground('#fffaf1', 'paper') },
    { id: 'canvas-bg-mist', icon: 'BM', title: 'Canvas background mist', hint: 'Set canvas background to soft mist', run: () => setCanvasBackground('#edf3f1', 'mist') },
    { id: 'canvas-bg-ink', icon: 'BI', title: 'Canvas background ink', hint: 'Set canvas background to dark ink for contrast', run: () => setCanvasBackground('#10141b', 'ink') },
    { id: 'canvas-bg-sand', icon: 'BS', title: 'Canvas background sand', hint: 'Set canvas background to a warm planning board tone', run: () => setCanvasBackground('#f7ecd8', 'sand') },
    { id: 'canvas-bg-slate', icon: 'BSl', title: 'Canvas background slate', hint: 'Set canvas background to a muted dark slate', run: () => setCanvasBackground('#18202b', 'slate') },
    { id: 'canvas-minimap', icon: 'CM', title: canvasMinimapVisible ? 'Hide canvas minimap' : 'Show canvas minimap', hint: 'Toggle the lightweight canvas navigation minimap', run: () => { openCanvas(); toggleCanvasMinimap(); } },
    { id: 'canvas-zoom-out', icon: 'Z-', title: 'Canvas zoom out', hint: 'Step the canvas view out without changing content', run: () => { openCanvas(); stepCanvasZoom(0.8); } },
    { id: 'canvas-zoom-50', icon: 'Z50', title: 'Canvas zoom 50%', hint: 'Set the canvas view to a wider 50% overview', run: () => { openCanvas(); setCanvasZoomPreset(0.5); } },
    { id: 'canvas-zoom-100', icon: 'Z1', title: 'Canvas zoom 100%', hint: 'Return the canvas view to actual size', run: () => { openCanvas(); setCanvasZoomPreset(1); } },
    { id: 'canvas-zoom-200', icon: 'Z2', title: 'Canvas zoom 200%', hint: 'Set the canvas view to a close 200% editing zoom', run: () => { openCanvas(); setCanvasZoomPreset(2); } },
    { id: 'canvas-zoom-in', icon: 'Z+', title: 'Canvas zoom in', hint: 'Step the canvas view in without changing content', run: () => { openCanvas(); stepCanvasZoom(1.25); } },
    { id: 'canvas-reset-view', icon: 'ZR', title: 'Canvas reset view', hint: 'Return the canvas camera to origin at 100%', run: () => { openCanvas(); resetCanvasView(); } },
    { id: 'canvas-pan-up', icon: 'PU', title: 'Canvas pan up', hint: 'Move the canvas viewport up by one step', run: () => { openCanvas(); panCanvasView(0, 160); } },
    { id: 'canvas-pan-down', icon: 'PD', title: 'Canvas pan down', hint: 'Move the canvas viewport down by one step', run: () => { openCanvas(); panCanvasView(0, -160); } },
    { id: 'canvas-pan-left', icon: 'PL', title: 'Canvas pan left', hint: 'Move the canvas viewport left by one step', run: () => { openCanvas(); panCanvasView(160, 0); } },
    { id: 'canvas-pan-right', icon: 'PR', title: 'Canvas pan right', hint: 'Move the canvas viewport right by one step', run: () => { openCanvas(); panCanvasView(-160, 0); } },
    { id: 'canvas-copy', icon: 'CC', title: 'Copy selected canvas element', hint: 'Copy the selected element to Markpad canvas clipboard', run: () => { copySelectedCanvasElement(); updateCanvasSelectionButtons(); } },
    { id: 'canvas-element-inspector', icon: 'CEI', title: 'Canvas selected element inspector', hint: 'Inspect selected element geometry, style, and lightweight export actions', run: showSelectedCanvasElementInspector },
    { id: 'canvas-copy-details', icon: 'CDT', title: 'Copy selected canvas details', hint: 'Copy selected canvas element geometry and style as Markdown', run: copySelectedCanvasDetails },
    { id: 'canvas-insert-element-md', icon: 'C2M', title: 'Insert selected canvas element into note', hint: 'Insert selected canvas element geometry/text as portable Markdown at the editor cursor', run: insertSelectedCanvasElementMarkdownIntoNote },
    { id: 'canvas-copy-element-json', icon: 'CEJ', title: 'Copy selected canvas element JSON', hint: 'Copy the selected canvas element as portable JSON', run: copySelectedCanvasElementJson },
    { id: 'canvas-copy-element-svg', icon: 'CES', title: 'Copy selected canvas element SVG', hint: 'Copy the selected canvas element as standalone SVG markup', run: copySelectedCanvasElementSvg },
    { id: 'canvas-paste-element-json', icon: 'PEJ', title: 'Paste canvas element JSON', hint: 'Paste one canvas element from clipboard JSON', run: pasteCanvasElementJsonFromClipboard },
    { id: 'canvas-merge-json', icon: 'CMJ', title: 'Merge canvas JSON from clipboard', hint: 'Append elements from clipboard canvas JSON without replacing the draft', run: mergeCanvasJsonFromClipboard },
    { id: 'canvas-replace-json', icon: 'CRJ', title: 'Replace canvas from clipboard JSON', hint: 'Replace the current canvas draft with clipboard Markpad, Obsidian, or Excalidraw JSON', run: replaceCanvasJsonFromClipboard },
    { id: 'canvas-paste', icon: 'CP', title: 'Paste canvas element', hint: 'Paste the copied canvas element with a small offset', run: pasteCanvasElement },
    { id: 'canvas-clear-undo-history', icon: 'CU', title: 'Clear canvas undo history', hint: 'Release in-memory canvas undo snapshots for the current canvas draft', run: clearCanvasUndoHistory },
    { id: 'canvas-duplicate', icon: 'CDU', title: 'Duplicate selected canvas element', hint: 'Copy the selected canvas element with a small offset', run: duplicateSelectedCanvasElement },
    { id: 'canvas-delete', icon: 'CX', title: 'Delete selected canvas element', hint: 'Remove the currently selected canvas element', run: deleteSelectedCanvasElement },
    { id: 'canvas-nudge-up', icon: 'NU', title: 'Canvas nudge up', hint: 'Move the selected canvas element up by grid or 10px', run: () => nudgeSelectedCanvasElement(0, -1, 'up') },
    { id: 'canvas-nudge-down', icon: 'ND', title: 'Canvas nudge down', hint: 'Move the selected canvas element down by grid or 10px', run: () => nudgeSelectedCanvasElement(0, 1, 'down') },
    { id: 'canvas-nudge-left', icon: 'NL', title: 'Canvas nudge left', hint: 'Move the selected canvas element left by grid or 10px', run: () => nudgeSelectedCanvasElement(-1, 0, 'left') },
    { id: 'canvas-nudge-right', icon: 'NR', title: 'Canvas nudge right', hint: 'Move the selected canvas element right by grid or 10px', run: () => nudgeSelectedCanvasElement(1, 0, 'right') },
    { id: 'canvas-layer-forward', icon: 'LF', title: 'Canvas bring forward', hint: 'Move the selected canvas element one layer forward', run: () => moveSelectedCanvasLayer('forward') },
    { id: 'canvas-layer-backward', icon: 'LB', title: 'Canvas send backward', hint: 'Move the selected canvas element one layer backward', run: () => moveSelectedCanvasLayer('backward') },
    { id: 'canvas-layer-front', icon: 'TF', title: 'Canvas bring to front', hint: 'Move the selected canvas element above all others', run: () => moveSelectedCanvasLayer('front') },
    { id: 'canvas-layer-back', icon: 'TB', title: 'Canvas send to back', hint: 'Move the selected canvas element behind all others', run: () => moveSelectedCanvasLayer('back') },
    { id: 'canvas-stroke-up', icon: 'W+', title: 'Canvas stroke thicker', hint: 'Increase the selected canvas element stroke width', run: () => adjustSelectedCanvasWidth(1) },
    { id: 'canvas-stroke-down', icon: 'W-', title: 'Canvas stroke thinner', hint: 'Decrease the selected canvas element stroke width', run: () => adjustSelectedCanvasWidth(-1) },
    { id: 'canvas-copy-style', icon: 'CST', title: 'Copy selected canvas style', hint: 'Copy selected canvas stroke color and width', run: copySelectedCanvasStyle },
    { id: 'canvas-apply-style', icon: 'AST', title: 'Apply copied canvas style', hint: 'Apply copied canvas stroke color and width to the selected element', run: applyCopiedCanvasStyle },
    { id: 'canvas-align-left', icon: 'AL', title: 'Canvas align left', hint: 'Align the selected element to the visible canvas left edge', run: () => alignSelectedCanvasElement('left') },
    { id: 'canvas-align-center', icon: 'AC', title: 'Canvas align center', hint: 'Center the selected element horizontally in the visible canvas', run: () => alignSelectedCanvasElement('center') },
    { id: 'canvas-align-right', icon: 'AR', title: 'Canvas align right', hint: 'Align the selected element to the visible canvas right edge', run: () => alignSelectedCanvasElement('right') },
    { id: 'canvas-align-top', icon: 'AT', title: 'Canvas align top', hint: 'Align the selected element to the visible canvas top edge', run: () => alignSelectedCanvasElement('top') },
    { id: 'canvas-align-middle', icon: 'AM', title: 'Canvas align middle', hint: 'Center the selected element vertically in the visible canvas', run: () => alignSelectedCanvasElement('middle') },
    { id: 'canvas-align-bottom', icon: 'AB', title: 'Canvas align bottom', hint: 'Align the selected element to the visible canvas bottom edge', run: () => alignSelectedCanvasElement('bottom') },
    { id: 'canvas-align-center-view', icon: 'ACV', title: 'Canvas center selected in view', hint: 'Center the selected element both horizontally and vertically in the visible canvas', run: centerSelectedCanvasElementInView },
    { id: 'canvas-load-current', icon: 'CL', title: 'Load current document into canvas', hint: 'Parse current Markpad or Obsidian canvas JSON from the editor', run: loadCurrentDocumentIntoCanvas },
    { id: 'canvas-import', icon: 'CI', title: 'Import canvas JSON', hint: 'Load Markpad or Obsidian .canvas JSON into the canvas draft', run: importCanvasJson },
    { id: 'copy-canvas-json', icon: 'CJ', title: 'Copy canvas JSON', hint: 'Copy the current Markpad canvas document as portable JSON', run: copyCanvasJson },
    { id: 'copy-markcanvas-json', icon: 'CMJ', title: 'Copy .markcanvas.json', hint: 'Copy the current native Markpad canvas JSON with elements and appState', run: copyMarkcanvasJson },
    { id: 'export-markcanvas-json', icon: 'EMJ', title: 'Export .markcanvas.json', hint: 'Download the current native Markpad canvas as a portable .markcanvas.json file', run: exportMarkcanvasJson },
    { id: 'canvas-storage-profile', icon: 'CSP', title: 'Canvas storage profile', hint: 'Show document/session bytes, undo snapshots, format version, and export targets', run: showCanvasStorageProfile },
    { id: 'copy-canvas-storage-profile', icon: 'CSD', title: 'Copy canvas storage profile', hint: 'Copy canvas document/session storage diagnostics as Markdown', run: copyCanvasStorageProfileMarkdown },
    { id: 'export-canvas-storage-profile', icon: 'CSE', title: 'Export canvas storage profile', hint: 'Download canvas document/session storage diagnostics as Markdown', run: exportCanvasStorageProfileMarkdown },
    { id: 'canvas-svg', icon: 'SV', title: 'Export canvas SVG', hint: 'Download the current canvas as a lightweight SVG', run: exportCanvasSvg },
    { id: 'copy-canvas-svg', icon: 'CSV', title: 'Copy canvas SVG', hint: 'Copy the current canvas as lightweight SVG markup', run: copyCanvasSvg },
    { id: 'canvas-png-viewport', icon: 'PG', title: 'Export canvas viewport PNG', hint: 'Download the currently visible canvas viewport as a PNG image', run: exportCanvasPngViewport },
    { id: 'canvas-png-full', icon: 'PGA', title: 'Export full canvas PNG', hint: 'Download all canvas content as a bounded PNG image', run: exportCanvasPngFull },
    { id: 'canvas-obsidian', icon: 'OC', title: 'Export Obsidian canvas', hint: 'Download current canvas as an Obsidian-compatible .canvas file', run: exportObsidianCanvas },
    { id: 'copy-obsidian-canvas', icon: 'COC', title: 'Copy Obsidian canvas JSON', hint: 'Copy current canvas as Obsidian-compatible .canvas JSON', run: copyObsidianCanvasJson },
    { id: 'canvas-excalidraw', icon: 'EX', title: 'Export Excalidraw canvas', hint: 'Download current canvas as an Excalidraw .excalidraw scene', run: exportExcalidrawCanvas },
    { id: 'copy-excalidraw-canvas', icon: 'CEX', title: 'Copy Excalidraw canvas JSON', hint: 'Copy current canvas as Excalidraw-compatible scene JSON', run: copyExcalidrawCanvasJson },
    { id: 'canvas-inventory', icon: 'CI', title: 'Canvas inventory', hint: 'Show element counts, bounds, text, and export shortcuts', run: showCanvasInventory },
    { id: 'canvas-summary-md', icon: 'CM', title: 'Export canvas Markdown summary', hint: 'Download a lightweight Markdown inventory of canvas elements', run: exportCanvasMarkdownSummary },
    { id: 'copy-canvas-summary-md', icon: 'CCM', title: 'Copy canvas Markdown summary', hint: 'Copy a lightweight Markdown inventory of canvas elements', run: copyCanvasMarkdownSummary },
    { id: 'canvas-elements-csv', icon: 'CCV', title: 'Export canvas elements CSV', hint: 'Download a compact CSV inventory of canvas elements', run: exportCanvasElementsCsv },
    { id: 'copy-canvas-elements-csv', icon: 'CEV', title: 'Copy canvas elements CSV', hint: 'Copy a compact CSV inventory of canvas elements', run: copyCanvasElementsCsv },
    { id: 'canvas-inventory-json', icon: 'CIJ', title: 'Export canvas inventory JSON', hint: 'Download a compact JSON inventory of canvas elements', run: exportCanvasInventoryJson },
    { id: 'copy-canvas-inventory-json', icon: 'CIJ', title: 'Copy canvas inventory JSON', hint: 'Copy a compact JSON inventory of canvas elements', run: copyCanvasInventoryJson },
    { id: 'copy-canvas-view-state', icon: 'CVS', title: 'Copy canvas view state', hint: 'Copy camera, grid, snap, minimap, and element count as Markdown', run: copyCanvasViewStateMarkdown },
    { id: 'export-canvas-view-state', icon: 'EVS', title: 'Export canvas view state', hint: 'Download camera, grid, snap, minimap, and element count as Markdown', run: exportCanvasViewStateMarkdown },
    { id: 'copy-canvas-view-state-json', icon: 'CVJ', title: 'Copy canvas view state JSON', hint: 'Copy camera, grid, snap, minimap, and element count as JSON', run: copyCanvasViewStateJson },
    { id: 'export-canvas-view-state-json', icon: 'EVJ', title: 'Export canvas view state JSON', hint: 'Download camera, grid, snap, minimap, and element count as JSON', run: exportCanvasViewStateJson },
    { id: 'copy-canvas-view-state-csv', icon: 'CVC', title: 'Copy canvas view state CSV', hint: 'Copy camera, grid, snap, minimap, and element count as CSV', run: copyCanvasViewStateCsv },
    { id: 'export-canvas-view-state-csv', icon: 'EVC', title: 'Export canvas view state CSV', hint: 'Download camera, grid, snap, minimap, and element count as CSV', run: exportCanvasViewStateCsv },
    { id: 'canvas-restore-view-state', icon: 'RVJ', title: 'Restore canvas view state JSON', hint: 'Restore camera, grid, snap, minimap, background, and tool from clipboard JSON', run: restoreCanvasViewStateFromClipboard },
    { id: 'canvas-write-active', icon: 'CW', title: 'Write canvas to active document', hint: 'Update the active .canvas, JSON, or draft document with current canvas JSON', run: saveCanvasToActiveDocument },
    { id: 'canvas-draft', icon: 'CD', title: 'Save canvas as draft', hint: 'Create an editable JSON draft that can be saved as a .canvas file', run: saveCanvasAsDraft },
    { id: 'focus', icon: 'L', title: focusMode ? 'Exit focus mode' : 'Enter focus mode', hint: 'Hide secondary chrome for writing', kbd: 'Ctrl+Shift+L', run: toggleFocusMode },
    { id: 'compact-mode', icon: 'CP', title: compactMode ? 'Disable compact mode' : 'Enable compact mode', hint: 'Tighten sidebar, toolbar, modal, search, task, and canvas spacing', run: toggleCompactMode },
    { id: 'writing-focus-preset', icon: 'WF', title: 'Writing focus preset', hint: 'Focus + compact + soft wrap + reading width + editor-wide split', run: applyWritingFocusPreset },
    { id: 'review-split-preset', icon: 'RV', title: 'Review split preset', hint: 'Balanced split with soft wrap and full review chrome', run: applyReviewSplitPreset },
    { id: 'default-editing-preset', icon: 'DE', title: 'Default editing preset', hint: 'Full chrome + plain editor + balanced split', run: applyDefaultEditingPreset },
    { id: 'workspace-writing', icon: 'WW', title: 'Workspace preset: writing', hint: 'Apply Linen, soft wrap, reading width, and editor-wide split', run: () => applyWorkspacePreset('writing') },
    { id: 'workspace-planning', icon: 'WP', title: 'Workspace preset: planning', hint: 'Apply Sand and open open tasks as a kanban board', run: () => applyWorkspacePreset('planning') },
    { id: 'workspace-review', icon: 'WR', title: 'Workspace preset: review', hint: 'Apply Mist, reading width, and balanced split', run: () => applyWorkspacePreset('review') },
    { id: 'workspace-canvas', icon: 'WC', title: 'Workspace preset: canvas planning', hint: 'Apply Sand canvas background and connector drawing defaults', run: () => applyWorkspacePreset('canvas') },
    { id: 'workspace-night', icon: 'WN', title: 'Workspace preset: night reading', hint: 'Apply Midnight, soft wrap, reading width, and preview view', run: () => applyWorkspacePreset('night') },
    { id: 'workspace-low-memory', icon: 'WM', title: 'Workspace preset: low memory', hint: 'Enable compact mode and release editor/canvas undo snapshots plus loaded search cache', run: () => applyWorkspacePreset('low-memory') },
    { id: 'workspace-default', icon: 'WD', title: 'Workspace preset: default', hint: 'Return to Paper theme and the default editing layout', run: () => applyWorkspacePreset('default') },
    { id: 'ui-state-summary', icon: 'UI', title: 'UI state summary', hint: 'Show current theme, layout, search, task, and canvas preferences', run: showUiStateSummary },
    { id: 'copy-ui-state-summary', icon: 'CU', title: 'Copy UI state summary', hint: 'Copy current theme, layout, search, task, and canvas preferences as Markdown', run: copyUiStateSummary },
    { id: 'export-ui-state-summary', icon: 'EU', title: 'Export UI state Markdown', hint: 'Download current theme, layout, search, task, and canvas preferences as Markdown', run: exportUiStateSummary },
    { id: 'copy-ui-state-json', icon: 'CUJ', title: 'Copy UI state JSON', hint: 'Copy current theme, layout, search, task, and canvas preferences as JSON', run: copyUiStateJson },
    { id: 'export-ui-state-json', icon: 'EUJ', title: 'Export UI state JSON', hint: 'Download current theme, layout, search, task, and canvas preferences as JSON', run: exportUiStateJson },
    { id: 'restore-ui-state-json', icon: 'RUJ', title: 'Restore UI state JSON', hint: 'Restore local theme, layout, task, search, editor, and canvas preferences from clipboard JSON', run: restoreUiStateJsonFromClipboard },
    { id: 'editor-wrap', icon: 'W', title: editorSoftWrap ? 'Disable soft wrap' : 'Enable soft wrap', hint: 'Wrap long editor lines visually without changing file content', run: toggleEditorWrap },
    { id: 'editor-reading-width', icon: 'RW', title: editorReadingWidth ? 'Disable reading width' : 'Enable reading width', hint: 'Constrain editor and preview text to a focused reading lane', run: toggleEditorReadingWidth },
    { id: 'layout-profile', icon: 'LP', title: 'Layout profile', hint: 'Show view, split, wrap, reading width, zoom, focus, and compact state', run: showLayoutProfile },
    { id: 'copy-layout-profile', icon: 'CLP', title: 'Copy layout profile', hint: 'Copy current editor and split layout state as Markdown', run: copyLayoutProfileMarkdown },
    { id: 'export-layout-profile', icon: 'ELP', title: 'Export layout profile', hint: 'Download current editor and split layout state as Markdown', run: exportLayoutProfileMarkdown },
    { id: 'copy-layout-profile-json', icon: 'CLJ', title: 'Copy layout profile JSON', hint: 'Copy current editor and split layout state as JSON', run: copyLayoutProfileJson },
    { id: 'export-layout-profile-json', icon: 'ELJ', title: 'Export layout profile JSON', hint: 'Download current editor and split layout state as JSON', run: exportLayoutProfileJson },
    { id: 'layout-guide', icon: 'LG', title: 'Layout guide', hint: 'Show editor, split, preview, reading width, focus, and low-memory layout notes', run: showLayoutGuide },
    { id: 'split-workflow-guide', icon: 'SWG', title: 'Split workflow guide', hint: 'Show split presets, swap, nudges, and local split-state behavior', run: showSplitWorkflowGuide },
    { id: 'split', icon: '||', title: 'Split view', hint: 'Editor and preview side by side', kbd: 'Ctrl+Shift+E', run: () => setView('split') },
    { id: 'split-balanced', icon: '50', title: 'Split 50/50', hint: 'Use a balanced editor and preview split', run: () => setSplitPreset(50) },
    { id: 'split-editor-wide', icon: '62', title: 'Split editor wide', hint: 'Give the editor more width in split view', run: () => setSplitPreset(62) },
    { id: 'split-editor-focus', icon: '72', title: 'Split editor focus', hint: 'Use a wide editor with a narrow rendered preview', run: () => setSplitPreset(72) },
    { id: 'split-preview-wide', icon: '38', title: 'Split preview wide', hint: 'Give the preview more width in split view', run: () => setSplitPreset(38) },
    { id: 'split-preview-focus', icon: '28', title: 'Split preview focus', hint: 'Use a narrow editor with a wide rendered preview', run: () => setSplitPreset(28) },
    { id: 'split-swap', icon: 'SW', title: 'Swap split focus', hint: 'Flip the current editor/preview split ratio', run: swapSplitRatio },
    { id: 'split-nudge-editor', icon: '+E', title: 'Widen editor split', hint: 'Increase editor width by 5% in split view', run: () => adjustSplitRatio(5) },
    { id: 'split-nudge-preview', icon: '+P', title: 'Widen preview split', hint: 'Increase preview width by 5% in split view', run: () => adjustSplitRatio(-5) },
    { id: 'editor', icon: 'E', title: 'Editor view', hint: 'Show editor only', run: () => setView('markdown') },
    { id: 'preview', icon: 'P', title: 'Preview view', hint: 'Show preview/document only', run: () => setView('viewer') },
    { id: 'sidebar', icon: 'B', title: 'Toggle sidebar', hint: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar', kbd: 'Ctrl+Shift+B', run: toggleSidebar },
    { id: 'history', icon: 'H', title: 'Version history', hint: 'Open saved snapshots and diffs', kbd: 'Ctrl+H', run: toggleHistory },
    { id: 'theme', icon: '☼', title: 'Cycle theme', hint: 'Switch lightweight CSS-variable themes', run: cycleTheme },
    { id: 'theme-light-cycle', icon: 'TL', title: 'Cycle light theme', hint: 'Switch between Paper, Linen, Dawn, Mist, and Sand', run: cycleLightTheme },
    { id: 'theme-dark-cycle', icon: 'TD', title: 'Cycle dark theme', hint: 'Switch between Ink, Pine, Slate, Ember, and Midnight', run: cycleDarkTheme },
    { id: 'theme-companion', icon: 'TC', title: 'Switch to theme companion', hint: 'Apply the recommended light/dark companion for the current theme', run: applyThemeCompanion },
    { id: 'theme-reset', icon: 'TR', title: 'Reset theme to Paper', hint: 'Return to the default low-contrast Paper theme', run: () => applyTheme('paper') },
    { id: 'theme-guide', icon: 'TG', title: 'Theme guide', hint: 'Show light, dark, preset, portability, and lightweight theme notes', run: showThemeGuide },
    { id: 'theme-lab', icon: 'TLB', title: 'Theme Lab', hint: 'Compare light/dark themes and export the local theme catalog', run: showThemeLab },
    { id: 'copy-theme-catalog-json', icon: 'TCJ', title: 'Copy theme catalog JSON', hint: 'Copy built-in theme metadata without CSS or image assets', run: copyThemeCatalogJson },
    { id: 'export-theme-catalog-json', icon: 'TEJ', title: 'Export theme catalog JSON', hint: 'Download built-in theme metadata as a small local JSON file', run: exportThemeCatalogJson },
    { id: 'copy-theme-recipes-md', icon: 'TRM', title: 'Copy theme recipes Markdown', hint: 'Copy lightweight workspace theme recipes as Markdown', run: copyThemeRecipesMarkdown },
    { id: 'export-theme-recipes-md', icon: 'ERM', title: 'Export theme recipes Markdown', hint: 'Download lightweight workspace theme recipes as Markdown', run: exportThemeRecipesMarkdown },
    { id: 'copy-theme-recipes-json', icon: 'TRJ', title: 'Copy theme recipes JSON', hint: 'Copy lightweight workspace theme recipes as JSON', run: copyThemeRecipesJson },
    { id: 'export-theme-recipes-json', icon: 'ERJ', title: 'Export theme recipes JSON', hint: 'Download lightweight workspace theme recipes as JSON', run: exportThemeRecipesJson },
    ...themePresetCommandItems(),
    ...themeCommandItems(),
    { id: 'footprint', icon: 'M', title: 'Local footprint', hint: 'Show loaded text, local canvas, trash, and heap estimates', run: showLocalFootprint },
    { id: 'copy-footprint-json', icon: 'CFJ', title: 'Copy local footprint JSON', hint: 'Copy memory, loaded document, canvas, trash, and localStorage counters as JSON', run: copyLocalFootprintJson },
    { id: 'export-footprint-json', icon: 'EFJ', title: 'Export local footprint JSON', hint: 'Download memory, loaded document, canvas, trash, and localStorage counters as JSON', run: exportLocalFootprintJson },
    { id: 'copy-footprint-md', icon: 'CFM', title: 'Copy local footprint Markdown', hint: 'Copy memory, loaded document, canvas, trash, and localStorage counters as Markdown', run: copyLocalFootprintMarkdown },
    { id: 'export-footprint-md', icon: 'EFM', title: 'Export local footprint Markdown', hint: 'Download memory, loaded document, canvas, trash, and localStorage counters as Markdown', run: exportLocalFootprintMarkdown },
    { id: 'copy-footprint-csv', icon: 'CFC', title: 'Copy local footprint CSV', hint: 'Copy memory, loaded document, canvas, trash, and localStorage counters as CSV', run: copyLocalFootprintCsv },
    { id: 'export-footprint-csv', icon: 'EFC', title: 'Export local footprint CSV', hint: 'Download memory, loaded document, canvas, trash, and localStorage counters as CSV', run: exportLocalFootprintCsv },
    { id: 'local-folder', icon: 'LF', title: 'Local folder', hint: 'Show the default local folder and recent file list', run: () => showLocalFolder() },
    { id: 'local-workspace-setup', icon: 'LWS', title: 'Local workspace setup', hint: 'Choose and understand the default local folder workflow', run: showLocalWorkspaceSetupGuide },
    { id: 'open-local-folder', icon: 'OF', title: 'Open local folder', hint: 'Open the default local workspace in the OS file manager', run: openConfiguredLocalFolder },
    { id: 'reveal-active-file', icon: 'RF', title: 'Reveal active file', hint: 'Show the active saved file in the OS file manager', run: revealActiveFile },
    { id: 'choose-local-folder', icon: 'LD', title: 'Choose local folder', hint: 'Set Markpad default local workspace folder', run: chooseLocalFolder },
    { id: 'local-overview', icon: 'LO', title: 'Local folder overview', hint: 'Show lightweight counts for notes, canvases, tasks, and size', run: () => showLocalFolder() },
    { id: 'recent-local-files', icon: 'LR', title: 'Recent local files', hint: 'Show recently modified files from the default local folder', run: showRecentLocalFiles },
    { id: 'local-tags', icon: '#', title: 'Local tags', hint: 'Show Markdown tags found in the default local folder', run: showLocalTags },
    { id: 'local-links', icon: '[[]]', title: 'Local links', hint: 'Show wiki and Markdown links found in the default local folder', run: showLocalLinks },
    { id: 'local-links-canvas', icon: 'LG', title: 'Local links canvas', hint: 'Generate a lightweight .canvas map from local Markdown links', run: createLocalLinksCanvas },
    { id: 'active-backlinks', icon: 'BL', title: 'Backlinks for active note', hint: 'Find local Markdown files linking to the active saved note', run: showActiveBacklinks },
    { id: 'active-backlinks-to-canvas', icon: 'B2C', title: 'Send backlinks to canvas', hint: 'Append active-note backlinks as a lightweight local canvas map', run: insertActiveBacklinksCanvasMap },
    { id: 'copy-active-path', icon: 'CAP', title: 'Copy active file path', hint: 'Copy the active saved file path to the clipboard', run: copyActiveFilePath },
    { id: 'copy-active-context', icon: 'CAC', title: 'Copy active file context', hint: 'Copy active title, path, type, and dirty state as Markdown', run: copyActiveFileContext },
    { id: 'export-active-context', icon: 'EAC', title: 'Export active file context', hint: 'Download active title, path, type, and dirty state as Markdown', run: exportActiveFileContextMarkdown },
    { id: 'copy-active-context-json', icon: 'CAJ', title: 'Copy active file context JSON', hint: 'Copy active file metadata as portable JSON', run: copyActiveFileContextJson },
    { id: 'export-active-context-json', icon: 'EAJ', title: 'Export active file context JSON', hint: 'Download active file metadata as portable JSON', run: exportActiveFileContextJson },
    { id: 'copy-active-context-csv', icon: 'CAV', title: 'Copy active file context CSV', hint: 'Copy active file metadata as CSV rows', run: copyActiveFileContextCsv },
    { id: 'export-active-context-csv', icon: 'EAV', title: 'Export active file context CSV', hint: 'Download active file metadata as CSV rows', run: exportActiveFileContextCsv },
    { id: 'loaded-workspace', icon: 'LW', title: 'Loaded workspace inventory', hint: 'Show open files, drafts, dirty state, types, paths, and export shortcuts', run: showLoadedWorkspaceInventory },
    { id: 'loaded-workspace-to-canvas', icon: 'L2C', title: 'Send loaded workspace to canvas', hint: 'Append open files and drafts as a lightweight local canvas map', run: insertLoadedWorkspaceCanvasMap },
    { id: 'copy-loaded-workspace', icon: 'CLW', title: 'Copy loaded workspace Markdown', hint: 'Copy open files, drafts, dirty state, types, and paths as Markdown', run: copyLoadedWorkspaceMarkdown },
    { id: 'export-loaded-workspace', icon: 'ELW', title: 'Export loaded workspace Markdown', hint: 'Download open files, drafts, dirty state, types, and paths as Markdown', run: exportLoadedWorkspaceMarkdown },
    { id: 'copy-loaded-workspace-json', icon: 'LWJ', title: 'Copy loaded workspace JSON', hint: 'Copy open workspace metadata as portable JSON', run: copyLoadedWorkspaceJson },
    { id: 'export-loaded-workspace-json', icon: 'EWJ', title: 'Export loaded workspace JSON', hint: 'Download open workspace metadata as portable JSON', run: exportLoadedWorkspaceJson },
    { id: 'copy-loaded-workspace-csv', icon: 'LWC', title: 'Copy loaded workspace CSV', hint: 'Copy open workspace metadata as CSV rows', run: copyLoadedWorkspaceCsv },
    { id: 'export-loaded-workspace-csv', icon: 'EWC', title: 'Export loaded workspace CSV', hint: 'Download open workspace metadata as CSV rows', run: exportLoadedWorkspaceCsv },
    { id: 'new-local-note', icon: 'LN', title: 'New local note', hint: 'Create a Markdown note in the default local folder', run: createLocalFolderNote },
    { id: 'daily-note', icon: 'DN', title: 'Daily note', hint: 'Create or open today in the default local folder', run: createLocalFolderDailyNote },
    { id: 'weekly-note', icon: 'WN', title: 'Weekly note', hint: 'Create or open this ISO week in the default local folder', run: createLocalFolderWeeklyNote },
    { id: 'new-local-canvas', icon: 'LC', title: 'New local canvas', hint: 'Create a .canvas JSON file in the default local folder', run: createLocalFolderCanvas },
    { id: 'search-local-folder', icon: 'LS', title: 'Search local folder', hint: 'Search text files in the default local folder', run: searchLocalFolderPrompt },
    { id: 'export-local-settings', icon: 'EX', title: 'Export local settings', hint: 'Download a small JSON snapshot of local preferences and UI state', run: exportLocalSettings },
    { id: 'copy-local-settings', icon: 'CX', title: 'Copy local settings', hint: 'Copy a small JSON snapshot of local preferences and UI state', run: copyLocalSettings },
    { id: 'import-local-settings', icon: 'IM', title: 'Import local settings', hint: 'Restore an exported Markpad local settings JSON snapshot', run: importLocalSettings },
    { id: 'preferences', icon: ',', title: 'Preferences', hint: 'Appearance, file handling, storage', kbd: 'Ctrl+,', run: showPreferences },
    { id: 'help', icon: '?', title: 'Help', hint: 'Show shortcuts and workflow notes', run: showHelpModal },
  ];
}

function commandScore(item, query) {
  const recentRank = commandRecentRank(item.id);
  const recentBoost = recentRank >= 0 ? COMMAND_RECENTS_LIMIT - recentRank : 0;
  if (!query) return 1 + recentBoost * 10 + (item.kbd ? 2 : 0);
  const haystack = `${item.title} ${item.hint} ${item.id} ${commandCategory(item)}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.every(term => haystack.includes(term))) return 0;
  let score = 10;
  for (const term of terms) {
    if (item.title.toLowerCase().startsWith(term)) score += 30;
    else if (item.title.toLowerCase().includes(term)) score += 18;
    else score += 8;
  }
  return score + recentBoost * 4;
}

function commandCategory(item) {
  const id = String(item?.id || '');
  if (id === 'commands-search') return 'Search';
  if (id === 'commands-tasks') return 'Tasks';
  if (id === 'commands-canvas') return 'Canvas';
  if (id === 'commands-local') return 'Local';
  if (id === 'commands-layout') return 'Layout';
  if (id === 'commands-diagnostics') return 'Diagnostics';
  if (id === 'commands-theme') return 'Theme';
  if (id === 'commands-trash') return 'Trash';
  if (id === 'command-guide') return 'Search';
  if (id.includes('search') || id === 'find' || id.startsWith('find-') || id.includes('outline')) return 'Search';
  if (id.includes('command-recents') || id === 'clear-palette-recents') return 'Search';
  if (id.startsWith('tasks') || id.startsWith('add-task') || id.includes('task')) return 'Tasks';
  if (id.startsWith('canvas') || id === 'new-local-canvas' || id === 'local-links-canvas') return 'Canvas';
  if (id.startsWith('trash')) return 'Trash';
  if (id.startsWith('theme')) return 'Theme';
  if (id.includes('history')) return 'History';
  if (id.startsWith('workspace')) return 'Layout';
  if (id.startsWith('local') || id.includes('local') || id.includes('loaded-workspace') || id.includes('active-context') || id.includes('active-path') || id.includes('backlinks') || id.includes('daily') || id.includes('weekly') || id.includes('reveal')) return 'Local';
  if (['focus', 'compact-mode', 'writing-focus-preset', 'review-split-preset', 'editor-wrap', 'editor-reading-width', 'layout-guide', 'split-workflow-guide', 'split', 'split-balanced', 'split-editor-wide', 'split-editor-focus', 'split-preview-wide', 'split-preview-focus', 'split-swap', 'split-nudge-editor', 'split-nudge-preview', 'editor', 'preview', 'sidebar'].includes(id)) return 'Layout';
  if (id.includes('runtime') || id.includes('asset-report') || id === 'footprint' || id === 'low-memory-guide' || id === 'memory-cleanup-report' || id.includes('undo-history')) return 'Diagnostics';
  if (id.includes('settings') || id === 'preferences' || id === 'help') return 'Settings';
  return 'File';
}

function commandEmptyHtml(query) {
  const categories = commandPaletteCategories();
  const chips = categories
    .map(category => `<button class="command-empty-chip" data-command-empty-category="${escapeHtml(category.label)}" type="button">${escapeHtml(category.label)}</button>`)
    .join('');
  const shortcuts = [
    ['local-upgrade-map', 'Upgrade Map'],
    ['search-profile', 'Search Profile'],
    ['task-source-profile', 'Task Source'],
    ['canvas-storage-profile', 'Canvas Storage'],
    ['footprint', 'Footprint'],
    ['local-first-guide', 'Local Guide'],
  ].map(([id, label]) => `<button class="command-empty-chip shortcut" data-command-empty-action="${escapeHtml(id)}" type="button">${escapeHtml(label)}</button>`)
    .join('');
  const suffix = query ? ` for &quot;${escapeHtml(query)}&quot;` : '';
  return `<div class="command-empty"><strong>No command matched${suffix}.</strong><span>Try a command category:</span><div class="command-empty-cats">${chips}</div><span>Or open a local diagnostic:</span><div class="command-empty-cats shortcuts">${shortcuts}</div></div>`;
}

function commandPaletteCategories(items = commandItems()) {
  const preferred = ['Search', 'Tasks', 'Canvas', 'Local', 'Layout', 'Theme', 'Trash', 'Diagnostics'];
  const counts = items.reduce((acc, item) => {
    const category = commandCategory(item);
    if (!preferred.includes(category)) return acc;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  return preferred.map(label => ({ label, count: counts[label] || 0 })).filter(item => item.count);
}

function commandIconMetrics() {
  const items = commandItems();
  const icons = items.map(item => String(item.icon || '').trim()).filter(Boolean);
  const categories = items.reduce((acc, item) => {
    const category = commandCategory(item);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const uniqueIcons = new Set(icons);
  const longLabels = icons.filter(icon => icon.length > 4).length;
  return {
    total: icons.length,
    unique: uniqueIcons.size,
    missing: items.length - icons.length,
    longLabels,
    maxLength: icons.reduce((max, icon) => Math.max(max, icon.length), 0),
    categories,
    strategy: 'short text labels from command metadata; no icon font, sprite sheet, or bitmap pack',
  };
}

function renderCommandCategoryStrip(items) {
  const categories = commandPaletteCategories(items);
  if (!categories.length) return '';
  return `
    <div class="command-cats" aria-label="Command categories">
      <span>Menus</span>
      ${categories.map(category => `<button type="button" data-command-category="${escapeHtml(category.label)}">${escapeHtml(category.label)} <em>${category.count}</em></button>`).join('')}
    </div>
  `;
}

function renderCommandPalette() {
  const query = commandInput.value.trim();
  const allItems = commandItems();
  const items = allItems
    .map(item => ({ item, score: commandScore(item, query) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 18)
    .map(row => row.item);
  commandResults.innerHTML = renderCommandCategoryStrip(allItems);
  commandActiveIndex = Math.min(commandActiveIndex, Math.max(0, items.length - 1));
  if (!items.length) {
    commandResults.innerHTML += commandEmptyHtml(query);
    return;
  }
  items.forEach((item, index) => {
    const row = el('button', `command-row${index === commandActiveIndex ? ' active' : ''}`);
    const recent = isRecentCommand(item.id);
    const category = commandCategory(item);
    row.type = 'button';
    row.dataset.commandId = item.id;
    row.innerHTML = `
      <span class="command-icon">${escapeHtml(item.icon)}</span>
      <span class="command-body"><strong>${escapeHtml(item.title)}</strong><span class="command-hint"><small>${escapeHtml(category)}</small>${escapeHtml(item.hint)}</span></span>
      ${recent ? '<span class="command-recent">Recent</span>' : item.kbd ? `<span class="command-kbd">${escapeHtml(item.kbd)}</span>` : '<span></span>'}`;
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

function openCommandPaletteQuery(query) {
  commandOpen = true;
  commandOverlay.classList.remove('hidden');
  commandInput.value = query;
  commandActiveIndex = 0;
  renderCommandPalette();
  requestAnimationFrame(() => {
    commandInput.focus();
    commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
  });
}

function closeCommandPalette() {
  commandOpen = false;
  commandOverlay.classList.add('hidden');
  commandInput.blur();
}

async function runCommand(item) {
  closeCommandPalette();
  rememberCommand(item);
  await item.run();
}

commandInput?.addEventListener('input', () => {
  commandActiveIndex = 0;
  renderCommandPalette();
});

commandResults?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-command-category]');
  if (chip) {
    openCommandPaletteQuery(chip.dataset.commandCategory || '');
    return;
  }
  const category = event.target.closest('[data-command-empty-category]');
  if (category) {
    openCommandPaletteQuery(category.dataset.commandEmptyCategory || '');
    return;
  }
  const action = event.target.closest('[data-command-empty-action]');
  if (!action) return;
  const item = commandItems().find(command => command.id === action.dataset.commandEmptyAction);
  if (item) runCommand(item);
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
  const items = readDraftTrashRaw();
  const pruned = activeTrashItems(items);
  if (pruned.length !== items.length) localStorage.setItem(DRAFT_TRASH_KEY, JSON.stringify(pruned));
  return pruned;
}

function readDraftTrashRaw() {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(DRAFT_TRASH_KEY) || '[]');
  } catch {
    items = [];
  }
  return Array.isArray(items) ? items : [];
}

function activeTrashItems(items) {
  const cutoff = Date.now() - DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000;
  return items.filter(item => item && item.deletedAt && new Date(item.deletedAt).getTime() >= cutoff);
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
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
}

function trashExpiryDate(deletedAt) {
  const expires = new Date(deletedAt).getTime() + DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000;
  return Number.isFinite(expires) ? new Date(expires).toLocaleDateString() : 'Unknown';
}

function trashRetentionState(deletedAt) {
  const days = daysLeft(deletedAt);
  if (days <= 1) return { className: 'urgent', label: 'Expires today' };
  if (days <= 3) return { className: 'soon', label: `${days} days left` };
  return { className: 'safe', label: `${days} days left` };
}

function trashRetentionBadge(deletedAt) {
  const state = trashRetentionState(deletedAt);
  return `<span class="trash-retention ${state.className}">${escapeHtml(state.label)}</span>`;
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

function confirmPermanentTrashAction(message) {
  return window.confirm(message);
}

async function deleteDraftTrashItem(itemId) {
  const items = loadDraftTrash();
  const item = items.find(entry => entry.id === itemId);
  if (!item) return;
  const label = item.title || 'Untitled draft';
  if (!confirmPermanentTrashAction(`Permanently delete "${label}" from Trash? This cannot be undone.`)) {
    statusText.textContent = 'Permanent delete cancelled';
    return;
  }
  saveDraftTrash(items.filter(entry => entry.id !== itemId));
  await showTrashView();
  statusText.textContent = 'Trash draft permanently deleted';
}

async function copyDraftTrashItem(itemId) {
  const item = loadDraftTrash().find(entry => entry.id === itemId);
  if (!item) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(item.content || '');
  statusText.textContent = 'Trash draft copied';
}

async function copyDraftTrashItemJson(itemId) {
  const item = loadDraftTrash().find(entry => entry.id === itemId);
  if (!item) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(trashItemJson('Draft', item), null, 2) + '\n');
  statusText.textContent = 'Trash draft metadata copied as JSON';
}

async function emptyDraftTrash() {
  saveDraftTrash([]);
  await showTrashView();
}

function renderTrashRows(items) {
  if (!items.length) return trashEmptyStateHtml('No deleted drafts in Trash.', `Deleted drafts stay restorable here for ${DRAFT_TRASH_DAYS} days.`);
  return `<div class="trash-list">${items.map(item => {
    const state = trashRetentionState(item.deletedAt);
    return `
    <div class="trash-row ${state.className}">
      <div class="trash-body">
        <div class="trash-title-line"><strong>${escapeHtml(item.title || 'Untitled')}</strong>${trashRetentionBadge(item.deletedAt)}</div>
        <span>Deleted ${escapeHtml(new Date(item.deletedAt).toLocaleString())} · expires ${escapeHtml(trashExpiryDate(item.deletedAt))}</span>
        <p>${escapeHtml((item.content || '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Empty draft')}</p>
      </div>
      <div class="trash-actions">
        <button data-trash-restore="${escapeHtml(item.id)}">Restore</button>
        <button data-trash-copy="${escapeHtml(item.id)}">Copy</button>
        <button data-trash-copy-json="${escapeHtml(item.id)}">JSON</button>
        <button data-trash-delete="${escapeHtml(item.id)}" class="danger">Delete</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function trashEmptyStateHtml(message, detail) {
  return `
    <div class="trash-empty">
      <strong>${escapeHtml(message)}</strong>
      <span>${escapeHtml(detail)}</span>
      <div class="trash-empty-actions">
        <button type="button" data-trash-guide>Guide</button>
        <button type="button" data-trash-audit>Audit</button>
        <button type="button" data-trash-cleanup-profile>Cleanup Profile</button>
      </div>
    </div>`;
}

async function loadFileTrash() {
  try {
    if (window.go?.main?.App?.ListFileTrash) return await window.go.main.App.ListFileTrash();
  } catch {}
  return [];
}

function renderFileTrashRows(items) {
  if (!items.length) return trashEmptyStateHtml('No saved files in Trash.', 'Saved files moved to Trash appear here with restore paths and expiry dates.');
  return `<div class="trash-list">${items.map(item => {
    const state = trashRetentionState(item.deletedAt);
    return `
    <div class="trash-row ${state.className}">
      <div class="trash-body">
        <div class="trash-title-line"><strong>${escapeHtml(item.title || basename(item.originalPath) || 'File')}</strong>${trashRetentionBadge(item.deletedAt)}</div>
        <span>Deleted ${escapeHtml(new Date(item.deletedAt).toLocaleString())} · expires ${escapeHtml(trashExpiryDate(item.deletedAt))} · ${escapeHtml(typeLabel(getFileType(item.originalPath, item.kind)))}</span>
        <p>${escapeHtml(item.originalPath || '')} · ${formatBytes(item.size || 0)}</p>
      </div>
      <div class="trash-actions">
        <button data-file-trash-restore="${escapeHtml(item.id)}">Restore</button>
        <button data-file-trash-copy-path="${escapeHtml(item.id)}">Copy Path</button>
        <button data-file-trash-copy-json="${escapeHtml(item.id)}">JSON</button>
        <button data-file-trash-delete="${escapeHtml(item.id)}" class="danger">Delete</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function markdownTableCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function trashItemMarkdownRow(kind, item) {
  const title = kind === 'File' ? (item.title || basename(item.originalPath) || 'File') : (item.title || 'Untitled');
  const detail = kind === 'File'
    ? `${item.originalPath || ''} ${formatBytes(item.size || 0)}`
    : (item.content || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const deleted = item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'Unknown';
  return `| ${kind} | ${markdownTableCell(title)} | ${markdownTableCell(deleted)} | ${markdownTableCell(trashExpiryDate(item.deletedAt))} | ${markdownTableCell(trashRetentionState(item.deletedAt).label)} | ${markdownTableCell(detail || '-')} |`;
}

function trashReportToMarkdown(draftItems, fileItems) {
  const total = draftItems.length + fileItems.length;
  const lines = [
    '# Markpad Trash Report',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    `Retention: ${DRAFT_TRASH_DAYS} days`,
    `Items: ${total} (${fileItems.length} saved file${fileItems.length === 1 ? '' : 's'}, ${draftItems.length} draft${draftItems.length === 1 ? '' : 's'})`,
    '',
  ];
  if (!total) {
    lines.push('Trash is empty.');
    return `${lines.join('\n')}\n`;
  }
  lines.push('| Type | Title | Deleted | Expires | Retention | Detail |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  fileItems.forEach(item => lines.push(trashItemMarkdownRow('File', item)));
  draftItems.forEach(item => lines.push(trashItemMarkdownRow('Draft', item)));
  return `${lines.join('\n')}\n`;
}

function trashItemCsvRow(kind, item) {
  const title = kind === 'File' ? (item.title || basename(item.originalPath) || 'File') : (item.title || 'Untitled');
  const detail = kind === 'File'
    ? (item.originalPath || '')
    : (item.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return [
    kind,
    title,
    item.deletedAt || '',
    trashExpiryDate(item.deletedAt),
    daysLeft(item.deletedAt),
    trashRetentionState(item.deletedAt).label,
    kind === 'File' ? (item.kind || getFileType(item.originalPath, item.kind)) : 'draft',
    kind === 'File' ? Number(item.size || 0) : byteSize(item.content || ''),
    detail || '',
  ];
}

function trashReportToCsv(draftItems, fileItems) {
  const rows = [
    ['type', 'title', 'deletedAt', 'expires', 'daysLeft', 'retention', 'kind', 'bytes', 'detail'],
    ...fileItems.map(item => trashItemCsvRow('File', item)),
    ...draftItems.map(item => trashItemCsvRow('Draft', item)),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function trashItemJson(kind, item) {
  const title = kind === 'File' ? (item.title || basename(item.originalPath) || 'File') : (item.title || 'Untitled');
  const detail = kind === 'File'
    ? (item.originalPath || '')
    : (item.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return {
    type: kind.toLowerCase(),
    title,
    deletedAt: item.deletedAt || '',
    expires: trashExpiryDate(item.deletedAt),
    daysLeft: daysLeft(item.deletedAt),
    retention: trashRetentionState(item.deletedAt).label,
    kind: kind === 'File' ? (item.kind || getFileType(item.originalPath, item.kind)) : 'draft',
    bytes: kind === 'File' ? Number(item.size || 0) : byteSize(item.content || ''),
    detail: detail || '',
  };
}

function trashReportToJson(draftItems, fileItems) {
  const items = [
    ...fileItems.map(item => trashItemJson('File', item)),
    ...draftItems.map(item => trashItemJson('Draft', item)),
  ];
  return JSON.stringify({
    type: 'markpad-trash-report',
    version: 1,
    exportedAt: new Date().toISOString(),
    retentionDays: DRAFT_TRASH_DAYS,
    count: items.length,
    fileCount: fileItems.length,
    draftCount: draftItems.length,
    items,
  }, null, 2) + '\n';
}

function trashRetentionSummaryText(draftItems, fileItems) {
  const allItems = [...draftItems, ...fileItems];
  const total = allItems.length;
  const urgent = allItems.filter(item => daysLeft(item.deletedAt) <= 1).length;
  const soon = allItems.filter(item => {
    const days = daysLeft(item.deletedAt);
    return days > 1 && days <= 3;
  }).length;
  const draftBytes = draftItems.reduce((sum, item) => sum + byteSize(item.content || ''), 0);
  const fileBytes = fileItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const parts = [`${total} item${total === 1 ? '' : 's'}`, `auto-cleanup after ${DRAFT_TRASH_DAYS} days`];
  if (urgent) parts.push(`${urgent} expiring today`);
  if (soon) parts.push(`${soon} expiring soon`);
  if (total) parts.push(`${formatBytes(draftBytes + fileBytes)} retained`);
  return parts.join(' · ');
}

function trashRetentionAuditSnapshot(draftItems, fileItems) {
  const allItems = [...draftItems.map(item => ({ ...item, kind: 'draft' })), ...fileItems.map(item => ({ ...item, kind: 'file' }))];
  const counts = allItems.reduce((acc, item) => {
    const days = daysLeft(item.deletedAt);
    if (days <= 1) acc.urgent += 1;
    else if (days <= 3) acc.soon += 1;
    else acc.safe += 1;
    return acc;
  }, { urgent: 0, soon: 0, safe: 0 });
  const draftBytes = draftItems.reduce((sum, item) => sum + byteSize(item.content || ''), 0);
  const fileBytes = fileItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const next = allItems
    .map(item => ({ item, expiresAt: new Date(item.deletedAt).getTime() + DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000 }))
    .filter(entry => Number.isFinite(entry.expiresAt))
    .sort((a, b) => a.expiresAt - b.expiresAt)[0];
  return {
    total: allItems.length,
    drafts: draftItems.length,
    files: fileItems.length,
    draftBytes,
    fileBytes,
    totalBytes: draftBytes + fileBytes,
    urgent: counts.urgent,
    soon: counts.soon,
    safe: counts.safe,
    retentionDays: DRAFT_TRASH_DAYS,
    nextExpiry: next ? new Date(next.expiresAt).toLocaleString() : 'None',
    nextTitle: next ? (next.item.title || basename(next.item.originalPath) || 'Untitled') : '',
  };
}

function trashRetentionMeter(audit) {
  const total = Math.max(1, Number(audit.total || 0));
  const buckets = [
    { label: 'Today', value: Number(audit.urgent || 0), className: 'urgent' },
    { label: 'Soon', value: Number(audit.soon || 0), className: 'soon' },
    { label: 'Safe', value: Number(audit.safe || 0), className: 'safe' },
  ];
  const segments = buckets
    .filter(bucket => bucket.value > 0)
    .map(bucket => {
      const width = Math.round((bucket.value / total) * 1000) / 10;
      return `<span class="trash-meter-segment ${bucket.className}" style="width:${width}%;" title="${escapeHtml(`${bucket.label}: ${bucket.value}`)}"></span>`;
    })
    .join('');
  const legend = buckets.map(bucket => `
    <span class="trash-meter-chip ${bucket.className}">
      <strong>${bucket.value}</strong>
      ${escapeHtml(bucket.label)}
    </span>
  `).join('');
  return `
    <div class="trash-meter" aria-label="Trash retention distribution">
      <div class="trash-meter-top">
        <strong>${Number(audit.total || 0)} retained</strong>
        <span>${audit.total ? `Next expiry: ${escapeHtml(audit.nextTitle || 'Untitled')} · ${escapeHtml(audit.nextExpiry)}` : 'No cleanup scheduled'}</span>
      </div>
      <div class="trash-meter-track">${segments || '<span class="trash-meter-segment empty" style="width:100%;"></span>'}</div>
      <div class="trash-meter-legend">${legend}</div>
    </div>
  `;
}

async function showTrashRetentionAudit() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  const audit = trashRetentionAuditSnapshot(draftItems, fileItems);
  showModal('Trash Retention Audit', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${audit.total}</strong><span>Retained items</span><small>${audit.drafts} drafts · ${audit.files} saved files</small></div>
      <div class="diag-card"><strong>${formatBytes(audit.totalBytes)}</strong><span>Retained size</span><small>${formatBytes(audit.draftBytes)} drafts · ${formatBytes(audit.fileBytes)} files</small></div>
      <div class="diag-card"><strong>${audit.urgent}</strong><span>Expiring today</span><small>Restore or clean intentionally</small></div>
      <div class="diag-card"><strong>${audit.soon}</strong><span>Expiring soon</span><small>Within 3 days</small></div>
      <div class="diag-card"><strong>${audit.safe}</strong><span>Safe window</span><small>More than 3 days left</small></div>
      <div class="diag-card"><strong>${audit.retentionDays}</strong><span>Retention days</span><small>Local default cleanup window</small></div>
    </div>
    <p class="diag-note">${audit.total ? `Next expiry: ${escapeHtml(audit.nextTitle)} at ${escapeHtml(audit.nextExpiry)}.` : 'Trash is empty. Nothing is scheduled for cleanup.'}</p>
    <p class="diag-note">This audit is metadata-only. It does not export deleted draft contents or inspect files outside the existing local Trash manifest.</p>
  `);
}

function trashCleanupProfileSnapshot(rawDraftItems, activeDraftItems, fileItems) {
  const now = Date.now();
  const activeIds = new Set(activeDraftItems.map(item => item.id));
  const expiredDraftItems = rawDraftItems.filter(item => item?.id && !activeIds.has(item.id));
  const visibleExpiredFileItems = fileItems.filter(item => {
    const expiresAt = new Date(item.deletedAt).getTime() + DRAFT_TRASH_DAYS * 24 * 60 * 60 * 1000;
    return Number.isFinite(expiresAt) && expiresAt <= now;
  });
  const audit = trashRetentionAuditSnapshot(activeDraftItems, fileItems);
  const expiredDraftBytes = expiredDraftItems.reduce((sum, item) => sum + byteSize(item.content || ''), 0);
  const expiredFileBytes = visibleExpiredFileItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  return {
    type: 'markpad-trash-cleanup-profile',
    version: 1,
    sampledAt: new Date().toISOString(),
    retentionDays: DRAFT_TRASH_DAYS,
    retained: {
      total: audit.total,
      drafts: audit.drafts,
      files: audit.files,
      bytes: audit.totalBytes,
      draftBytes: audit.draftBytes,
      fileBytes: audit.fileBytes,
      urgent: audit.urgent,
      soon: audit.soon,
      safe: audit.safe,
      nextExpiry: audit.nextExpiry,
      nextTitle: audit.nextTitle,
    },
    cleanupCandidates: {
      expiredDrafts: expiredDraftItems.length,
      visibleExpiredFiles: visibleExpiredFileItems.length,
      draftBytes: expiredDraftBytes,
      fileBytes: expiredFileBytes,
      totalBytes: expiredDraftBytes + expiredFileBytes,
    },
    backend: {
      fileTrashList: !!window.go?.main?.App?.ListFileTrash,
      cleanupExpiredFileTrash: !!window.go?.main?.App?.CleanupExpiredFileTrash,
      emptyFileTrash: !!window.go?.main?.App?.EmptyFileTrash,
    },
    actions: {
      cleanExpired: 'Deletes only expired local Trash items where cleanup support exists.',
      emptyTrash: 'Deletes every retained Trash item after confirmation.',
      restore: 'Restores individual drafts or saved files before permanent cleanup.',
    },
    note: 'Cleanup profile is metadata-only and does not export deleted draft contents.',
  };
}

async function currentTrashCleanupProfileSnapshot() {
  const rawDraftItems = readDraftTrashRaw();
  const activeDraftItems = activeTrashItems(rawDraftItems);
  const fileItems = await loadFileTrash();
  return trashCleanupProfileSnapshot(rawDraftItems, activeDraftItems, fileItems);
}

function trashCleanupProfileMarkdown(snapshot) {
  return [
    '# Markpad Trash Cleanup Profile',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    `Retention: ${snapshot.retentionDays} days`,
    '',
    '## Retained Trash',
    '',
    `- Items: ${snapshot.retained.total} (${snapshot.retained.drafts} drafts, ${snapshot.retained.files} files)`,
    `- Bytes: ${formatBytes(snapshot.retained.bytes || 0)} (${formatBytes(snapshot.retained.draftBytes || 0)} drafts, ${formatBytes(snapshot.retained.fileBytes || 0)} files)`,
    `- Expiring today: ${snapshot.retained.urgent}`,
    `- Expiring soon: ${snapshot.retained.soon}`,
    `- Safe window: ${snapshot.retained.safe}`,
    `- Next expiry: ${snapshot.retained.nextExpiry || 'None'}${snapshot.retained.nextTitle ? ` (${snapshot.retained.nextTitle})` : ''}`,
    '',
    '## Cleanup candidates',
    '',
    `- Expired drafts: ${snapshot.cleanupCandidates.expiredDrafts}`,
    `- Visible expired files: ${snapshot.cleanupCandidates.visibleExpiredFiles}`,
    `- Candidate bytes: ${formatBytes(snapshot.cleanupCandidates.totalBytes || 0)}`,
    '',
    '## Backend support',
    '',
    `- File Trash list: ${snapshot.backend.fileTrashList ? 'available' : 'unavailable'}`,
    `- Clean expired files: ${snapshot.backend.cleanupExpiredFileTrash ? 'available' : 'unavailable'}`,
    `- Empty file Trash: ${snapshot.backend.emptyFileTrash ? 'available' : 'unavailable'}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function trashCleanupProfileJson(snapshot) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function trashCleanupProfileCsv(snapshot) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['retention_days', Number(snapshot.retentionDays || DRAFT_TRASH_DAYS)],
    ['retained_total', Number(snapshot.retained.total || 0)],
    ['retained_drafts', Number(snapshot.retained.drafts || 0)],
    ['retained_files', Number(snapshot.retained.files || 0)],
    ['retained_bytes', Number(snapshot.retained.bytes || 0)],
    ['retained_draft_bytes', Number(snapshot.retained.draftBytes || 0)],
    ['retained_file_bytes', Number(snapshot.retained.fileBytes || 0)],
    ['retained_urgent', Number(snapshot.retained.urgent || 0)],
    ['retained_soon', Number(snapshot.retained.soon || 0)],
    ['retained_safe', Number(snapshot.retained.safe || 0)],
    ['expired_drafts', Number(snapshot.cleanupCandidates.expiredDrafts || 0)],
    ['visible_expired_files', Number(snapshot.cleanupCandidates.visibleExpiredFiles || 0)],
    ['candidate_bytes', Number(snapshot.cleanupCandidates.totalBytes || 0)],
    ['file_trash_list_available', snapshot.backend.fileTrashList ? 'true' : 'false'],
    ['cleanup_expired_file_trash_available', snapshot.backend.cleanupExpiredFileTrash ? 'true' : 'false'],
    ['empty_file_trash_available', snapshot.backend.emptyFileTrash ? 'true' : 'false'],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function showTrashCleanupProfile() {
  const snapshot = await currentTrashCleanupProfileSnapshot();
  const expiredCleanupCandidates = Number(snapshot.cleanupCandidates?.expiredDrafts || 0)
    + Number(snapshot.cleanupCandidates?.visibleExpiredFiles || 0);
  showModal('Trash Cleanup Profile', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${snapshot.retained.total}</strong><span>Retained items</span><small>${snapshot.retained.drafts} drafts · ${snapshot.retained.files} files</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.retained.bytes || 0)}</strong><span>Retained size</span><small>${formatBytes(snapshot.retained.draftBytes || 0)} drafts · ${formatBytes(snapshot.retained.fileBytes || 0)} files</small></div>
      <div class="diag-card"><strong>${snapshot.cleanupCandidates.expiredDrafts}</strong><span>Expired drafts</span><small>${formatBytes(snapshot.cleanupCandidates.draftBytes || 0)} cleanup candidate</small></div>
      <div class="diag-card"><strong>${snapshot.cleanupCandidates.visibleExpiredFiles}</strong><span>Expired files</span><small>${formatBytes(snapshot.cleanupCandidates.fileBytes || 0)} visible candidate</small></div>
      <div class="diag-card"><strong>${snapshot.retained.urgent}</strong><span>Expiring today</span><small>${snapshot.retained.soon} soon · ${snapshot.retained.safe} safe</small></div>
      <div class="diag-card"><strong>${snapshot.backend.cleanupExpiredFileTrash ? 'yes' : 'no'}</strong><span>File cleanup bridge</span><small>${snapshot.backend.emptyFileTrash ? 'empty supported' : 'empty unavailable'}</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-trash-cleanup-md>Copy MD</button>
      <button data-export-trash-cleanup-md>Export MD</button>
      <button data-copy-trash-cleanup-json>Copy JSON</button>
      <button data-export-trash-cleanup-json>Export JSON</button>
      <button data-copy-trash-cleanup-csv>Copy CSV</button>
      <button data-export-trash-cleanup-csv>Export CSV</button>
      <button data-trash-clean-expired ${expiredCleanupCandidates ? '' : 'disabled'}>Clean Expired</button>
      <button data-trash-audit>Audit Retention</button>
      <button data-trash-guide>Guide</button>
    </div>
    <p class="diag-note">${expiredCleanupCandidates ? `${expiredCleanupCandidates} expired Trash cleanup candidate${expiredCleanupCandidates === 1 ? '' : 's'} available.` : 'No expired Trash cleanup candidates are available from the current profile.'} ${escapeHtml(snapshot.note)}</p>
  `);
}

async function copyTrashCleanupProfileMarkdown() {
  await navigator.clipboard.writeText(trashCleanupProfileMarkdown(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile copied as Markdown';
}

async function exportTrashCleanupProfileMarkdown() {
  downloadText('markpad-trash-cleanup-profile.md', 'text/markdown', trashCleanupProfileMarkdown(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile exported as Markdown';
}

async function copyTrashCleanupProfileJson() {
  await navigator.clipboard.writeText(trashCleanupProfileJson(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile copied as JSON';
}

async function exportTrashCleanupProfileJson() {
  downloadText('markpad-trash-cleanup-profile.json', 'application/json', trashCleanupProfileJson(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile exported as JSON';
}

async function copyTrashCleanupProfileCsv() {
  await navigator.clipboard.writeText(trashCleanupProfileCsv(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile copied as CSV';
}

async function exportTrashCleanupProfileCsv() {
  downloadText('markpad-trash-cleanup-profile.csv', 'text/csv', trashCleanupProfileCsv(await currentTrashCleanupProfileSnapshot()));
  statusText.textContent = 'Trash cleanup profile exported as CSV';
}

async function copyTrashReportMarkdown() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  await navigator.clipboard.writeText(trashReportToMarkdown(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} copied as Markdown`;
}

async function copyFileTrashPath(itemId) {
  const item = (await loadFileTrash()).find(entry => entry.id === itemId);
  if (!item) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(item.originalPath || item.path || '');
  statusText.textContent = 'Trash file path copied';
}

async function copyFileTrashItemJson(itemId) {
  const item = (await loadFileTrash()).find(entry => entry.id === itemId);
  if (!item) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(trashItemJson('File', item), null, 2) + '\n');
  statusText.textContent = 'Trash file metadata copied as JSON';
}

async function exportTrashReportMarkdown() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  downloadText('markpad-trash-report.md', 'text/markdown', trashReportToMarkdown(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} exported as Markdown`;
}

async function copyTrashReportCsv() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  await navigator.clipboard.writeText(trashReportToCsv(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} copied as CSV`;
}

async function copyTrashReportJson() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  await navigator.clipboard.writeText(trashReportToJson(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} copied as JSON`;
}

async function exportTrashReportCsv() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  downloadText('markpad-trash-report.csv', 'text/csv', trashReportToCsv(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} exported as CSV`;
}

async function exportTrashReportJson() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  downloadText('markpad-trash-report.json', 'application/json', trashReportToJson(draftItems, fileItems));
  const total = draftItems.length + fileItems.length;
  statusText.textContent = `${total} Trash item${total === 1 ? '' : 's'} exported as JSON`;
}

function showTrashGuide() {
  showModal('Trash Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${DRAFT_TRASH_DAYS} days</strong><span>Retention</span><small>Expired items can be cleaned manually</small></div>
      <div class="diag-card"><strong>drafts</strong><span>localStorage</span><small>Unsaved notes stay restorable without disk files</small></div>
      <div class="diag-card"><strong>saved files</strong><span>disk Trash manifest</span><small>Restored through the Wails backend</small></div>
      <div class="diag-card"><strong>reports</strong><span>MD / JSON / CSV</span><small>Audit what is retained before cleanup</small></div>
      <div class="diag-card"><strong>cleanup</strong><span>Clean Expired</span><small>Only removes items past retention</small></div>
      <div class="diag-card"><strong>empty</strong><span>Empty Trash</span><small>Permanent local cleanup action</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-trash-audit>Audit Retention</button>
      <button data-trash-cleanup-profile>Cleanup Profile</button>
      <button data-trash-copy-report>Copy Report</button>
      <button data-trash-export-report>Export Report</button>
      <button data-trash-copy-json>Copy JSON</button>
      <button data-trash-export-json>Export JSON</button>
      <button data-trash-copy-csv>Copy CSV</button>
      <button data-trash-export-csv>Export CSV</button>
      <button data-trash-clean-expired>Clean Expired</button>
    </div>
    <p class="diag-note">Trash is local-only. Reports include metadata and expiry dates; draft content is only copied from per-item actions to avoid exporting deleted text accidentally.</p>
  `);
}

async function emptyAllTrash() {
  const draftItems = loadDraftTrash();
  const fileItems = await loadFileTrash();
  const total = draftItems.length + fileItems.length;
  if (!total) {
    statusText.textContent = 'Trash is empty';
    await showTrashView();
    return;
  }
  if (!confirmPermanentTrashAction(`Permanently delete ${total} Trash item${total === 1 ? '' : 's'}? This cannot be undone.`)) {
    statusText.textContent = 'Empty Trash cancelled';
    return;
  }
  saveDraftTrash([]);
  try {
    if (window.go?.main?.App?.EmptyFileTrash) await window.go.main.App.EmptyFileTrash();
  } catch {}
  await showTrashView();
  statusText.textContent = 'Trash emptied permanently';
}

async function cleanupExpiredTrash() {
  const draftItems = readDraftTrashRaw();
  const activeDrafts = activeTrashItems(draftItems);
  const draftRemoved = Math.max(0, draftItems.length - activeDrafts.length);
  if (draftRemoved > 0) saveDraftTrash(activeDrafts);

  let fileRemoved = 0;
  try {
    if (window.go?.main?.App?.CleanupExpiredFileTrash) {
      const result = await window.go.main.App.CleanupExpiredFileTrash();
      fileRemoved = Number(result?.removed || 0);
    }
  } catch {}

  const total = draftRemoved + fileRemoved;
  statusText.textContent = total
    ? `Cleaned ${total} expired Trash item${total === 1 ? '' : 's'}`
    : 'No expired Trash items';
  await showTrashView();
}

async function showTrashView() {
  const items = loadDraftTrash();
  const fileItems = await loadFileTrash();
  const total = items.length + fileItems.length;
  const audit = trashRetentionAuditSnapshot(items, fileItems);
  const cleanupProfile = await currentTrashCleanupProfileSnapshot();
  const expiredCleanupCandidates = Number(cleanupProfile.cleanupCandidates?.expiredDrafts || 0)
    + Number(cleanupProfile.cleanupCandidates?.visibleExpiredFiles || 0);
  showModal('Trash', `
    <div class="trash-head">
      <span>${escapeHtml(trashRetentionSummaryText(items, fileItems))}</span>
      <button data-trash-copy-report ${total ? '' : 'disabled'}>Copy Report</button>
      <button data-trash-export-report ${total ? '' : 'disabled'}>Export Report</button>
      <button data-trash-copy-csv ${total ? '' : 'disabled'}>Copy CSV</button>
      <button data-trash-export-csv ${total ? '' : 'disabled'}>Export CSV</button>
      <button data-trash-copy-json ${total ? '' : 'disabled'}>Copy JSON</button>
      <button data-trash-export-json ${total ? '' : 'disabled'}>Export JSON</button>
      <button data-trash-audit>Audit</button>
      <button data-trash-cleanup-profile>Profile</button>
      <button data-trash-guide>Guide</button>
      <button data-trash-clean-expired ${expiredCleanupCandidates ? '' : 'disabled'}>Clean Expired</button>
      <button data-trash-empty ${total ? '' : 'disabled'}>Empty Trash</button>
    </div>
    ${trashRetentionMeter(audit)}
    <div class="trash-cleanup-note ${expiredCleanupCandidates ? 'ready' : 'idle'}">
      <strong>${expiredCleanupCandidates ? `${expiredCleanupCandidates} expired cleanup candidate${expiredCleanupCandidates === 1 ? '' : 's'}` : 'No expired cleanup candidates'}</strong>
      <span>${DRAFT_TRASH_DAYS}-day retention is active. Clean Expired only removes items past retention; use Profile before permanent cleanup.</span>
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

function undoHistoryFootprint() {
  let editorStates = 0;
  let editorBytes = 0;
  editHistories.forEach((history) => {
    editorStates += history.states?.length || 0;
    for (const state of history.states || []) {
      editorBytes += byteSize(state.content || '');
    }
  });
  const canvasStates = canvasHistory.length;
  const canvasBytes = canvasHistory.reduce((sum, snap) => sum + byteSize(snap || ''), 0);
  return { editorStates, editorBytes, canvasStates, canvasBytes };
}

function loadedSearchCacheFootprint() {
  return {
    bytes: Math.max(0, loadedSearchCacheBytes),
    entries: loadedSearchCache.size,
    maxBytes: SEARCH_CACHE_MAX_BYTES,
    maxEntries: SEARCH_CACHE_MAX_ENTRIES,
  };
}

async function localFootprintSnapshot() {
  const docs = await loadedDocumentFootprint();
  const runtimeStats = await runtimeFootprint();
  const undo = undoHistoryFootprint();
  const searchCache = loadedSearchCacheFootprint();
  const canvasBytes = byteSize(localStorage.getItem(CANVAS_DOC_KEY) || '') + byteSize(localStorage.getItem(CANVAS_SESSION_KEY) || '');
  const trashItems = loadDraftTrash();
  const trashBytes = byteSize(localStorage.getItem(DRAFT_TRASH_KEY) || '');
  const fileTrashItems = await loadFileTrash();
  const fileTrashBytes = fileTrashItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const trashAudit = trashRetentionAuditSnapshot(trashItems, fileTrashItems);
  const markpadLocalBytes = localStorageMarkpadBytes();
  return {
    type: 'markpad-local-footprint',
    version: 1,
    sampledAt: new Date().toISOString(),
    runtime: runtimeStats ? {
      rssAvailable: !!runtimeStats.rssAvailable,
      rssSource: runtimeStats.rssSource || '',
      processRss: Number(runtimeStats.processRss || 0),
      goAlloc: Number(runtimeStats.goAlloc || 0),
      goSys: Number(runtimeStats.goSys || 0),
      goNumGC: Number(runtimeStats.goNumGC || 0),
    } : null,
    loadedDocuments: docs,
    searchCache,
    canvas: {
      draftSessionBytes: canvasBytes,
      elementCount: (canvasDoc?.elements || []).length,
    },
    undo: {
      editorBytes: undo.editorBytes,
      editorStates: undo.editorStates,
      canvasBytes: undo.canvasBytes,
      canvasStates: undo.canvasStates,
    },
    trash: {
      draftBytes: trashBytes,
      draftCount: trashItems.length,
      fileBytes: fileTrashBytes,
      fileCount: fileTrashItems.length,
      retentionDays: trashAudit.retentionDays,
      urgentCount: trashAudit.urgent,
      soonCount: trashAudit.soon,
      safeCount: trashAudit.safe,
      nextExpiry: trashAudit.nextExpiry,
      nextTitle: trashAudit.nextTitle,
    },
    localStorage: {
      markpadBytes: markpadLocalBytes,
    },
    note: 'Sampled on demand without scanning the workspace.',
  };
}

async function copyLocalFootprintJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(await localFootprintSnapshot(), null, 2) + '\n');
  statusText.textContent = 'Local footprint copied as JSON';
}

async function exportLocalFootprintJson() {
  downloadText('markpad-local-footprint.json', 'application/json', JSON.stringify(await localFootprintSnapshot(), null, 2) + '\n');
  statusText.textContent = 'Local footprint exported as JSON';
}

function localFootprintSnapshotToMarkdown(snapshot) {
  const runtime = snapshot.runtime || {};
  return [
    '# Markpad Local Footprint',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    '',
    '## Runtime',
    '',
    `- Process RSS: ${runtime.rssAvailable ? formatBytes(runtime.processRss) : 'N/A'} (${runtime.rssSource || 'unavailable'})`,
    `- Go heap alloc: ${runtime.goAlloc ? formatBytes(runtime.goAlloc) : 'N/A'}`,
    `- Go sys: ${runtime.goSys ? formatBytes(runtime.goSys) : 'N/A'}`,
    `- Go GC count: ${Number(runtime.goNumGC || 0)}`,
    '',
    '## Loaded Documents',
    '',
    `- Editable text: ${formatBytes(snapshot.loadedDocuments.editableBytes || 0)}`,
    `- Editable count: ${snapshot.loadedDocuments.editableCount || 0}`,
    `- Read-only count: ${snapshot.loadedDocuments.readOnlyCount || 0}`,
    `- Search cache: ${formatBytes(snapshot.searchCache?.bytes || 0)} (${snapshot.searchCache?.entries || 0}/${snapshot.searchCache?.maxEntries || SEARCH_CACHE_MAX_ENTRIES} entries)`,
    '',
    '## Canvas and Undo',
    '',
    `- Canvas draft/session: ${formatBytes(snapshot.canvas.draftSessionBytes || 0)}`,
    `- Canvas elements: ${snapshot.canvas.elementCount || 0}`,
    `- Editor undo: ${formatBytes(snapshot.undo.editorBytes || 0)} (${snapshot.undo.editorStates || 0} states)`,
    `- Canvas undo: ${formatBytes(snapshot.undo.canvasBytes || 0)} (${snapshot.undo.canvasStates || 0} states)`,
    '',
    '## Trash and Local Storage',
    '',
    `- Draft trash: ${formatBytes(snapshot.trash.draftBytes || 0)} (${snapshot.trash.draftCount || 0} drafts)`,
    `- Saved file trash: ${formatBytes(snapshot.trash.fileBytes || 0)} (${snapshot.trash.fileCount || 0} files)`,
    `- Trash retention: ${snapshot.trash?.retentionDays || DRAFT_TRASH_DAYS} days`,
    `- Expiring today: ${snapshot.trash?.urgentCount || 0}`,
    `- Expiring soon: ${snapshot.trash?.soonCount || 0}`,
    `- Safe window: ${snapshot.trash?.safeCount || 0}`,
    `- Next expiry: ${snapshot.trash?.nextExpiry || 'None'}${snapshot.trash?.nextTitle ? ` (${snapshot.trash.nextTitle})` : ''}`,
    `- Markpad localStorage: ${formatBytes(snapshot.localStorage.markpadBytes || 0)}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function localFootprintSnapshotToCsv(snapshot) {
  const runtime = snapshot.runtime || {};
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt || ''],
    ['runtime_rss_available', runtime.rssAvailable ? 'true' : 'false'],
    ['runtime_rss_bytes', Number(runtime.processRss || 0)],
    ['runtime_go_alloc_bytes', Number(runtime.goAlloc || 0)],
    ['runtime_go_sys_bytes', Number(runtime.goSys || 0)],
    ['runtime_go_gc_count', Number(runtime.goNumGC || 0)],
    ['loaded_editable_bytes', Number(snapshot.loadedDocuments.editableBytes || 0)],
    ['loaded_editable_count', Number(snapshot.loadedDocuments.editableCount || 0)],
    ['loaded_readonly_count', Number(snapshot.loadedDocuments.readOnlyCount || 0)],
    ['search_cache_bytes', Number(snapshot.searchCache?.bytes || 0)],
    ['search_cache_entries', Number(snapshot.searchCache?.entries || 0)],
    ['search_cache_max_bytes', Number(snapshot.searchCache?.maxBytes || SEARCH_CACHE_MAX_BYTES)],
    ['search_cache_max_entries', Number(snapshot.searchCache?.maxEntries || SEARCH_CACHE_MAX_ENTRIES)],
    ['canvas_draft_session_bytes', Number(snapshot.canvas.draftSessionBytes || 0)],
    ['canvas_element_count', Number(snapshot.canvas.elementCount || 0)],
    ['editor_undo_bytes', Number(snapshot.undo.editorBytes || 0)],
    ['editor_undo_states', Number(snapshot.undo.editorStates || 0)],
    ['canvas_undo_bytes', Number(snapshot.undo.canvasBytes || 0)],
    ['canvas_undo_states', Number(snapshot.undo.canvasStates || 0)],
    ['draft_trash_bytes', Number(snapshot.trash.draftBytes || 0)],
    ['draft_trash_count', Number(snapshot.trash.draftCount || 0)],
    ['file_trash_bytes', Number(snapshot.trash.fileBytes || 0)],
    ['file_trash_count', Number(snapshot.trash.fileCount || 0)],
    ['trash_retention_days', Number(snapshot.trash?.retentionDays || DRAFT_TRASH_DAYS)],
    ['trash_urgent_count', Number(snapshot.trash?.urgentCount || 0)],
    ['trash_soon_count', Number(snapshot.trash?.soonCount || 0)],
    ['trash_safe_count', Number(snapshot.trash?.safeCount || 0)],
    ['trash_next_expiry', snapshot.trash?.nextExpiry || ''],
    ['trash_next_title', snapshot.trash?.nextTitle || ''],
    ['markpad_localstorage_bytes', Number(snapshot.localStorage.markpadBytes || 0)],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyLocalFootprintMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(localFootprintSnapshotToMarkdown(await localFootprintSnapshot()));
  statusText.textContent = 'Local footprint copied as Markdown';
}

async function exportLocalFootprintMarkdown() {
  downloadText('markpad-local-footprint.md', 'text/markdown', localFootprintSnapshotToMarkdown(await localFootprintSnapshot()));
  statusText.textContent = 'Local footprint exported as Markdown';
}

async function copyLocalFootprintCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(localFootprintSnapshotToCsv(await localFootprintSnapshot()));
  statusText.textContent = 'Local footprint copied as CSV';
}

async function exportLocalFootprintCsv() {
  downloadText('markpad-local-footprint.csv', 'text/csv', localFootprintSnapshotToCsv(await localFootprintSnapshot()));
  statusText.textContent = 'Local footprint exported as CSV';
}

async function showLocalFootprint() {
  const docs = await loadedDocumentFootprint();
  const runtimeStats = await runtimeFootprint();
  const undo = undoHistoryFootprint();
  const searchCache = loadedSearchCacheFootprint();
  const canvasBytes = byteSize(localStorage.getItem(CANVAS_DOC_KEY) || '') + byteSize(localStorage.getItem(CANVAS_SESSION_KEY) || '');
  const trashItems = loadDraftTrash();
  const trashBytes = byteSize(localStorage.getItem(DRAFT_TRASH_KEY) || '');
  const fileTrashItems = await loadFileTrash();
  const fileTrashBytes = fileTrashItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const trashAudit = trashRetentionAuditSnapshot(trashItems, fileTrashItems);
  const markpadLocalBytes = localStorageMarkpadBytes();
  showModal('Local Footprint', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${runtimeStats?.rssAvailable ? formatBytes(runtimeStats.processRss) : 'N/A'}</strong><span>Process RSS</span><small>${runtimeStats?.rssSource || 'Backend metric unavailable'}</small></div>
      <div class="diag-card"><strong>${runtimeStats ? formatBytes(runtimeStats.goAlloc) : 'N/A'}</strong><span>Go heap alloc</span><small>${runtimeStats ? `${formatBytes(runtimeStats.goSys)} Go sys · ${runtimeStats.goNumGC} GC` : 'Backend metric unavailable'}</small></div>
      <div class="diag-card"><strong>${formatBytes(docs.editableBytes)}</strong><span>Loaded editable text</span><small>${docs.editableCount} editable · ${docs.readOnlyCount} read-only loaded</small></div>
      <div class="diag-card"><strong>${formatBytes(searchCache.bytes)}</strong><span>Search cache</span><small>${searchCache.entries}/${searchCache.maxEntries} entries · cap ${formatBytes(searchCache.maxBytes)}</small></div>
      <div class="diag-card"><strong>${formatBytes(canvasBytes)}</strong><span>Canvas draft/session</span><small>${(canvasDoc?.elements || []).length} canvas elements</small></div>
      <div class="diag-card"><strong>${formatBytes(undo.editorBytes)}</strong><span>Editor undo history</span><small>${undo.editorStates} text snapshot${undo.editorStates === 1 ? '' : 's'} in memory</small></div>
      <div class="diag-card"><strong>${formatBytes(undo.canvasBytes)}</strong><span>Canvas undo history</span><small>${undo.canvasStates} canvas snapshot${undo.canvasStates === 1 ? '' : 's'} in memory</small></div>
      <div class="diag-card"><strong>${formatBytes(trashBytes)}</strong><span>Draft trash</span><small>${trashItems.length} retained draft${trashItems.length === 1 ? '' : 's'}</small></div>
      <div class="diag-card"><strong>${formatBytes(fileTrashBytes)}</strong><span>Saved file trash</span><small>${fileTrashItems.length} retained file${fileTrashItems.length === 1 ? '' : 's'} · stored on disk</small></div>
      <div class="diag-card"><strong>${trashAudit.urgent}</strong><span>Trash expiring today</span><small>${trashAudit.soon} soon · ${trashAudit.safe} safe</small></div>
      <div class="diag-card"><strong>${escapeHtml(trashAudit.nextExpiry)}</strong><span>Next trash expiry</span><small>${trashAudit.nextTitle ? escapeHtml(trashAudit.nextTitle) : 'No retained trash items'}</small></div>
      <div class="diag-card"><strong>${formatBytes(markpadLocalBytes)}</strong><span>Markpad localStorage</span><small>themes, layout, canvas, draft trash</small></div>
    </div>
    <div class="diag-heap"><strong>Browser heap</strong>${heapFootprintHtml()}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
      <button data-copy-footprint-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
      <button data-export-footprint-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
      <button data-copy-footprint-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
      <button data-export-footprint-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
      <button data-copy-footprint-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy CSV</button>
      <button data-export-footprint-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export CSV</button>
    </div>
    <p class="diag-note">Metrics are sampled only when this panel opens. Loaded text and local persisted UI data are counted without scanning the workspace; saved Trash reads the existing Trash manifest.</p>
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

async function openConfiguredLocalFolder() {
  try {
    if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.OpenExternalPath) {
      statusText.textContent = 'Open local folder unavailable';
      return;
    }
    const info = await window.go.main.App.GetLocalFolder();
    if (!info.path || info.missing) {
      statusText.textContent = info.missing ? 'Local folder is missing' : 'No local folder set';
      return;
    }
    await window.go.main.App.OpenExternalPath(info.path);
    statusText.textContent = 'Opened local folder';
  } catch (err) {
    statusText.textContent = 'Open local folder failed: ' + err;
  }
}

async function showLocalWorkspaceSetupGuide() {
  let info = {};
  if (window.go?.main?.App?.GetLocalFolder) {
    try { info = await window.go.main.App.GetLocalFolder(); } catch {}
  }
  const ready = !!info.path && !info.missing;
  showModal('Local Workspace Setup', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${ready ? 'ready' : info.missing ? 'missing' : 'not set'}</strong><span>Default folder</span><small>${info.path ? escapeHtml(info.path) : 'Choose one local workspace folder'}</small></div>
      <div class="diag-card"><strong>local</strong><span>No sync in phase 1</span><small>Files, tasks, canvases, search, tags, and links stay on this computer</small></div>
      <div class="diag-card"><strong>notes</strong><span>Markdown first</span><small>Daily, weekly, and quick notes are plain files</small></div>
      <div class="diag-card"><strong>tasks</strong><span>Checkbox source</span><small>List, calendar, and kanban read Markdown tasks from this folder</small></div>
      <div class="diag-card"><strong>canvas</strong><span>Portable JSON</span><small>Local .canvas files use inspectable JSON</small></div>
      <div class="diag-card"><strong>search</strong><span>Bounded scans</span><small>Local search avoids eager full-workspace loading</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-local-folder-choose>Choose folder</button>
      <button data-local-folder-open ${ready ? '' : 'disabled'}>Open folder</button>
      <button data-local-folder-new ${ready ? '' : 'disabled'}>New note</button>
      <button data-local-folder-daily ${ready ? '' : 'disabled'}>Daily</button>
      <button data-local-folder-weekly ${ready ? '' : 'disabled'}>Weekly</button>
      <button data-local-folder-tasks ${ready ? '' : 'disabled'}>Tasks.md</button>
      <button data-local-folder-canvas ${ready ? '' : 'disabled'}>New canvas</button>
      <button data-local-folder-search ${ready ? '' : 'disabled'}>Search</button>
      <button data-local-folder-map ${ready ? '' : 'disabled'}>Links map</button>
      <button data-task-file-setup>Task setup</button>
      <button data-search-performance-open>Search guide</button>
      <button data-open-local-footprint>Footprint</button>
    </div>
    <p class="diag-note">This setup guide is local-only. It prepares the folder model for future sync, but does not create an account, background service, or remote index.</p>
  `);
}

async function revealActiveFile() {
  try {
    const note = cachedNotes.find(n => n.id === activeId);
    if (!note?.path) {
      statusText.textContent = 'Active note is not saved yet';
      return;
    }
    await window.go.main.App.OpenContainingFolder(note.path);
    statusText.textContent = 'Revealed active file';
  } catch (err) {
    statusText.textContent = 'Reveal file failed: ' + err;
  }
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

async function createLocalFolderDailyNote() {
  await createLocalTemplateNote('CreateLocalFolderDailyNote', 'Daily note opened');
}

async function createLocalFolderWeeklyNote() {
  await createLocalTemplateNote('CreateLocalFolderWeeklyNote', 'Weekly note opened');
}

async function createLocalTemplateNote(method, message) {
  try {
    if (!window.go?.main?.App?.[method]) {
      statusText.textContent = 'Local template backend unavailable';
      return;
    }
    renderSession(await window.go.main.App[method]());
    loadContent(await window.go.main.App.GetActiveContent());
    setView('markdown');
    modalOverlay.classList.add('hidden');
    statusText.textContent = message;
  } catch (err) {
    statusText.textContent = 'Create local template failed: ' + err;
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

async function showRecentLocalFiles() {
  if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.ListRecentLocalFolderFiles) {
    showModal('Recent Local Files', '<div class="local-empty">Recent local files backend unavailable in this build.</div>');
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  if (!info.path || info.missing) {
    showModal('Recent Local Files', `<div class="local-empty">${info.missing ? 'The saved local folder is missing.' : 'No default local folder set yet.'}</div>`);
    return;
  }
  const files = await window.go.main.App.ListRecentLocalFolderFiles(80);
  showModal('Recent Local Files', `
    <div class="local-summary">${files.length} recently modified file${files.length === 1 ? '' : 's'} · bounded local scan · newest first</div>
    ${renderLocalFolderFiles(files)}
  `, true);
}

function renderLocalSearchHits(hits) {
  if (!hits.length) return '<div class="local-empty">No local folder matches.</div>';
  return `<div class="local-list">${hits.map(hit => `
    <button class="local-row" data-local-open="${escapeAttr(hit.path)}">
      <span class="local-badge">${escapeHtml(fileIcon(hit.path))}</span>
      <span class="local-body">
        <strong>${escapeHtml(hit.relPath || hit.title)}</strong>
        <span>Line ${Number(hit.line || 0) + 1} · ${escapeHtml(typeLabel(getFileType(hit.path, hit.kind)))}</span>
        <small>${escapeHtml(hit.snippet || '')}</small>
      </span>
    </button>`).join('')}</div>`;
}

function renderLocalFolderOverview(overview) {
  if (!overview || !overview.path || overview.missing) return '';
  const cards = [
    ['Files', overview.files || 0],
    ['Notes', overview.notes || 0],
    ['Canvases', overview.canvases || 0],
    ['Tasks', `${overview.openTasks || 0}/${overview.tasks || 0} open`],
    ['Size', formatBytes(overview.totalBytes || 0)],
    ['Folders', overview.folders || 0],
  ];
  return `
    <div class="local-overview">
      ${cards.map(([label, value]) => `<div class="local-stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`).join('')}
    </div>
    <div class="local-summary">
      ${overview.newestRel ? `Newest: <b>${escapeHtml(overview.newestRel)}</b>${overview.newestModified ? ' · ' + escapeHtml(overview.newestModified) : ''}` : 'No files scanned'}
      ${overview.largestRel ? ` · Largest: <b>${escapeHtml(overview.largestRel)}</b> ${formatBytes(overview.largestBytes || 0)}` : ''}
      ${overview.truncated ? ' · Scan capped' : ''}
      ${overview.skippedFiles ? ` · ${overview.skippedFiles} skipped` : ''}
    </div>
  `;
}

function renderLocalFolderSearchBox(query, enabled) {
  const disabled = enabled ? '' : 'disabled';
  return `
    <div class="local-search-row">
      <input data-local-folder-query value="${escapeAttr(query || '')}" placeholder="Search local folder text files" ${disabled} />
      <button data-local-folder-search-apply ${disabled}>Search</button>
      <button data-local-folder-search-clear ${(enabled && query) ? '' : 'disabled'}>Clear</button>
    </div>
  `;
}

function renderLocalTags(tags) {
  if (!tags.length) return '<div class="local-empty">No Markdown tags found in the local folder.</div>';
  return `<div class="tag-cloud">${tags.map(tag => `
    <button class="tag-chip" data-local-tag-search="${escapeAttr('#' + tag.tag)}">
      <strong>#${escapeHtml(tag.tag)}</strong>
      <span>${Number(tag.count || 0)} mention${Number(tag.count || 0) === 1 ? '' : 's'} · ${Number(tag.files || 0)} file${Number(tag.files || 0) === 1 ? '' : 's'}</span>
      ${tag.latestRel ? `<small>${escapeHtml(tag.latestRel)}</small>` : ''}
    </button>
  `).join('')}</div>`;
}

async function showLocalTags() {
  if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.ListLocalFolderTags) {
    showModal('Local Tags', '<div class="local-empty">Local tags backend unavailable in this build.</div>');
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  if (!info.path || info.missing) {
    showModal('Local Tags', `<div class="local-empty">${info.missing ? 'The saved local folder is missing.' : 'No default local folder set yet.'}</div>`);
    return;
  }
  const tags = await window.go.main.App.ListLocalFolderTags(120);
  showModal('Local Tags', `
    <div class="local-summary">${tags.length} tag${tags.length === 1 ? '' : 's'} listed · bounded Markdown scan · click a tag to search the folder</div>
    ${renderLocalTags(tags)}
  `, true);
}

function renderLocalLinks(links) {
  if (!links.length) return '<div class="local-empty">No local Markdown links found in the local folder.</div>';
  return `<div class="tag-cloud">${links.map(link => `
    <button class="tag-chip" data-local-link-search="${escapeAttr(link.target)}">
      <strong>${escapeHtml(link.kind === 'wiki' ? '[[' + link.target + ']]' : link.target)}</strong>
      <span>${Number(link.count || 0)} link${Number(link.count || 0) === 1 ? '' : 's'} · ${Number(link.files || 0)} file${Number(link.files || 0) === 1 ? '' : 's'} · ${escapeHtml(link.kind || 'local')}</span>
      ${link.latestRel ? `<small>${escapeHtml(link.latestRel)}</small>` : ''}
    </button>
  `).join('')}</div>`;
}

async function showLocalLinks() {
  if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.ListLocalFolderLinks) {
    showModal('Local Links', '<div class="local-empty">Local links backend unavailable in this build.</div>');
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  if (!info.path || info.missing) {
    showModal('Local Links', `<div class="local-empty">${info.missing ? 'The saved local folder is missing.' : 'No default local folder set yet.'}</div>`);
    return;
  }
  const links = await window.go.main.App.ListLocalFolderLinks(160);
  showModal('Local Links', `
    <div class="local-summary">${links.length} link target${links.length === 1 ? '' : 's'} listed · bounded Markdown scan · click a link to search the folder</div>
    ${renderLocalLinks(links)}
  `, true);
}

async function createLocalLinksCanvas() {
  try {
    if (!window.go?.main?.App?.CreateLocalFolderLinksCanvas) {
      statusText.textContent = 'Local links canvas backend unavailable';
      return;
    }
    renderSession(await window.go.main.App.CreateLocalFolderLinksCanvas(120));
    loadContent(await window.go.main.App.GetActiveContent());
    modalOverlay.classList.add('hidden');
    loadCurrentDocumentIntoCanvas();
    statusText.textContent = 'Local links canvas generated';
  } catch (err) {
    statusText.textContent = 'Create local links canvas failed: ' + err;
  }
}

function renderLocalBacklinks(backlinks) {
  if (!backlinks.length) return '<div class="local-empty">No local backlinks found for the active note.</div>';
  return `<div class="local-list">${backlinks.map(hit => `
    <button class="local-row" data-local-open="${escapeHtml(hit.path)}">
      <span class="local-badge">BL</span>
      <span class="local-body">
        <strong>${escapeHtml(hit.relPath || hit.title)}</strong>
        <span>Line ${Number(hit.line || 0) + 1}</span>
        <small>${escapeHtml(hit.snippet || '')}</small>
      </span>
    </button>`).join('')}</div>`;
}

async function showActiveBacklinks() {
  const note = cachedNotes.find(n => n.id === activeId);
  if (!note?.path) {
    showModal('Backlinks', '<div class="local-empty">Save the active note before searching for local backlinks.</div>');
    return;
  }
  if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.ListLocalFolderBacklinks) {
    showModal('Backlinks', '<div class="local-empty">Backlinks backend unavailable in this build.</div>');
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  if (!info.path || info.missing) {
    showModal('Backlinks', `<div class="local-empty">${info.missing ? 'The saved local folder is missing.' : 'No default local folder set yet.'}</div>`);
    return;
  }
  const backlinks = await window.go.main.App.ListLocalFolderBacklinks(note.path, note.title || '', 120);
  showModal('Backlinks', `
    <div class="local-summary">${backlinks.length} backlink${backlinks.length === 1 ? '' : 's'} for <b>${escapeHtml(note.title || basename(note.path))}</b> · bounded Markdown scan</div>
    ${renderLocalBacklinks(backlinks)}
  `, true);
}

function compactCanvasBacklinkTitle(hit) {
  const title = String(hit?.relPath || hit?.title || basename(hit?.path || '') || 'Backlink').replace(/\s+/g, ' ').trim();
  return title.length > 38 ? `${title.slice(0, 35)}...` : title;
}

function compactCanvasBacklinkSnippet(hit) {
  const snippet = String(hit?.snippet || '').replace(/\s+/g, ' ').trim();
  return snippet.length > 48 ? `${snippet.slice(0, 45)}...` : snippet;
}

async function insertActiveBacklinksCanvasMap() {
  const note = cachedNotes.find(n => n.id === activeId);
  if (!note?.path) {
    statusText.textContent = 'Save the active note before sending backlinks to canvas';
    return;
  }
  if (!window.go?.main?.App?.GetLocalFolder || !window.go?.main?.App?.ListLocalFolderBacklinks) {
    statusText.textContent = 'Backlinks backend unavailable';
    return;
  }
  const info = await window.go.main.App.GetLocalFolder();
  if (!info.path || info.missing) {
    statusText.textContent = info.missing ? 'Saved local folder is missing' : 'No local folder set';
    return;
  }
  const backlinks = await window.go.main.App.ListLocalFolderBacklinks(note.path, note.title || '', 120);
  if (!backlinks.length) {
    statusText.textContent = 'No backlinks to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = backlinks.slice(0, 24);
  const centerX = origin.x + 320;
  const centerY = origin.y + 120;
  const elements = [
    ...canvasTemplateCard(centerX - 120, centerY - 40, 240, 80, note.title || basename(note.path) || 'Active note', '#2f6f61'),
    canvasTemplateText(origin.x, origin.y - 28, `Backlinks · ${visible.length}${backlinks.length > visible.length ? ` of ${backlinks.length}` : ''} local note${visible.length === 1 ? '' : 's'}`, 18, '#2f6f61'),
  ];
  visible.forEach((hit, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, visible.length);
    const radiusX = 360;
    const radiusY = 230;
    const x = Math.round(centerX + Math.cos(angle) * radiusX - 105);
    const y = Math.round(centerY + Math.sin(angle) * radiusY - 40);
    elements.push(canvasTemplateArrow(centerX, centerY, x + 105, y + 40, '#6b6e68'));
    elements.push({ id: canvasId(), type: 'rect', x, y, w: 210, h: 80, stroke: '#2563eb', width: 2 });
    elements.push(canvasTemplateText(x + 12, y + 27, compactCanvasBacklinkTitle(hit), 13, '#2563eb'));
    elements.push(canvasTemplateText(x + 12, y + 49, `line ${Number(hit.line || 0) + 1}`, 10, '#6b6e68'));
    const snippet = compactCanvasBacklinkSnippet(hit);
    if (snippet) elements.push(canvasTemplateText(x + 12, y + 68, snippet, 9, '#1f2937'));
  });
  if (backlinks.length > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + 520, `${backlinks.length - visible.length} additional backlinks omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} backlink${visible.length === 1 ? '' : 's'} sent to canvas`;
}

async function showLocalFolder(query = '') {
  query = String(query || '').trim();
  localFolderQuery = query;
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
  let overview = '';
  if (info.path && !info.missing && window.go?.main?.App?.GetLocalFolderOverview) {
    overview = renderLocalFolderOverview(await window.go.main.App.GetLocalFolderOverview());
  }
  const searchBox = renderLocalFolderSearchBox(query, !!info.path && !info.missing);
  showModal('Local Folder', `
    <div class="local-head">
      <div><strong>${escapeHtml(info.path || 'No folder selected')}</strong><span>${info.missing ? 'Missing' : info.path ? 'Default local workspace' : 'Choose a folder to start'}</span></div>
      <div class="local-actions">
        <button data-local-folder-choose>Choose</button>
        <button data-local-workspace-setup>Setup</button>
        <button data-local-folder-open ${info.path && !info.missing ? '' : 'disabled'}>Open folder</button>
        <button data-local-folder-reveal ${activeId ? '' : 'disabled'}>Reveal active</button>
        <button data-local-folder-recent ${info.path && !info.missing ? '' : 'disabled'}>Recent</button>
        <button data-local-folder-new ${info.path && !info.missing ? '' : 'disabled'}>New note</button>
        <button data-local-folder-tasks ${info.path && !info.missing ? '' : 'disabled'}>Tasks</button>
        <button data-local-folder-daily ${info.path && !info.missing ? '' : 'disabled'}>Daily</button>
        <button data-local-folder-weekly ${info.path && !info.missing ? '' : 'disabled'}>Weekly</button>
        <button data-local-folder-canvas ${info.path && !info.missing ? '' : 'disabled'}>New canvas</button>
        <button data-local-folder-tags ${info.path && !info.missing ? '' : 'disabled'}>Tags</button>
        <button data-local-folder-links ${info.path && !info.missing ? '' : 'disabled'}>Links</button>
        <button data-local-folder-map ${info.path && !info.missing ? '' : 'disabled'}>Map</button>
        <button data-local-folder-backlinks ${activeId && info.path && !info.missing ? '' : 'disabled'}>Backlinks</button>
        <button data-local-folder-search ${info.path && !info.missing ? '' : 'disabled'}>Search</button>
        <button data-local-folder-clear ${info.path ? '' : 'disabled'} class="danger">Clear</button>
      </div>
    </div>
    ${overview}
    ${searchBox}
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
  const today = todayKey();
  return task.due <= today ? 'today' : 'upcoming';
}

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function isTaskDueNow(task) {
  return !task.checked && !!task.due && task.due <= todayKey();
}

function isTaskOverdue(task) {
  return !task.checked && !!task.due && task.due < todayKey();
}

function isHighPriorityTask(task) {
  return !task.checked && ['high', 'urgent', 'now', 'p1'].includes(String(task.priority || '').toLowerCase());
}

function taskPriorityRank(task) {
  const priority = String(task.priority || '').toLowerCase();
  if (['urgent', 'now', 'p1'].includes(priority)) return 0;
  if (priority === 'high') return 1;
  if (['medium', 'normal', 'p2'].includes(priority)) return 2;
  if (['low', 'p3'].includes(priority)) return 3;
  return 4;
}

function taskPriorityClass(task) {
  const priority = String(task.priority || '').toLowerCase();
  if (['urgent', 'now', 'p1'].includes(priority)) return 'urgent';
  if (['high', 'h'].includes(priority)) return 'high';
  if (['medium', 'normal', 'med', 'm', 'p2'].includes(priority)) return 'medium';
  if (['low', 'l', 'p3'].includes(priority)) return 'low';
  return '';
}

function taskFilterMatches(task) {
  switch (taskFilter) {
    case 'open': return !task.checked;
    case 'due': return isTaskDueNow(task);
    case 'overdue': return isTaskOverdue(task);
    case 'waiting': return !task.checked && task.waiting;
    case 'high': return isHighPriorityTask(task);
    case 'done': return task.checked;
    default: return true;
  }
}

function normalizeTaskSourceFilter(value) {
  return ['all', 'loaded', 'local'].includes(value) ? value : 'all';
}

function setTaskSourceFilter(value) {
  taskSourceFilter = normalizeTaskSourceFilter(value);
  localStorage.setItem('markpad-task-source-filter', taskSourceFilter);
}

function showTasksForSource(source) {
  setTaskSourceFilter(source);
  return showTasksView(taskViewMode);
}

function setTaskStatusFilter(value) {
  const allowed = new Set(['all', 'open', 'due', 'overdue', 'waiting', 'high', 'done']);
  taskFilter = allowed.has(value) ? value : 'all';
  localStorage.setItem('markpad-task-filter', taskFilter);
}

function showTasksForFilter(filter) {
  setTaskStatusFilter(filter);
  return showTasksView(taskViewMode);
}

function showTasksPreset({ view = 'list', source = 'all', filter = 'all', query = '' } = {}) {
  setTaskSourceFilter(source);
  setTaskStatusFilter(filter);
  taskQuery = String(query || '').trim();
  localStorage.setItem('markpad-task-query', taskQuery);
  return showTasksView(view);
}

function showTasksForQuery(query) {
  taskQuery = String(query || '').trim();
  return showTasksView(taskViewMode);
}

function resetTaskViewFilters() {
  taskSourceFilter = 'all';
  taskFilter = 'all';
  taskQuery = '';
  localStorage.setItem('markpad-task-source-filter', taskSourceFilter);
  localStorage.setItem('markpad-task-filter', taskFilter);
  localStorage.setItem('markpad-task-query', taskQuery);
  return showTasksView(taskViewMode);
}

function taskSourceMatches(task) {
  switch (taskSourceFilter) {
    case 'loaded': return !task.local;
    case 'local': return !!task.local;
    default: return true;
  }
}

function showTaskSyntaxHelp() {
  showModal('Task Format', `
    <div class="diag-grid">
      <div class="diag-card"><strong>source</strong><span>Markdown checkbox lines</span><small>No hidden task database</small></div>
      <div class="diag-card"><strong>checkbox</strong><span>- [ ] Write outline</span><small>Plain Markdown task</small></div>
      <div class="diag-card"><strong>done</strong><span>- [x] Ship note</span><small>Completed Markdown task</small></div>
      <div class="diag-card"><strong>due date</strong><span>due:2026-06-24</span><small>Portable ISO date token</small></div>
      <div class="diag-card"><strong>priority</strong><span>!high !medium !low</span><small>Aliases: !h, !med, !m, !l</small></div>
      <div class="diag-card"><strong>waiting</strong><span>@waiting</span><small>Moves work into waiting filters</small></div>
      <div class="diag-card"><strong>tag</strong><span>#project</span><small>Used by task and search filters</small></div>
      <div class="diag-card"><strong>exclude</strong><span>-@waiting -#blocked</span><small>Hide matching task tokens</small></div>
      <div class="diag-card"><strong>exports</strong><span>MD / JSON / CSV / ICS / Todo.txt</span><small>Portable escape hatches stay visible</small></div>
      <div class="diag-card"><strong>starters</strong><span>Project, weekly, review</span><small>Append portable Markdown checklists</small></div>
      <div class="diag-card"><strong>canvas</strong><span>Send visible tasks</span><small>Turn filtered tasks into a canvas board</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-task-file-setup>Task file setup</button>
      <button data-task-source-profile>Source profile</button>
      <button data-task-file-inbox>Create inbox starter</button>
      <button data-task-file-weekly>Weekly starter</button>
      <button data-task-file-copy-starter>Copy tasks.md starter</button>
      <button data-task-file-export-starter>Export tasks.md starter</button>
      <button data-task-agenda>Agenda</button>
      <button data-copy-task-agenda-json>Copy Agenda JSON</button>
      <button data-export-task-agenda-csv>Export Agenda CSV</button>
      <button data-copy-task-agenda-ics>Copy Agenda ICS</button>
      <button data-export-task-agenda-todo>Export Agenda Todo.txt</button>
    </div>
    <pre class="diag-code">- [ ] Draft launch note !high due:2026-06-24 #release
- [ ] Wait for design review @waiting #design
- [x] Publish changelog due:2026-06-20 #release</pre>
    <p class="diag-note">Tasks remain regular Markdown lines in your files. Markpad only reads tokens from checkbox lines, so the source stays local, portable, and not vendor-locked. List, calendar, kanban, exports, and canvas boards are views over the same Markdown source.</p>
  `);
}

function showTaskFileSetup() {
  const target = findTaskTargetNote();
  showModal('Task File Setup', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${target ? 'found' : 'create'}</strong><span>Tasks.md</span><small>${target ? escapeHtml(target.title || basename(target.path || '') || 'Loaded task file') : 'Uses local Tasks.md when available, otherwise creates a draft'}</small></div>
      <div class="diag-card"><strong>portable</strong><span>Markdown only</span><small>No task database or vendor-locked format</small></div>
      <div class="diag-card"><strong>views</strong><span>List / calendar / kanban</span><small>Same checkbox lines, different local views</small></div>
      <div class="diag-card"><strong>tokens</strong><span>due: !priority @waiting #tag</span><small>Searchable and readable outside Markpad</small></div>
      <div class="diag-card"><strong>exports</strong><span>MD / JSON / CSV / ICS</span><small>Useful escape hatches stay visible</small></div>
      <div class="diag-card"><strong>canvas</strong><span>Visual planning</span><small>Send filtered tasks to lightweight canvas cards</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-task-file-inbox>${target ? 'Append inbox starter' : 'Create inbox starter'}</button>
      <button data-task-file-weekly>Weekly starter</button>
      <button data-task-file-project>Project starter</button>
      <button data-task-file-review>Review starter</button>
      <button data-task-file-quick>Quick task</button>
      <button data-task-file-open-view>Open task views</button>
      <button data-task-source-profile>Source profile</button>
      <button data-task-file-copy-starter>Copy tasks.md starter</button>
      <button data-task-file-export-starter>Export tasks.md starter</button>
      <button data-task-copy-source-md>Copy source MD</button>
      <button data-task-export-source-md>Export source MD</button>
    </div>
    <p class="diag-note">The contained task-file workflow is still plain Markdown. If the local-folder backend is available, starters go to local Tasks.md; otherwise Markpad creates an unsaved Tasks draft.</p>
  `, true);
}

function showTaskCanvasGuide() {
  showModal('Task Canvas Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>source</strong><span>Current task filters</span><small>Uses source, status, query, tag, due, and priority filters</small></div>
      <div class="diag-card"><strong>layout</strong><span>Today / Upcoming / Waiting / Done</span><small>Matches the kanban status model</small></div>
      <div class="diag-card"><strong>cap</strong><span>24 visible tasks</span><small>Keeps canvas inserts bounded and responsive</small></div>
      <div class="diag-card"><strong>format</strong><span>Canvas JSON cards</span><small>Does not rewrite Markdown task files</small></div>
      <div class="diag-card"><strong>colors</strong><span>Priority + waiting states</span><small>High, waiting, done, and normal tasks get different strokes</small></div>
      <div class="diag-card"><strong>workflow</strong><span>Filter first, send second</span><small>Use task filters to choose exactly what becomes a board</small></div>
    </div>
    <p class="diag-note">Task-to-canvas is a local visual snapshot. The source of truth remains plain Markdown tasks; the generated board is editable canvas JSON.</p>
  `);
}

function parseTaskQuery(query) {
  const tokens = String(query || '').trim().match(/"[^"]+"|\S+/g) || [];
  const plan = {
    terms: [],
    due: [],
    priority: [],
    tags: [],
    waiting: false,
    exclude: { terms: [], due: [], priority: [], tags: [], waiting: false },
    hasQuery: false,
  };
  tokens.forEach((token) => {
    const raw = token.replace(/^"|"$/g, '').trim().toLowerCase();
    const negated = raw.startsWith('-') && raw.length > 1;
    const clean = negated ? raw.slice(1) : raw;
    const target = negated ? plan.exclude : plan;
    if (!clean) return;
    plan.hasQuery = true;
    if (clean === '@waiting') {
      target.waiting = true;
      return;
    }
    if (clean.startsWith('#') && clean.length > 1) {
      target.tags.push(clean.slice(1));
      return;
    }
    if (clean.startsWith('!') && clean.length > 1) {
      target.priority.push(clean.slice(1));
      return;
    }
    const parts = clean.split(':');
    if (parts.length > 1) {
      const key = parts.shift();
      const value = parts.join(':').trim();
      if (value && key === 'due') {
        target.due.push(value);
        return;
      }
      if (value && ['priority', 'prio', 'p'].includes(key)) {
        target.priority.push(value);
        return;
      }
      if (value && key === 'tag') {
        target.tags.push(value.replace(/^#/, ''));
        return;
      }
    }
    target.terms.push(clean);
  });
  return plan;
}

function taskDueQueryMatches(task, value) {
  const due = String(task.due || '');
  if (value === 'today') return due === todayKey();
  if (value === 'tomorrow') {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return due === date.toISOString().slice(0, 10);
  }
  if (value === 'overdue') return !!due && due < todayKey();
  if (['week', 'next7', '7d'].includes(value)) {
    if (!due) return false;
    const start = todayKey();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    endDate.setMinutes(endDate.getMinutes() - endDate.getTimezoneOffset());
    const end = endDate.toISOString().slice(0, 10);
    return due >= start && due <= end;
  }
  if (['none', 'unset', 'unscheduled'].includes(value)) return !due;
  return due.includes(value);
}

function taskPriorityQueryMatches(task, value) {
  const priority = String(task.priority || '').toLowerCase();
  const priorityClass = taskPriorityClass(task);
  if (value === 'p1') return ['urgent', 'high'].includes(priorityClass) || priority === 'p1';
  return priority.includes(value) || priorityClass === value;
}

function taskQueryMatches(task, plan) {
  const queryPlan = plan || parseTaskQuery(taskQuery);
  if (!queryPlan.hasQuery) return true;
  const exclude = queryPlan.exclude || { terms: [], due: [], priority: [], tags: [], waiting: false };
  if (queryPlan.waiting && !task.waiting) return false;
  if (queryPlan.due.some(value => !taskDueQueryMatches(task, value))) return false;
  if (queryPlan.priority.some(value => !taskPriorityQueryMatches(task, value))) return false;
  const tags = (task.tags || []).map(tag => String(tag).toLowerCase());
  if (queryPlan.tags.some(tag => !tags.includes(tag) && !String(task.text || '').toLowerCase().includes(`#${tag}`))) return false;
  const haystack = [
    task.text, task.noteTitle, task.path, task.due, task.priority,
    task.waiting ? 'waiting' : '', ...(task.tags || []),
  ].join(' ').toLowerCase();
  if (exclude.waiting && task.waiting) return false;
  if (exclude.due.some(value => taskDueQueryMatches(task, value))) return false;
  if (exclude.priority.some(value => taskPriorityQueryMatches(task, value))) return false;
  if (exclude.tags.some(tag => tags.includes(tag) || String(task.text || '').toLowerCase().includes(`#${tag}`))) return false;
  if (exclude.terms.some(term => haystack.includes(term))) return false;
  return queryPlan.terms.every(term => haystack.includes(term));
}

function sortTasksForView(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (isTaskOverdue(a) !== isTaskOverdue(b)) return isTaskOverdue(a) ? -1 : 1;
    const dueA = a.due || '9999-99-99';
    const dueB = b.due || '9999-99-99';
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    const prio = taskPriorityRank(a) - taskPriorityRank(b);
    if (prio) return prio;
    return String(a.noteTitle || '').localeCompare(String(b.noteTitle || '')) || a.line - b.line;
  });
}

function visibleTasksForView(tasks) {
  const queryPlan = parseTaskQuery(taskQuery);
  return sortTasksForView(tasks.filter(task => taskSourceMatches(task) && taskFilterMatches(task) && taskQueryMatches(task, queryPlan)));
}

function taskFilterCounts(tasks) {
  return {
    all: tasks.length,
    open: tasks.filter(task => !task.checked).length,
    due: tasks.filter(isTaskDueNow).length,
    overdue: tasks.filter(isTaskOverdue).length,
    waiting: tasks.filter(task => !task.checked && task.waiting).length,
    high: tasks.filter(isHighPriorityTask).length,
    done: tasks.filter(task => task.checked).length,
  };
}

function renderTaskSourceStrip(tasks, visibleTasks) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const shownTasks = Array.isArray(visibleTasks) ? visibleTasks : [];
  const allLoaded = allTasks.filter(task => !task.local).length;
  const allLocal = allTasks.length - allLoaded;
  const visibleLoaded = shownTasks.filter(task => !task.local).length;
  const visibleLocal = shownTasks.length - visibleLoaded;
  const openVisible = shownTasks.filter(task => !task.checked).length;
  const sourceFiles = new Set(allTasks.map(task => task.path || task.noteTitle || (task.local ? 'Local task file' : 'Draft')));
  const dueCounts = shownTasks.reduce((acc, task) => {
    const bucket = taskDueBucket(task);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, unscheduled: 0, done: 0 });
  const dueBuckets = [
    ['overdue', 'Overdue', 'danger'],
    ['today', 'Today', 'today'],
    ['tomorrow', 'Tomorrow', 'soon'],
    ['week', 'Week', 'soon'],
    ['later', 'Later', 'later'],
    ['unscheduled', 'No due', 'muted'],
    ['done', 'Done', 'done'],
  ];
  const totalForMeter = Math.max(1, shownTasks.length);
  const slices = dueBuckets
    .filter(([key]) => dueCounts[key] > 0)
    .map(([key, label, className]) => {
      const width = Math.round((dueCounts[key] / totalForMeter) * 1000) / 10;
      return `<span class="task-source-slice ${className}" style="width:${width}%;" title="${escapeHtml(`${label}: ${dueCounts[key]}`)}"></span>`;
    })
    .join('');
  const dueChips = dueBuckets.map(([key, label, className]) => `
    <span class="task-source-chip ${className}"><strong>${dueCounts[key] || 0}</strong>${escapeHtml(label)}</span>
  `).join('');
  return `
    <div class="task-source-strip" aria-label="Task source and due summary">
      <div class="task-source-card">
        <strong>${shownTasks.length}/${allTasks.length}</strong>
        <span>Visible / total</span>
        <small>${openVisible} open · ${shownTasks.length - openVisible} done</small>
      </div>
      <div class="task-source-card">
        <strong>${visibleLoaded}/${allLoaded}</strong>
        <span>Loaded</span>
        <small>Current session Markdown</small>
      </div>
      <div class="task-source-card">
        <strong>${visibleLocal}/${allLocal}</strong>
        <span>Local folder</span>
        <small>Plain file source</small>
      </div>
      <div class="task-source-card">
        <strong>${sourceFiles.size}</strong>
        <span>Task files</span>
        <small>No database lock-in</small>
      </div>
      <div class="task-source-meter">
        <div class="task-source-track">${slices || '<span class="task-source-slice empty" style="width:100%;"></span>'}</div>
        <div class="task-source-legend">${dueChips}</div>
      </div>
    </div>
  `;
}

function renderTaskControls(tasks, visibleTasks) {
  const sourceTasks = tasks.filter(taskSourceMatches);
  const counts = taskFilterCounts(sourceTasks);
  const visibleLoaded = visibleTasks.filter(task => !task.local).length;
  const visibleLocal = visibleTasks.length - visibleLoaded;
  const totalLoaded = tasks.filter(task => !task.local).length;
  const totalLocal = tasks.length - totalLoaded;
  const sourceFilters = [
    ['all', 'All sources', tasks.length],
    ['loaded', 'Loaded', totalLoaded],
    ['local', 'Local', totalLocal],
  ];
  const sourceChips = sourceFilters.map(([id, label, count]) => `
    <button class="task-filter${taskSourceFilter === id ? ' active' : ''}" data-task-source-filter="${id}" aria-pressed="${taskSourceFilter === id ? 'true' : 'false'}">
      ${label} <span>${count || 0}</span>
    </button>
  `).join('');
  const filters = [
    ['all', 'All'],
    ['open', 'Open'],
    ['due', 'Due now'],
    ['overdue', 'Overdue'],
    ['waiting', 'Waiting'],
    ['high', 'High'],
    ['done', 'Done'],
  ];
  const chips = filters.map(([id, label]) => `
    <button class="task-filter${taskFilter === id ? ' active' : ''}" data-task-filter="${id}" aria-pressed="${taskFilter === id ? 'true' : 'false'}">
      ${label} <span>${counts[id] || 0}</span>
    </button>
  `).join('');
  const query = escapeHtml(taskQuery);
  const filterLabel = (filters.find(([id]) => id === taskFilter) || filters[0])[1];
  const sourceLabel = (sourceFilters.find(([id]) => id === taskSourceFilter) || sourceFilters[0])[1];
  return `
    <div class="task-controls">
      <div class="task-filter-row" aria-label="Task source filters">${sourceChips}</div>
      <div class="task-filter-row" aria-label="Task status filters">${chips}</div>
      <div class="task-search-row">
        <input data-task-search value="${query}" placeholder="Filter text, due:today, !high, @waiting, #tag, -#blocked" />
        <button data-task-search-apply>Apply</button>
        <button data-task-search-clear ${taskQuery ? '' : 'disabled'}>Clear</button>
      </div>
      <div class="task-query-hints" aria-label="Task query examples">
        <span>Examples</span>
        <button data-task-query-example="due:today">due:today</button>
        <button data-task-query-example="due:tomorrow">due:tomorrow</button>
        <button data-task-query-example="due:week">due:week</button>
        <button data-task-query-example="due:overdue">due:overdue</button>
        <button data-task-query-example="!high">!high</button>
        <button data-task-query-example="@waiting">@waiting</button>
        <button data-task-query-example="#idea">#idea</button>
      </div>
      ${renderTaskSourceStrip(tasks, visibleTasks)}
      <div class="task-summary">${visibleTasks.length} visible in ${escapeHtml(filterLabel)} from ${escapeHtml(sourceLabel)} (${visibleLoaded} loaded, ${visibleLocal} local) · ${sourceTasks.length}/${tasks.length} source-matched · ${counts.open} open · Markdown stays the source of truth.</div>
    </div>
  `;
}

function taskDueBadge(task) {
  if (!task.due || task.checked) return '';
  const today = todayKey();
  const dueTime = new Date(`${task.due}T00:00:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  if (!Number.isFinite(dueTime) || !Number.isFinite(todayTime)) return '';
  const days = Math.round((dueTime - todayTime) / (24 * 60 * 60 * 1000));
  if (days < 0) return '<span class="task-pill task-due-pill overdue">overdue</span>';
  if (days === 0) return '<span class="task-pill task-due-pill today">today</span>';
  if (days === 1) return '<span class="task-pill task-due-pill soon">tomorrow</span>';
  if (days <= 7) return `<span class="task-pill task-due-pill soon">${days} days</span>`;
  return '';
}

function taskMeta(task) {
  const bits = [];
  const provenance = taskProvenance(task);
  if (provenance) bits.push(`<span class="task-pill task-provenance ${task.local ? 'local' : 'loaded'}" title="${escapeAttr(taskProvenanceTitle(task))}">${escapeHtml(provenance)}</span>`);
  if (task.due) bits.push(`<span class="task-pill">due ${escapeHtml(task.due)}</span>`);
  const dueBadge = taskDueBadge(task);
  if (dueBadge) bits.push(dueBadge);
  if (task.priority) {
    const priorityClass = taskPriorityClass(task);
    bits.push(`<span class="task-pill task-priority-pill${priorityClass ? ` ${priorityClass}` : ''}">!${escapeHtml(task.priority)}</span>`);
  }
  if (task.waiting) bits.push('<span class="task-pill">@waiting</span>');
  task.tags.forEach(tag => bits.push(`<span class="task-pill">#${escapeHtml(tag)}</span>`));
  return bits.join('');
}

function compactTaskSourceName(task) {
  const raw = task.noteTitle || (task.path ? String(task.path).split(/[\\/]/).pop() : '') || 'Untitled';
  const clean = String(raw).replace(/\s+/g, ' ').trim();
  return clean.length > 36 ? `${clean.slice(0, 33)}...` : clean;
}

function taskProvenance(task) {
  const bits = [task.local ? 'local' : 'loaded'];
  const line = Number(task.line);
  if (Number.isFinite(line)) bits.push(`line ${line + 1}`);
  const sourceName = compactTaskSourceName(task);
  if (sourceName) bits.push(sourceName);
  return bits.join(' · ');
}

function taskProvenanceTitle(task) {
  const bits = [task.local ? 'Local task source' : 'Loaded editor source'];
  const line = Number(task.line);
  if (Number.isFinite(line)) bits.push(`line ${line + 1}`);
  if (task.noteTitle) bits.push(`title: ${task.noteTitle}`);
  if (task.path) bits.push(`path: ${task.path}`);
  return bits.join(' · ');
}

function renderTaskRow(task, compact) {
  const priorityClass = taskPriorityClass(task);
  return `
    <div class="task-row${task.checked ? ' done' : ''}${priorityClass ? ` priority-${priorityClass}` : ''}">
      <button class="task-check" data-task-toggle="${escapeHtml(task.id)}" title="Toggle task">${task.checked ? '✓' : ''}</button>
      <div class="task-body">
        <div class="task-text">${escapeHtml(task.text)}</div>
        <div class="task-meta">${taskMeta(task)}</div>
      </div>
      ${compact ? '' : `<button class="task-open" data-task-open="${escapeHtml(task.id)}">Open</button><button class="task-open" data-task-copy="${escapeHtml(task.id)}">Copy</button><button class="task-open" data-task-copy-json="${escapeHtml(task.id)}">JSON</button><button class="task-open" data-task-copy-ics="${escapeHtml(task.id)}">ICS</button><button class="task-open" data-task-copy-csv="${escapeHtml(task.id)}">CSV</button><button class="task-open" data-task-copy-todo="${escapeHtml(task.id)}">Todo.txt</button>`}
    </div>`;
}

function renderTaskList(tasks) {
  if (!tasks.length) return taskEmptyStateHtml('No Markdown tasks matched this task view.');
  return `<div class="task-list">${tasks.map(task => renderTaskRow(task)).join('')}</div>`;
}

function taskEmptyStateHtml(message = 'No Markdown tasks found in loaded files.') {
  return `
    <div class="task-empty">
      <strong>${escapeHtml(message)}</strong>
      <span>Tasks stay as Markdown checkbox lines; these views are just projections.</span>
      <div class="task-empty-actions">
        <button type="button" data-task-add>+ Task</button>
        <button type="button" data-task-file-setup>Task File</button>
        <button type="button" data-task-format>Format Help</button>
        <button type="button" data-task-source-profile>Source Profile</button>
        <button type="button" data-task-reset-filters>Reset Filters</button>
      </div>
    </div>`;
}

function renderTaskAgendaSection(title, tasks) {
  const list = sortTasksForView(tasks).slice(0, 12);
  return `
    <section class="task-day">
      <h4>${escapeHtml(title)} (${tasks.length})</h4>
      ${list.length ? list.map(task => renderTaskRow(task, true)).join('') : '<div class="task-empty">No tasks in this bucket.</div>'}
      ${tasks.length > list.length ? `<div class="task-summary">${tasks.length - list.length} more hidden to keep the agenda compact.</div>` : ''}
    </section>`;
}

function taskDisplayTitle(task) {
  return String(task?.title || task?.text || task?.raw || 'Untitled task').replace(/\s+/g, ' ').trim();
}

function taskSourceLabel(task) {
  return String(task?.noteTitle || task?.fileName || task?.path || task?.id || '').trim();
}

function taskAgendaGroups() {
  const tasks = collectLoadedTasks();
  const visibleTasks = tasks.filter(taskSourceMatches);
  const openTasks = visibleTasks.filter(task => !task.checked);
  const overdue = openTasks.filter(isTaskOverdue);
  const dueToday = openTasks.filter(task => !isTaskOverdue(task) && task.due === todayKey());
  const waiting = openTasks.filter(task => task.waiting || task.status === 'waiting');
  const high = openTasks.filter(task => isHighPriorityTask(task) && !overdue.includes(task) && !dueToday.includes(task));
  return { all: tasks, visible: visibleTasks, open: openTasks, overdue, dueToday, waiting, high };
}

function taskAgendaMarkdown() {
  const groups = taskAgendaGroups();
  const lines = [
    '# Markpad Task Agenda',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];
  [
    ['Overdue', groups.overdue],
    ['Due today', groups.dueToday],
    ['Waiting', groups.waiting],
    ['High priority', groups.high],
  ].forEach(([title, tasks]) => {
    lines.push(`## ${title}`, '');
    if (!tasks.length) {
      lines.push('- No tasks', '');
      return;
    }
    tasks.forEach((task) => {
      const meta = [];
      if (task.due) meta.push(`due:${task.due}`);
      if (task.priority) meta.push(`priority:${task.priority}`);
      if (task.status) meta.push(`status:${task.status}`);
      const source = taskSourceLabel(task);
      lines.push(`- [ ] ${taskDisplayTitle(task)}${meta.length ? ` (${meta.join(', ')})` : ''}${source ? ` - ${source}` : ''}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

function taskAgendaBuckets(groups = taskAgendaGroups()) {
  return [
    ['overdue', 'Overdue', groups.overdue],
    ['due_today', 'Due today', groups.dueToday],
    ['waiting', 'Waiting', groups.waiting],
    ['high_priority', 'High priority', groups.high],
  ];
}

function taskAgendaRecord(bucketId, bucketTitle, task) {
  return {
    bucket: bucketId,
    bucketTitle,
    id: task.id || '',
    title: taskDisplayTitle(task),
    text: task.text || task.raw || '',
    checked: !!task.checked,
    due: task.due || '',
    priority: task.priority || '',
    waiting: !!task.waiting,
    status: task.status || '',
    tags: Array.isArray(task.tags) ? task.tags : [],
    source: taskSourceLabel(task),
    noteId: task.noteId || '',
    noteTitle: task.noteTitle || '',
    path: task.path || '',
    line: Number.isFinite(Number(task.line)) ? Number(task.line) : '',
    local: !!task.local,
  };
}

function taskAgendaRecords(groups = taskAgendaGroups()) {
  return taskAgendaBuckets(groups).flatMap(([bucketId, bucketTitle, tasks]) =>
    tasks.map(task => taskAgendaRecord(bucketId, bucketTitle, task))
  );
}

function taskAgendaUniqueTasks(groups = taskAgendaGroups()) {
  const seen = new Set();
  const tasks = [];
  taskAgendaBuckets(groups).forEach(([bucketId, bucketTitle, bucketTasks]) => {
    bucketTasks.forEach((task) => {
      const key = task.id || `${task.noteId || ''}|${task.path || ''}|${task.line || ''}|${task.text || task.raw || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      tasks.push({ ...task, agendaBucket: bucketId, agendaBucketTitle: bucketTitle });
    });
  });
  return tasks;
}

function taskAgendaJson() {
  const groups = taskAgendaGroups();
  const buckets = taskAgendaBuckets(groups);
  return JSON.stringify({
    type: 'markpad-task-agenda',
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFilter: taskSourceFilter,
    counts: {
      total: groups.all.length,
      visible: groups.visible.length,
      open: groups.open.length,
      overdue: groups.overdue.length,
      dueToday: groups.dueToday.length,
      waiting: groups.waiting.length,
      highPriority: groups.high.length,
    },
    buckets: buckets.map(([id, title, tasks]) => ({
      id,
      title,
      count: tasks.length,
      tasks: tasks.map(task => taskAgendaRecord(id, title, task)),
    })),
  }, null, 2) + '\n';
}

function taskAgendaCsv() {
  const rows = [
    ['bucket', 'title', 'due', 'priority', 'waiting', 'status', 'source', 'noteId', 'path', 'line', 'local'],
    ...taskAgendaRecords().map(task => [
      task.bucketTitle,
      task.title,
      task.due,
      task.priority,
      task.waiting ? 'true' : 'false',
      task.status,
      task.source,
      task.noteId,
      task.path,
      task.line,
      task.local ? 'true' : 'false',
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function taskAgendaIcs() {
  return tasksToIcs(taskAgendaUniqueTasks());
}

function taskAgendaTodoTxt() {
  return tasksToTodoTxt(taskAgendaUniqueTasks());
}

async function copyTaskAgendaMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(taskAgendaMarkdown());
  statusText.textContent = 'Task agenda copied as Markdown';
}

async function copyTaskAgendaJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(taskAgendaJson());
  statusText.textContent = 'Task agenda copied as JSON';
}

async function copyTaskAgendaCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(taskAgendaCsv());
  statusText.textContent = 'Task agenda copied as CSV';
}

async function copyTaskAgendaIcs() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const tasks = taskAgendaUniqueTasks();
  if (!tasks.length) {
    statusText.textContent = 'No agenda tasks to copy';
    return;
  }
  await navigator.clipboard.writeText(tasksToIcs(tasks));
  statusText.textContent = 'Task agenda copied as ICS';
}

async function copyTaskAgendaTodoTxt() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const tasks = taskAgendaUniqueTasks();
  if (!tasks.length) {
    statusText.textContent = 'No agenda tasks to copy';
    return;
  }
  await navigator.clipboard.writeText(tasksToTodoTxt(tasks));
  statusText.textContent = 'Task agenda copied as Todo.txt';
}

function exportTaskAgendaMarkdown() {
  downloadText('markpad-task-agenda.md', 'text/markdown', taskAgendaMarkdown());
  statusText.textContent = 'Task agenda exported as Markdown';
}

function exportTaskAgendaJson() {
  downloadText('markpad-task-agenda.json', 'application/json', taskAgendaJson());
  statusText.textContent = 'Task agenda exported as JSON';
}

function exportTaskAgendaCsv() {
  downloadText('markpad-task-agenda.csv', 'text/csv', taskAgendaCsv());
  statusText.textContent = 'Task agenda exported as CSV';
}

function exportTaskAgendaIcs() {
  const tasks = taskAgendaUniqueTasks();
  if (!tasks.length) {
    statusText.textContent = 'No agenda tasks to export';
    return;
  }
  downloadText('markpad-task-agenda.ics', 'text/calendar', tasksToIcs(tasks));
  statusText.textContent = 'Task agenda exported as ICS';
}

function exportTaskAgendaTodoTxt() {
  const tasks = taskAgendaUniqueTasks();
  if (!tasks.length) {
    statusText.textContent = 'No agenda tasks to export';
    return;
  }
  downloadText('markpad-task-agenda.txt', 'text/plain', tasksToTodoTxt(tasks));
  statusText.textContent = 'Task agenda exported as Todo.txt';
}

async function showTaskAgenda() {
  const groups = taskAgendaGroups();
  showModal('Task Agenda', `
    <div class="task-summary">${groups.open.length} open task${groups.open.length === 1 ? '' : 's'} from ${escapeHtml(taskSourceFilter)} sources · Markdown stays the source of truth.</div>
    <div class="task-calendar">
      ${renderTaskAgendaSection('Overdue', groups.overdue)}
      ${renderTaskAgendaSection('Due today', groups.dueToday)}
      ${renderTaskAgendaSection('Waiting', groups.waiting)}
      ${renderTaskAgendaSection('High priority', groups.high)}
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-task-agenda-md>Copy Markdown</button>
      <button data-copy-task-agenda-json>Copy JSON</button>
      <button data-copy-task-agenda-csv>Copy CSV</button>
      <button data-copy-task-agenda-ics>Copy ICS</button>
      <button data-copy-task-agenda-todo>Copy Todo.txt</button>
      <button data-export-task-agenda-md>Export Markdown</button>
      <button data-export-task-agenda-json>Export JSON</button>
      <button data-export-task-agenda-csv>Export CSV</button>
      <button data-export-task-agenda-ics>Export ICS</button>
      <button data-export-task-agenda-todo>Export Todo.txt</button>
      <button data-task-agenda-canvas>Send to Canvas</button>
    </div>
    <p class="diag-note">Agenda is a derived local view over Markdown checkbox lines. It does not create a task database or rewrite task files.</p>
  `, true);
}

function taskPriorityBucket(task) {
  const priorityClass = taskPriorityClass(task);
  if (priorityClass === 'urgent' || priorityClass === 'high') return 'high';
  if (priorityClass === 'medium') return 'medium';
  if (priorityClass === 'low') return 'low';
  return 'normal';
}

function renderTaskBoardGroups(tasks) {
  if (!tasks.length) return '<div class="task-empty">Empty</div>';
  const groups = [
    ['high', 'High priority'],
    ['medium', 'Medium'],
    ['normal', 'Normal'],
    ['low', 'Low'],
  ];
  return groups.map(([id, label]) => {
    const groupTasks = tasks.filter(task => taskPriorityBucket(task) === id);
    if (!groupTasks.length) return '';
    return `
      <div class="task-board-group ${id}">
        <div class="task-board-group-title">${label} <span>${groupTasks.length}</span></div>
        ${groupTasks.map(task => renderTaskRow(task, true)).join('')}
      </div>
    `;
  }).join('');
}

function renderTaskBoard(tasks) {
  if (!tasks.length) return taskEmptyStateHtml('No tasks matched this board view.');
  const columns = [
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
    ['waiting', 'Waiting'],
    ['done', 'Done'],
  ];
  return `<div class="task-board">${columns.map(([id, label]) => {
    const colTasks = tasks.filter(task => taskStatus(task) === id);
    return `<section class="task-col"><h4>${label} (${colTasks.length})</h4>${renderTaskBoardGroups(colTasks)}</section>`;
  }).join('')}</div>`;
}

function taskCalendarState(key) {
  if (key === 'No due date') return { className: 'none', label: 'Unscheduled' };
  const today = todayKey();
  if (key < today) return { className: 'overdue', label: 'Overdue' };
  if (key === today) return { className: 'today', label: 'Today' };
  return { className: 'upcoming', label: 'Upcoming' };
}

function renderTaskCalendarHeading(key, count) {
  const state = taskCalendarState(key);
  return `
    <span>${escapeHtml(key)}</span>
    <span class="task-day-state ${state.className}">${escapeHtml(state.label)}</span>
    <small>${count}</small>
  `;
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
  if (!keys.length) return taskEmptyStateHtml('No scheduled tasks matched this calendar view.');
  return `<div class="task-calendar">${keys.map(key => {
    const groupTasks = groups.get(key);
    const state = taskCalendarState(key);
    return `<section class="task-day ${state.className}"><h4>${renderTaskCalendarHeading(key, groupTasks.length)}</h4>${groupTasks.map(task => renderTaskRow(task)).join('')}</section>`;
  }).join('')}</div>`;
}

async function showTasksView(mode = taskViewMode) {
  taskViewMode = ['list', 'calendar', 'kanban'].includes(mode) ? mode : 'list';
  localStorage.setItem('markpad-task-view', taskViewMode);
  const tasks = await collectLoadedTasks();
  const visibleTasks = visibleTasksForView(tasks);
  const body = taskViewMode === 'calendar' ? renderTaskCalendar(visibleTasks)
    : taskViewMode === 'kanban' ? renderTaskBoard(visibleTasks)
    : renderTaskList(visibleTasks);
  showModal('Tasks', `
    <div class="task-view-tabs">
      <button class="task-tab${taskViewMode === 'list' ? ' active' : ''}" data-task-view="list" aria-pressed="${taskViewMode === 'list' ? 'true' : 'false'}">List</button>
      <button class="task-tab${taskViewMode === 'calendar' ? ' active' : ''}" data-task-view="calendar" aria-pressed="${taskViewMode === 'calendar' ? 'true' : 'false'}">Calendar</button>
      <button class="task-tab${taskViewMode === 'kanban' ? ' active' : ''}" data-task-view="kanban" aria-pressed="${taskViewMode === 'kanban' ? 'true' : 'false'}">Kanban</button>
      <button class="task-tab" data-task-agenda>Agenda</button>
        <button class="task-tab push" data-task-add>+ Task</button>
        <button class="task-tab" data-task-format>Format</button>
        <button class="task-tab" data-task-source-profile>Source Profile</button>
        <button class="task-tab" data-task-export-md>Export MD</button>
        <button class="task-tab" data-task-copy-source-md>Copy Source MD</button>
        <button class="task-tab" data-task-export-source-md>Export Source MD</button>
        <button class="task-tab" data-task-copy-json>Copy JSON</button>
        <button class="task-tab" data-task-export-json>Export JSON</button>
        <button class="task-tab" data-task-copy-csv>Copy CSV</button>
        <button class="task-tab" data-task-export-csv>Export CSV</button>
        <button class="task-tab" data-task-copy-todo>Copy Todo.txt</button>
        <button class="task-tab" data-task-export-todo>Export Todo.txt</button>
        <button class="task-tab" data-task-copy-summary>Copy Summary</button>
        <button class="task-tab" data-task-copy-summary-json>Summary JSON</button>
        <button class="task-tab" data-task-copy-summary-csv>Summary CSV</button>
        <button class="task-tab" data-task-export-summary>Export Summary</button>
        <button class="task-tab" data-task-export-summary-json>Export Summary JSON</button>
        <button class="task-tab" data-task-export-summary-csv>Export Summary CSV</button>
        <button class="task-tab" data-task-copy-ics>Copy ICS</button>
        <button class="task-tab" data-task-export>Export ICS</button>
    </div>
    ${renderTaskControls(tasks, visibleTasks)}
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

function appendTaskBlockToMarkdown(content, lines) {
  const body = String(content || '');
  const prefix = body.trim() ? body.replace(/\s*$/, '\n') : '# Tasks\n\n';
  return `${prefix}${lines.filter(Boolean).join('\n')}\n`;
}

async function addQuickTask() {
  const raw = window.prompt('New task. You can add due:YYYY-MM-DD, !high, @waiting, #tag');
  const line = formatTaskLine(raw);
  if (!line) return;
  await addTaskLine(line);
}

async function addTaskTemplate(suffix) {
  const raw = window.prompt(`New task (${suffix})`);
  const text = String(raw || '').trim();
  if (!text) return;
  const line = formatTaskLine(`${text} ${suffix}`.trim());
  if (!line) return;
  await addTaskLine(line);
}

function dateKeyOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function taskStarterLines(kind) {
  if (kind === 'inbox') {
    return [
      `## Inbox ${todayKey()}`,
      `- [ ] Capture first task !medium due:${todayKey()} #inbox`,
      `- [ ] Review inbox and assign next action @waiting #inbox`,
    ];
  }
  if (kind === 'weekly') {
    return [
      `## Weekly Plan ${todayKey()}`,
      `- [ ] Pick top three outcomes !high due:${todayKey()} #weekly`,
      `- [ ] Review open waiting items @waiting #weekly`,
      `- [ ] Schedule deep work block due:${dateKeyOffset(1)} !medium #weekly`,
      `- [ ] Ship one visible improvement due:${dateKeyOffset(5)} !high #weekly`,
    ];
  }
  if (kind === 'review') {
    return [
      `## Review Queue ${todayKey()}`,
      `- [ ] Triage new notes !high due:${todayKey()} #review`,
      `- [ ] Verify links and references !medium #review`,
      `- [ ] Extract follow-up tasks @waiting #review`,
      `- [ ] Archive completed items !low #review`,
    ];
  }
  return [
    `## Project Kickoff ${todayKey()}`,
    `- [ ] Define outcome !high due:${todayKey()} #project`,
    `- [ ] Gather context !medium due:${dateKeyOffset(1)} #project`,
    `- [ ] Draft first milestone !high due:${dateKeyOffset(3)} #project`,
    `- [ ] List risks @waiting #project`,
  ];
}

function taskFileStarterMarkdown() {
  return [
    '# Tasks',
    '',
    '## Inbox',
    `- [ ] Capture a task !medium due:${todayKey()} #inbox`,
    '- [ ] Add project context #inbox',
    '',
    '## Waiting',
    '- [ ] Follow up on a delegated item @waiting #waiting',
    '',
    '## This week',
    `- [ ] Pick top three outcomes !high due:${todayKey()} #weekly`,
    `- [ ] Schedule one deep-work block !medium due:${dateKeyOffset(1)} #weekly`,
    '',
    '## Done',
    '- [x] Create portable Markdown task file #example',
    '',
  ].join('\n');
}

async function copyTaskFileStarterMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(taskFileStarterMarkdown());
  statusText.textContent = 'tasks.md starter copied';
}

function exportTaskFileStarterMarkdown() {
  downloadText('tasks.md', 'text/markdown', taskFileStarterMarkdown());
  statusText.textContent = 'tasks.md starter exported';
}

async function addTaskStarterTemplate(kind, label) {
  const lines = taskStarterLines(kind);
  let target = findTaskTargetNote();
  if (!target) {
    if (window.go?.main?.App?.AppendLocalFolderTask) {
      try {
        renderSession(await window.go.main.App.AppendLocalFolderTask(lines.join('\n')));
        loadContent(await window.go.main.App.GetActiveContent());
        setView('markdown');
        statusText.textContent = `${label} task starter added to local Tasks.md`;
        await showTasksView(taskViewMode);
        return;
      } catch {}
    }
    renderSession(await window.go.main.App.NewNote());
    target = cachedNotes.find(note => note.id === activeId);
    const content = appendTaskBlockToMarkdown('', lines);
    await window.go.main.App.UpdateContent(activeId, content, true);
    loadContent(content);
    renderSession(await window.go.main.App.GetSession());
    setView('markdown');
    statusText.textContent = `Created ${label} Tasks draft`;
    await showTasksView(taskViewMode);
    return;
  }
  const content = target.id === activeId ? currentContent : await window.go.main.App.GetNoteContent(target.id);
  const next = appendTaskBlockToMarkdown(content, lines);
  await window.go.main.App.UpdateContent(target.id, next, true);
  if (target.id === activeId) {
    currentContent = next;
    editor.value = next;
    if (viewMode !== 'markdown') renderViewer(currentContent, cachedNotes.find(n => n.id === activeId));
    updateStats();
    updateOutline();
  }
  renderSession(await window.go.main.App.GetSession());
  statusText.textContent = `${label} task starter added`;
  await showTasksView(taskViewMode);
}

async function addTaskLine(line) {
  let target = findTaskTargetNote();
  if (!target) {
    if (window.go?.main?.App?.AppendLocalFolderTask) {
      try {
        renderSession(await window.go.main.App.AppendLocalFolderTask(line));
        loadContent(await window.go.main.App.GetActiveContent());
        setView('markdown');
        statusText.textContent = 'Task added to local Tasks.md';
        await showTasksView(taskViewMode);
        return;
      } catch {}
    }
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

function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsFoldLine(line) {
  const text = String(line || '');
  const parts = [];
  for (let i = 0; i < text.length; i += 74) {
    parts.push((i ? ' ' : '') + text.slice(i, i + 74));
  }
  return parts.join('\r\n');
}

function taskIcsUid(task, index) {
  const seed = `${task.path}|${task.line}|${task.text}|${task.due}|${index}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return `markpad-task-${Math.abs(hash)}-${index}@local`;
}

function tasksToIcs(tasks) {
  const stamp = icsTimestamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Markpad//Local Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  tasks.forEach((task, index) => {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${taskIcsUid(task, index)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${icsEscape(task.text || 'Task')}`);
    lines.push(`STATUS:${task.checked ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    if (task.checked) lines.push(`COMPLETED:${stamp}`);
    if (task.due) lines.push(`DUE;VALUE=DATE:${String(task.due).replace(/-/g, '')}`);
    const description = [
      task.noteTitle ? `Source: ${task.noteTitle}` : '',
      task.path ? `Path: ${task.path}` : '',
      Number.isFinite(task.line) ? `Line: ${task.line + 1}` : '',
      task.priority ? `Priority: ${task.priority}` : '',
      task.waiting ? 'Waiting: yes' : '',
      (task.tags || []).length ? `Tags: ${(task.tags || []).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if ((task.tags || []).length) lines.push(`CATEGORIES:${icsEscape((task.tags || []).join(','))}`);
    lines.push('END:VTODO');
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFoldLine).join('\r\n') + '\r\n';
}

async function exportTasksIcs() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No tasks to export';
    return;
  }
  downloadText('markpad-tasks.ics', 'text/calendar', tasksToIcs(tasks));
  statusText.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} exported as ICS`;
}

async function copyVisibleTasksIcs() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No tasks to copy';
    return;
  }
  await navigator.clipboard.writeText(tasksToIcs(tasks));
  statusText.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} copied as ICS`;
}

function taskMarkdownExportLine(task) {
  const extras = [];
  if (task.due) extras.push(`due:${task.due}`);
  if (task.priority) extras.push(`!${task.priority}`);
  if (task.waiting) extras.push('@waiting');
  (task.tags || []).forEach(tag => extras.push(`#${tag}`));
  const body = [String(task.text || '').trim(), ...extras].filter(Boolean).join(' ');
  return `- [${task.checked ? 'x' : ' '}] ${body || 'Task'}`;
}

function tasksToMarkdown(tasks) {
  const filterLabel = `${taskSourceFilter}/${taskFilter}${taskQuery ? `/${taskQuery}` : ''}`;
  const lines = [
    '# Markpad Tasks Export',
    '',
    `Exported: ${new Date().toLocaleString()}`,
    `Filter: ${filterLabel}`,
    `Count: ${tasks.length}`,
    '',
  ];
  for (const task of tasks) {
    lines.push(taskMarkdownExportLine(task));
    lines.push(`  - Source: ${task.local ? 'Local' : 'Loaded'} · ${task.noteTitle || 'Untitled'} · ${task.path || 'Draft'}:${Number(task.line || 0) + 1}`);
  }
  return lines.join('\n') + '\n';
}

function tasksToSourceMarkdown(tasks) {
  const open = tasks.filter(task => !task.checked);
  const done = tasks.filter(task => task.checked);
  const groups = [
    ['Open', open],
    ['Done', done],
  ].filter(([, items]) => items.length);
  const lines = ['# Tasks', ''];
  if (!groups.length) return `${lines.join('\n')}\n`;
  for (const [label, items] of groups) {
    lines.push(`## ${label}`);
    for (const task of items) lines.push(taskMarkdownExportLine(task));
    lines.push('');
  }
  return lines.join('\n');
}

function tasksToJson(tasks) {
  return JSON.stringify({
    type: 'markpad-visible-tasks',
    version: 1,
    exportedAt: new Date().toISOString(),
    view: {
      mode: taskViewMode,
      source: taskSourceFilter,
      filter: taskFilter,
      query: taskQuery,
    },
    count: tasks.length,
    tasks: tasks.map(task => ({
      text: String(task.text || ''),
      checked: !!task.checked,
      due: task.due || '',
      priority: task.priority || '',
      waiting: !!task.waiting,
      tags: Array.isArray(task.tags) ? task.tags : [],
      source: task.local ? 'local' : 'loaded',
      noteTitle: task.noteTitle || '',
      path: task.path || '',
      line: Number.isFinite(Number(task.line)) ? Number(task.line) + 1 : null,
      raw: task.raw || '',
    })),
  }, null, 2) + '\n';
}

function tasksToCsv(tasks) {
  const rows = [
    ['text', 'checked', 'due', 'priority', 'waiting', 'tags', 'source', 'noteTitle', 'path', 'line'],
    ...tasks.map(task => [
      String(task.text || ''),
      task.checked ? 'true' : 'false',
      task.due || '',
      task.priority || '',
      task.waiting ? 'true' : 'false',
      (task.tags || []).join(' '),
      task.local ? 'local' : 'loaded',
      task.noteTitle || '',
      task.path || '',
      Number.isFinite(Number(task.line)) ? Number(task.line) + 1 : '',
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function exportTasksMarkdown() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to export';
    return;
  }
  downloadText('markpad-tasks.md', 'text/markdown', tasksToMarkdown(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} exported as Markdown`;
}

async function exportTasksSourceMarkdown() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to export';
    return;
  }
  downloadText('tasks.md', 'text/markdown', tasksToSourceMarkdown(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} exported as editable tasks.md`;
}

async function exportTasksJson() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to export';
    return;
  }
  downloadText('markpad-tasks.json', 'application/json', tasksToJson(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} exported as JSON`;
}

async function exportTasksCsv() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to export';
    return;
  }
  downloadText('markpad-tasks.csv', 'text/csv', tasksToCsv(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} exported as CSV`;
}

async function copyVisibleTasksMarkdown() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToMarkdown(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} copied as Markdown`;
}

async function copyVisibleTasksSourceMarkdown() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToSourceMarkdown(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} copied as editable tasks.md`;
}

async function copyVisibleTasksJson() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToJson(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} copied as JSON`;
}

async function copyVisibleTasksCsv() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToCsv(tasks));
  statusText.textContent = `${tasks.length} visible task${tasks.length === 1 ? '' : 's'} copied as CSV`;
}

async function copySingleTaskMarkdown(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const text = [
    taskMarkdownExportLine(task),
    `  - Source: ${task.local ? 'Local' : 'Loaded'} · ${task.noteTitle || 'Untitled'} · ${task.path || 'Draft'}:${Number(task.line || 0) + 1}`,
    '',
  ].join('\n');
  await navigator.clipboard.writeText(text);
  statusText.textContent = 'Task copied as Markdown';
}

async function copySingleTaskJson(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify({
    type: 'markpad-task',
    version: 1,
    exportedAt: new Date().toISOString(),
    task: {
      text: String(task.text || ''),
      checked: !!task.checked,
      due: task.due || '',
      priority: task.priority || '',
      waiting: !!task.waiting,
      tags: Array.isArray(task.tags) ? task.tags : [],
      source: task.local ? 'local' : 'loaded',
      noteTitle: task.noteTitle || '',
      path: task.path || '',
      line: Number.isFinite(Number(task.line)) ? Number(task.line) + 1 : null,
      raw: task.raw || '',
    },
  }, null, 2) + '\n');
  statusText.textContent = 'Task copied as JSON';
}

async function copySingleTaskIcs(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToIcs([task]));
  statusText.textContent = 'Task copied as ICS';
}

async function copySingleTaskCsv(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToCsv([task]));
  statusText.textContent = 'Task copied as CSV';
}

function taskTodoTxtToken(value) {
  return String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w.-]/g, '')
    .slice(0, 48);
}

function taskTodoTxtPriority(task) {
  const priority = String(task.priority || '').trim().toLowerCase();
  if (!priority || task.checked) return '';
  if (priority === 'high' || priority === 'a' || priority === '1') return 'A';
  if (priority === 'medium' || priority === 'med' || priority === 'b' || priority === '2') return 'B';
  if (priority === 'low' || priority === 'c' || priority === '3') return 'C';
  return '';
}

function taskToTodoTxtLine(task) {
  const parts = [];
  if (task.checked) parts.push('x');
  const priority = taskTodoTxtPriority(task);
  if (priority) parts.push(`(${priority})`);
  parts.push(String(task.text || 'Untitled task').replace(/\s+/g, ' ').trim());
  if (task.due) parts.push(`due:${String(task.due).slice(0, 10)}`);
  if (task.waiting) parts.push('@waiting');
  if (Array.isArray(task.tags)) {
    task.tags.forEach(tag => {
      const token = taskTodoTxtToken(tag);
      if (token) parts.push(`+${token}`);
    });
  }
  parts.push(`source:${task.local ? 'local' : 'loaded'}`);
  const sourceToken = taskTodoTxtToken(task.noteTitle || (task.path ? String(task.path).split(/[\\/]/).pop() : ''));
  if (sourceToken) parts.push(`src:${sourceToken}`);
  if (Number.isFinite(Number(task.line))) parts.push(`line:${Number(task.line) + 1}`);
  return parts.join(' ');
}

async function copySingleTaskTodoTxt(taskId) {
  const task = latestTasks.find(item => item.id === taskId);
  if (!task) return;
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(`${taskToTodoTxtLine(task)}\n`);
  statusText.textContent = 'Task copied as Todo.txt';
}

function tasksToTodoTxt(tasks) {
  return tasks.map(taskToTodoTxtLine).join('\n') + (tasks.length ? '\n' : '');
}

async function copyVisibleTasksTodoTxt() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(tasksToTodoTxt(tasks));
  statusText.textContent = `Copied ${tasks.length} tasks as Todo.txt`;
}

async function exportTasksTodoTxt() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to export';
    return;
  }
  downloadText('markpad-tasks.todo.txt', 'text/plain', tasksToTodoTxt(tasks));
  statusText.textContent = `Exported ${tasks.length} tasks as Todo.txt`;
}

async function copyTaskViewSummary() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const open = tasks.filter(task => !task.checked).length;
  const done = tasks.length - open;
  const waiting = tasks.filter(task => task.waiting && !task.checked).length;
  const high = tasks.filter(task => isHighPriorityTask(task) && !task.checked).length;
  const due = tasks.filter(task => task.due && !task.checked).length;
  const sources = tasks.reduce((counts, task) => {
    counts[task.local ? 'local' : 'loaded'] += 1;
    return counts;
  }, { loaded: 0, local: 0 });
  const lines = [
    '# Markpad Task View',
    '',
    `- View: ${taskViewMode}`,
    `- Source: ${taskSourceFilter}`,
    `- Filter: ${taskFilter}`,
    `- Query: ${taskQuery || '(none)'}`,
    `- Visible: ${tasks.length}`,
    `- Open: ${open}`,
    `- Done: ${done}`,
    `- High priority: ${high}`,
    `- Waiting: ${waiting}`,
    `- With due dates: ${due}`,
    `- Loaded/local: ${sources.loaded}/${sources.local}`,
  ];
  await navigator.clipboard.writeText(lines.join('\n') + '\n');
  statusText.textContent = 'Task view summary copied';
}

async function copyTaskViewSummaryJson() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const open = tasks.filter(task => !task.checked).length;
  const waiting = tasks.filter(task => task.waiting && !task.checked).length;
  const high = tasks.filter(task => isHighPriorityTask(task) && !task.checked).length;
  const due = tasks.filter(task => task.due && !task.checked).length;
  const sources = tasks.reduce((counts, task) => {
    counts[task.local ? 'local' : 'loaded'] += 1;
    return counts;
  }, { loaded: 0, local: 0 });
  await navigator.clipboard.writeText(JSON.stringify({
    type: 'markpad-task-view-summary',
    version: 1,
    exportedAt: new Date().toISOString(),
    view: taskViewMode,
    source: taskSourceFilter,
    filter: taskFilter,
    query: taskQuery || '',
    counts: {
      visible: tasks.length,
      open,
      done: tasks.length - open,
      high,
      waiting,
      due,
      loaded: sources.loaded,
      local: sources.local,
    },
  }, null, 2) + '\n');
  statusText.textContent = 'Task view summary copied as JSON';
}

async function copyTaskViewSummaryCsv() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const open = tasks.filter(task => !task.checked).length;
  const waiting = tasks.filter(task => task.waiting && !task.checked).length;
  const high = tasks.filter(task => isHighPriorityTask(task) && !task.checked).length;
  const due = tasks.filter(task => task.due && !task.checked).length;
  const sources = tasks.reduce((counts, task) => {
    counts[task.local ? 'local' : 'loaded'] += 1;
    return counts;
  }, { loaded: 0, local: 0 });
  const rows = [
    ['view', 'source', 'filter', 'query', 'visible', 'open', 'done', 'high', 'waiting', 'due', 'loaded', 'local'],
    [taskViewMode, taskSourceFilter, taskFilter, taskQuery || '', tasks.length, open, tasks.length - open, high, waiting, due, sources.loaded, sources.local],
  ];
  await navigator.clipboard.writeText(rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n');
  statusText.textContent = 'Task view summary copied as CSV';
}

function taskViewSummarySnapshot(tasks) {
  const open = tasks.filter(task => !task.checked).length;
  const waiting = tasks.filter(task => task.waiting && !task.checked).length;
  const high = tasks.filter(task => isHighPriorityTask(task) && !task.checked).length;
  const due = tasks.filter(task => task.due && !task.checked).length;
  const sources = tasks.reduce((counts, task) => {
    counts[task.local ? 'local' : 'loaded'] += 1;
    return counts;
  }, { loaded: 0, local: 0 });
  return {
    type: 'markpad-task-view-summary',
    version: 1,
    exportedAt: new Date().toISOString(),
    view: taskViewMode,
    source: taskSourceFilter,
    filter: taskFilter,
    query: taskQuery || '',
    counts: {
      visible: tasks.length,
      open,
      done: tasks.length - open,
      high,
      waiting,
      due,
      loaded: sources.loaded,
      local: sources.local,
    },
  };
}

function taskViewSummaryMarkdownText(summary) {
  return [
    '# Markpad Task View',
    '',
    `- Generated: ${summary.exportedAt}`,
    `- View: ${summary.view}`,
    `- Source: ${summary.source}`,
    `- Filter: ${summary.filter}`,
    `- Query: ${summary.query || '(none)'}`,
    `- Visible: ${summary.counts.visible}`,
    `- Open: ${summary.counts.open}`,
    `- Done: ${summary.counts.done}`,
    `- High priority: ${summary.counts.high}`,
    `- Waiting: ${summary.counts.waiting}`,
    `- With due dates: ${summary.counts.due}`,
    `- Loaded/local: ${summary.counts.loaded}/${summary.counts.local}`,
  ].join('\n') + '\n';
}

function taskViewSummaryCsvText(summary) {
  const rows = [
    ['exportedAt', 'view', 'source', 'filter', 'query', 'visible', 'open', 'done', 'high', 'waiting', 'due', 'loaded', 'local'],
    [summary.exportedAt, summary.view, summary.source, summary.filter, summary.query || '', summary.counts.visible, summary.counts.open, summary.counts.done, summary.counts.high, summary.counts.waiting, summary.counts.due, summary.counts.loaded, summary.counts.local],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function exportTaskViewSummaryMarkdown() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  downloadText('markpad-task-view-summary.md', 'text/markdown', taskViewSummaryMarkdownText(taskViewSummarySnapshot(tasks)));
  statusText.textContent = 'Task view summary exported as Markdown';
}

async function exportTaskViewSummaryJson() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  downloadText('markpad-task-view-summary.json', 'application/json', JSON.stringify(taskViewSummarySnapshot(tasks), null, 2) + '\n');
  statusText.textContent = 'Task view summary exported as JSON';
}

async function exportTaskViewSummaryCsv() {
  const tasks = visibleTasksForView(latestTasks.length ? latestTasks : await collectLoadedTasks());
  downloadText('markpad-task-view-summary.csv', 'text/csv', taskViewSummaryCsvText(taskViewSummarySnapshot(tasks)));
  statusText.textContent = 'Task view summary exported as CSV';
}

function taskDueBucket(task) {
  if (task.checked) return 'done';
  if (!task.due) return 'unscheduled';
  const today = todayKey();
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due === tomorrowKey()) return 'tomorrow';
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);
  endDate.setMinutes(endDate.getMinutes() - endDate.getTimezoneOffset());
  return task.due <= endDate.toISOString().slice(0, 10) ? 'week' : 'later';
}

function taskVisiblePageFootprint(tasks) {
  const visible = Array.isArray(tasks) ? tasks : [];
  const compact = visible.map(task => ({
    text: String(task.text || ''),
    checked: !!task.checked,
    due: task.due || '',
    priority: task.priority || '',
    waiting: !!task.waiting,
    tags: Array.isArray(task.tags) ? task.tags : [],
    source: task.local ? 'local' : 'loaded',
    noteTitle: task.noteTitle || '',
    path: task.path || '',
    line: Number.isFinite(Number(task.line)) ? Number(task.line) + 1 : null,
  }));
  const bytes = byteSize(JSON.stringify(compact));
  const textBytes = compact.reduce((sum, task) => sum + byteSize(task.text || ''), 0);
  return {
    count: compact.length,
    bytes,
    textBytes,
    metadataBytes: Math.max(0, bytes - textBytes),
    averageBytes: compact.length ? Math.round(bytes / compact.length) : 0,
  };
}

function taskSourceProfileSnapshot(allTasks, visibleTasks) {
  const tasks = Array.isArray(allTasks) ? allTasks : [];
  const visible = Array.isArray(visibleTasks) ? visibleTasks : visibleTasksForView(tasks);
  const sourceFiles = new Set(tasks.map(task => task.path || 'Draft'));
  const loadedFiles = new Set(tasks.filter(task => !task.local).map(task => task.path || 'Draft'));
  const localFiles = new Set(tasks.filter(task => task.local).map(task => task.path || 'Local'));
  const dueBuckets = tasks.reduce((acc, task) => {
    const key = taskDueBucket(task);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { overdue: 0, today: 0, tomorrow: 0, week: 0, later: 0, unscheduled: 0, done: 0 });
  const priorityBuckets = tasks.reduce((acc, task) => {
    const key = taskPriorityBucket(task);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { high: 0, medium: 0, normal: 0, low: 0 });
  const target = findTaskTargetNote();
  const sourceMarkdown = tasksToSourceMarkdown(visible);
  const todoText = tasksToTodoTxt(visible);
  return {
    type: 'markpad-task-source-profile',
    version: 1,
    sampledAt: new Date().toISOString(),
    view: {
      mode: taskViewMode,
      source: taskSourceFilter,
      filter: taskFilter,
      query: taskQuery || '',
      visible: visible.length,
    },
    counts: {
      total: tasks.length,
      open: tasks.filter(task => !task.checked).length,
      done: tasks.filter(task => task.checked).length,
      waiting: tasks.filter(task => !task.checked && task.waiting).length,
      high: tasks.filter(isHighPriorityTask).length,
      loaded: tasks.filter(task => !task.local).length,
      local: tasks.filter(task => task.local).length,
      sourceFiles: sourceFiles.size,
      loadedFiles: loadedFiles.size,
      localFiles: localFiles.size,
    },
    dueBuckets,
    priorityBuckets,
    taskFile: target ? {
      found: true,
      title: target.title || basename(target.path || '') || 'Tasks',
      path: target.path || 'Draft',
      active: target.id === activeId,
    } : {
      found: false,
      title: '',
      path: '',
      active: false,
    },
    formats: {
      source: 'GitHub-style Markdown checkboxes in tasks.md',
      metadata: ['due:YYYY-MM-DD', '!high', '!medium', '!low', '@waiting', '#tag'],
      views: ['list', 'calendar', 'kanban'],
      exports: ['tasks.md', 'Markdown report', 'JSON', 'CSV', 'ICS', 'Todo.txt', 'canvas board'],
      generatedSourceBytes: byteSize(sourceMarkdown),
      generatedTodoBytes: byteSize(todoText),
    },
    footprint: taskVisiblePageFootprint(visible),
    backend: {
      localFolderTasks: !!window.go?.main?.App?.ListLocalFolderTasks,
      appendLocalFolderTask: !!window.go?.main?.App?.AppendLocalFolderTask,
    },
    note: 'Task views are derived from Markdown checkbox lines; Markpad does not create a hidden task database.',
  };
}

async function currentTaskSourceProfileSnapshot() {
  const allTasks = await collectLoadedTasks();
  return taskSourceProfileSnapshot(allTasks, visibleTasksForView(allTasks));
}

function taskSourceProfileMarkdown(snapshot) {
  return [
    '# Markpad Task Source Profile',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    `View: ${snapshot.view.mode}`,
    `Source filter: ${snapshot.view.source}`,
    `Status filter: ${snapshot.view.filter}`,
    `Query: ${snapshot.view.query || '(none)'}`,
    `Visible: ${snapshot.view.visible}`,
    '',
    '## Counts',
    '',
    `- Total tasks: ${snapshot.counts.total}`,
    `- Open: ${snapshot.counts.open}`,
    `- Done: ${snapshot.counts.done}`,
    `- Waiting: ${snapshot.counts.waiting}`,
    `- High priority: ${snapshot.counts.high}`,
    `- Loaded/local: ${snapshot.counts.loaded}/${snapshot.counts.local}`,
    `- Source files: ${snapshot.counts.sourceFiles} (${snapshot.counts.loadedFiles} loaded, ${snapshot.counts.localFiles} local)`,
    '',
    '## Due buckets',
    '',
    `- Overdue: ${snapshot.dueBuckets.overdue || 0}`,
    `- Today: ${snapshot.dueBuckets.today || 0}`,
    `- Tomorrow: ${snapshot.dueBuckets.tomorrow || 0}`,
    `- This week: ${snapshot.dueBuckets.week || 0}`,
    `- Later: ${snapshot.dueBuckets.later || 0}`,
    `- Unscheduled: ${snapshot.dueBuckets.unscheduled || 0}`,
    '',
    '## Portable source',
    '',
    `- Task file: ${snapshot.taskFile.found ? `${snapshot.taskFile.title} (${snapshot.taskFile.path})` : 'not currently loaded'}`,
    `- Source format: ${snapshot.formats.source}`,
    `- Metadata tokens: ${snapshot.formats.metadata.join(', ')}`,
    `- Views: ${snapshot.formats.views.join(', ')}`,
    `- Exports: ${snapshot.formats.exports.join(', ')}`,
    `- Generated visible tasks.md size: ${formatBytes(snapshot.formats.generatedSourceBytes || 0)}`,
    `- Generated visible Todo.txt size: ${formatBytes(snapshot.formats.generatedTodoBytes || 0)}`,
    `- Visible task page footprint: ${formatBytes(snapshot.footprint?.bytes || 0)} (${snapshot.footprint?.count || 0} tasks, ${formatBytes(snapshot.footprint?.textBytes || 0)} text)`,
    '',
    '## Backend bridges',
    '',
    `- Local folder task scan: ${snapshot.backend.localFolderTasks ? 'available' : 'unavailable'}`,
    `- Append local folder task: ${snapshot.backend.appendLocalFolderTask ? 'available' : 'unavailable'}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function taskSourceProfileJson(snapshot) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function taskSourceProfileCsv(snapshot) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['view_mode', snapshot.view.mode],
    ['source_filter', snapshot.view.source],
    ['status_filter', snapshot.view.filter],
    ['query', snapshot.view.query || ''],
    ['visible', Number(snapshot.view.visible || 0)],
    ['total', Number(snapshot.counts.total || 0)],
    ['open', Number(snapshot.counts.open || 0)],
    ['done', Number(snapshot.counts.done || 0)],
    ['waiting', Number(snapshot.counts.waiting || 0)],
    ['high', Number(snapshot.counts.high || 0)],
    ['loaded', Number(snapshot.counts.loaded || 0)],
    ['local', Number(snapshot.counts.local || 0)],
    ['source_files', Number(snapshot.counts.sourceFiles || 0)],
    ['due_overdue', Number(snapshot.dueBuckets.overdue || 0)],
    ['due_today', Number(snapshot.dueBuckets.today || 0)],
    ['due_tomorrow', Number(snapshot.dueBuckets.tomorrow || 0)],
    ['due_week', Number(snapshot.dueBuckets.week || 0)],
    ['due_later', Number(snapshot.dueBuckets.later || 0)],
    ['due_unscheduled', Number(snapshot.dueBuckets.unscheduled || 0)],
    ['task_file_found', snapshot.taskFile.found ? 'true' : 'false'],
    ['task_file_path', snapshot.taskFile.path || ''],
    ['generated_source_bytes', Number(snapshot.formats.generatedSourceBytes || 0)],
    ['generated_todo_bytes', Number(snapshot.formats.generatedTodoBytes || 0)],
    ['visible_page_bytes', Number(snapshot.footprint?.bytes || 0)],
    ['visible_page_text_bytes', Number(snapshot.footprint?.textBytes || 0)],
    ['visible_page_metadata_bytes', Number(snapshot.footprint?.metadataBytes || 0)],
    ['visible_page_average_bytes', Number(snapshot.footprint?.averageBytes || 0)],
    ['local_folder_task_scan', snapshot.backend.localFolderTasks ? 'true' : 'false'],
    ['append_local_folder_task', snapshot.backend.appendLocalFolderTask ? 'true' : 'false'],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function showTaskSourceProfile() {
  const snapshot = await currentTaskSourceProfileSnapshot();
  showModal('Task Source Profile', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${snapshot.counts.total}</strong><span>Total tasks</span><small>${snapshot.counts.open} open · ${snapshot.counts.done} done</small></div>
      <div class="diag-card"><strong>${snapshot.view.visible}</strong><span>Visible now</span><small>${escapeHtml(snapshot.view.source)} · ${escapeHtml(snapshot.view.filter)}${snapshot.view.query ? ` · ${escapeHtml(snapshot.view.query)}` : ''}</small></div>
      <div class="diag-card"><strong>${snapshot.counts.loaded}/${snapshot.counts.local}</strong><span>Loaded/local</span><small>${snapshot.counts.sourceFiles} source file${snapshot.counts.sourceFiles === 1 ? '' : 's'}</small></div>
      <div class="diag-card"><strong>${snapshot.dueBuckets.overdue || 0}</strong><span>Overdue</span><small>${snapshot.dueBuckets.today || 0} today · ${snapshot.dueBuckets.week || 0} this week</small></div>
      <div class="diag-card"><strong>${snapshot.counts.waiting}</strong><span>Waiting</span><small>${snapshot.counts.high} high priority</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.formats.generatedSourceBytes || 0)}</strong><span>Visible tasks.md</span><small>Clean editable source export</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.formats.generatedTodoBytes || 0)}</strong><span>Visible Todo.txt</span><small>Portable task list export</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.footprint.bytes || 0)}</strong><span>Visible page</span><small>${formatBytes(snapshot.footprint.textBytes || 0)} text · avg ${formatBytes(snapshot.footprint.averageBytes || 0)}</small></div>
      <div class="diag-card"><strong>${snapshot.taskFile.found ? 'found' : 'missing'}</strong><span>Task file</span><small>${escapeHtml(snapshot.taskFile.path || 'Use setup or starter')}</small></div>
      <div class="diag-card"><strong>${snapshot.backend.localFolderTasks ? 'yes' : 'no'}</strong><span>Local scan bridge</span><small>${snapshot.backend.appendLocalFolderTask ? 'append available' : 'append fallback to draft'}</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-task-source-profile-md>Copy MD</button>
      <button data-export-task-source-profile-md>Export MD</button>
      <button data-copy-task-source-profile-json>Copy JSON</button>
      <button data-export-task-source-profile-json>Export JSON</button>
      <button data-copy-task-source-profile-csv>Copy CSV</button>
      <button data-export-task-source-profile-csv>Export CSV</button>
      <button data-task-export-source-md>Export Source MD</button>
      <button data-task-file-setup>Task File Setup</button>
    </div>
    <p class="diag-note">${escapeHtml(snapshot.note)}</p>
  `, true);
}

async function copyTaskSourceProfileMarkdown() {
  await navigator.clipboard.writeText(taskSourceProfileMarkdown(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile copied as Markdown';
}

async function exportTaskSourceProfileMarkdown() {
  downloadText('markpad-task-source-profile.md', 'text/markdown', taskSourceProfileMarkdown(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile exported as Markdown';
}

async function copyTaskSourceProfileJson() {
  await navigator.clipboard.writeText(taskSourceProfileJson(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile copied as JSON';
}

async function exportTaskSourceProfileJson() {
  downloadText('markpad-task-source-profile.json', 'application/json', taskSourceProfileJson(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile exported as JSON';
}

async function copyTaskSourceProfileCsv() {
  await navigator.clipboard.writeText(taskSourceProfileCsv(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile copied as CSV';
}

async function exportTaskSourceProfileCsv() {
  downloadText('markpad-task-source-profile.csv', 'text/csv', taskSourceProfileCsv(await currentTaskSourceProfileSnapshot()));
  statusText.textContent = 'Task source profile exported as CSV';
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
    schema: MARKPAD_CANVAS_SCHEMA,
    source: 'markpad',
    meta: canvasDocumentMeta({ createdAt: new Date().toISOString() }),
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}

function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function canvasDocumentMeta(meta = {}) {
  return {
    format: MARKPAD_CANVAS_FORMAT,
    generator: 'Markpad',
    ...meta,
  };
}

function normalizeCanvasDoc(input) {
  if (input && input.type === 'markpad-canvas' && Array.isArray(input.elements)) {
    return {
      type: 'markpad-canvas',
      version: 1,
      schema: input.schema || MARKPAD_CANVAS_SCHEMA,
      source: input.source || 'markpad',
      meta: canvasDocumentMeta(input.meta || {}),
      elements: input.elements.filter(Boolean),
      appState: input.appState || { viewBackgroundColor: '#ffffff' },
      files: input.files || {},
    };
  }
  if (input && input.type === 'excalidraw' && Array.isArray(input.elements)) {
    return {
      type: 'markpad-canvas',
      version: 1,
      schema: MARKPAD_CANVAS_SCHEMA,
      source: 'markpad-import-excalidraw',
      meta: canvasDocumentMeta({ importedFrom: 'excalidraw' }),
      elements: input.elements.map(excalidrawElementToCanvas).filter(Boolean),
      appState: { viewBackgroundColor: input.appState?.viewBackgroundColor || '#ffffff' },
      files: {},
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
      schema: MARKPAD_CANVAS_SCHEMA,
      source: 'markpad-import-obsidian-canvas',
      meta: canvasDocumentMeta({ importedFrom: 'obsidian-canvas' }),
      elements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };
  }
  throw new Error('Unsupported canvas JSON');
}

function canvasPortableDoc(doc, options = {}) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const meta = canvasDocumentMeta(source.meta || {});
  if (options.includeExportedAt) meta.exportedAt = new Date().toISOString();
  return {
    type: 'markpad-canvas',
    version: 1,
    schema: MARKPAD_CANVAS_SCHEMA,
    source: source.source || 'markpad',
    meta,
    elements: source.elements || [],
    appState: source.appState || { viewBackgroundColor: '#ffffff' },
    files: source.files || {},
  };
}

function excalidrawElementToCanvas(element) {
  if (!element || element.isDeleted) return null;
  const x = Number(element.x || 0);
  const y = Number(element.y || 0);
  const w = Number(element.width || 0);
  const h = Number(element.height || 0);
  const base = {
    id: canvasId(),
    stroke: element.strokeColor || '#1e1e1e',
    width: Math.max(1, Number(element.strokeWidth || 2)),
  };
  if (element.type === 'rectangle' || element.type === 'diamond') {
    return { ...base, type: 'rect', x, y, w: Math.max(1, w), h: Math.max(1, h) };
  }
  if (element.type === 'ellipse') {
    return { ...base, type: 'ellipse', x, y, w: Math.max(1, w), h: Math.max(1, h) };
  }
  if (element.type === 'text') {
    return {
      ...base,
      type: 'text',
      x,
      y: y + Number(element.fontSize || 16),
      text: String(element.text || element.originalText || '').trim(),
      size: Math.max(8, Number(element.fontSize || 16)),
    };
  }
  if (element.type === 'line' || element.type === 'arrow') {
    const points = Array.isArray(element.points) && element.points.length >= 2 ? element.points : [[0, 0], [w, h]];
    const first = excalidrawPointToCanvas(points[0], x, y);
    const last = excalidrawPointToCanvas(points[points.length - 1], x, y);
    return { ...base, type: element.type, x: first.x, y: first.y, w: last.x - first.x, h: last.y - first.y };
  }
  if (element.type === 'freedraw') {
    const points = (element.points || []).map(point => excalidrawPointToCanvas(point, x, y));
    if (points.length < 2) return null;
    return { ...base, type: 'path', points };
  }
  return null;
}

function excalidrawPointToCanvas(point, x, y) {
  const px = Array.isArray(point) ? point[0] : point?.x;
  const py = Array.isArray(point) ? point[1] : point?.y;
  return { x: x + Number(px || 0), y: y + Number(py || 0) };
}

function canvasPathBounds(points = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = Number(point?.x || 0);
    const y = Number(point?.y || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function canvasElementBounds(el) {
  if (el.type === 'path' && el.points?.length) return canvasPathBounds(el.points);
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

function canvasViewportBounds() {
  if (!canvasStage || !canvasSession) return null;
  const camera = canvasCamera();
  const rect = canvasStage.getBoundingClientRect();
  const scale = camera.scale || 1;
  return {
    x: -camera.x / scale,
    y: -camera.y / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

function canvasElementInViewport(el, view, pad = 100) {
  if (!view) return true;
  const bounds = canvasElementBounds(el);
  const strokePad = Math.max(pad, Number(el.strokeWidth || el.width || 0) * 4);
  return bounds.x + bounds.w >= view.x - strokePad
    && bounds.y + bounds.h >= view.y - strokePad
    && bounds.x <= view.x + view.w + strokePad
    && bounds.y <= view.y + view.h + strokePad;
}

function canvasVisibleElementCount() {
  const elements = canvasDoc?.elements || [];
  if (!elements.length) return 0;
  const view = canvasViewportBounds();
  if (!view || !canvasActive) return elements.length;
  return elements.filter(el => canvasElementInViewport(el, view)).length;
}

function updateCanvasStatus() {
  if (!canvasStatus || !canvasSession) return;
  const count = (canvasDoc?.elements || []).length;
  const visibleCount = canvasVisibleElementCount();
  const zoom = Math.round((canvasSession.camera?.scale || 1) * 100);
  const bytes = byteSize(JSON.stringify(canvasDoc || newCanvasDoc()));
  const bg = canvasDoc?.appState?.viewBackgroundColor || '#ffffff';
  const mode = `${canvasToolLabel(canvasTool)} · ${canvasGridVisible ? 'grid' : 'no grid'} · ${canvasSnapToGrid ? 'snap' : 'free'}`;
  const visibility = count ? `${visibleCount}/${count} visible` : '0 elements';
  canvasStatus.textContent = `${visibility} · ${zoom}% · ${mode} · ${formatBytes(bytes)} · bg ${bg}${canvasSelectionStatus(count)}`;
  updateCanvasHint(count);
  updateCanvasSelectionButtons();
}

function updateCanvasHint(count = (canvasDoc?.elements || []).length) {
  if (!canvasHint) return;
  if (!count) {
    canvasHint.textContent = 'Empty local canvas: choose Pen, Rect, Arrow, or Text. Wheel zooms, Pan moves the board, JSON stays on this machine.';
    return;
  }
  if (canvasDoc && canvasSelectedIndex >= 0 && canvasSelectedIndex < count) {
    const element = canvasDoc.elements[canvasSelectedIndex];
    const label = String(element?.type || 'element');
    canvasHint.textContent = `Selected ${label}: drag to move, Color/Width edits style, Ctrl+C/V copies locally, Front/Back changes layers.`;
    return;
  }
  if (canvasTool === 'select') {
    canvasHint.textContent = 'Select mode: click an element for copy, duplicate, style, layer, inspector, and fit actions.';
    return;
  }
  if (canvasTool === 'pan') {
    canvasHint.textContent = 'Pan mode: drag the board, wheel zooms, Fit recenters visible content, Write saves to the active local canvas file.';
    return;
  }
  canvasHint.textContent = `${canvasToolLabel(canvasTool)} mode: drag on the canvas to create an element. Use Select to move and style it after drawing.`;
}

function canvasToolLabel(tool) {
  return ({
    pen: 'Pen',
    rect: 'Rectangle',
    ellipse: 'Oval',
    line: 'Line',
    arrow: 'Arrow',
    text: 'Text',
    sticky: 'Sticky note',
    erase: 'Erase',
  })[tool] || 'Canvas';
}

function canvasSelectionStatus(count) {
  if (!canvasDoc || canvasSelectedIndex < 0 || canvasSelectedIndex >= count) return '';
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  const type = String(element?.type || 'item');
  const size = `${Math.round(bounds.w)}x${Math.round(bounds.h)}`;
  return ` · ${type} · ${size}`;
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
  fitCanvasToBounds(elements.map(canvasElementBounds), 2.5);
}

function fitCanvasToSelection() {
  if (!canvasDoc || !canvasStage || !hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return;
  }
  fitCanvasToBounds([canvasElementBounds(canvasDoc.elements[canvasSelectedIndex])], 3);
  statusText.textContent = 'Canvas selection fitted';
}

function fitCanvasToBounds(bounds, maxScale = 2.5) {
  if (!canvasStage || !bounds?.length) return;
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w));
  const maxY = Math.max(...bounds.map(b => b.y + b.h));
  const rect = canvasStage.getBoundingClientRect();
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const scale = Math.max(0.12, Math.min(maxScale, Math.min((rect.width - 96) / contentW, (rect.height - 96) / contentH)));
  canvasSession.camera = {
    x: rect.width / 2 - (minX + contentW / 2) * scale,
    y: rect.height / 2 - (minY + contentH / 2) * scale,
    scale,
  };
  saveCanvasState();
  renderCanvas();
}

function setCanvasZoom(nextScale) {
  if (!canvasStage) return;
  const camera = canvasCamera();
  const rect = canvasStage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    requestAnimationFrame(() => setCanvasZoom(nextScale));
    return;
  }
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const before = canvasScreenToWorld(centerX, centerY);
  camera.scale = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, Number(nextScale) || 1));
  camera.x = rect.width / 2 - before.x * camera.scale;
  camera.y = rect.height / 2 - before.y * camera.scale;
  saveCanvasState();
  renderCanvas();
  statusText.textContent = `Canvas zoom ${Math.round(camera.scale * 100)}%`;
}

function zoomCanvasBy(factor) {
  const camera = canvasCamera();
  setCanvasZoom((camera.scale || 1) * factor);
}

function resetCanvasView() {
  if (!canvasSession) loadCanvasState();
  canvasSession.camera = { x: 0, y: 0, scale: 1 };
  saveCanvasState();
  renderCanvas();
  statusText.textContent = 'Canvas view reset';
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
    if (el.type === 'sticky') {
      const bounds = canvasElementBounds(el);
      const fill = esc(el.fill || '#fff4a8');
      const size = Number(el.size || 15);
      const lines = canvasWrapTextLines(String(el.text || 'Sticky note'), size, Math.max(40, bounds.w - 18)).slice(0, Math.max(1, Math.floor((bounds.h - 16) / (size * 1.25))));
      return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" rx="10"/>\n${lines.map((line, i) => `<text x="${bounds.x + 10}" y="${bounds.y + 20 + i * size * 1.25}" fill="${stroke}" font-size="${size}" font-family="monospace">${esc(line)}</text>`).join('\n')}`;
    }
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

function canvasWrapTextLines(text, size, maxWidth) {
  const maxChars = Math.max(8, Math.floor(Number(maxWidth || 120) / (Number(size || 15) * .58)));
  return String(text || '')
    .split('\n')
    .flatMap((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      if (!words.length) return [''];
      const lines = [];
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) lines.push(current);
      return lines;
    });
}

function loadCanvasState() {
  try { canvasDoc = JSON.parse(localStorage.getItem(CANVAS_DOC_KEY) || ''); } catch { canvasDoc = null; }
  try { canvasSession = JSON.parse(localStorage.getItem(CANVAS_SESSION_KEY) || ''); } catch { canvasSession = null; }
  if (!canvasDoc || !Array.isArray(canvasDoc.elements)) canvasDoc = newCanvasDoc();
  if (!canvasSession) canvasSession = { camera: { x: 0, y: 0, scale: 1 } };
  canvasSelectedIndex = -1;
  canvasMoveStart = null;
  canvasHistory = [];
  canvasHistoryIndex = -1;
  rememberCanvasHistory(true);
}

function saveCanvasState() {
  if (!canvasDoc || !canvasSession) return;
  localStorage.setItem(CANVAS_DOC_KEY, JSON.stringify(canvasDoc));
  localStorage.setItem(CANVAS_SESSION_KEY, JSON.stringify(canvasSession));
}

function queueCanvasStateSave() {
  if (!canvasDoc || !canvasSession) return;
  if (canvasSaveTimer) clearTimeout(canvasSaveTimer);
  canvasSaveTimer = setTimeout(() => {
    canvasSaveTimer = null;
    saveCanvasState();
  }, CANVAS_SAVE_DEBOUNCE_MS);
}

function flushCanvasStateSave() {
  if (!canvasSaveTimer) return;
  clearTimeout(canvasSaveTimer);
  canvasSaveTimer = null;
  saveCanvasState();
}

function canvasDocSnapshot() {
  return JSON.stringify(canvasDoc || newCanvasDoc());
}

function updateCanvasHistoryButtons() {
  const undo = $('canvas-undo');
  const redo = $('canvas-redo');
  if (undo) undo.disabled = canvasHistoryIndex <= 0;
  if (redo) redo.disabled = canvasHistoryIndex < 0 || canvasHistoryIndex >= canvasHistory.length - 1;
  updateCanvasSelectionButtons();
}

function clearCanvasUndoHistory() {
  canvasHistory = [];
  canvasHistoryIndex = -1;
  updateCanvasHistoryButtons();
  statusText.textContent = 'Canvas undo history cleared';
}

function updateCanvasSelectionButtons() {
  const copy = $('canvas-copy');
  const paste = $('canvas-paste');
  const duplicate = $('canvas-duplicate');
  const remove = $('canvas-delete');
  const snap = $('canvas-snap-selected');
  const disabled = !hasCanvasSelection();
  if (copy) copy.disabled = disabled;
  if (paste) paste.disabled = !canvasClipboard;
  if (duplicate) duplicate.disabled = disabled;
  if (remove) remove.disabled = disabled;
  if (snap) snap.disabled = disabled;
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
    if (canvasSelectedIndex >= canvasDoc.elements.length) canvasSelectedIndex = -1;
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

function canvasSnapPoint(point) {
  if (!canvasSnapToGrid) return point;
  const step = normalizeCanvasGridSize(canvasGridSize);
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
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
  if (!canvasGridVisible) return;
  const camera = canvasCamera();
  const step = Math.max(canvasGridSize, canvasGridSize * 2 * camera.scale);
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
  } else if (el.type === 'sticky') {
    const bounds = canvasElementBounds(el);
    const size = el.size || 15;
    ctx.fillStyle = el.fill || '#fff4a8';
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.fillStyle = el.stroke || '#3f3a1f';
    ctx.font = `${size}px "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace`;
    const lines = canvasWrapTextLines(String(el.text || 'Sticky note'), size, Math.max(40, bounds.w - 18))
      .slice(0, Math.max(1, Math.floor((bounds.h - 16) / (size * 1.25))));
    lines.forEach((line, i) => ctx.fillText(line, bounds.x + 10, bounds.y + 20 + i * size * 1.25));
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

function renderCanvasSelection(ctx) {
  if (!canvasDoc || canvasSelectedIndex < 0 || canvasSelectedIndex >= canvasDoc.elements.length) return;
  const bounds = canvasElementBounds(canvasDoc.elements[canvasSelectedIndex]);
  const camera = canvasCamera();
  const scale = camera.scale || 1;
  const pad = Math.max(6, 8 / scale);
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6f61';
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash([7 / scale, 4 / scale]);
  ctx.strokeRect(bounds.x - pad, bounds.y - pad, Math.max(10, bounds.w + pad * 2), Math.max(10, bounds.h + pad * 2));
  ctx.restore();
}

function renderCanvasMinimap() {
  if (!canvasMinimap) return;
  canvasMinimap.classList.toggle('hidden', !canvasMinimapVisible);
  if (!canvasMinimapVisible || !canvasDoc || !canvasActive || !canvasStage) return;
  const rect = canvasMinimap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvasMinimap.width !== width || canvasMinimap.height !== height) {
    canvasMinimap.width = width;
    canvasMinimap.height = height;
  }
  const ctx = canvasMinimap.getContext('2d', { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const camera = canvasCamera();
  const stageRect = canvasStage.getBoundingClientRect();
  const view = {
    x: -camera.x / camera.scale,
    y: -camera.y / camera.scale,
    w: stageRect.width / camera.scale,
    h: stageRect.height / camera.scale,
  };
  const bounds = (canvasDoc.elements || []).map(canvasElementBounds).filter(b => Number.isFinite(b.x + b.y + b.w + b.h));
  bounds.push(view);
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w));
  const maxY = Math.max(...bounds.map(b => b.y + b.h));
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const scale = Math.min((rect.width - 14) / contentW, (rect.height - 14) / contentH);
  const tx = (rect.width - contentW * scale) / 2 - minX * scale;
  const ty = (rect.height - contentH * scale) / 2 - minY * scale;
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = styles.getPropertyValue('--surface').trim() || '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = styles.getPropertyValue('--accent').trim() || '#2f6f61';
  ctx.globalAlpha = 0.45;
  for (const b of bounds.slice(0, -1)) {
    ctx.fillRect(tx + b.x * scale, ty + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = styles.getPropertyValue('--danger').trim() || '#c54b33';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx + view.x * scale, ty + view.y * scale, Math.max(4, view.w * scale), Math.max(4, view.h * scale));
}

function arrowHeadPoints(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return {
    left: { x: x2 - Math.cos(angle - spread) * size, y: y2 - Math.sin(angle - spread) * size },
    right: { x: x2 - Math.cos(angle + spread) * size, y: y2 - Math.sin(angle + spread) * size },
  };
}

function setCanvasBackground(color, label) {
  if (!canvasDoc) loadCanvasState();
  canvasDoc.appState = canvasDoc.appState || {};
  canvasDoc.appState.viewBackgroundColor = color;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = `Canvas background ${label}`;
}

function canvasTemplateOrigin() {
  const camera = canvasCamera();
  const rect = canvasStage?.getBoundingClientRect?.();
  const width = rect?.width || 960;
  const height = rect?.height || 640;
  return {
    x: Math.round((width / 2 - camera.x) / camera.scale - 360),
    y: Math.round((height / 2 - camera.y) / camera.scale - 220),
  };
}

function canvasTemplateText(x, y, text, size = 16, stroke = '#1f2937') {
  return { id: canvasId(), type: 'text', x, y, text, size, stroke, width: 2 };
}

function canvasTemplateCard(x, y, w, h, title, stroke = '#2f6f61') {
  return [
    { id: canvasId(), type: 'rect', x, y, w, h, stroke, width: 2 },
    canvasTemplateText(x + 16, y + 34, title, 16, stroke),
  ];
}

function canvasTemplateSticky(x, y, w, h, text, stroke = '#2f6f61') {
  return {
    id: canvasId(),
    type: 'sticky',
    x,
    y,
    w,
    h,
    text,
    stroke,
    fill: canvasStickyFillForStroke(stroke),
    width: 2,
    size: 13,
  };
}

function canvasTemplateArrow(x1, y1, x2, y2, stroke = '#2563eb') {
  return { id: canvasId(), type: 'arrow', x: x1, y: y1, w: x2 - x1, h: y2 - y1, stroke, width: 3 };
}

function canvasStarterTemplateElements(kind, x, y) {
  if (kind === 'kanban') {
    const columns = [
      { title: 'Backlog', x: x, stroke: '#6f6230' },
      { title: 'Doing', x: x + 260, stroke: '#2563eb' },
      { title: 'Done', x: x + 520, stroke: '#16a34a' },
    ];
    return columns.flatMap((col) => [
      { id: canvasId(), type: 'rect', x: col.x, y, w: 220, h: 340, stroke: col.stroke, width: 3 },
      canvasTemplateText(col.x + 16, y + 34, col.title, 18, col.stroke),
      ...canvasTemplateCard(col.x + 18, y + 70, 184, 74, 'Task card', col.stroke),
      ...canvasTemplateCard(col.x + 18, y + 160, 184, 74, 'Note / idea', col.stroke),
    ]);
  }
  if (kind === 'timeline') {
    const baseY = y + 180;
    const points = [
      { title: 'Now', x: x + 40, stroke: '#2f6f61' },
      { title: 'Next', x: x + 280, stroke: '#2563eb' },
      { title: 'Later', x: x + 520, stroke: '#d97706' },
      { title: 'Ship', x: x + 760, stroke: '#16a34a' },
    ];
    return [
      { id: canvasId(), type: 'line', x: x + 40, y: baseY, w: 720, h: 0, stroke: '#6b6e68', width: 3 },
      ...points.flatMap(point => [
        { id: canvasId(), type: 'ellipse', x: point.x - 14, y: baseY - 14, w: 28, h: 28, stroke: point.stroke, width: 4 },
        canvasTemplateText(point.x - 30, baseY - 42, point.title, 16, point.stroke),
        ...canvasTemplateCard(point.x - 80, baseY + 34, 160, 72, 'Milestone', point.stroke),
      ]),
    ];
  }
  const center = { x: x + 320, y: y + 180 };
  const nodes = [
    { title: 'Idea', x: x + 40, y: y + 40, stroke: '#2563eb' },
    { title: 'Research', x: x + 600, y: y + 40, stroke: '#d97706' },
    { title: 'Tasks', x: x + 40, y: y + 300, stroke: '#16a34a' },
    { title: 'Risks', x: x + 600, y: y + 300, stroke: '#dc2626' },
  ];
  return [
    ...canvasTemplateCard(center.x - 100, center.y - 42, 200, 84, 'Core topic', '#2f6f61'),
    ...nodes.flatMap(node => [
      canvasTemplateArrow(center.x, center.y, node.x + 80, node.y + 36, node.stroke),
      ...canvasTemplateCard(node.x, node.y, 160, 72, node.title, node.stroke),
    ]),
  ];
}

function insertCanvasStarterTemplate(kind, label) {
  openCanvas();
  const origin = canvasTemplateOrigin();
  const elements = canvasStarterTemplateElements(kind, origin.x, origin.y);
  if (!elements.length) return;
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${label} canvas starter inserted`;
}

function canvasTaskCardColor(task) {
  const priority = taskPriorityClass(task);
  if (task.checked) return '#16a34a';
  if (task.waiting) return '#d97706';
  if (priority === 'urgent' || priority === 'high') return '#dc2626';
  if (priority === 'medium') return '#2563eb';
  if (priority === 'low') return '#6f6230';
  return '#2f6f61';
}

function compactCanvasTaskText(task) {
  const prefix = task.checked ? '[x]' : '[ ]';
  const text = String(task.text || 'Task').replace(/\s+/g, ' ').trim();
  return `${prefix} ${text.length > 42 ? `${text.slice(0, 39)}...` : text}`;
}

function compactCanvasTaskMeta(task) {
  const bits = [];
  if (task.due) bits.push(`due:${task.due}`);
  if (task.priority) bits.push(`!${task.priority}`);
  if (task.waiting) bits.push('@waiting');
  bits.push(task.local ? 'local' : 'loaded');
  if (Number.isFinite(Number(task.line))) bits.push(`line ${Number(task.line) + 1}`);
  if (task.noteTitle) bits.push(task.noteTitle);
  return bits.join(' · ').slice(0, 64);
}

async function insertVisibleTasksCanvasBoard() {
  const tasks = visibleTasksForView(await collectLoadedTasks());
  if (!tasks.length) {
    statusText.textContent = 'No visible tasks to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = tasks.slice(0, 24);
  const columns = [
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
    ['waiting', 'Waiting'],
    ['done', 'Done'],
  ];
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `Task board · ${visible.length}${tasks.length > visible.length ? ` of ${tasks.length}` : ''} visible`, 18, '#2f6f61'),
  ];
  columns.forEach(([status, label], colIndex) => {
    const x = origin.x + colIndex * 250;
    const y = origin.y;
    const colTasks = visible.filter(task => taskStatus(task) === status);
    const height = Math.max(180, 64 + colTasks.length * 92);
    elements.push({ id: canvasId(), type: 'rect', x, y, w: 220, h: height, stroke: '#6b6e68', width: 2 });
    elements.push(canvasTemplateText(x + 16, y + 34, `${label} (${colTasks.length})`, 17, '#1f2937'));
    colTasks.forEach((task, taskIndex) => {
      const cardY = y + 62 + taskIndex * 92;
      const stroke = canvasTaskCardColor(task);
      const meta = compactCanvasTaskMeta(task);
      elements.push(canvasTemplateSticky(x + 14, cardY, 192, 74, [compactCanvasTaskText(task), meta].filter(Boolean).join('\n'), stroke));
    });
  });
  if (tasks.length > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + 470, `${tasks.length - visible.length} additional visible tasks omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} visible task${visible.length === 1 ? '' : 's'} sent to canvas`;
}

function insertTaskAgendaCanvasBoard() {
  const groups = taskAgendaGroups();
  const buckets = [
    ['Overdue', groups.overdue, '#dc2626'],
    ['Due today', groups.dueToday, '#2563eb'],
    ['Waiting', groups.waiting, '#d97706'],
    ['High priority', groups.high, '#6f6230'],
  ];
  const total = buckets.reduce((sum, [, tasks]) => sum + tasks.length, 0);
  if (!total) {
    statusText.textContent = 'No agenda tasks to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  let remaining = 24;
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `Task agenda · ${Math.min(total, 24)}${total > 24 ? ` of ${total}` : ''} task${total === 1 ? '' : 's'}`, 18, '#2f6f61'),
  ];
  buckets.forEach(([label, tasks, stroke], colIndex) => {
    const x = origin.x + colIndex * 250;
    const y = origin.y;
    const visible = tasks.slice(0, Math.max(0, remaining));
    remaining -= visible.length;
    const height = Math.max(180, 64 + visible.length * 92);
    elements.push({ id: canvasId(), type: 'rect', x, y, w: 220, h: height, stroke, width: 2 });
    elements.push(canvasTemplateText(x + 16, y + 34, `${label} (${tasks.length})`, 17, stroke));
    visible.forEach((task, taskIndex) => {
      const cardY = y + 62 + taskIndex * 92;
      const cardStroke = canvasTaskCardColor(task);
      const meta = compactCanvasTaskMeta(task);
      elements.push(canvasTemplateSticky(x + 14, cardY, 192, 74, [compactCanvasTaskText(task), meta].filter(Boolean).join('\n'), cardStroke));
    });
  });
  if (total > 24) {
    elements.push(canvasTemplateText(origin.x, origin.y + 470, `${total - 24} additional agenda tasks omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${Math.min(total, 24)} agenda task${Math.min(total, 24) === 1 ? '' : 's'} sent to canvas`;
}

function compactCanvasSearchTitle(result) {
  const title = String(result?.title || basename(result?.path) || 'Result').replace(/\s+/g, ' ').trim();
  return title.length > 36 ? `${title.slice(0, 33)}...` : title;
}

function compactCanvasSearchMeta(result) {
  const parts = [];
  parts.push(result?.source === 'local' ? 'local' : 'loaded');
  if (Number.isFinite(Number(result?.line))) parts.push(`line ${Number(result.line) + 1}`);
  const path = String(result?.path || '').replace(/\s+/g, ' ').trim();
  if (path) parts.push(path.length > 38 ? `...${path.slice(-35)}` : path);
  return parts.join(' · ').slice(0, 58);
}

function compactCanvasSearchSnippet(result) {
  const snippet = String(result?.snippet || '').replace(/\s+/g, ' ').trim();
  if (!snippet) return '';
  return snippet.length > 52 ? `${snippet.slice(0, 49)}...` : snippet;
}

function insertSearchResultsCanvasBoard() {
  if (!searchLastResults.length) {
    statusText.textContent = 'No search results to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = searchLastResults.slice(0, 24);
  const query = searchLastQuery ? `Search: ${searchLastQuery}` : 'Search results';
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `${query} · ${visible.length}${searchLastResults.length > visible.length ? ` of ${searchLastResults.length}` : ''} result${visible.length === 1 ? '' : 's'}`, 18, '#2f6f61'),
  ];
  visible.forEach((result, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = origin.x + col * 260;
    const y = origin.y + row * 118;
    const stroke = result.source === 'local' ? '#2563eb' : '#2f6f61';
    const snippet = compactCanvasSearchSnippet(result);
    elements.push(canvasTemplateSticky(
      x,
      y,
      230,
      92,
      [compactCanvasSearchTitle(result), compactCanvasSearchMeta(result), snippet].filter(Boolean).join('\n'),
      stroke
    ));
  });
  if (searchLastResults.length > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + 970, `${searchLastResults.length - visible.length} additional results omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} search result${visible.length === 1 ? '' : 's'} sent to canvas`;
}

function canvasOutlineStroke(level) {
  return ['#2f6f61', '#2563eb', '#d97706', '#16a34a', '#6f6230', '#dc2626'][Math.max(0, Math.min(5, Number(level || 1) - 1))];
}

function compactCanvasOutlineTitle(item) {
  const label = `H${item.level} ${String(item.text || 'Heading').replace(/\s+/g, ' ').trim()}`;
  return label.length > 42 ? `${label.slice(0, 39)}...` : label;
}

function insertDocumentOutlineCanvasMap() {
  const active = cachedNotes.find(n => n.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  if (isReadOnlyType(type)) {
    statusText.textContent = 'No editable Markdown outline to send to canvas';
    return;
  }
  const outline = parseDocumentOutline(currentContent);
  if (!outline.length) {
    statusText.textContent = 'No headings to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = outline.slice(0, 40);
  const title = active?.title || basename(active?.path || '') || 'Untitled';
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `${title} outline · ${visible.length}${outline.length > visible.length ? ` of ${outline.length}` : ''} heading${visible.length === 1 ? '' : 's'}`, 18, '#2f6f61'),
  ];
  const anchors = {};
  visible.forEach((item, index) => {
    const level = Math.max(1, Math.min(6, Number(item.level || 1)));
    const x = origin.x + (level - 1) * 58;
    const y = origin.y + index * 74;
    const stroke = canvasOutlineStroke(level);
    const parent = anchors[level - 1];
    if (parent) elements.push(canvasTemplateArrow(parent.x, parent.y, x + 8, y + 29, '#6b6e68'));
    elements.push(canvasTemplateSticky(x, y, 260, 58, `${compactCanvasOutlineTitle(item)}\nline ${item.line + 1}`, stroke));
    anchors[level] = { x: x + 260, y: y + 29 };
    for (let clear = level + 1; clear <= 6; clear++) delete anchors[clear];
  });
  if (outline.length > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + visible.length * 74 + 24, `${outline.length - visible.length} additional headings omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} outline heading${visible.length === 1 ? '' : 's'} sent to canvas`;
}

function compactCanvasWorkspaceTitle(note) {
  const title = String(note?.title || 'Untitled').replace(/\s+/g, ' ').trim();
  return title.length > 38 ? `${title.slice(0, 35)}...` : title;
}

function compactCanvasWorkspaceMeta(note) {
  const parts = [];
  if (note?.active) parts.push('active');
  parts.push(note?.draft ? 'draft' : 'file');
  if (note?.dirty) parts.push('unsaved');
  if (note?.type) parts.push(note.type);
  const path = String(note?.path || '').replace(/\s+/g, ' ').trim();
  if (path) parts.push(path.length > 38 ? `...${path.slice(-35)}` : path);
  return parts.join(' · ').slice(0, 62);
}

function canvasWorkspaceStroke(note) {
  if (note?.active) return '#2563eb';
  if (note?.dirty) return '#dc2626';
  if (note?.draft) return '#d97706';
  return '#2f6f61';
}

function insertLoadedWorkspaceCanvasMap() {
  const snapshot = loadedWorkspaceSnapshot();
  if (!snapshot.notes.length) {
    statusText.textContent = 'No loaded workspace items to send to canvas';
    return;
  }
  openCanvas();
  const origin = canvasTemplateOrigin();
  const visible = snapshot.notes.slice(0, 24);
  const elements = [
    canvasTemplateText(origin.x, origin.y - 28, `Loaded workspace · ${visible.length}${snapshot.notes.length > visible.length ? ` of ${snapshot.notes.length}` : ''} item${visible.length === 1 ? '' : 's'}`, 18, '#2f6f61'),
  ];
  visible.forEach((note, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = origin.x + col * 270;
    const y = origin.y + row * 104;
    const stroke = canvasWorkspaceStroke(note);
    const card = canvasTemplateSticky(x, y, 240, 78, [compactCanvasWorkspaceTitle(note), compactCanvasWorkspaceMeta(note)].filter(Boolean).join('\n'), stroke);
    card.width = note.active ? 4 : 2;
    elements.push(card);
  });
  if (snapshot.notes.length > visible.length) {
    elements.push(canvasTemplateText(origin.x, origin.y + 850, `${snapshot.notes.length - visible.length} additional workspace items omitted to keep the canvas lightweight.`, 13, '#6b6e68'));
  }
  canvasDoc.elements.push(...elements);
  canvasSelectedIndex = canvasDoc.elements.length - elements.length;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasSelectionButtons();
  statusText.textContent = `${visible.length} workspace item${visible.length === 1 ? '' : 's'} sent to canvas`;
}

function setCanvasZoomPreset(scale) {
  if (!canvasDoc) loadCanvasState();
  const camera = canvasCamera();
  camera.scale = Math.max(0.2, Math.min(4, scale));
  renderCanvas();
  statusText.textContent = `Canvas zoom ${Math.round(camera.scale * 100)}%`;
}

function stepCanvasZoom(multiplier) {
  if (!canvasDoc) loadCanvasState();
  const camera = canvasCamera();
  setCanvasZoomPreset(camera.scale * multiplier);
}

function resetCanvasView() {
  if (!canvasDoc) loadCanvasState();
  const camera = canvasCamera();
  camera.x = 0;
  camera.y = 0;
  camera.scale = 1;
  renderCanvas();
  statusText.textContent = 'Canvas view reset';
}

function panCanvasView(dx, dy) {
  if (!canvasDoc) loadCanvasState();
  const camera = canvasCamera();
  camera.x += dx;
  camera.y += dy;
  renderCanvas();
  statusText.textContent = 'Canvas view moved';
}

function renderCanvas() {
  updateCanvasStatus();
  if (!canvasStage || !canvasDoc || !canvasActive) return;
  const ctx = canvasStage.getContext('2d', { alpha: false });
  const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
  const width = canvasStage.width / dpr;
  const height = canvasStage.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = canvasDoc.appState?.viewBackgroundColor || styles.getPropertyValue('--editor').trim() || '#fffffc';
  ctx.fillRect(0, 0, width, height);
  drawCanvasGrid(ctx, width, height);
  const camera = canvasCamera();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  const view = canvasViewportBounds();
  canvasDoc.elements.filter(el => canvasElementInViewport(el, view)).forEach(el => renderCanvasElement(ctx, el));
  if (canvasDraftElement) renderCanvasElement(ctx, canvasDraftElement);
  renderCanvasSelection(ctx);
  renderCanvasMinimap();
}

function setCanvasTool(tool) {
  const allowed = new Set(['select', 'pan', 'pen', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'erase']);
  if (!allowed.has(tool)) tool = 'pan';
  canvasTool = tool;
  localStorage.setItem('markpad-canvas-tool', tool);
  document.querySelectorAll('[data-canvas-tool]').forEach(btn => {
    const active = btn.dataset.canvasTool === tool;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (canvasStage) canvasStage.style.cursor = tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  updateCanvasStatus();
}

function setCanvasStrokePreset(value, label) {
  openCanvas();
  if (canvasColor) canvasColor.value = value;
  const selected = hasCanvasSelection();
  if (selected) applySelectedCanvasStyle('stroke');
  statusText.textContent = selected
    ? `Selected canvas stroke set to ${label}`
    : `Canvas stroke preset set to ${label}`;
}

function setCanvasStrokeWidthPreset(value) {
  openCanvas();
  if (canvasWidth) canvasWidth.value = String(value);
  const selected = hasCanvasSelection();
  if (selected) applySelectedCanvasStyle('width');
  statusText.textContent = selected
    ? `Selected canvas stroke set to ${value}px`
    : `Canvas stroke width set to ${value}px`;
}

function applyCanvasDrawingPreset(tool, color, width, label) {
  openCanvas();
  if (canvasColor) canvasColor.value = color;
  if (canvasWidth) canvasWidth.value = String(width);
  setCanvasTool(tool);
  const selected = hasCanvasSelection();
  if (selected) {
    applySelectedCanvasStyle('stroke');
    applySelectedCanvasStyle('width');
  }
  statusText.textContent = selected
    ? `Selected canvas element styled for ${label}`
    : `Canvas ${label} preset ready`;
}

function setCanvasStickyPreset(color, label) {
  openCanvas();
  if (canvasColor) canvasColor.value = color;
  setCanvasTool('sticky');
  const selected = hasCanvasSelection();
  if (selected && canvasDoc.elements[canvasSelectedIndex]?.type === 'sticky') {
    applySelectedCanvasStyle('stroke');
    statusText.textContent = `Selected sticky note set to ${label}`;
    return;
  }
  statusText.textContent = `Sticky note preset ready: ${label}`;
}

function nudgeSelectedCanvasElement(dx, dy, label) {
  openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element to nudge';
    return;
  }
  const step = canvasSnapToGrid ? canvasGridSize : 10;
  canvasDoc.elements[canvasSelectedIndex] = moveCanvasElement(canvasDoc.elements[canvasSelectedIndex], dx * step, dy * step);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  syncCanvasControlsFromSelection();
  statusText.textContent = `Canvas element nudged ${label}`;
}

function centerSelectedCanvasElementInView() {
  openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element to center';
    return;
  }
  alignSelectedCanvasElement('center');
  alignSelectedCanvasElement('middle');
  statusText.textContent = 'Canvas element centered in view';
}

function updateCanvasOptionButtons() {
  const grid = $('canvas-grid');
  const snap = $('canvas-snap');
  const minimap = $('canvas-minimap-toggle');
  grid?.classList.toggle('active', canvasGridVisible);
  grid?.setAttribute('aria-pressed', canvasGridVisible ? 'true' : 'false');
  snap?.classList.toggle('active', canvasSnapToGrid);
  snap?.setAttribute('aria-pressed', canvasSnapToGrid ? 'true' : 'false');
  minimap?.classList.toggle('active', canvasMinimapVisible);
  minimap?.setAttribute('aria-pressed', canvasMinimapVisible ? 'true' : 'false');
}

function toggleCanvasGrid() {
  canvasGridVisible = !canvasGridVisible;
  localStorage.setItem('markpad-canvas-grid', canvasGridVisible ? '1' : '0');
  updateCanvasOptionButtons();
  renderCanvas();
  statusText.textContent = canvasGridVisible ? 'Canvas grid shown' : 'Canvas grid hidden';
}

function normalizeCanvasGridSize(value) {
  const size = Number(value);
  return [12, 16, 24, 32, 48].includes(size) ? size : 24;
}

function setCanvasGridSize(size) {
  canvasGridSize = normalizeCanvasGridSize(size);
  localStorage.setItem('markpad-canvas-grid-size', String(canvasGridSize));
  renderCanvas();
  updateCanvasStatus();
  statusText.textContent = `Canvas grid ${canvasGridSize}px`;
}

function toggleCanvasSnap() {
  canvasSnapToGrid = !canvasSnapToGrid;
  localStorage.setItem('markpad-canvas-snap', canvasSnapToGrid ? '1' : '0');
  updateCanvasOptionButtons();
  statusText.textContent = canvasSnapToGrid ? 'Canvas snap enabled' : 'Canvas snap disabled';
}

function toggleCanvasMinimap() {
  canvasMinimapVisible = !canvasMinimapVisible;
  localStorage.setItem('markpad-canvas-minimap', canvasMinimapVisible ? '1' : '0');
  updateCanvasOptionButtons();
  renderCanvas();
  statusText.textContent = canvasMinimapVisible ? 'Canvas minimap shown' : 'Canvas minimap hidden';
}

function openCanvas() {
  loadCanvasState();
  canvasActive = true;
  canvasOverlay.classList.remove('hidden');
  setCanvasTool(canvasTool);
  updateCanvasOptionButtons();
  requestAnimationFrame(resizeCanvasStage);
}

function closeCanvas() {
  finishCanvasTextEdit();
  flushCanvasStateSave();
  canvasActive = false;
  canvasOverlay.classList.add('hidden');
  saveCanvasState();
}

function canvasPointNearBounds(point, bounds, tolerance = 0) {
  return point.x >= bounds.x - tolerance
    && point.x <= bounds.x + bounds.w + tolerance
    && point.y >= bounds.y - tolerance
    && point.y <= bounds.y + bounds.h + tolerance;
}

function canvasHitTest(point) {
  const tolerance = 12 / canvasCamera().scale;
  for (let i = canvasDoc.elements.length - 1; i >= 0; i--) {
    const el = canvasDoc.elements[i];
    const bounds = canvasElementBounds(el);
    if (!canvasPointNearBounds(point, bounds, tolerance)) continue;
    if (el.type === 'path') {
      if ((el.points || []).some(p => Math.hypot(p.x - point.x, p.y - point.y) < tolerance)) return i;
    } else if (el.type === 'text') {
      return i;
    } else {
      return i;
    }
  }
  return -1;
}

function cloneCanvasElement(el) {
  return JSON.parse(JSON.stringify(el));
}

function moveCanvasElement(el, dx, dy) {
  const next = cloneCanvasElement(el);
  if (next.type === 'path') {
    next.points = (next.points || []).map(point => ({ x: point.x + dx, y: point.y + dy }));
  } else {
    next.x = Number(next.x || 0) + dx;
    next.y = Number(next.y || 0) + dy;
  }
  return next;
}

function hasCanvasSelection() {
  return !!canvasDoc && canvasSelectedIndex >= 0 && canvasSelectedIndex < canvasDoc.elements.length;
}

function syncCanvasControlsFromSelection() {
  if (!hasCanvasSelection()) return;
  const el = canvasDoc.elements[canvasSelectedIndex];
  if (canvasColor && /^#[0-9a-fA-F]{6}$/.test(String(el.stroke || ''))) canvasColor.value = el.stroke;
  if (canvasWidth && el.type !== 'text' && Number.isFinite(Number(el.width))) canvasWidth.value = String(el.width);
}

function canvasStickyFillForStroke(value) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(value || '').trim());
  if (!match) return '#fff4a8';
  const int = parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  return `#${channels.map(channel => Math.round(channel * 0.16 + 255 * 0.84).toString(16).padStart(2, '0')).join('')}`;
}

function syncStickyFillFromStroke(element) {
  if (element?.type === 'sticky') element.fill = canvasStickyFillForStroke(element.stroke);
}

function applySelectedCanvasStyle(kind) {
  if (!canvasActive || !hasCanvasSelection()) return false;
  const el = canvasDoc.elements[canvasSelectedIndex];
  if ((kind === 'stroke' || kind === 'all') && canvasColor) {
    el.stroke = canvasColor.value;
    syncStickyFillFromStroke(el);
  }
  if ((kind === 'width' || kind === 'all') && canvasWidth && el.type !== 'text') {
    el.width = Number(canvasWidth.value || el.width || 3);
  }
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = 'Canvas element style updated';
  return true;
}

function adjustSelectedCanvasWidth(delta) {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  const el = canvasDoc.elements[canvasSelectedIndex];
  if (el.type === 'text') {
    statusText.textContent = 'Text elements do not use stroke width';
    return false;
  }
  const next = Math.max(1, Math.min(18, Number(el.width || 3) + delta));
  el.width = next;
  if (canvasWidth) canvasWidth.value = String(next);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasStatus();
  statusText.textContent = `Canvas stroke width ${next}`;
  return true;
}

function copySelectedCanvasStyle() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  canvasStyleClipboard = {
    stroke: element.stroke || '#1f2937',
    width: Number(element.width || 3),
    fill: element.fill || '',
  };
  statusText.textContent = 'Canvas style copied';
  return true;
}

function applyCopiedCanvasStyle() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  if (!canvasStyleClipboard) {
    statusText.textContent = 'Copy a canvas style first';
    return false;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  element.stroke = canvasStyleClipboard.stroke;
  if (element.type === 'sticky') element.fill = canvasStyleClipboard.fill || canvasStickyFillForStroke(element.stroke);
  if (element.type !== 'text') element.width = canvasStyleClipboard.width;
  if (canvasColor && /^#[0-9a-fA-F]{6}$/.test(String(element.stroke || ''))) canvasColor.value = element.stroke;
  if (canvasWidth && element.type !== 'text') canvasWidth.value = String(element.width || 3);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  syncCanvasControlsFromSelection();
  statusText.textContent = 'Canvas style applied';
  return true;
}

function alignSelectedCanvasElement(direction) {
  if (!canvasActive) openCanvas();
  if (!canvasStage || !hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  const camera = canvasCamera();
  const rect = canvasStage.getBoundingClientRect();
  const scale = camera.scale || 1;
  const viewport = {
    left: -camera.x / scale,
    top: -camera.y / scale,
    right: (rect.width - camera.x) / scale,
    bottom: (rect.height - camera.y) / scale,
  };
  viewport.cx = (viewport.left + viewport.right) / 2;
  viewport.cy = (viewport.top + viewport.bottom) / 2;

  let dx = 0;
  let dy = 0;
  if (direction === 'left') dx = viewport.left - bounds.x;
  if (direction === 'center') dx = viewport.cx - (bounds.x + bounds.w / 2);
  if (direction === 'right') dx = viewport.right - (bounds.x + bounds.w);
  if (direction === 'top') dy = viewport.top - bounds.y;
  if (direction === 'middle') dy = viewport.cy - (bounds.y + bounds.h / 2);
  if (direction === 'bottom') dy = viewport.bottom - (bounds.y + bounds.h);

  canvasDoc.elements[canvasSelectedIndex] = moveCanvasElement(element, dx, dy);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  updateCanvasStatus();
  statusText.textContent = `Canvas element aligned ${direction}`;
  return true;
}

async function copySelectedCanvasDetails() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  const lines = [
    '# Markpad Canvas Element',
    '',
    `Type: ${element.type || 'element'}`,
    `ID: ${element.id || ''}`,
    `Bounds: x ${Math.round(Number(bounds.x || 0))}, y ${Math.round(Number(bounds.y || 0))}, w ${Math.round(Number(bounds.w || 0))}, h ${Math.round(Number(bounds.h || 0))}`,
    `Stroke: ${element.stroke || 'none'}`,
    `Width: ${element.width || 'n/a'}`,
  ];
  if (element.fill) lines.push(`Fill: ${element.fill}`);
  if (canvasElementHasText(element)) {
    lines.push('', 'Text:', '```', String(element.text || ''), '```');
  }
  if (element.type === 'path') {
    lines.push(`Points: ${(element.points || []).length}`);
  }
  await navigator.clipboard.writeText(lines.join('\n') + '\n');
  statusText.textContent = 'Canvas element details copied';
}

function canvasElementHasText(element) {
  return ['text', 'sticky'].includes(element?.type);
}

function selectedCanvasElementMarkdownBlock() {
  if (!hasCanvasSelection()) return '';
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  const title = canvasElementHasText(element)
    ? String(element.text || 'Text').replace(/\s+/g, ' ').trim().slice(0, 64)
    : `${element.type || 'element'} ${element.id || ''}`.trim();
  const lines = [
    `### Canvas element: ${title || 'Untitled'}`,
    '',
    `- Type: ${element.type || 'element'}`,
    `- Bounds: x ${Math.round(Number(bounds.x || 0))}, y ${Math.round(Number(bounds.y || 0))}, w ${Math.round(Number(bounds.w || 0))}, h ${Math.round(Number(bounds.h || 0))}`,
    `- Stroke: ${element.stroke || 'none'}`,
  ];
  if (element.fill) lines.push(`- Fill: ${element.fill}`);
  if (!canvasElementHasText(element)) lines.push(`- Width: ${element.width || 'n/a'}`);
  if (element.type === 'path') lines.push(`- Points: ${(element.points || []).length}`);
  if (canvasElementHasText(element)) {
    lines.push('', '```text', String(element.text || ''), '```');
  }
  return lines.join('\n') + '\n';
}

function insertTextAtEditorCursor(text) {
  const start = Math.max(0, Math.min(editor.selectionStart || 0, editor.value.length));
  const end = Math.max(start, Math.min(editor.selectionEnd || start, editor.value.length));
  const prefix = start > 0 && editor.value[start - 1] !== '\n' ? '\n\n' : '';
  const suffix = end < editor.value.length && editor.value[end] !== '\n' ? '\n\n' : '\n';
  const insert = prefix + text + suffix;
  editor.value = editor.value.slice(0, start) + insert + editor.value.slice(end);
  const next = start + insert.length;
  editor.focus();
  editor.setSelectionRange(next, next);
  editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: insert, bubbles: true }));
}

function insertSelectedCanvasElementMarkdownIntoNote() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return;
  }
  const active = cachedNotes.find(n => n.id === activeId);
  if (!activeId || isReadOnlyType(getFileType(active?.path, active?.kind))) {
    statusText.textContent = 'Open an editable note before inserting canvas Markdown';
    return;
  }
  insertTextAtEditorCursor(selectedCanvasElementMarkdownBlock());
  statusText.textContent = 'Canvas element inserted into active note';
}

function showSelectedCanvasElementInspector() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    showModal('Canvas Element Inspector', '<div class="local-empty">Select a canvas element first.</div>');
    return;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  const label = canvasElementHasText(element)
    ? String(element.text || 'Text').replace(/\s+/g, ' ').trim().slice(0, 80)
    : `${element.type || 'element'} ${element.id || ''}`.trim();
  showModal('Canvas Element Inspector', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${escapeHtml(element.type || 'element')}</strong><span>Type</span><small>${escapeHtml(label || 'Selected element')}</small></div>
      <div class="diag-card"><strong>${Math.round(Number(bounds.w || 0))}x${Math.round(Number(bounds.h || 0))}</strong><span>Size</span><small>x ${Math.round(Number(bounds.x || 0))}, y ${Math.round(Number(bounds.y || 0))}</small></div>
      <div class="diag-card"><strong>${escapeHtml(element.stroke || 'none')}</strong><span>Stroke</span><small>Width ${escapeHtml(String(element.width || 'n/a'))}</small></div>
      <div class="diag-card"><strong>${escapeHtml(element.fill || 'none')}</strong><span>Fill</span><small>${element.fill ? 'Native element fill' : 'Transparent / stroke-only'}</small></div>
      <div class="diag-card"><strong>${element.type === 'path' ? (element.points || []).length : canvasSelectedIndex + 1}</strong><span>${element.type === 'path' ? 'Points' : 'Layer'}</span><small>Lightweight JSON element</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-selected-canvas-details>Copy Markdown</button>
      <button data-copy-selected-canvas-json>Copy JSON</button>
      <button data-copy-selected-canvas-svg>Copy SVG</button>
      <button data-insert-selected-canvas-md>Insert into Note</button>
      <button data-fit-selected-canvas-element>Fit Selection</button>
      <button data-selected-canvas-stroke="#1f2937" data-selected-canvas-stroke-label="ink">Ink</button>
      <button data-selected-canvas-stroke="#2563eb" data-selected-canvas-stroke-label="blue">Blue</button>
      <button data-selected-canvas-stroke="#dc2626" data-selected-canvas-stroke-label="red">Red</button>
      <button data-selected-canvas-stroke="#16a34a" data-selected-canvas-stroke-label="green">Green</button>
      <button data-selected-canvas-stroke="#d97706" data-selected-canvas-stroke-label="amber">Amber</button>
      <button data-selected-canvas-width-delta="-1">Thinner</button>
      <button data-selected-canvas-width-delta="1">Thicker</button>
      <button data-copy-selected-canvas-style>Copy Style</button>
      <button data-apply-selected-canvas-style ${canvasStyleClipboard ? '' : 'disabled'}>Apply Style</button>
      <button data-duplicate-selected-canvas>Duplicate</button>
    </div>
    <p class="diag-note">Inspector reads the selected element already held in the canvas document. It does not export the whole canvas or create new persistent state.</p>
  `);
}

function deleteSelectedCanvasElement() {
  if (!hasCanvasSelection()) return false;
  canvasDoc.elements.splice(canvasSelectedIndex, 1);
  canvasSelectedIndex = -1;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = 'Canvas element deleted';
  return true;
}

function duplicateSelectedCanvasElement() {
  if (!hasCanvasSelection()) return false;
  const copy = moveCanvasElement(canvasDoc.elements[canvasSelectedIndex], 24, 24);
  copy.id = canvasId();
  canvasDoc.elements.push(copy);
  canvasSelectedIndex = canvasDoc.elements.length - 1;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = 'Canvas element duplicated';
  return true;
}

function copySelectedCanvasElement() {
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  canvasClipboard = cloneCanvasElement(canvasDoc.elements[canvasSelectedIndex]);
  statusText.textContent = 'Canvas element copied';
  return true;
}

function pasteCanvasElement() {
  if (!canvasActive || !canvasClipboard || !canvasDoc) return false;
  const copy = moveCanvasElement(canvasClipboard, 28, 28);
  copy.id = canvasId();
  canvasDoc.elements.push(copy);
  canvasSelectedIndex = canvasDoc.elements.length - 1;
  canvasClipboard = cloneCanvasElement(copy);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = 'Canvas element pasted';
  return true;
}

function nudgeSelectedCanvasElement(dx, dy) {
  if (!hasCanvasSelection()) return false;
  canvasDoc.elements[canvasSelectedIndex] = moveCanvasElement(canvasDoc.elements[canvasSelectedIndex], dx, dy);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  return true;
}

function snapSelectedCanvasElementToGrid() {
  if (!canvasActive) openCanvas();
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element to snap';
    return false;
  }
  const element = canvasDoc.elements[canvasSelectedIndex];
  const bounds = canvasElementBounds(element);
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    statusText.textContent = 'Selected canvas element cannot be snapped';
    return false;
  }
  const step = normalizeCanvasGridSize(canvasGridSize);
  const nextX = Math.round(bounds.x / step) * step;
  const nextY = Math.round(bounds.y / step) * step;
  const dx = nextX - bounds.x;
  const dy = nextY - bounds.y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    statusText.textContent = 'Selected canvas element is already on grid';
    return true;
  }
  canvasDoc.elements[canvasSelectedIndex] = moveCanvasElement(element, dx, dy);
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = `Selected canvas element snapped to ${step}px grid`;
  return true;
}

function moveSelectedCanvasLayer(direction) {
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element first';
    return false;
  }
  const from = canvasSelectedIndex;
  const last = canvasDoc.elements.length - 1;
  let to = from;
  if (direction === 'front') to = last;
  else if (direction === 'back') to = 0;
  else if (direction === 'forward') to = Math.min(last, from + 1);
  else if (direction === 'backward') to = Math.max(0, from - 1);
  if (to === from) {
    statusText.textContent = 'Canvas element already at that layer';
    return false;
  }
  const [element] = canvasDoc.elements.splice(from, 1);
  canvasDoc.elements.splice(to, 0, element);
  canvasSelectedIndex = to;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  statusText.textContent = direction === 'front' ? 'Canvas element brought to front'
    : direction === 'back' ? 'Canvas element sent to back'
    : direction === 'forward' ? 'Canvas element brought forward'
    : 'Canvas element sent backward';
  return true;
}

function handleCanvasSelectionShortcut(e) {
  if (!canvasActive) return false;
  if (canvasTextEditor && !canvasTextEditor.classList.contains('hidden')) return false;
  if (commandOpen || searchOpen || !modalOverlay.classList.contains('hidden')) return false;
  if (document.activeElement === commandInput || document.activeElement === searchInput || document.activeElement === findInput) return false;
  const key = e.key;
  if (canvasClipboard && (e.ctrlKey || e.metaKey) && !e.shiftKey && key.toLowerCase() === 'v') {
    e.preventDefault();
    return pasteCanvasElement();
  }
  if (!hasCanvasSelection()) return false;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key.toLowerCase() === 'c') {
    e.preventDefault();
    return copySelectedCanvasElement();
  }
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    return deleteSelectedCanvasElement();
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key.toLowerCase() === 'd') {
    e.preventDefault();
    return duplicateSelectedCanvasElement();
  }
  const step = e.shiftKey ? 10 : 1;
  if (key === 'ArrowLeft') { e.preventDefault(); return nudgeSelectedCanvasElement(-step, 0); }
  if (key === 'ArrowRight') { e.preventDefault(); return nudgeSelectedCanvasElement(step, 0); }
  if (key === 'ArrowUp') { e.preventDefault(); return nudgeSelectedCanvasElement(0, -step); }
  if (key === 'ArrowDown') { e.preventDefault(); return nudgeSelectedCanvasElement(0, step); }
  return false;
}

function startCanvasTextEdit(point, existingIndex = -1) {
  const camera = canvasCamera();
  canvasTextTarget = existingIndex >= 0 ? existingIndex : null;
  const existing = existingIndex >= 0 ? canvasDoc.elements[existingIndex] : null;
  const sticky = existing?.type === 'sticky';
  canvasTextEditor.value = existing?.text || '';
  canvasTextEditor.style.left = `${((existing?.x ?? point.x) + (sticky ? 10 : 0)) * camera.scale + camera.x}px`;
  canvasTextEditor.style.top = `${((existing?.y ?? point.y) + (sticky ? 10 : -18)) * camera.scale + camera.y}px`;
  canvasTextEditor.style.width = sticky ? `${Math.max(160, Math.abs(existing.w || 220) - 20) * camera.scale}px` : existing ? `${Math.max(180, String(existing.text || '').length * 8)}px` : '220px';
  canvasTextEditor.style.height = sticky ? `${Math.max(60, Math.abs(existing.h || 140) - 20) * camera.scale}px` : '';
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
  const rawPoint = canvasScreenToWorld(e.clientX, e.clientY);
  const point = ['select', 'pan', 'erase'].includes(canvasTool) ? rawPoint : canvasSnapPoint(rawPoint);
  canvasStage.setPointerCapture(e.pointerId);
  if (canvasTool === 'select') {
    const idx = canvasHitTest(point);
    canvasSelectedIndex = idx;
    if (idx >= 0) {
      canvasMoveStart = {
        index: idx,
        point,
        element: cloneCanvasElement(canvasDoc.elements[idx]),
        moved: false,
      };
      syncCanvasControlsFromSelection();
      canvasStage.style.cursor = 'grabbing';
    }
    renderCanvas();
    return;
  }
  if (canvasTool === 'pan') {
    const camera = canvasCamera();
    canvasPanStart = { x: e.clientX, y: e.clientY, cameraX: camera.x, cameraY: camera.y };
    return;
  }
  if (canvasTool === 'erase') {
    const idx = canvasHitTest(point);
    if (idx >= 0) {
      canvasDoc.elements.splice(idx, 1);
      canvasSelectedIndex = -1;
      saveCanvasState();
      rememberCanvasHistory();
      renderCanvas();
    }
    return;
  }
  if (canvasTool === 'text') {
    const idx = canvasHitTest(point);
    canvasSelectedIndex = idx;
    if (idx >= 0) syncCanvasControlsFromSelection();
    startCanvasTextEdit(point, idx >= 0 && ['text', 'sticky'].includes(canvasDoc.elements[idx].type) ? idx : -1);
    return;
  }
  const base = { id: canvasId(), stroke: canvasColor.value, width: Number(canvasWidth.value || 3) };
  if (canvasTool === 'pen') canvasDrawing = { ...base, type: 'path', points: [point] };
  else if (canvasTool === 'sticky') canvasDrawing = { ...base, type: 'sticky', x: point.x, y: point.y, w: 220, h: 140, fill: canvasStickyFillForStroke(base.stroke), text: 'Sticky note', size: 15 };
  else canvasDrawing = { ...base, type: canvasTool, x: point.x, y: point.y, w: 0, h: 0 };
});

canvasStage?.addEventListener('pointermove', (e) => {
  if (!canvasActive) return;
  if (canvasMoveStart) {
    const point = canvasScreenToWorld(e.clientX, e.clientY);
    const dx = point.x - canvasMoveStart.point.x;
    const dy = point.y - canvasMoveStart.point.y;
    canvasMoveStart.moved = canvasMoveStart.moved || Math.hypot(dx, dy) > 0.5;
    canvasDoc.elements[canvasMoveStart.index] = moveCanvasElement(canvasMoveStart.element, dx, dy);
    renderCanvas();
    return;
  }
  if (canvasPanStart) {
    const camera = canvasCamera();
    camera.x = canvasPanStart.cameraX + (e.clientX - canvasPanStart.x);
    camera.y = canvasPanStart.cameraY + (e.clientY - canvasPanStart.y);
    renderCanvas();
    return;
  }
  if (!canvasDrawing) return;
  const point = canvasScreenToWorld(e.clientX, e.clientY);
  const drawPoint = canvasSnapToGrid && canvasDrawing?.type !== 'path' ? canvasSnapPoint(point) : point;
  if (canvasDrawing.type === 'path') {
    const last = canvasDrawing.points[canvasDrawing.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) > 1.5) canvasDrawing.points.push(point);
  } else {
    canvasDrawing.w = drawPoint.x - canvasDrawing.x;
    canvasDrawing.h = drawPoint.y - canvasDrawing.y;
  }
  canvasDraftElement = canvasDrawing;
  renderCanvas();
});

canvasStage?.addEventListener('pointerup', () => {
  if (canvasMoveStart) {
    const moved = canvasMoveStart.moved;
    canvasMoveStart = null;
    if (canvasTool === 'select') canvasStage.style.cursor = 'default';
    if (moved) {
      saveCanvasState();
      rememberCanvasHistory();
    }
    renderCanvas();
    return;
  }
  if (canvasPanStart) {
    canvasPanStart = null;
    saveCanvasState();
  }
  if (!canvasDrawing) return;
  const createdSticky = canvasDrawing.type === 'sticky';
  if (canvasDrawing.type === 'path' ? canvasDrawing.points.length > 1 : canvasDrawing.type === 'sticky' || Math.hypot(canvasDrawing.w, canvasDrawing.h) > 3) {
    canvasDoc.elements.push(canvasDrawing);
    canvasSelectedIndex = canvasDoc.elements.length - 1;
    saveCanvasState();
    rememberCanvasHistory();
    if (createdSticky) {
      const stickyIndex = canvasSelectedIndex;
      const sticky = canvasDoc.elements[stickyIndex];
      requestAnimationFrame(() => startCanvasTextEdit({ x: sticky.x, y: sticky.y }, stickyIndex));
    }
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
  camera.scale = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, camera.scale * factor));
  camera.x = e.clientX - rect.left - before.x * camera.scale;
  camera.y = e.clientY - rect.top - before.y * camera.scale;
  queueCanvasStateSave();
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
$('canvas-copy')?.addEventListener('click', () => { copySelectedCanvasElement(); updateCanvasSelectionButtons(); });
$('canvas-paste')?.addEventListener('click', pasteCanvasElement);
$('canvas-duplicate')?.addEventListener('click', duplicateSelectedCanvasElement);
$('canvas-delete')?.addEventListener('click', deleteSelectedCanvasElement);
$('canvas-reset-view')?.addEventListener('click', resetCanvasView);
$('canvas-fit')?.addEventListener('click', fitCanvasToContent);
$('canvas-zoom-out')?.addEventListener('click', () => zoomCanvasBy(1 / 1.16));
$('canvas-zoom-reset')?.addEventListener('click', () => setCanvasZoom(1));
$('canvas-zoom-in')?.addEventListener('click', () => zoomCanvasBy(1.16));
$('canvas-grid')?.addEventListener('click', toggleCanvasGrid);
$('canvas-snap')?.addEventListener('click', toggleCanvasSnap);
$('canvas-snap-selected')?.addEventListener('click', snapSelectedCanvasElementToGrid);
$('canvas-minimap-toggle')?.addEventListener('click', toggleCanvasMinimap);
$('canvas-layer-front')?.addEventListener('click', () => moveSelectedCanvasLayer('front'));
$('canvas-layer-back')?.addEventListener('click', () => moveSelectedCanvasLayer('back'));
canvasColor?.addEventListener('input', () => { if (hasCanvasSelection()) applySelectedCanvasStyle('stroke'); });
canvasWidth?.addEventListener('input', () => { if (hasCanvasSelection()) applySelectedCanvasStyle('width'); });
function exportCanvasJson() {
  const json = JSON.stringify(canvasPortableDoc(canvasDoc || newCanvasDoc(), { includeExportedAt: true }), null, 2);
  downloadText('markpad-canvas-draft.json', 'application/json', json);
  statusText.textContent = 'Canvas JSON exported';
}

function markcanvasJson() {
  if (!canvasDoc) loadCanvasState();
  return `${JSON.stringify(canvasPortableDoc(canvasDoc || newCanvasDoc(), { includeExportedAt: true }), null, 2)}\n`;
}

function exportMarkcanvasJson() {
  downloadText('markpad-canvas.markcanvas.json', 'application/json', markcanvasJson());
  statusText.textContent = 'Native .markcanvas.json exported';
}

async function copyMarkcanvasJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(markcanvasJson());
  statusText.textContent = 'Native .markcanvas.json copied';
}

async function copyCanvasJson() {
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasPortableDoc(canvasDoc || newCanvasDoc(), { includeExportedAt: true }), null, 2);
  await navigator.clipboard.writeText(`${json}\n`);
  const count = (canvasDoc?.elements || []).length;
  statusText.textContent = `${count} canvas element${count === 1 ? '' : 's'} copied as JSON`;
}

async function copySelectedCanvasElementJson() {
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element to copy JSON';
    return;
  }
  await navigator.clipboard.writeText(`${JSON.stringify(canvasDoc.elements[canvasSelectedIndex], null, 2)}\n`);
  statusText.textContent = 'Selected canvas element JSON copied';
}

async function copySelectedCanvasElementSvg() {
  if (!hasCanvasSelection()) {
    statusText.textContent = 'Select a canvas element to copy SVG';
    return;
  }
  const doc = { elements: [canvasDoc.elements[canvasSelectedIndex]], appState: canvasDoc.appState || { viewBackgroundColor: '#ffffff' } };
  await navigator.clipboard.writeText(canvasToSvg(doc));
  statusText.textContent = 'Selected canvas element SVG copied';
}

async function pasteCanvasElementJsonFromClipboard() {
  if (!canvasDoc) loadCanvasState();
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain canvas element JSON';
    return;
  }
  const source = Array.isArray(parsed?.elements) ? parsed.elements[0] : parsed;
  const element = normalizeCanvasDoc({ elements: [source], appState: canvasDoc.appState || { viewBackgroundColor: '#ffffff' } }).elements[0];
  if (!element?.type) {
    statusText.textContent = 'Clipboard JSON is not a supported canvas element';
    return;
  }
  canvasDoc.elements.push(moveCanvasElement({ ...element, id: canvasId() }, 24, 24));
  canvasSelectedIndex = canvasDoc.elements.length - 1;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  syncCanvasControlsFromSelection();
  statusText.textContent = 'Canvas element JSON pasted';
}

async function mergeCanvasJsonFromClipboard() {
  if (!canvasDoc) loadCanvasState();
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain canvas JSON';
    return;
  }
  const doc = normalizeCanvasDoc(parsed);
  if (!doc.elements.length) {
    statusText.textContent = 'Clipboard canvas has no elements';
    return;
  }
  const imported = doc.elements.map(element => moveCanvasElement({ ...element, id: canvasId() }, 24, 24));
  canvasDoc.elements.push(...imported);
  canvasSelectedIndex = canvasDoc.elements.length - 1;
  saveCanvasState();
  rememberCanvasHistory();
  renderCanvas();
  syncCanvasControlsFromSelection();
  statusText.textContent = `${imported.length} canvas element${imported.length === 1 ? '' : 's'} merged`;
}

async function replaceCanvasJsonFromClipboard() {
  openCanvas();
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain canvas JSON';
    return;
  }
  const doc = normalizeCanvasDoc(parsed);
  if (!doc.elements.length) {
    statusText.textContent = 'Clipboard canvas has no elements';
    return;
  }
  canvasDoc = doc;
  canvasSession.camera = { x: 0, y: 0, scale: 1 };
  canvasSelectedIndex = -1;
  canvasMoveStart = null;
  saveCanvasState();
  rememberCanvasHistory(true);
  renderCanvas();
  requestAnimationFrame(fitCanvasToContent);
  statusText.textContent = `${doc.elements.length} canvas element${doc.elements.length === 1 ? '' : 's'} loaded from clipboard`;
}

function exportCanvasSvg() {
  if (!canvasDoc) loadCanvasState();
  downloadText('markpad-canvas-draft.svg', 'image/svg+xml', canvasToSvg(canvasDoc));
  statusText.textContent = 'Canvas SVG exported';
}

async function copyCanvasSvg() {
  if (!canvasDoc) loadCanvasState();
  await navigator.clipboard.writeText(canvasToSvg(canvasDoc));
  const count = (canvasDoc?.elements || []).length;
  statusText.textContent = `${count} canvas element${count === 1 ? '' : 's'} copied as SVG`;
}

async function exportCanvasPngViewport() {
  if (!canvasActive) openCanvas();
  await new Promise(resolve => requestAnimationFrame(resolve));
  resizeCanvasStage();
  renderCanvas();
  if (!canvasStage?.toBlob || !canvasStage.width || !canvasStage.height) {
    statusText.textContent = 'Canvas PNG export unavailable';
    return;
  }
  canvasStage.toBlob((blob) => {
    if (!blob) {
      statusText.textContent = 'Canvas PNG export failed';
      return;
    }
    downloadBlob('markpad-canvas-viewport.png', blob);
    statusText.textContent = 'Canvas viewport PNG exported';
  }, 'image/png');
}

function exportCanvasPngFull() {
  if (!canvasDoc) loadCanvasState();
  const elements = canvasDoc?.elements || [];
  if (!elements.length) {
    statusText.textContent = 'Canvas is empty';
    return;
  }
  const bounds = elements.map(canvasElementBounds).filter(b => Number.isFinite(b.x + b.y + b.w + b.h));
  if (!bounds.length) {
    statusText.textContent = 'Canvas PNG export failed';
    return;
  }
  const padding = 48;
  const left = Math.min(...bounds.map(b => b.x));
  const top = Math.min(...bounds.map(b => b.y));
  const right = Math.max(...bounds.map(b => b.x + b.w));
  const bottom = Math.max(...bounds.map(b => b.y + b.h));
  const worldWidth = Math.max(1, right - left + padding * 2);
  const worldHeight = Math.max(1, bottom - top + padding * 2);
  const maxDimension = 4096;
  const scale = Math.min(1, maxDimension / Math.max(worldWidth, worldHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(worldWidth * scale));
  canvas.height = Math.max(1, Math.ceil(worldHeight * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    statusText.textContent = 'Canvas PNG export unavailable';
    return;
  }
  ctx.fillStyle = canvasDoc.appState?.viewBackgroundColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(padding - left, padding - top);
  elements.forEach(element => renderCanvasElement(ctx, element));
  ctx.restore();
  canvas.toBlob((blob) => {
    if (!blob) {
      statusText.textContent = 'Canvas PNG export failed';
      return;
    }
    downloadBlob('markpad-canvas-full.png', blob);
    statusText.textContent = `Full canvas PNG exported${scale < 1 ? ' (scaled)' : ''}`;
  }, 'image/png');
}

function canvasToObsidianCanvas(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const nodes = [];
  const edges = [];
  const nodeEntries = [];
  const usedIds = new Set();
  const edgeTypes = new Set(['arrow', 'line']);

  source.elements.forEach((element, index) => {
    if (!element || edgeTypes.has(element.type)) return;
    const bounds = obsidianElementBounds(element);
    const id = uniqueObsidianId(obsidianSafeId(element.id, `node-${index + 1}`), usedIds);
    const node = {
      id,
      type: 'text',
      x: bounds.x,
      y: bounds.y,
      width: bounds.w,
      height: bounds.h,
      text: obsidianElementText(element),
    };
    if (element.type === 'rect') {
      node.type = 'group';
      node.label = node.text || 'Rectangle';
      delete node.text;
    } else if (element.type === 'ellipse') {
      node.type = 'group';
      node.label = node.text || 'Oval';
      delete node.text;
    }
    const color = obsidianColor(element.stroke || element.color || element.fill);
    if (color) node.color = color;
    nodes.push(node);
    nodeEntries.push({ id, bounds });
  });

  source.elements.forEach((element, index) => {
    if (!element || !edgeTypes.has(element.type)) return;
    const start = { x: Number(element.x || 0), y: Number(element.y || 0) };
    const end = { x: start.x + Number(element.w || 0), y: start.y + Number(element.h || 0) };
    const from = nearestObsidianNode(start, nodeEntries);
    const to = nearestObsidianNode(end, nodeEntries);
    if (!from || !to || from.id === to.id) return;
    const edge = {
      id: uniqueObsidianId(obsidianSafeId(element.id, `edge-${index + 1}`), usedIds),
      fromNode: from.id,
      fromSide: obsidianCanvasSide(from.bounds, to.bounds),
      toNode: to.id,
      toSide: obsidianCanvasSide(to.bounds, from.bounds),
    };
    const color = obsidianColor(element.stroke || element.color);
    if (color) edge.color = color;
    edges.push(edge);
  });

  return { nodes, edges };
}

function exportObsidianCanvas() {
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasToObsidianCanvas(canvasDoc), null, 2);
  downloadText('markpad-canvas.canvas', 'application/json', json);
  statusText.textContent = 'Obsidian canvas exported';
}

async function copyObsidianCanvasJson() {
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasToObsidianCanvas(canvasDoc), null, 2);
  await navigator.clipboard.writeText(`${json}\n`);
  statusText.textContent = 'Obsidian canvas JSON copied';
}

function excalidrawBaseElement(element, index, type) {
  const bounds = canvasElementBounds(element);
  return {
    id: String(element.id || `markpad-${index + 1}`),
    type,
    x: Number.isFinite(bounds.x) ? bounds.x : 0,
    y: Number.isFinite(bounds.y) ? bounds.y : 0,
    width: Math.max(1, Math.abs(Number(bounds.w) || 1)),
    height: Math.max(1, Math.abs(Number(bounds.h) || 1)),
    angle: 0,
    strokeColor: element.stroke || '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: Math.max(1, Number(element.width || 2)),
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.max(1, index + 1),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function canvasToExcalidraw(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const elements = source.elements.map((element, index) => {
    if (element.type === 'rect') {
      return excalidrawBaseElement(element, index, 'rectangle');
    }
    if (element.type === 'sticky') {
      const base = excalidrawBaseElement(element, index, 'text');
      const text = String(element.text || 'Sticky note');
      const fontSize = Math.max(8, Number(element.size || 15));
      return {
        ...base,
        backgroundColor: element.fill || '#fff4a8',
        text,
        originalText: text,
        fontSize,
        fontFamily: 3,
        textAlign: 'left',
        verticalAlign: 'top',
        baseline: Math.round(fontSize * 1.25),
        lineHeight: 1.25,
        containerId: null,
      };
    }
    if (element.type === 'ellipse') {
      return excalidrawBaseElement(element, index, 'ellipse');
    }
    if (element.type === 'line' || element.type === 'arrow') {
      const base = excalidrawBaseElement(element, index, element.type);
      const start = { x: Number(element.x || 0), y: Number(element.y || 0) };
      const end = { x: start.x + Number(element.w || 0), y: start.y + Number(element.h || 0) };
      return {
        ...base,
        points: [[start.x - base.x, start.y - base.y], [end.x - base.x, end.y - base.y]],
        startBinding: null,
        endBinding: null,
        lastCommittedPoint: null,
        startArrowhead: null,
        endArrowhead: element.type === 'arrow' ? 'arrow' : null,
      };
    }
    if (element.type === 'path') {
      const base = excalidrawBaseElement(element, index, 'freedraw');
      const points = (element.points || []).map(point => [Number(point.x || 0) - base.x, Number(point.y || 0) - base.y]);
      return {
        ...base,
        points,
        pressures: points.map(() => 0.5),
        simulatePressure: true,
        lastCommittedPoint: null,
      };
    }
    if (element.type === 'text') {
      const base = excalidrawBaseElement(element, index, 'text');
      const text = String(element.text || '');
      const fontSize = Math.max(8, Number(element.size || 16));
      return {
        ...base,
        text,
        originalText: text,
        fontSize,
        fontFamily: 3,
        textAlign: 'left',
        verticalAlign: 'top',
        baseline: Math.round(fontSize * 1.25),
        lineHeight: 1.25,
        containerId: null,
      };
    }
    return null;
  }).filter(Boolean);

  return {
    type: 'excalidraw',
    version: 2,
    source: 'markpad',
    elements,
    appState: {
      viewBackgroundColor: source.appState?.viewBackgroundColor || '#ffffff',
      gridSize: canvasGridVisible ? canvasGridSize : null,
    },
    files: {},
  };
}

function exportExcalidrawCanvas() {
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasToExcalidraw(canvasDoc), null, 2);
  downloadText('markpad-canvas.excalidraw', 'application/json', json);
  statusText.textContent = 'Excalidraw canvas exported';
}

async function copyExcalidrawCanvasJson() {
  if (!canvasDoc) loadCanvasState();
  const json = JSON.stringify(canvasToExcalidraw(canvasDoc), null, 2);
  await navigator.clipboard.writeText(`${json}\n`);
  statusText.textContent = 'Excalidraw canvas JSON copied';
}

function canvasElementSummary(element, index) {
  const bounds = canvasElementBounds(element);
  const label = ['text', 'sticky'].includes(element.type)
    ? String(element.text || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    : element.type === 'path'
      ? `${(element.points || []).length} points`
      : `${Math.round(Number(bounds.w || 0))}x${Math.round(Number(bounds.h || 0))}`;
  return `- ${index + 1}. ${element.type || 'element'} · x:${Math.round(Number(bounds.x || 0))}, y:${Math.round(Number(bounds.y || 0))}, w:${Math.round(Number(bounds.w || 0))}, h:${Math.round(Number(bounds.h || 0))}${label ? ` · ${label}` : ''}`;
}

function renderCanvasInventoryRows(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  if (!source.elements.length) return '<div class="canvas-empty">Canvas is empty.</div>';
  return `<div class="local-list">${source.elements.map((element, index) => {
    const bounds = canvasElementBounds(element);
    const label = ['text', 'sticky'].includes(element.type)
      ? String(element.text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      : element.type === 'path'
        ? `${(element.points || []).length} point${(element.points || []).length === 1 ? '' : 's'}`
        : `${Math.round(Number(bounds.w || 0))}x${Math.round(Number(bounds.h || 0))}`;
    return `
    <button class="local-row" data-canvas-inventory-select="${index}" type="button">
      <span class="local-badge">${escapeHtml(String(index + 1))}</span>
      <span class="local-body">
        <strong>${escapeHtml(element.type || 'element')} ${escapeHtml(element.id || '')}</strong>
        <span>x:${Math.round(Number(bounds.x || 0))} · y:${Math.round(Number(bounds.y || 0))} · w:${Math.round(Number(bounds.w || 0))} · h:${Math.round(Number(bounds.h || 0))} · ${escapeHtml(element.stroke || '#1f2937')}</span>
        <small>${escapeHtml(label || 'No label')}</small>
      </span>
    </button>`;
  }).join('')}</div>`;
}

function selectCanvasInventoryElement(index) {
  if (!canvasDoc) loadCanvasState();
  if (!Number.isInteger(index) || index < 0 || index >= canvasDoc.elements.length) {
    statusText.textContent = 'Canvas inventory selection unavailable';
    return;
  }
  modalOverlay.classList.add('hidden');
  openCanvas();
  canvasSelectedIndex = index;
  syncCanvasControlsFromSelection();
  renderCanvas();
  requestAnimationFrame(fitCanvasToSelection);
  statusText.textContent = 'Canvas inventory element selected';
}

function showCanvasHelp() {
  showModal('Canvas Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>tools</strong><span>Select, pan, pen, text, sticky, shape</span><small>Command palette or canvas toolbar</small></div>
      <div class="diag-card"><strong>infinite view</strong><span>Pan + zoom</span><small>Camera changes do not alter content</small></div>
      <div class="diag-card"><strong>grid</strong><span>12-48px snap</span><small>Stored as local UI preference</small></div>
      <div class="diag-card"><strong>selected</strong><span>Inspect + style</span><small>Open selected inspector for geometry, exports, colors, width, style copy/apply, duplicate, and fit</small></div>
      <div class="diag-card"><strong>snap selected</strong><span>Align existing items</span><small>Move selected element to the current grid</small></div>
      <div class="diag-card"><strong>starters</strong><span>Mind map, kanban, timeline</span><small>Insert lightweight JSON templates</small></div>
      <div class="diag-card"><strong>tasks</strong><span>Visible task board</span><small>Append filtered Markdown tasks as canvas cards</small></div>
      <div class="diag-card"><strong>search</strong><span>Result board</span><small>Append current search results as canvas cards</small></div>
      <div class="diag-card"><strong>outline</strong><span>Heading map</span><small>Append active Markdown headings as a hierarchy</small></div>
      <div class="diag-card"><strong>workspace</strong><span>Loaded item map</span><small>Append open files and drafts as cards</small></div>
      <div class="diag-card"><strong>backlinks</strong><span>Reference map</span><small>Append active-note backlinks as cards</small></div>
      <div class="diag-card"><strong>native</strong><span>.markcanvas.json</span><small>Plain Markpad JSON, no binary lock-in</small></div>
      <div class="diag-card"><strong>state split</strong><span>elements + appState</span><small>Content stays separate from camera and UI state</small></div>
      <div class="diag-card"><strong>legacy</strong><span>.canvas / JSON</span><small>Existing local text exports still work</small></div>
      <div class="diag-card"><strong>interchange</strong><span>Obsidian + Excalidraw</span><small>Export scenes without bundling their runtimes</small></div>
      <div class="diag-card"><strong>exports</strong><span>SVG, PNG, Markdown, CSV, JSON</span><small>Use the current viewport or full content</small></div>
      <div class="diag-card"><strong>shortcuts</strong><span>Copy, nudge, undo</span><small>Open the focused shortcut guide</small></div>
      <div class="diag-card"><strong>autosave</strong><span>Debounced viewport</span><small>Wheel zoom writes after idle instead of every tick</small></div>
      <div class="diag-card"><strong>memory</strong><span>Bounded undo</span><small>Clear canvas undo history to release snapshots</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-canvas-shortcuts-guide>Canvas shortcuts</button>
      <button data-canvas-inventory-open>Inventory</button>
      <button data-canvas-element-inspector-open>Selected Inspector</button>
      <button data-canvas-fit-content>Fit Content</button>
      <button data-canvas-clear-undo>Clear Undo</button>
      <button data-export-markcanvas-json>Export .markcanvas.json</button>
      <button data-copy-markcanvas-json>Copy .markcanvas.json</button>
      <button data-canvas-storage-profile-open>Storage Profile</button>
      <button data-export-excalidraw-canvas>Export .excalidraw</button>
      <button data-copy-excalidraw-canvas>Copy Excalidraw JSON</button>
    </div>
    <p class="diag-note">Markpad canvas stores lightweight JSON elements and appState locally. Export .markcanvas.json for the native file, .canvas for Obsidian/JSON Canvas, or .excalidraw for external drawing tools. Viewport wheel changes use a short debounced local save to reduce synchronous storage writes while drawing and element edits still save as completed local actions.</p>
  `);
}

function showCanvasShortcutsGuide() {
  showModal('Canvas Shortcuts', `
    <div class="diag-grid">
      <div class="diag-card"><strong>Ctrl+Z</strong><span>Undo</span><small>Canvas-only undo while the canvas is active</small></div>
      <div class="diag-card"><strong>Ctrl+Y</strong><span>Redo</span><small>Also supports Ctrl+Shift+Z</small></div>
      <div class="diag-card"><strong>Ctrl+C / V</strong><span>Copy / paste</span><small>Uses Markpad's lightweight canvas clipboard</small></div>
      <div class="diag-card"><strong>Ctrl+D</strong><span>Duplicate</span><small>Copies the selected element with a small offset</small></div>
      <div class="diag-card"><strong>Delete</strong><span>Remove selected</span><small>Backspace works too</small></div>
      <div class="diag-card"><strong>Arrow keys</strong><span>Nudge selected</span><small>Hold Shift for 10px steps</small></div>
      <div class="diag-card"><strong>Esc</strong><span>Close canvas</span><small>Also closes modal/search/find first</small></div>
      <div class="diag-card"><strong>Wheel</strong><span>Zoom viewport</span><small>Viewport save is debounced to reduce storage churn</small></div>
    </div>
    <p class="diag-note">Shortcuts are active only when the canvas is open and text editing, search, command palette, and modals are not focused. This prevents canvas actions from stealing normal typing shortcuts.</p>
  `);
}

function showCanvasMapGuide() {
  showModal('Canvas Map Guide', `
    <div class="diag-grid">
      <div class="diag-card"><strong>tasks</strong><span>24 visible tasks</span><small>Uses current task filters and keeps Markdown as source of truth</small></div>
      <div class="diag-card"><strong>agenda</strong><span>24 agenda tasks</span><small>Maps overdue, today, waiting, and high-priority tasks</small></div>
      <div class="diag-card"><strong>search</strong><span>24 current results</span><small>Creates a local research board from result metadata and snippets</small></div>
      <div class="diag-card"><strong>current file</strong><span>24 matches</span><small>Maps active-file search positions without scanning the workspace</small></div>
      <div class="diag-card"><strong>outline</strong><span>40 headings</span><small>Maps active Markdown structure without changing the file</small></div>
      <div class="diag-card"><strong>workspace</strong><span>24 open items</span><small>Maps loaded files and drafts from metadata only</small></div>
      <div class="diag-card"><strong>backlinks</strong><span>24 references</span><small>Maps local backlinks for the saved active note</small></div>
      <div class="diag-card"><strong>memory</strong><span>bounded cards</span><small>Every bridge caps inserts before writing canvas JSON</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-task-agenda-canvas>Agenda to Canvas</button>
      <button data-search-results-canvas ${searchLastResults.length ? '' : 'disabled'}>Search to Canvas</button>
      <button data-current-file-search-canvas-guide>Current File to Canvas</button>
    </div>
    <p class="diag-note">Canvas maps are snapshots. They help plan and review local work, but they do not replace Markdown files, task lines, search results, or workspace metadata manifests.</p>
  `);
}

function showCanvasInventory() {
  if (!canvasDoc) loadCanvasState();
  const source = normalizeCanvasDoc(canvasDoc || newCanvasDoc());
  const counts = source.elements.reduce((acc, element) => {
    const key = element.type || 'element';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  showModal('Canvas Inventory', `
    <div class="local-summary">${source.elements.length} element${source.elements.length === 1 ? '' : 's'} · ${Object.entries(counts).map(([type, count]) => `${escapeHtml(type)} ${count}`).join(' · ') || 'empty canvas'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
      <button data-copy-canvas-summary-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy MD</button>
      <button data-export-canvas-summary-md style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export MD</button>
      <button data-copy-canvas-elements-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy CSV</button>
      <button data-export-canvas-elements-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export CSV</button>
      <button data-copy-canvas-inventory-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy JSON</button>
      <button data-export-canvas-inventory-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export JSON</button>
      <button data-copy-canvas-view-state style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy View</button>
      <button data-export-canvas-view-state style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export View</button>
      <button data-copy-canvas-view-state-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy View JSON</button>
      <button data-export-canvas-view-state-json style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export View JSON</button>
      <button data-restore-canvas-view-state style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Restore View JSON</button>
      <button data-copy-canvas-view-state-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy View CSV</button>
      <button data-export-canvas-view-state-csv style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export View CSV</button>
    </div>
    ${renderCanvasInventoryRows(source)}
    <p class="local-note">Inventory is derived from the current local canvas draft. No files are scanned.</p>
  `, true);
}

function canvasToMarkdownSummary(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const counts = source.elements.reduce((acc, element) => {
    const key = element.type || 'element';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Markpad Canvas Summary',
    '',
    `Exported: ${new Date().toLocaleString()}`,
    `Elements: ${source.elements.length}`,
    `Types: ${Object.entries(counts).map(([type, count]) => `${type} ${count}`).join(', ') || 'none'}`,
    '',
    '## Elements',
    '',
    ...source.elements.map(canvasElementSummary),
    '',
  ];
  return lines.join('\n');
}

function canvasToCsv(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const rows = [
    ['index', 'id', 'type', 'x', 'y', 'width', 'height', 'stroke', 'strokeWidth', 'text', 'points'],
    ...source.elements.map((element, index) => {
      const bounds = canvasElementBounds(element);
      return [
        index + 1,
        element.id || '',
        element.type || '',
        Math.round(Number(bounds.x || 0)),
        Math.round(Number(bounds.y || 0)),
        Math.round(Number(bounds.w || 0)),
        Math.round(Number(bounds.h || 0)),
        element.stroke || '',
        element.width || '',
        element.text || '',
        Array.isArray(element.points) ? element.points.length : '',
      ];
    }),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function canvasInventoryToJson(doc) {
  const source = normalizeCanvasDoc(doc || newCanvasDoc());
  const counts = source.elements.reduce((acc, element) => {
    const key = element.type || 'element';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return JSON.stringify({
    type: 'markpad-canvas-inventory',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: source.elements.length,
    counts,
    elements: source.elements.map((element, index) => {
      const bounds = canvasElementBounds(element);
      return {
        index: index + 1,
        id: element.id || '',
        type: element.type || '',
        bounds: {
          x: Math.round(Number(bounds.x || 0)),
          y: Math.round(Number(bounds.y || 0)),
          width: Math.round(Number(bounds.w || 0)),
          height: Math.round(Number(bounds.h || 0)),
        },
        stroke: element.stroke || '',
        strokeWidth: element.width || '',
        text: element.text || '',
        points: Array.isArray(element.points) ? element.points.length : 0,
      };
    }),
  }, null, 2) + '\n';
}

function exportCanvasMarkdownSummary() {
  if (!canvasDoc) loadCanvasState();
  downloadText('markpad-canvas-summary.md', 'text/markdown', canvasToMarkdownSummary(canvasDoc));
  statusText.textContent = 'Canvas Markdown summary exported';
}

async function copyCanvasMarkdownSummary() {
  if (!canvasDoc) loadCanvasState();
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasToMarkdownSummary(canvasDoc));
  statusText.textContent = 'Canvas Markdown summary copied';
}

function exportCanvasElementsCsv() {
  if (!canvasDoc) loadCanvasState();
  downloadText('markpad-canvas-elements.csv', 'text/csv', canvasToCsv(canvasDoc));
  statusText.textContent = 'Canvas elements exported as CSV';
}

async function copyCanvasElementsCsv() {
  if (!canvasDoc) loadCanvasState();
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasToCsv(canvasDoc));
  statusText.textContent = 'Canvas elements copied as CSV';
}

function exportCanvasInventoryJson() {
  if (!canvasDoc) loadCanvasState();
  downloadText('markpad-canvas-inventory.json', 'application/json', canvasInventoryToJson(canvasDoc));
  statusText.textContent = 'Canvas inventory exported as JSON';
}

async function copyCanvasInventoryJson() {
  if (!canvasDoc) loadCanvasState();
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasInventoryToJson(canvasDoc));
  statusText.textContent = 'Canvas inventory copied as JSON';
}

function canvasViewStateSnapshot() {
  if (!canvasDoc || !canvasSession) loadCanvasState();
  const camera = canvasCamera();
  return {
    type: 'markpad-canvas-view-state',
    version: 1,
    exportedAt: new Date().toISOString(),
    tool: canvasTool,
    camera: {
      x: Math.round(Number(camera.x || 0)),
      y: Math.round(Number(camera.y || 0)),
      zoomPercent: Math.round(Number(camera.scale || 1) * 100),
    },
    grid: {
      visible: !!canvasGridVisible,
      size: canvasGridSize,
      snap: !!canvasSnapToGrid,
    },
    minimapVisible: !!canvasMinimapVisible,
    background: canvasDoc?.appState?.viewBackgroundColor || '#ffffff',
    elementCount: (canvasDoc?.elements || []).length,
  };
}

function canvasViewStateMarkdown() {
  const snapshot = canvasViewStateSnapshot();
  return [
    '# Markpad Canvas View State',
    '',
    `Generated: ${new Date(snapshot.exportedAt).toLocaleString()}`,
    `Tool: ${snapshot.tool}`,
    `Camera: ${snapshot.camera.x}, ${snapshot.camera.y} @ ${snapshot.camera.zoomPercent}%`,
    `Grid: ${snapshot.grid.visible ? `${snapshot.grid.size}px` : 'hidden'} · snap ${snapshot.grid.snap ? 'on' : 'off'}`,
    `Minimap: ${snapshot.minimapVisible ? 'visible' : 'hidden'}`,
    `Background: ${snapshot.background}`,
    `Elements: ${snapshot.elementCount}`,
    '',
  ].join('\n');
}

function canvasViewStateJson() {
  return JSON.stringify(canvasViewStateSnapshot(), null, 2) + '\n';
}

function canvasViewStateCsv() {
  const snapshot = canvasViewStateSnapshot();
  const rows = [
    ['exportedAt', 'tool', 'cameraX', 'cameraY', 'zoomPercent', 'gridVisible', 'gridSize', 'snap', 'minimapVisible', 'background', 'elementCount'],
    [snapshot.exportedAt, snapshot.tool, snapshot.camera.x, snapshot.camera.y, snapshot.camera.zoomPercent, snapshot.grid.visible ? 'true' : 'false', snapshot.grid.size, snapshot.grid.snap ? 'true' : 'false', snapshot.minimapVisible ? 'true' : 'false', snapshot.background, snapshot.elementCount],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function copyCanvasViewStateMarkdown() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasViewStateMarkdown());
  statusText.textContent = 'Canvas view state copied as Markdown';
}

async function copyCanvasViewStateJson() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasViewStateJson());
  statusText.textContent = 'Canvas view state copied as JSON';
}

async function copyCanvasViewStateCsv() {
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  await navigator.clipboard.writeText(canvasViewStateCsv());
  statusText.textContent = 'Canvas view state copied as CSV';
}

function exportCanvasViewStateMarkdown() {
  downloadText('markpad-canvas-view-state.md', 'text/markdown', canvasViewStateMarkdown());
  statusText.textContent = 'Canvas view state exported as Markdown';
}

function exportCanvasViewStateJson() {
  downloadText('markpad-canvas-view-state.json', 'application/json', canvasViewStateJson());
  statusText.textContent = 'Canvas view state exported as JSON';
}

function exportCanvasViewStateCsv() {
  downloadText('markpad-canvas-view-state.csv', 'text/csv', canvasViewStateCsv());
  statusText.textContent = 'Canvas view state exported as CSV';
}

function canvasStorageProfileSnapshot() {
  if (!canvasDoc || !canvasSession) loadCanvasState();
  const documentText = localStorage.getItem(CANVAS_DOC_KEY) || JSON.stringify(canvasDoc || newCanvasDoc());
  const sessionText = localStorage.getItem(CANVAS_SESSION_KEY) || JSON.stringify(canvasSession || { camera: { x: 0, y: 0, scale: 1 } });
  const doc = canvasDoc || newCanvasDoc();
  const session = canvasSession || { camera: { x: 0, y: 0, scale: 1 } };
  const historyBytes = canvasHistory.reduce((sum, snap) => sum + byteSize(snap || ''), 0);
  const totalElements = (doc.elements || []).length;
  const visibleElements = canvasVisibleElementCount();
  const view = canvasViewportBounds();
  const pathElements = (doc.elements || []).filter(element => element?.type === 'path');
  const visiblePathElements = pathElements.filter(element => canvasElementInViewport(element, view)).length;
  const elementText = JSON.stringify(doc.elements || []);
  const elementBytes = byteSize(elementText);
  const elementTypes = (doc.elements || []).reduce((acc, element) => {
    const type = String(element?.type || 'element');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return {
    type: 'markpad-canvas-storage-profile',
    version: 1,
    sampledAt: new Date().toISOString(),
    format: MARKPAD_CANVAS_FORMAT,
    schema: MARKPAD_CANVAS_SCHEMA,
    document: {
      key: CANVAS_DOC_KEY,
      bytes: byteSize(documentText),
      elements: totalElements,
      elementBytes,
      averageElementBytes: totalElements ? Math.round(elementBytes / totalElements) : 0,
      elementTypes,
      appStateBytes: byteSize(JSON.stringify(doc.appState || {})),
      filesBytes: byteSize(JSON.stringify(doc.files || {})),
      background: doc.appState?.viewBackgroundColor || '#ffffff',
      source: doc.source || 'markpad',
    },
    session: {
      key: CANVAS_SESSION_KEY,
      bytes: byteSize(sessionText),
      camera: {
        x: Math.round(Number(session.camera?.x || 0)),
        y: Math.round(Number(session.camera?.y || 0)),
        scale: Number(session.camera?.scale || 1),
      },
      gridVisible: !!canvasGridVisible,
      snapToGrid: !!canvasSnapToGrid,
      gridSize: canvasGridSize,
      minimapVisible: !!canvasMinimapVisible,
      tool: canvasTool,
    },
    virtualization: {
      visibleElements,
      totalElements,
      culledElements: Math.max(0, totalElements - visibleElements),
      viewportPadding: 100,
      pathElementsAlwaysDrawn: false,
      pathsCulledByBounds: true,
      totalPathElements: pathElements.length,
      visiblePathElements,
      culledPathElements: Math.max(0, pathElements.length - visiblePathElements),
      pathPadding: 'max(100px, stroke width * 4)',
      pathBounds: 'single-pass',
    },
    undo: {
      snapshots: canvasHistory.length,
      currentIndex: canvasHistoryIndex,
      bytes: historyBytes,
      limit: CANVAS_HISTORY_LIMIT,
      maxBytes: CANVAS_HISTORY_BYTES,
    },
    exports: {
      native: '.markcanvas.json',
      obsidian: '.canvas',
      excalidraw: '.excalidraw',
      images: ['svg', 'png viewport', 'png full'],
      summaries: ['markdown', 'csv', 'inventory json'],
    },
    note: 'Canvas document and session are stored separately locally; exports are plain text JSON unless explicitly exporting SVG/PNG.',
  };
}

function canvasElementTypeSummary(counts = {}) {
  const entries = Object.entries(counts);
  if (!entries.length) return 'none';
  return entries.map(([type, count]) => `${type}: ${count}`).join(', ');
}

function canvasStorageProfileMarkdown(snapshot = canvasStorageProfileSnapshot()) {
  const camera = snapshot.session.camera || {};
  return [
    '# Markpad Canvas Storage Profile',
    '',
    `Sampled: ${snapshot.sampledAt}`,
    `Format: ${snapshot.format}`,
    `Schema: ${snapshot.schema}`,
    '',
    '## Document',
    '',
    `- Key: ${snapshot.document.key}`,
    `- Bytes: ${formatBytes(snapshot.document.bytes || 0)}`,
    `- Elements: ${snapshot.document.elements || 0}`,
    `- Element JSON: ${formatBytes(snapshot.document.elementBytes || 0)} (${formatBytes(snapshot.document.averageElementBytes || 0)} average)`,
    `- Viewport-visible elements: ${snapshot.virtualization?.visibleElements ?? snapshot.document.elements || 0}/${snapshot.virtualization?.totalElements ?? snapshot.document.elements || 0}`,
    `- Viewport-visible paths: ${snapshot.virtualization?.visiblePathElements || 0}/${snapshot.virtualization?.totalPathElements || 0}`,
    `- Path bounds: ${snapshot.virtualization?.pathBounds || 'single-pass'}; paths culled by bounds: ${snapshot.virtualization?.pathsCulledByBounds ? 'yes' : 'no'}`,
    `- Element types: ${canvasElementTypeSummary(snapshot.document.elementTypes)}`,
    `- App state: ${formatBytes(snapshot.document.appStateBytes || 0)}`,
    `- Files/assets: ${formatBytes(snapshot.document.filesBytes || 0)}`,
    `- Background: ${snapshot.document.background}`,
    `- Source: ${snapshot.document.source}`,
    '',
    '## Session',
    '',
    `- Key: ${snapshot.session.key}`,
    `- Bytes: ${formatBytes(snapshot.session.bytes || 0)}`,
    `- Camera: x ${camera.x || 0}, y ${camera.y || 0}, zoom ${Math.round(Number(camera.scale || 1) * 100)}%`,
    `- Tool: ${snapshot.session.tool}`,
    `- Grid: ${snapshot.session.gridVisible ? `${snapshot.session.gridSize}px` : 'off'}`,
    `- Snap: ${snapshot.session.snapToGrid ? 'on' : 'off'}`,
    `- Minimap: ${snapshot.session.minimapVisible ? 'on' : 'off'}`,
    '',
    '## Undo',
    '',
    `- Snapshots: ${snapshot.undo.snapshots}/${snapshot.undo.limit}`,
    `- Bytes: ${formatBytes(snapshot.undo.bytes || 0)} / ${formatBytes(snapshot.undo.maxBytes || 0)}`,
    `- Current index: ${snapshot.undo.currentIndex}`,
    '',
    '## Exports',
    '',
    `- Native: ${snapshot.exports.native}`,
    `- Obsidian/JSON Canvas: ${snapshot.exports.obsidian}`,
    `- Excalidraw: ${snapshot.exports.excalidraw}`,
    `- Images: ${(snapshot.exports.images || []).join(', ')}`,
    `- Summaries: ${(snapshot.exports.summaries || []).join(', ')}`,
    '',
    snapshot.note,
    '',
  ].join('\n');
}

function canvasStorageProfileJson(snapshot = canvasStorageProfileSnapshot()) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

function canvasStorageProfileCsv(snapshot = canvasStorageProfileSnapshot()) {
  const rows = [
    ['metric', 'value'],
    ['sampled_at', snapshot.sampledAt],
    ['format', snapshot.format],
    ['schema', snapshot.schema],
    ['document_key', snapshot.document.key],
    ['document_bytes', Number(snapshot.document.bytes || 0)],
    ['document_elements', Number(snapshot.document.elements || 0)],
    ['document_element_bytes', Number(snapshot.document.elementBytes || 0)],
    ['document_average_element_bytes', Number(snapshot.document.averageElementBytes || 0)],
    ['viewport_visible_elements', Number(snapshot.virtualization?.visibleElements || 0)],
    ['viewport_culled_elements', Number(snapshot.virtualization?.culledElements || 0)],
    ['viewport_padding', Number(snapshot.virtualization?.viewportPadding || 0)],
    ['viewport_visible_path_elements', Number(snapshot.virtualization?.visiblePathElements || 0)],
    ['viewport_total_path_elements', Number(snapshot.virtualization?.totalPathElements || 0)],
    ['viewport_culled_path_elements', Number(snapshot.virtualization?.culledPathElements || 0)],
    ['path_padding', snapshot.virtualization?.pathPadding || ''],
    ['path_elements_always_drawn', snapshot.virtualization?.pathElementsAlwaysDrawn ? 'true' : 'false'],
    ['paths_culled_by_bounds', snapshot.virtualization?.pathsCulledByBounds ? 'true' : 'false'],
    ['path_bounds', snapshot.virtualization?.pathBounds || ''],
    ['document_appstate_bytes', Number(snapshot.document.appStateBytes || 0)],
    ['document_files_bytes', Number(snapshot.document.filesBytes || 0)],
    ['document_background', snapshot.document.background || ''],
    ['session_key', snapshot.session.key],
    ['session_bytes', Number(snapshot.session.bytes || 0)],
    ['session_camera_x', Number(snapshot.session.camera?.x || 0)],
    ['session_camera_y', Number(snapshot.session.camera?.y || 0)],
    ['session_camera_scale', Number(snapshot.session.camera?.scale || 1)],
    ['session_tool', snapshot.session.tool || ''],
    ['session_grid_visible', snapshot.session.gridVisible ? 'true' : 'false'],
    ['session_snap_to_grid', snapshot.session.snapToGrid ? 'true' : 'false'],
    ['undo_snapshots', Number(snapshot.undo.snapshots || 0)],
    ['undo_bytes', Number(snapshot.undo.bytes || 0)],
    ['undo_limit', Number(snapshot.undo.limit || 0)],
    ['undo_max_bytes', Number(snapshot.undo.maxBytes || 0)],
  ];
  Object.entries(snapshot.document.elementTypes || {}).forEach(([type, count]) => rows.push([`element_type_${type}`, Number(count || 0)]));
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function showCanvasStorageProfile() {
  const snapshot = canvasStorageProfileSnapshot();
  const camera = snapshot.session.camera || {};
  showModal('Canvas Storage Profile', `
    <div class="diag-grid">
      <div class="diag-card"><strong>${formatBytes(snapshot.document.bytes || 0)}</strong><span>Document JSON</span><small>${snapshot.document.elements || 0} elements · ${escapeHtml(snapshot.document.key)}</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.document.averageElementBytes || 0)}</strong><span>Avg element</span><small>${formatBytes(snapshot.document.elementBytes || 0)} element JSON</small></div>
      <div class="diag-card"><strong>${snapshot.virtualization.visibleElements}/${snapshot.virtualization.totalElements}</strong><span>Viewport draw</span><small>${snapshot.virtualization.culledElements} culled · ${snapshot.virtualization.viewportPadding}px pad</small></div>
      <div class="diag-card"><strong>${snapshot.virtualization.visiblePathElements}/${snapshot.virtualization.totalPathElements}</strong><span>Visible paths</span><small>${snapshot.virtualization.culledPathElements} path${snapshot.virtualization.culledPathElements === 1 ? '' : 's'} culled</small></div>
      <div class="diag-card"><strong>${Object.keys(snapshot.document.elementTypes || {}).length}</strong><span>Element types</span><small>${escapeHtml(canvasElementTypeSummary(snapshot.document.elementTypes))}</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.session.bytes || 0)}</strong><span>Session JSON</span><small>camera, tool, grid, snap</small></div>
      <div class="diag-card"><strong>${Math.round(Number(camera.scale || 1) * 100)}%</strong><span>Camera</span><small>x ${camera.x || 0} · y ${camera.y || 0}</small></div>
      <div class="diag-card"><strong>${formatBytes(snapshot.undo.bytes || 0)}</strong><span>Canvas undo</span><small>${snapshot.undo.snapshots}/${snapshot.undo.limit} snapshots</small></div>
      <div class="diag-card"><strong>${escapeHtml(snapshot.format)}</strong><span>Native format</span><small>${escapeHtml(snapshot.exports.native)}</small></div>
      <div class="diag-card"><strong>plain</strong><span>Interop exports</span><small>${escapeHtml(snapshot.exports.obsidian)} · ${escapeHtml(snapshot.exports.excalidraw)}</small></div>
    </div>
    <div class="local-actions" style="margin-top:10px;">
      <button data-copy-canvas-storage-md>Copy MD</button>
      <button data-export-canvas-storage-md>Export MD</button>
      <button data-copy-canvas-storage-json>Copy JSON</button>
      <button data-export-canvas-storage-json>Export JSON</button>
      <button data-copy-canvas-storage-csv>Copy CSV</button>
      <button data-export-canvas-storage-csv>Export CSV</button>
      <button data-copy-markcanvas-json>Copy .markcanvas.json</button>
      <button data-export-markcanvas-json>Export .markcanvas.json</button>
      <button data-canvas-clear-undo>Clear Undo</button>
    </div>
    <p class="diag-note">${escapeHtml(snapshot.note)}</p>
  `);
}

async function copyCanvasStorageProfileMarkdown() {
  await navigator.clipboard.writeText(canvasStorageProfileMarkdown());
  statusText.textContent = 'Canvas storage profile copied as Markdown';
}

function exportCanvasStorageProfileMarkdown() {
  downloadText('markpad-canvas-storage-profile.md', 'text/markdown', canvasStorageProfileMarkdown());
  statusText.textContent = 'Canvas storage profile exported as Markdown';
}

async function copyCanvasStorageProfileJson() {
  await navigator.clipboard.writeText(canvasStorageProfileJson());
  statusText.textContent = 'Canvas storage profile copied as JSON';
}

function exportCanvasStorageProfileJson() {
  downloadText('markpad-canvas-storage-profile.json', 'application/json', canvasStorageProfileJson());
  statusText.textContent = 'Canvas storage profile exported as JSON';
}

async function copyCanvasStorageProfileCsv() {
  await navigator.clipboard.writeText(canvasStorageProfileCsv());
  statusText.textContent = 'Canvas storage profile copied as CSV';
}

function exportCanvasStorageProfileCsv() {
  downloadText('markpad-canvas-storage-profile.csv', 'text/csv', canvasStorageProfileCsv());
  statusText.textContent = 'Canvas storage profile exported as CSV';
}

async function restoreCanvasViewStateFromClipboard() {
  if (!navigator.clipboard?.readText) {
    statusText.textContent = 'Clipboard read unavailable';
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(await navigator.clipboard.readText());
  } catch {
    statusText.textContent = 'Clipboard does not contain canvas view-state JSON';
    return;
  }
  if (!parsed || (parsed.type && parsed.type !== 'markpad-canvas-view-state')) {
    statusText.textContent = 'Clipboard JSON is not a canvas view state';
    return;
  }
  openCanvas();
  const camera = canvasCamera();
  const nextCamera = parsed.camera || {};
  if (Number.isFinite(Number(nextCamera.x))) camera.x = Number(nextCamera.x);
  if (Number.isFinite(Number(nextCamera.y))) camera.y = Number(nextCamera.y);
  const zoom = Number.isFinite(Number(nextCamera.zoomPercent)) ? Number(nextCamera.zoomPercent) / 100 : Number(nextCamera.scale);
  if (Number.isFinite(zoom)) camera.scale = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, zoom));
  const grid = parsed.grid || {};
  if (typeof grid.visible === 'boolean') {
    canvasGridVisible = grid.visible;
    localStorage.setItem('markpad-canvas-grid', canvasGridVisible ? '1' : '0');
  }
  if (Number.isFinite(Number(grid.size))) {
    canvasGridSize = normalizeCanvasGridSize(grid.size);
    localStorage.setItem('markpad-canvas-grid-size', String(canvasGridSize));
  }
  if (typeof grid.snap === 'boolean') {
    canvasSnapToGrid = grid.snap;
    localStorage.setItem('markpad-canvas-snap', canvasSnapToGrid ? '1' : '0');
  }
  if (typeof parsed.minimapVisible === 'boolean') {
    canvasMinimapVisible = parsed.minimapVisible;
    localStorage.setItem('markpad-canvas-minimap', canvasMinimapVisible ? '1' : '0');
  }
  if (typeof parsed.background === 'string' && parsed.background.trim()) {
    canvasDoc.appState = canvasDoc.appState || {};
    canvasDoc.appState.viewBackgroundColor = parsed.background.trim();
  }
  if (typeof parsed.tool === 'string') setCanvasTool(parsed.tool);
  saveCanvasState();
  updateCanvasOptionButtons();
  renderCanvas();
  updateCanvasStatus();
  statusText.textContent = 'Canvas view state restored from clipboard';
}

function obsidianElementBounds(element) {
  const bounds = canvasElementBounds(element);
  return {
    x: Math.round(Number(bounds.x || 0)),
    y: Math.round(Number(bounds.y || 0)),
    w: Math.max(80, Math.round(Number(bounds.w || 260))),
    h: Math.max(60, Math.round(Number(bounds.h || 120))),
  };
}

function obsidianElementText(element) {
  if (typeof element.text === 'string') return element.text;
  if (element.type === 'path') return 'Freehand path';
  if (element.type === 'rect') return 'Rectangle';
  if (element.type === 'ellipse') return 'Oval';
  if (element.type === 'sticky') return 'Sticky note';
  return '';
}

function obsidianSafeId(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const id = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return id || fallback || canvasId();
}

function uniqueObsidianId(base, used) {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function obsidianColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '';
}

function nearestObsidianNode(point, entries) {
  let best = null;
  let bestDistance = Infinity;
  entries.forEach((entry) => {
    const distance = distancePointToBounds(point, entry.bounds);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  });
  return bestDistance <= 220 ? best : null;
}

function distancePointToBounds(point, bounds) {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.w));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.h));
  return Math.hypot(dx, dy);
}

function obsidianCanvasSide(fromBounds, toBounds) {
  const fromCenter = { x: fromBounds.x + fromBounds.w / 2, y: fromBounds.y + fromBounds.h / 2 };
  const toCenter = { x: toBounds.x + toBounds.w / 2, y: toBounds.y + toBounds.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
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
    canvasSelectedIndex = -1;
    canvasMoveStart = null;
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
  const json = JSON.stringify(canvasPortableDoc(canvasDoc || newCanvasDoc()), null, 2) + '\n';
  if (canvasActive) closeCanvas();
  renderSession(await window.go.main.App.NewNote());
  await window.go.main.App.UpdateContent(activeId, json, true);
  loadContent(json);
  renderSession(await window.go.main.App.GetSession());
  setView('markdown');
  editor.focus();
  statusText.textContent = 'Canvas JSON draft created. Use Save As for .canvas';
}

async function saveCanvasToActiveDocument() {
  finishCanvasTextEdit();
  if (!canvasDoc) loadCanvasState();
  const active = cachedNotes.find(n => n.id === activeId);
  if (!active) {
    statusText.textContent = 'No active document for canvas write';
    return;
  }
  const ext = fileExt(active.path || '').toLowerCase();
  if (active.path && ext !== 'canvas' && ext !== 'json') {
    statusText.textContent = 'Active file is not .canvas or JSON. Use Draft instead.';
    return;
  }
  const type = getFileType(active.path, active.kind);
  if (isReadOnlyType(type)) {
    statusText.textContent = 'Active document is read-only';
    return;
  }
  const json = JSON.stringify(canvasPortableDoc(canvasDoc || newCanvasDoc()), null, 2) + '\n';
  await window.go.main.App.UpdateContent(activeId, json, true);
  currentContent = json;
  editor.value = json;
  if (viewMode !== 'markdown') renderViewer(currentContent, active);
  renderSession(await window.go.main.App.GetSession());
  updateStats();
  statusText.textContent = 'Canvas written to active document';
}

function importCanvasJson() {
  openCanvas();
  canvasImportFile?.click();
}
$('canvas-import')?.addEventListener('click', importCanvasJson);
$('canvas-export')?.addEventListener('click', exportCanvasJson);
$('canvas-export-svg')?.addEventListener('click', exportCanvasSvg);
$('canvas-export-obsidian')?.addEventListener('click', exportObsidianCanvas);
$('canvas-save-active')?.addEventListener('click', saveCanvasToActiveDocument);
$('canvas-save-draft')?.addEventListener('click', saveCanvasAsDraft);
canvasImportFile?.addEventListener('change', async () => {
  const file = canvasImportFile.files && canvasImportFile.files[0];
  canvasImportFile.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    canvasDoc = normalizeCanvasDoc(JSON.parse(text));
    canvasSession.camera = { x: 0, y: 0, scale: 1 };
    canvasSelectedIndex = -1;
    canvasMoveStart = null;
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
  canvasSelectedIndex = -1;
  canvasMoveStart = null;
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
  if (activeId) deleteLoadedSearchCache(activeId);
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
    const isActiveView = b.dataset.mode === mode;
    b.classList.toggle('active', isActiveView);
    b.setAttribute('aria-pressed', isActiveView ? 'true' : 'false');
    if (b.dataset.mode === 'split') b.classList.toggle('hidden', ft !== 'md');
    if (b.dataset.mode === 'markdown') b.classList.toggle('hidden', isReadOnlyType(ft));
  });
  const showEditor = mode === 'markdown' || mode === 'split';
  const showViewer = mode === 'viewer' || mode === 'split';
  editorCont.classList.toggle('hidden', !showEditor);
  viewerCont.classList.toggle('hidden', !showViewer);
  divider.classList.toggle('hidden', mode !== 'split');
  divider.tabIndex = mode === 'split' ? 0 : -1;
  $('split-preset-group')?.classList.toggle('hidden', mode !== 'split' || ft !== 'md');
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
    divider.removeAttribute('data-split-label');
    divider.removeAttribute('title');
  }
  if (!showEditor && findOpen) toggleFind();
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.mode));
});
divider.addEventListener('dblclick', () => {
  setSplitPreset(50);
});
divider.addEventListener('keydown', (e) => {
  if (viewMode !== 'split') return;
  const step = e.shiftKey ? 10 : 5;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    adjustSplitRatio(-step);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    adjustSplitRatio(step);
  } else if (e.key === 'Home') {
    e.preventDefault();
    setSplitPreset(28);
  } else if (e.key === 'End') {
    e.preventDefault();
    setSplitPreset(72);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setSplitPreset(50);
  }
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
  const clamped = normalizeSplitRatio(pct);
  editorCont.style.flex = `0 0 ${clamped}%`;
  viewerCont.style.flex = `0 0 ${100 - clamped}%`;
  updateSplitRatioBadge(clamped);
});
document.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

document.querySelectorAll('[data-split-ratio]').forEach((button) => {
  button.addEventListener('click', () => setSplitPreset(button.dataset.splitRatio));
});
$('split-preset-group')?.querySelector('[data-split-swap]')?.addEventListener('click', swapSplitRatio);

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
editor.addEventListener('keyup', () => {
  queueReadPositionSave();
  updateStats();
});
editor.addEventListener('click', updateStats);
editor.addEventListener('select', updateStats);
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

function clearEditorUndoHistory() {
  editHistories.clear();
  updateHistoryButtons();
  statusText.textContent = 'Editor undo history cleared';
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

['select', 'keyup', 'mouseup'].forEach(eventName => {
  editor.addEventListener(eventName, updateStats);
});

editor.addEventListener('input', (e) => {
  const active = cachedNotes.find(n => n.id === activeId);
  if (isReadOnlyType(getFileType(active?.path, active?.kind))) return;
  recordEditState(e.inputType);
  currentContent = editor.value;
  if (activeId) deleteLoadedSearchCache(activeId);
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

function editorCursorPosition() {
  const pos = Math.max(0, Math.min(editor.selectionStart || 0, editor.value.length));
  const before = editor.value.slice(0, pos);
  const lastBreak = before.lastIndexOf('\n');
  const line = before ? before.split('\n').length : 1;
  const col = pos - lastBreak;
  return { line, col };
}

function editorSelectionSummary() {
  const start = Math.max(0, Math.min(editor.selectionStart || 0, editor.selectionEnd || 0));
  const end = Math.max(0, Math.max(editor.selectionStart || 0, editor.selectionEnd || 0));
  if (start === end) return '';
  const selected = editor.value.slice(start, end);
  const words = selected.trim() ? selected.trim().split(/\s+/).length : 0;
  const lines = selected ? selected.split('\n').length : 0;
  return ` \u00b7 Sel ${selected.length} ch / ${words} w / ${lines} ln`;
}

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
  const cursor = editorCursorPosition();
  statusStats.textContent = `${lang} \u00b7 ${lines} ln \u00b7 ${words} w \u00b7 ${t.length} ch \u00b7 Ln ${cursor.line}, Col ${cursor.col}${editorSelectionSummary()} \u00b7 ~${readMin} min \u00b7 UTF-8`;
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

function findSelectionInCurrentFile() {
  const selected = getSelectedSearchText().replace(/\s+/g, ' ').trim();
  if (!findOpen) toggleFind();
  findInput.value = selected;
  findInput.focus();
  if (!selected) {
    findInfo.textContent = 'Select text to find';
    return;
  }
  doFind();
}

function clearCurrentFind() {
  if (!findOpen) toggleFind();
  findInput.value = '';
  findInfo.textContent = '';
  findInput.focus();
}

function findFromTop() {
  if (!findOpen) toggleFind();
  if (!findInput.value.trim()) {
    findInput.focus();
    findInfo.textContent = 'Enter text to find';
    return;
  }
  editor.focus();
  editor.setSelectionRange(0, 0);
  doFind();
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
  else if (canvasActive && handleCanvasSelectionShortcut(e)) {}
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
$('btn-wrap')?.addEventListener('click', toggleEditorWrap);
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
  const exportSettings = e.target.closest('[data-export-local-settings]');
  if (exportSettings) await exportLocalSettings();
  const copySettings = e.target.closest('[data-copy-local-settings]');
  if (copySettings) await copyLocalSettings();
  const importSettings = e.target.closest('[data-import-local-settings]');
  if (importSettings) importLocalSettings();
  const copyLoadedWorkspaceMd = e.target.closest('[data-copy-loaded-workspace-md]');
  if (copyLoadedWorkspaceMd) await copyLoadedWorkspaceMarkdown();
  const exportLoadedWorkspaceMd = e.target.closest('[data-export-loaded-workspace-md]');
  if (exportLoadedWorkspaceMd) exportLoadedWorkspaceMarkdown();
  const copyLoadedWorkspaceJson = e.target.closest('[data-copy-loaded-workspace-json]');
  if (copyLoadedWorkspaceJson) await copyLoadedWorkspaceJson();
  const exportLoadedWorkspaceJson = e.target.closest('[data-export-loaded-workspace-json]');
  if (exportLoadedWorkspaceJson) exportLoadedWorkspaceJson();
  const copyLoadedWorkspaceCsv = e.target.closest('[data-copy-loaded-workspace-csv]');
  if (copyLoadedWorkspaceCsv) await copyLoadedWorkspaceCsv();
  const exportLoadedWorkspaceCsv = e.target.closest('[data-export-loaded-workspace-csv]');
  if (exportLoadedWorkspaceCsv) exportLoadedWorkspaceCsv();
  const copyFootprintMd = e.target.closest('[data-copy-footprint-md]');
  if (copyFootprintMd) await copyLocalFootprintMarkdown();
  const exportFootprintMd = e.target.closest('[data-export-footprint-md]');
  if (exportFootprintMd) await exportLocalFootprintMarkdown();
  const copyFootprintJson = e.target.closest('[data-copy-footprint-json]');
  if (copyFootprintJson) await copyLocalFootprintJson();
  const exportFootprintJson = e.target.closest('[data-export-footprint-json]');
  if (exportFootprintJson) await exportLocalFootprintJson();
  const copyFootprintCsv = e.target.closest('[data-copy-footprint-csv]');
  if (copyFootprintCsv) await copyLocalFootprintCsv();
  const exportFootprintCsv = e.target.closest('[data-export-footprint-csv]');
  if (exportFootprintCsv) await exportLocalFootprintCsv();
  const copyRuntimeText = e.target.closest('[data-copy-runtime-text]');
  if (copyRuntimeText) await copyRuntimeStats();
  const exportRuntimeText = e.target.closest('[data-export-runtime-text]');
  if (exportRuntimeText) await exportRuntimeStatsText();
  const copyRuntimeMd = e.target.closest('[data-copy-runtime-md]');
  if (copyRuntimeMd) await copyRuntimeStatsMarkdown();
  const exportRuntimeMd = e.target.closest('[data-export-runtime-md]');
  if (exportRuntimeMd) await exportRuntimeStatsMarkdown();
  const copyRuntimeJson = e.target.closest('[data-copy-runtime-json]');
  if (copyRuntimeJson) await copyRuntimeStatsJson();
  const exportRuntimeJson = e.target.closest('[data-export-runtime-json]');
  if (exportRuntimeJson) await exportRuntimeStatsJson();
  const copyRuntimeCsv = e.target.closest('[data-copy-runtime-csv]');
  if (copyRuntimeCsv) await copyRuntimeStatsCsv();
  const exportRuntimeCsv = e.target.closest('[data-export-runtime-csv]');
  if (exportRuntimeCsv) await exportRuntimeStatsCsv();
  const copyAssetReportMd = e.target.closest('[data-copy-asset-report-md]');
  if (copyAssetReportMd) await copyLightweightAssetReportMarkdown();
  const exportAssetReportMd = e.target.closest('[data-export-asset-report-md]');
  if (exportAssetReportMd) exportLightweightAssetReportMarkdown();
  const copyAssetReportJson = e.target.closest('[data-copy-asset-report-json]');
  if (copyAssetReportJson) await copyLightweightAssetReportJson();
  const exportAssetReportJson = e.target.closest('[data-export-asset-report-json]');
  if (exportAssetReportJson) exportLightweightAssetReportJson();
  const copyCanvasSummaryMd = e.target.closest('[data-copy-canvas-summary-md]');
  if (copyCanvasSummaryMd) await copyCanvasMarkdownSummary();
  const exportCanvasSummaryMd = e.target.closest('[data-export-canvas-summary-md]');
  if (exportCanvasSummaryMd) exportCanvasMarkdownSummary();
  const copyCanvasElementsCsv = e.target.closest('[data-copy-canvas-elements-csv]');
  if (copyCanvasElementsCsv) await copyCanvasElementsCsv();
  const exportCanvasElementsCsvBtn = e.target.closest('[data-export-canvas-elements-csv]');
  if (exportCanvasElementsCsvBtn) exportCanvasElementsCsv();
  const copyCanvasInventoryJsonBtn = e.target.closest('[data-copy-canvas-inventory-json]');
  if (copyCanvasInventoryJsonBtn) await copyCanvasInventoryJson();
  const exportCanvasInventoryJsonBtn = e.target.closest('[data-export-canvas-inventory-json]');
  if (exportCanvasInventoryJsonBtn) exportCanvasInventoryJson();
  const copyMarkcanvasJsonBtn = e.target.closest('[data-copy-markcanvas-json]');
  if (copyMarkcanvasJsonBtn) await copyMarkcanvasJson();
  const exportMarkcanvasJsonBtn = e.target.closest('[data-export-markcanvas-json]');
  if (exportMarkcanvasJsonBtn) exportMarkcanvasJson();
  const canvasStorageProfileOpenBtn = e.target.closest('[data-canvas-storage-profile-open]');
  if (canvasStorageProfileOpenBtn) showCanvasStorageProfile();
  const copyCanvasStorageMdBtn = e.target.closest('[data-copy-canvas-storage-md]');
  if (copyCanvasStorageMdBtn) await copyCanvasStorageProfileMarkdown();
  const exportCanvasStorageMdBtn = e.target.closest('[data-export-canvas-storage-md]');
  if (exportCanvasStorageMdBtn) exportCanvasStorageProfileMarkdown();
  const copyCanvasStorageJsonBtn = e.target.closest('[data-copy-canvas-storage-json]');
  if (copyCanvasStorageJsonBtn) await copyCanvasStorageProfileJson();
  const exportCanvasStorageJsonBtn = e.target.closest('[data-export-canvas-storage-json]');
  if (exportCanvasStorageJsonBtn) exportCanvasStorageProfileJson();
  const copyCanvasStorageCsvBtn = e.target.closest('[data-copy-canvas-storage-csv]');
  if (copyCanvasStorageCsvBtn) await copyCanvasStorageProfileCsv();
  const exportCanvasStorageCsvBtn = e.target.closest('[data-export-canvas-storage-csv]');
  if (exportCanvasStorageCsvBtn) exportCanvasStorageProfileCsv();
  const copyCanvasViewStateBtn = e.target.closest('[data-copy-canvas-view-state]');
  if (copyCanvasViewStateBtn) await copyCanvasViewStateMarkdown();
  const exportCanvasViewStateBtn = e.target.closest('[data-export-canvas-view-state]');
  if (exportCanvasViewStateBtn) exportCanvasViewStateMarkdown();
  const copyCanvasViewStateJsonBtn = e.target.closest('[data-copy-canvas-view-state-json]');
  if (copyCanvasViewStateJsonBtn) await copyCanvasViewStateJson();
  const exportCanvasViewStateJsonBtn = e.target.closest('[data-export-canvas-view-state-json]');
  if (exportCanvasViewStateJsonBtn) exportCanvasViewStateJson();
  const restoreCanvasViewStateBtn = e.target.closest('[data-restore-canvas-view-state]');
  if (restoreCanvasViewStateBtn) await restoreCanvasViewStateFromClipboard();
  const copyCanvasViewStateCsvBtn = e.target.closest('[data-copy-canvas-view-state-csv]');
  if (copyCanvasViewStateCsvBtn) await copyCanvasViewStateCsv();
  const exportCanvasViewStateCsvBtn = e.target.closest('[data-export-canvas-view-state-csv]');
  if (exportCanvasViewStateCsvBtn) exportCanvasViewStateCsv();
  const exportExcalidrawCanvasBtn = e.target.closest('[data-export-excalidraw-canvas]');
  if (exportExcalidrawCanvasBtn) exportExcalidrawCanvas();
  const copyExcalidrawCanvasBtn = e.target.closest('[data-copy-excalidraw-canvas]');
  if (copyExcalidrawCanvasBtn) await copyExcalidrawCanvasJson();
  const copyTaskAgendaMdBtn = e.target.closest('[data-copy-task-agenda-md]');
  if (copyTaskAgendaMdBtn) await copyTaskAgendaMarkdown();
  const copyTaskAgendaJsonBtn = e.target.closest('[data-copy-task-agenda-json]');
  if (copyTaskAgendaJsonBtn) await copyTaskAgendaJson();
  const copyTaskAgendaCsvBtn = e.target.closest('[data-copy-task-agenda-csv]');
  if (copyTaskAgendaCsvBtn) await copyTaskAgendaCsv();
  const copyTaskAgendaIcsBtn = e.target.closest('[data-copy-task-agenda-ics]');
  if (copyTaskAgendaIcsBtn) await copyTaskAgendaIcs();
  const copyTaskAgendaTodoBtn = e.target.closest('[data-copy-task-agenda-todo]');
  if (copyTaskAgendaTodoBtn) await copyTaskAgendaTodoTxt();
  const exportTaskAgendaMdBtn = e.target.closest('[data-export-task-agenda-md]');
  if (exportTaskAgendaMdBtn) exportTaskAgendaMarkdown();
  const exportTaskAgendaJsonBtn = e.target.closest('[data-export-task-agenda-json]');
  if (exportTaskAgendaJsonBtn) exportTaskAgendaJson();
  const exportTaskAgendaCsvBtn = e.target.closest('[data-export-task-agenda-csv]');
  if (exportTaskAgendaCsvBtn) exportTaskAgendaCsv();
  const exportTaskAgendaIcsBtn = e.target.closest('[data-export-task-agenda-ics]');
  if (exportTaskAgendaIcsBtn) exportTaskAgendaIcs();
  const exportTaskAgendaTodoBtn = e.target.closest('[data-export-task-agenda-todo]');
  if (exportTaskAgendaTodoBtn) exportTaskAgendaTodoTxt();
  const taskAgendaCanvasBtn = e.target.closest('[data-task-agenda-canvas]');
  if (taskAgendaCanvasBtn) insertTaskAgendaCanvasBoard();
  const openLocalFootprintBtn = e.target.closest('[data-open-local-footprint]');
  if (openLocalFootprintBtn) await showLocalFootprint();
  const localUpgradeMapBtn = e.target.closest('[data-local-upgrade-map]');
  if (localUpgradeMapBtn) await showUpgradeMap();
  const clearLoadedSearchCacheBtn = e.target.closest('[data-clear-loaded-search-cache]');
  if (clearLoadedSearchCacheBtn) clearLoadedSearchCacheAction();
  const runMemoryCleanupReportBtn = e.target.closest('[data-run-memory-cleanup-report]');
  if (runMemoryCleanupReportBtn) await runMemoryCleanupReport();
  const clearAllUndoHistoryBtn = e.target.closest('[data-clear-all-undo-history]');
  if (clearAllUndoHistoryBtn) clearAllUndoHistories();
  const searchCurrentFileOpenBtn = e.target.closest('[data-search-current-file-open]');
  if (searchCurrentFileOpenBtn) showCurrentFileSearch();
  const searchQueryInspectorOpenBtn = e.target.closest('[data-search-query-inspector-open]');
  if (searchQueryInspectorOpenBtn) showSearchQueryInspector();
  const searchPerformanceOpenBtn = e.target.closest('[data-search-performance-open]');
  if (searchPerformanceOpenBtn) showSearchPerformanceGuide();
  const searchProfileOpenBtn = e.target.closest('[data-search-profile-open]');
  if (searchProfileOpenBtn) showSearchProfile();
  const copyUpgradeMapMdBtn = e.target.closest('[data-copy-upgrade-map-md]');
  if (copyUpgradeMapMdBtn) await copyUpgradeMapMarkdown();
  const exportUpgradeMapMdBtn = e.target.closest('[data-export-upgrade-map-md]');
  if (exportUpgradeMapMdBtn) await exportUpgradeMapMarkdown();
  const copyUpgradeMapJsonBtn = e.target.closest('[data-copy-upgrade-map-json]');
  if (copyUpgradeMapJsonBtn) await copyUpgradeMapJson();
  const exportUpgradeMapJsonBtn = e.target.closest('[data-export-upgrade-map-json]');
  if (exportUpgradeMapJsonBtn) await exportUpgradeMapJson();
  const copyUpgradeMapCsvBtn = e.target.closest('[data-copy-upgrade-map-csv]');
  if (copyUpgradeMapCsvBtn) await copyUpgradeMapCsv();
  const exportUpgradeMapCsvBtn = e.target.closest('[data-export-upgrade-map-csv]');
  if (exportUpgradeMapCsvBtn) await exportUpgradeMapCsv();
  const copySearchProfileMdBtn = e.target.closest('[data-copy-search-profile-md]');
  if (copySearchProfileMdBtn) await copySearchProfileMarkdown();
  const exportSearchProfileMdBtn = e.target.closest('[data-export-search-profile-md]');
  if (exportSearchProfileMdBtn) exportSearchProfileMarkdown();
  const copySearchProfileJsonBtn = e.target.closest('[data-copy-search-profile-json]');
  if (copySearchProfileJsonBtn) await copySearchProfileJson();
  const exportSearchProfileJsonBtn = e.target.closest('[data-export-search-profile-json]');
  if (exportSearchProfileJsonBtn) exportSearchProfileJson();
  const copySearchProfileCsvBtn = e.target.closest('[data-copy-search-profile-csv]');
  if (copySearchProfileCsvBtn) await copySearchProfileCsv();
  const exportSearchProfileCsvBtn = e.target.closest('[data-export-search-profile-csv]');
  if (exportSearchProfileCsvBtn) exportSearchProfileCsv();
  const workspaceSearchPlanBtn = e.target.closest('[data-workspace-search-plan]');
  if (workspaceSearchPlanBtn) showWorkspaceSearchPlan();
  const searchResultsCanvasBtn = e.target.closest('[data-search-results-canvas]');
  if (searchResultsCanvasBtn && !searchResultsCanvasBtn.disabled) insertSearchResultsCanvasBoard();
  const currentFileSearchCanvasGuideBtn = e.target.closest('[data-current-file-search-canvas-guide]');
  if (currentFileSearchCanvasGuideBtn) insertCurrentFileSearchCanvasBoard();
  const currentFileSearchApply = e.target.closest('[data-current-file-search-apply]');
  if (currentFileSearchApply) showCurrentFileSearch(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const currentFileSearchClear = e.target.closest('[data-current-file-search-clear]');
  if (currentFileSearchClear && !currentFileSearchClear.disabled) showCurrentFileSearch('');
  const copyCurrentFileSearchMdBtn = e.target.closest('[data-copy-current-file-search-md]');
  if (copyCurrentFileSearchMdBtn && !copyCurrentFileSearchMdBtn.disabled) await copyCurrentFileSearchMarkdown(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const copyCurrentFileSearchJsonBtn = e.target.closest('[data-copy-current-file-search-json]');
  if (copyCurrentFileSearchJsonBtn && !copyCurrentFileSearchJsonBtn.disabled) await copyCurrentFileSearchJson(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const copyCurrentFileSearchCsvBtn = e.target.closest('[data-copy-current-file-search-csv]');
  if (copyCurrentFileSearchCsvBtn && !copyCurrentFileSearchCsvBtn.disabled) await copyCurrentFileSearchCsv(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const exportCurrentFileSearchMdBtn = e.target.closest('[data-export-current-file-search-md]');
  if (exportCurrentFileSearchMdBtn && !exportCurrentFileSearchMdBtn.disabled) exportCurrentFileSearchMarkdown(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const exportCurrentFileSearchJsonBtn = e.target.closest('[data-export-current-file-search-json]');
  if (exportCurrentFileSearchJsonBtn && !exportCurrentFileSearchJsonBtn.disabled) exportCurrentFileSearchJson(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const exportCurrentFileSearchCsvBtn = e.target.closest('[data-export-current-file-search-csv]');
  if (exportCurrentFileSearchCsvBtn && !exportCurrentFileSearchCsvBtn.disabled) exportCurrentFileSearchCsv(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const currentFileSearchCanvasBtn = e.target.closest('[data-current-file-search-canvas]');
  if (currentFileSearchCanvasBtn && !currentFileSearchCanvasBtn.disabled) insertCurrentFileSearchCanvasBoard(modalBodyEl.querySelector('[data-current-file-search-input]')?.value || '');
  const currentFileSearchJump = e.target.closest('[data-current-file-search-jump]');
  if (currentFileSearchJump) jumpToCurrentFileSearchMatch(currentFileSearchJump.dataset.currentFileSearchJump, currentFileSearchJump.dataset.currentFileSearchLength);
  const taskFileSetupBtn = e.target.closest('[data-task-file-setup]');
  if (taskFileSetupBtn) showTaskFileSetup();
  const taskFileInboxBtn = e.target.closest('[data-task-file-inbox]');
  if (taskFileInboxBtn) await addTaskStarterTemplate('inbox', 'Inbox');
  const taskFileWeeklyBtn = e.target.closest('[data-task-file-weekly]');
  if (taskFileWeeklyBtn) await addTaskStarterTemplate('weekly', 'Weekly plan');
  const taskFileProjectBtn = e.target.closest('[data-task-file-project]');
  if (taskFileProjectBtn) await addTaskStarterTemplate('project', 'Project kickoff');
  const taskFileReviewBtn = e.target.closest('[data-task-file-review]');
  if (taskFileReviewBtn) await addTaskStarterTemplate('review', 'Review queue');
  const taskFileQuickBtn = e.target.closest('[data-task-file-quick]');
  if (taskFileQuickBtn) await addQuickTask();
  const taskFileOpenViewBtn = e.target.closest('[data-task-file-open-view]');
  if (taskFileOpenViewBtn) await showTasksView(taskViewMode);
  const taskFileCopyStarterBtn = e.target.closest('[data-task-file-copy-starter]');
  if (taskFileCopyStarterBtn) await copyTaskFileStarterMarkdown();
  const taskFileExportStarterBtn = e.target.closest('[data-task-file-export-starter]');
  if (taskFileExportStarterBtn) exportTaskFileStarterMarkdown();
  const viewModeButton = e.target.closest('[data-view-mode]');
  if (viewModeButton) setView(viewModeButton.dataset.viewMode);
  const splitPresetButton = e.target.closest('[data-split-preset]');
  if (splitPresetButton) setSplitPreset(splitPresetButton.dataset.splitPreset);
  const splitSwapGuideButton = e.target.closest('[data-split-swap-guide]');
  if (splitSwapGuideButton) swapSplitRatio();
  const splitNudgeButton = e.target.closest('[data-split-nudge]');
  if (splitNudgeButton) adjustSplitRatio(Number(splitNudgeButton.dataset.splitNudge || 0));
  const copySelectedCanvasDetailsBtn = e.target.closest('[data-copy-selected-canvas-details]');
  if (copySelectedCanvasDetailsBtn) await copySelectedCanvasDetails();
  const copySelectedCanvasJsonBtn = e.target.closest('[data-copy-selected-canvas-json]');
  if (copySelectedCanvasJsonBtn) await copySelectedCanvasElementJson();
  const copySelectedCanvasSvgBtn = e.target.closest('[data-copy-selected-canvas-svg]');
  if (copySelectedCanvasSvgBtn) await copySelectedCanvasElementSvg();
  const insertSelectedCanvasMdBtn = e.target.closest('[data-insert-selected-canvas-md]');
  if (insertSelectedCanvasMdBtn) insertSelectedCanvasElementMarkdownIntoNote();
  const fitSelectedCanvasElementBtn = e.target.closest('[data-fit-selected-canvas-element]');
  if (fitSelectedCanvasElementBtn) fitCanvasToSelection();
  const selectedCanvasStrokeBtn = e.target.closest('[data-selected-canvas-stroke]');
  if (selectedCanvasStrokeBtn) setCanvasStrokePreset(selectedCanvasStrokeBtn.dataset.selectedCanvasStroke, selectedCanvasStrokeBtn.dataset.selectedCanvasStrokeLabel || 'custom');
  const selectedCanvasWidthDeltaBtn = e.target.closest('[data-selected-canvas-width-delta]');
  if (selectedCanvasWidthDeltaBtn) adjustSelectedCanvasWidth(Number(selectedCanvasWidthDeltaBtn.dataset.selectedCanvasWidthDelta || 0));
  const copySelectedCanvasStyleBtn = e.target.closest('[data-copy-selected-canvas-style]');
  if (copySelectedCanvasStyleBtn) copySelectedCanvasStyle();
  const applySelectedCanvasStyleBtn = e.target.closest('[data-apply-selected-canvas-style]');
  if (applySelectedCanvasStyleBtn && !applySelectedCanvasStyleBtn.disabled) applyCopiedCanvasStyle();
  const duplicateSelectedCanvasBtn = e.target.closest('[data-duplicate-selected-canvas]');
  if (duplicateSelectedCanvasBtn) duplicateSelectedCanvasElement();
  const canvasInventoryOpenBtn = e.target.closest('[data-canvas-inventory-open]');
  if (canvasInventoryOpenBtn) showCanvasInventory();
  const canvasElementInspectorOpenBtn = e.target.closest('[data-canvas-element-inspector-open]');
  if (canvasElementInspectorOpenBtn) showSelectedCanvasElementInspector();
  const canvasFitContentBtn = e.target.closest('[data-canvas-fit-content]');
  if (canvasFitContentBtn) {
    openCanvas();
    fitCanvasToContent();
  }
  const canvasClearUndoBtn = e.target.closest('[data-canvas-clear-undo]');
  if (canvasClearUndoBtn) clearCanvasUndoHistory();
  const canvasShortcutsGuideBtn = e.target.closest('[data-canvas-shortcuts-guide]');
  if (canvasShortcutsGuideBtn) showCanvasShortcutsGuide();
  const canvasInventorySelect = e.target.closest('[data-canvas-inventory-select]');
  if (canvasInventorySelect) selectCanvasInventoryElement(Number(canvasInventorySelect.dataset.canvasInventorySelect));
  const copyUiStateMdBtn = e.target.closest('[data-copy-ui-state-md]');
  if (copyUiStateMdBtn) await copyUiStateSummary();
  const exportUiStateMdBtn = e.target.closest('[data-export-ui-state-md]');
  if (exportUiStateMdBtn) exportUiStateSummary();
  const copyUiStateJsonBtn = e.target.closest('[data-copy-ui-state-json]');
  if (copyUiStateJsonBtn) await copyUiStateJson();
  const exportUiStateJsonBtn = e.target.closest('[data-export-ui-state-json]');
  if (exportUiStateJsonBtn) exportUiStateJson();
  const restoreUiStateJsonBtn = e.target.closest('[data-restore-ui-state-json]');
  if (restoreUiStateJsonBtn) await restoreUiStateJsonFromClipboard();
  const copyLayoutProfileMdBtn = e.target.closest('[data-copy-layout-profile-md]');
  if (copyLayoutProfileMdBtn) await copyLayoutProfileMarkdown();
  const exportLayoutProfileMdBtn = e.target.closest('[data-export-layout-profile-md]');
  if (exportLayoutProfileMdBtn) exportLayoutProfileMarkdown();
  const copyLayoutProfileJsonBtn = e.target.closest('[data-copy-layout-profile-json]');
  if (copyLayoutProfileJsonBtn) await copyLayoutProfileJson();
  const exportLayoutProfileJsonBtn = e.target.closest('[data-export-layout-profile-json]');
  if (exportLayoutProfileJsonBtn) exportLayoutProfileJson();
  const copyLayoutProfileCsvBtn = e.target.closest('[data-copy-layout-profile-csv]');
  if (copyLayoutProfileCsvBtn) await copyLayoutProfileCsv();
  const exportLayoutProfileCsvBtn = e.target.closest('[data-export-layout-profile-csv]');
  if (exportLayoutProfileCsvBtn) exportLayoutProfileCsv();
  const layoutGuideOpenBtn = e.target.closest('[data-layout-guide-open]');
  if (layoutGuideOpenBtn) showLayoutGuide();
  const splitWorkflowOpenBtn = e.target.closest('[data-split-workflow-open]');
  if (splitWorkflowOpenBtn) showSplitWorkflowGuide();
  const outlineJump = e.target.closest('[data-outline-jump]');
  if (outlineJump) jumpToOutlineOffset(Number(outlineJump.dataset.outlineJump || 0));
  const themeChoice = e.target.closest('[data-theme-choice]');
  if (themeChoice) {
    applyTheme(themeChoice.dataset.themeChoice);
    showPreferences();
  }
  const themeLabOpen = e.target.closest('[data-theme-lab-open]');
  if (themeLabOpen) showThemeLab();
  const themeGuideOpen = e.target.closest('[data-theme-guide-open]');
  if (themeGuideOpen) showThemeGuide();
  const assetReportOpen = e.target.closest('[data-asset-report-open]');
  if (assetReportOpen) showLightweightAssetReport();
  const themeLabChoice = e.target.closest('[data-theme-lab-choice]');
  if (themeLabChoice) {
    applyTheme(themeLabChoice.dataset.themeLabChoice);
    showThemeLab();
  }
  const workspacePresetChoice = e.target.closest('[data-workspace-preset]');
  if (workspacePresetChoice) await applyWorkspacePreset(workspacePresetChoice.dataset.workspacePreset);
  const copyThemeCatalogBtn = e.target.closest('[data-copy-theme-catalog-json]');
  if (copyThemeCatalogBtn) await copyThemeCatalogJson();
  const exportThemeCatalogBtn = e.target.closest('[data-export-theme-catalog-json]');
  if (exportThemeCatalogBtn) exportThemeCatalogJson();
  const copyThemeRecipesMdBtn = e.target.closest('[data-copy-theme-recipes-md]');
  if (copyThemeRecipesMdBtn) await copyThemeRecipesMarkdown();
  const exportThemeRecipesMdBtn = e.target.closest('[data-export-theme-recipes-md]');
  if (exportThemeRecipesMdBtn) exportThemeRecipesMarkdown();
  const copyThemeRecipesJsonBtn = e.target.closest('[data-copy-theme-recipes-json]');
  if (copyThemeRecipesJsonBtn) await copyThemeRecipesJson();
  const exportThemeRecipesJsonBtn = e.target.closest('[data-export-theme-recipes-json]');
  if (exportThemeRecipesJsonBtn) exportThemeRecipesJson();
  const taskView = e.target.closest('[data-task-view]');
  if (taskView) await showTasksView(taskView.dataset.taskView);
  const taskAgenda = e.target.closest('[data-task-agenda]');
  if (taskAgenda) await showTaskAgenda();
  const taskAdd = e.target.closest('[data-task-add]');
  if (taskAdd) await addQuickTask();
  const taskFormat = e.target.closest('[data-task-format]');
  if (taskFormat) showTaskSyntaxHelp();
  const taskSourceProfile = e.target.closest('[data-task-source-profile]');
  if (taskSourceProfile) await showTaskSourceProfile();
  const copyTaskSourceProfileMd = e.target.closest('[data-copy-task-source-profile-md]');
  if (copyTaskSourceProfileMd) await copyTaskSourceProfileMarkdown();
  const exportTaskSourceProfileMd = e.target.closest('[data-export-task-source-profile-md]');
  if (exportTaskSourceProfileMd) await exportTaskSourceProfileMarkdown();
  const copyTaskSourceProfileJson = e.target.closest('[data-copy-task-source-profile-json]');
  if (copyTaskSourceProfileJson) await copyTaskSourceProfileJson();
  const exportTaskSourceProfileJson = e.target.closest('[data-export-task-source-profile-json]');
  if (exportTaskSourceProfileJson) await exportTaskSourceProfileJson();
  const copyTaskSourceProfileCsv = e.target.closest('[data-copy-task-source-profile-csv]');
  if (copyTaskSourceProfileCsv) await copyTaskSourceProfileCsv();
  const exportTaskSourceProfileCsv = e.target.closest('[data-export-task-source-profile-csv]');
  if (exportTaskSourceProfileCsv) await exportTaskSourceProfileCsv();
  const taskExportMd = e.target.closest('[data-task-export-md]');
  if (taskExportMd) await exportTasksMarkdown();
  const taskCopySourceMd = e.target.closest('[data-task-copy-source-md]');
  if (taskCopySourceMd) await copyVisibleTasksSourceMarkdown();
  const taskExportSourceMd = e.target.closest('[data-task-export-source-md]');
  if (taskExportSourceMd) await exportTasksSourceMarkdown();
  const taskCopyJson = e.target.closest('[data-task-copy-json]');
  if (taskCopyJson && !taskCopyJson.dataset.taskCopyJson) await copyVisibleTasksJson();
  const taskExportJson = e.target.closest('[data-task-export-json]');
  if (taskExportJson) await exportTasksJson();
  const taskCopyCsv = e.target.closest('[data-task-copy-csv]');
  if (taskCopyCsv && !taskCopyCsv.dataset.taskCopyCsv) await copyVisibleTasksCsv();
  const taskExportCsv = e.target.closest('[data-task-export-csv]');
  if (taskExportCsv) await exportTasksCsv();
  const taskCopyTodo = e.target.closest('[data-task-copy-todo]');
  if (taskCopyTodo && !taskCopyTodo.dataset.taskCopyTodo) await copyVisibleTasksTodoTxt();
  const taskExportTodo = e.target.closest('[data-task-export-todo]');
  if (taskExportTodo) await exportTasksTodoTxt();
  const taskCopySummary = e.target.closest('[data-task-copy-summary]');
  if (taskCopySummary) await copyTaskViewSummary();
  const taskCopySummaryJson = e.target.closest('[data-task-copy-summary-json]');
  if (taskCopySummaryJson) await copyTaskViewSummaryJson();
  const taskCopySummaryCsv = e.target.closest('[data-task-copy-summary-csv]');
  if (taskCopySummaryCsv) await copyTaskViewSummaryCsv();
  const taskExportSummary = e.target.closest('[data-task-export-summary]');
  if (taskExportSummary) await exportTaskViewSummaryMarkdown();
  const taskExportSummaryJson = e.target.closest('[data-task-export-summary-json]');
  if (taskExportSummaryJson) await exportTaskViewSummaryJson();
  const taskExportSummaryCsv = e.target.closest('[data-task-export-summary-csv]');
  if (taskExportSummaryCsv) await exportTaskViewSummaryCsv();
  const taskCopyIcs = e.target.closest('[data-task-copy-ics]');
  if (taskCopyIcs && !taskCopyIcs.dataset.taskCopyIcs) await copyVisibleTasksIcs();
  const taskExport = e.target.closest('[data-task-export]');
  if (taskExport) await exportTasksIcs();
  const taskFilterBtn = e.target.closest('[data-task-filter]');
  if (taskFilterBtn) {
    taskFilter = taskFilterBtn.dataset.taskFilter || 'all';
    localStorage.setItem('markpad-task-filter', taskFilter);
    await showTasksView(taskViewMode);
  }
  const taskSourceBtn = e.target.closest('[data-task-source-filter]');
  if (taskSourceBtn) {
    setTaskSourceFilter(taskSourceBtn.dataset.taskSourceFilter || 'all');
    await showTasksView(taskViewMode);
  }
  const taskResetFilters = e.target.closest('[data-task-reset-filters]');
  if (taskResetFilters) await resetTaskViewFilters();
  const taskSearchApply = e.target.closest('[data-task-search-apply]');
  if (taskSearchApply) {
    const input = modalBodyEl.querySelector('[data-task-search]');
    taskQuery = String(input?.value || '').trim();
    localStorage.setItem('markpad-task-query', taskQuery);
    await showTasksView(taskViewMode);
  }
  const taskSearchClear = e.target.closest('[data-task-search-clear]');
  if (taskSearchClear && !taskSearchClear.disabled) {
    taskQuery = '';
    localStorage.removeItem('markpad-task-query');
    await showTasksView(taskViewMode);
  }
  const taskQueryExample = e.target.closest('[data-task-query-example]');
  if (taskQueryExample) {
    const input = modalBodyEl.querySelector('[data-task-search]');
    const example = taskQueryExample.dataset.taskQueryExample || '';
    const current = String(input?.value || '').trim();
    taskQuery = current ? `${current} ${example}` : example;
    localStorage.setItem('markpad-task-query', taskQuery);
    await showTasksView(taskViewMode);
  }
  const taskToggle = e.target.closest('[data-task-toggle]');
  if (taskToggle) await toggleLoadedTask(taskToggle.dataset.taskToggle);
  const taskOpen = e.target.closest('[data-task-open]');
  if (taskOpen) await openLoadedTask(taskOpen.dataset.taskOpen);
  const taskCopy = e.target.closest('[data-task-copy]');
  if (taskCopy) await copySingleTaskMarkdown(taskCopy.dataset.taskCopy);
  const taskCopyJson = e.target.closest('[data-task-copy-json]');
  if (taskCopyJson) await copySingleTaskJson(taskCopyJson.dataset.taskCopyJson);
  const taskCopyIcs = e.target.closest('[data-task-copy-ics]');
  if (taskCopyIcs) await copySingleTaskIcs(taskCopyIcs.dataset.taskCopyIcs);
  const taskCopyCsv = e.target.closest('[data-task-copy-csv]');
  if (taskCopyCsv) await copySingleTaskCsv(taskCopyCsv.dataset.taskCopyCsv);
  const taskCopyTodo = e.target.closest('[data-task-copy-todo]');
  if (taskCopyTodo) await copySingleTaskTodoTxt(taskCopyTodo.dataset.taskCopyTodo);
  const trashRestore = e.target.closest('[data-trash-restore]');
  if (trashRestore) await restoreDraftTrash(trashRestore.dataset.trashRestore);
  const trashCopy = e.target.closest('[data-trash-copy]');
  if (trashCopy) await copyDraftTrashItem(trashCopy.dataset.trashCopy);
  const trashCopyJson = e.target.closest('[data-trash-copy-json]');
  if (trashCopyJson) await copyDraftTrashItemJson(trashCopyJson.dataset.trashCopyJson);
  const trashDelete = e.target.closest('[data-trash-delete]');
  if (trashDelete) await deleteDraftTrashItem(trashDelete.dataset.trashDelete);
  const fileTrashRestore = e.target.closest('[data-file-trash-restore]');
  if (fileTrashRestore && window.go?.main?.App?.RestoreFileTrash) {
    renderSession(await window.go.main.App.RestoreFileTrash(fileTrashRestore.dataset.fileTrashRestore));
    loadContent(await window.go.main.App.GetActiveContent());
    modalOverlay.classList.add('hidden');
    statusText.textContent = 'File restored from Trash';
  }
  const fileTrashCopyPath = e.target.closest('[data-file-trash-copy-path]');
  if (fileTrashCopyPath) await copyFileTrashPath(fileTrashCopyPath.dataset.fileTrashCopyPath);
  const fileTrashCopyJson = e.target.closest('[data-file-trash-copy-json]');
  if (fileTrashCopyJson) await copyFileTrashItemJson(fileTrashCopyJson.dataset.fileTrashCopyJson);
  const fileTrashDelete = e.target.closest('[data-file-trash-delete]');
  if (fileTrashDelete && window.go?.main?.App?.DeleteFileTrash) {
    const itemId = fileTrashDelete.dataset.fileTrashDelete;
    const item = (await loadFileTrash()).find(entry => entry.id === itemId);
    const label = item?.title || item?.name || item?.originalPath || 'file';
    if (!confirmPermanentTrashAction(`Permanently delete "${label}" from Trash? This cannot be undone.`)) {
      statusText.textContent = 'Permanent delete cancelled';
      return;
    }
    await window.go.main.App.DeleteFileTrash(itemId);
    await showTrashView();
    statusText.textContent = 'Trash file permanently deleted';
  }
  const trashCleanExpired = e.target.closest('[data-trash-clean-expired]');
  if (trashCleanExpired) await cleanupExpiredTrash();
  const trashGuide = e.target.closest('[data-trash-guide]');
  if (trashGuide) showTrashGuide();
  const trashAudit = e.target.closest('[data-trash-audit]');
  if (trashAudit) await showTrashRetentionAudit();
  const trashCleanupProfile = e.target.closest('[data-trash-cleanup-profile]');
  if (trashCleanupProfile) await showTrashCleanupProfile();
  const copyTrashCleanupMd = e.target.closest('[data-copy-trash-cleanup-md]');
  if (copyTrashCleanupMd) await copyTrashCleanupProfileMarkdown();
  const exportTrashCleanupMd = e.target.closest('[data-export-trash-cleanup-md]');
  if (exportTrashCleanupMd) await exportTrashCleanupProfileMarkdown();
  const copyTrashCleanupJson = e.target.closest('[data-copy-trash-cleanup-json]');
  if (copyTrashCleanupJson) await copyTrashCleanupProfileJson();
  const exportTrashCleanupJson = e.target.closest('[data-export-trash-cleanup-json]');
  if (exportTrashCleanupJson) await exportTrashCleanupProfileJson();
  const copyTrashCleanupCsv = e.target.closest('[data-copy-trash-cleanup-csv]');
  if (copyTrashCleanupCsv) await copyTrashCleanupProfileCsv();
  const exportTrashCleanupCsv = e.target.closest('[data-export-trash-cleanup-csv]');
  if (exportTrashCleanupCsv) await exportTrashCleanupProfileCsv();
  const trashCopyReport = e.target.closest('[data-trash-copy-report]');
  if (trashCopyReport && !trashCopyReport.disabled) await copyTrashReportMarkdown();
  const trashExportReport = e.target.closest('[data-trash-export-report]');
  if (trashExportReport && !trashExportReport.disabled) await exportTrashReportMarkdown();
  const trashCopyCsv = e.target.closest('[data-trash-copy-csv]');
  if (trashCopyCsv && !trashCopyCsv.disabled) await copyTrashReportCsv();
  const trashExportCsv = e.target.closest('[data-trash-export-csv]');
  if (trashExportCsv && !trashExportCsv.disabled) await exportTrashReportCsv();
  const trashCopyJson = e.target.closest('[data-trash-copy-json]');
  if (trashCopyJson && !trashCopyJson.disabled) await copyTrashReportJson();
  const trashExportJson = e.target.closest('[data-trash-export-json]');
  if (trashExportJson && !trashExportJson.disabled) await exportTrashReportJson();
  const trashEmpty = e.target.closest('[data-trash-empty]');
  if (trashEmpty && !trashEmpty.disabled) await emptyAllTrash();
  const localChoose = e.target.closest('[data-local-folder-choose]');
  if (localChoose) await chooseLocalFolder();
  const localWorkspaceSetup = e.target.closest('[data-local-workspace-setup]');
  if (localWorkspaceSetup) await showLocalWorkspaceSetupGuide();
  const localFolderOpen = e.target.closest('[data-local-folder-open]');
  if (localFolderOpen && !localFolderOpen.disabled) await openConfiguredLocalFolder();
  const localFolderReveal = e.target.closest('[data-local-folder-reveal]');
  if (localFolderReveal && !localFolderReveal.disabled) await revealActiveFile();
  const localRecent = e.target.closest('[data-local-folder-recent]');
  if (localRecent && !localRecent.disabled) await showRecentLocalFiles();
  const localClear = e.target.closest('[data-local-folder-clear]');
  if (localClear && !localClear.disabled && window.go?.main?.App?.ClearLocalFolder) {
    await window.go.main.App.ClearLocalFolder();
    await showLocalFolder();
  }
  const localNew = e.target.closest('[data-local-folder-new]');
  if (localNew && !localNew.disabled) await createLocalFolderNote();
  const localTasks = e.target.closest('[data-local-folder-tasks]');
  if (localTasks && !localTasks.disabled) showTaskFileSetup();
  const localDaily = e.target.closest('[data-local-folder-daily]');
  if (localDaily && !localDaily.disabled) await createLocalFolderDailyNote();
  const localWeekly = e.target.closest('[data-local-folder-weekly]');
  if (localWeekly && !localWeekly.disabled) await createLocalFolderWeeklyNote();
  const localCanvas = e.target.closest('[data-local-folder-canvas]');
  if (localCanvas && !localCanvas.disabled) await createLocalFolderCanvas();
  const localSearch = e.target.closest('[data-local-folder-search]');
  if (localSearch && !localSearch.disabled) await searchLocalFolderPrompt();
  const localSearchApply = e.target.closest('[data-local-folder-search-apply]');
  if (localSearchApply && !localSearchApply.disabled) {
    const input = modalBodyEl.querySelector('[data-local-folder-query]');
    await showLocalFolder(String(input?.value || '').trim());
  }
  const localSearchClear = e.target.closest('[data-local-folder-search-clear]');
  if (localSearchClear && !localSearchClear.disabled) await showLocalFolder('');
  const localTags = e.target.closest('[data-local-folder-tags]');
  if (localTags && !localTags.disabled) await showLocalTags();
  const localTagSearch = e.target.closest('[data-local-tag-search]');
  if (localTagSearch) await showLocalFolder(localTagSearch.dataset.localTagSearch || '');
  const localLinks = e.target.closest('[data-local-folder-links]');
  if (localLinks && !localLinks.disabled) await showLocalLinks();
  const localMap = e.target.closest('[data-local-folder-map]');
  if (localMap && !localMap.disabled) await createLocalLinksCanvas();
  const localLinkSearch = e.target.closest('[data-local-link-search]');
  if (localLinkSearch) await showLocalFolder(localLinkSearch.dataset.localLinkSearch || '');
  const localBacklinks = e.target.closest('[data-local-folder-backlinks]');
  if (localBacklinks && !localBacklinks.disabled) await showActiveBacklinks();
  const localOpen = e.target.closest('[data-local-open]');
  if (localOpen) await openLocalFolderFile(localOpen.dataset.localOpen);
});

modalBodyEl.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.closest('[data-task-search]')) {
    e.preventDefault();
    taskQuery = String(e.target.value || '').trim();
    localStorage.setItem('markpad-task-query', taskQuery);
    await showTasksView(taskViewMode);
    return;
  }
  if (e.target.closest('[data-current-file-search-input]')) {
    e.preventDefault();
    showCurrentFileSearch(String(e.target.value || '').trim());
    return;
  }
  if (e.target.closest('[data-local-folder-query]')) {
    e.preventDefault();
    await showLocalFolder(String(e.target.value || '').trim());
  }
});

function parseDocumentOutline(content) {
  const outline = [];
  const lines = String(content || '').split('\n');
  let offset = 0;
  let inFence = false;
  let fenceMarker = '';
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    const fence = line.match(/^(\s*)(```|~~~)/);
    if (fence) {
      const marker = fence[2];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ''; }
      offset += line.length + 1;
      continue;
    }
    if (!inFence) {
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (match) {
        const text = match[2].replace(/\s+#*$/, '').trim();
        if (text) {
          outline.push({
            level: match[1].length,
            text,
            line: lineNumber,
            offset,
          });
        }
      }
    }
    offset += line.length + 1;
  }
  return outline;
}

function renderDocumentOutlineRows(outline) {
  if (!outline.length) return '<div class="outline-empty">No Markdown headings found in the active document.</div>';
  return `<div class="outline-list">${outline.map(item => `
    <button class="outline-row" style="--outline-depth:${Math.max(0, item.level - 1)}" data-outline-jump="${item.offset}">
      <span class="outline-level">H${item.level}</span>
      <span class="outline-text">${escapeHtml(item.text)}</span>
      <span class="outline-line">Line ${item.line + 1}</span>
    </button>
  `).join('')}</div>`;
}

function showDocumentOutline() {
  const active = cachedNotes.find(n => n.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  if (isReadOnlyType(type)) {
    showModal('Document Outline', '<div class="outline-empty">The active file is read-only, so no editable Markdown outline is available.</div>');
    return;
  }
  const outline = parseDocumentOutline(currentContent);
  showModal('Document Outline', `
    <div class="outline-summary">${outline.length} heading${outline.length === 1 ? '' : 's'} - parsed locally from the active editor buffer.</div>
    ${renderDocumentOutlineRows(outline)}
  `, true);
}

async function copyDocumentOutlineMarkdown() {
  const active = cachedNotes.find(n => n.id === activeId);
  const type = getFileType(active?.path, active?.kind);
  if (isReadOnlyType(type)) {
    statusText.textContent = 'No editable Markdown outline to copy';
    return;
  }
  const outline = parseDocumentOutline(currentContent);
  if (!outline.length) {
    statusText.textContent = 'No headings to copy';
    return;
  }
  if (!navigator.clipboard?.writeText) {
    statusText.textContent = 'Clipboard unavailable';
    return;
  }
  const title = active?.title || basename(active?.path || '') || 'Untitled';
  const lines = [`# ${title} Outline`, ''];
  outline.forEach(item => {
    const indent = '  '.repeat(Math.max(0, item.level - 1));
    lines.push(`${indent}- H${item.level} ${item.text} (line ${item.line + 1})`);
  });
  await navigator.clipboard.writeText(lines.join('\n') + '\n');
  statusText.textContent = `${outline.length} heading${outline.length === 1 ? '' : 's'} copied`;
}

function jumpToOutlineOffset(offset) {
  if (!Number.isFinite(offset)) return;
  if (viewMode === 'viewer') setView('split');
  modalOverlay.classList.add('hidden');
  editor.focus();
  const pos = Math.max(0, Math.min(currentContent.length, offset));
  editor.selectionStart = editor.selectionEnd = pos;
  statusText.textContent = 'Jumped to heading';
}


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

async function buildLocalSettingsSnapshot() {
  const settings = {};
  for (const key of LOCAL_SETTINGS_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) settings[key] = value;
  }
  let localFolder = {};
  if (window.go?.main?.App?.GetLocalFolder) {
    try { localFolder = await window.go.main.App.GetLocalFolder(); } catch {}
  }
  return {
    type: 'markpad-local-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    localFolder: {
      path: localFolder?.path || '',
      missing: !!localFolder?.missing,
    },
    settings,
    omitted: ['draft contents', 'trash contents', 'canvas document body', 'version history'],
  };
}

async function exportLocalSettings() {
  const snapshot = await buildLocalSettingsSnapshot();
  downloadText('markpad-local-settings.json', 'application/json', JSON.stringify(snapshot, null, 2) + '\n');
  statusText.textContent = 'Local settings exported';
}

async function copyLocalSettings() {
  const snapshot = await buildLocalSettingsSnapshot();
  await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2) + '\n');
  statusText.textContent = 'Local settings copied';
}

function importLocalSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const snapshot = JSON.parse(await file.text());
      if (snapshot?.type !== 'markpad-local-settings' || !snapshot.settings || typeof snapshot.settings !== 'object') {
        statusText.textContent = 'Invalid Markpad settings file';
        return;
      }
      let count = 0;
      for (const key of LOCAL_SETTINGS_KEYS) {
        const value = snapshot.settings[key];
        if (typeof value !== 'string' || value.length > 20000) continue;
        localStorage.setItem(key, value);
        count++;
      }
      applyImportedLocalSettings();
      statusText.textContent = `Imported ${count} local setting${count === 1 ? '' : 's'}`;
      if (!modalOverlay.classList.contains('hidden')) await showPreferences();
    } catch (err) {
      statusText.textContent = 'Settings import failed: ' + (err.message || err);
    }
  }, { once: true });
  input.click();
}

function applyImportedLocalSettings() {
  currentTheme = localStorage.getItem('markpad-theme') || currentTheme;
  searchScope = localStorage.getItem('markpad-search-scope') || searchScope;
  if (!['loaded', 'local', 'all'].includes(searchScope)) searchScope = 'loaded';
  localStorage.setItem('markpad-search-scope', searchScope);
  searchRecentQueries = loadSearchRecentQueries();
  commandRecentIds = loadCommandRecentIds();
  taskViewMode = localStorage.getItem('markpad-task-view') || taskViewMode;
  taskFilter = localStorage.getItem('markpad-task-filter') || taskFilter;
  taskQuery = localStorage.getItem('markpad-task-query') || '';
  taskSourceFilter = normalizeTaskSourceFilter(localStorage.getItem('markpad-task-source-filter') || 'all');
  canvasTool = localStorage.getItem('markpad-canvas-tool') || canvasTool;
  canvasGridVisible = localStorage.getItem('markpad-canvas-grid') !== '0';
  canvasSnapToGrid = localStorage.getItem('markpad-canvas-snap') === '1';
  canvasMinimapVisible = localStorage.getItem('markpad-canvas-minimap') !== '0';
  canvasGridSize = normalizeCanvasGridSize(localStorage.getItem('markpad-canvas-grid-size') || String(canvasGridSize));
  focusMode = localStorage.getItem('markpad-focus') === '1';
  compactMode = localStorage.getItem('markpad-compact') === '1';
  splitRatio = parseFloat(localStorage.getItem('markpad-split-ratio') || String(splitRatio));
  splitRatio = normalizeSplitRatio(splitRatio);
  localStorage.setItem('markpad-split-ratio', String(splitRatio));
  editorSoftWrap = localStorage.getItem('markpad-editor-wrap') === '1';
  editorReadingWidth = localStorage.getItem('markpad-editor-reading-width') === '1';
  fontSize = parseInt(localStorage.getItem('markpad-zoom') || String(fontSize), 10);
  if (!Number.isFinite(fontSize)) fontSize = ZOOM_DEFAULT;
  fontSize = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fontSize));
  localStorage.setItem('markpad-zoom', String(fontSize));
  applyTheme(currentTheme, true);
  applyZoom(true);
  applyEditorWrap(true);
  applyEditorReadingWidth(true);
  applyFocusMode(true);
  applyCompactMode(true);
  applySectionState();
  updateSearchScopeButtons();
  renderSearchRecents();
  if (canvasActive) {
    setCanvasTool(canvasTool);
    updateCanvasOptionButtons();
    renderCanvas();
  }
}

async function showPreferences() {
  const storagePath = await window.go.main.App.GetStoragePath();
  const localInfo = window.go?.main?.App?.GetLocalFolder ? await window.go.main.App.GetLocalFolder() : {};
  const themeButtons = THEMES.map(theme => `<button data-theme-choice="${theme.id}" data-theme-mode="${theme.mode}" class="pref-theme${theme.id === currentTheme ? ' active' : ''}" aria-pressed="${theme.id === currentTheme ? 'true' : 'false'}">${theme.label}</button>`).join('');
  showModal('Preferences', `
    <h3 style="margin-top:0;margin-bottom:8px;font-size:13px;font-weight:700;">Appearance</h3>
    <div class="pref-theme-grid">${themeButtons}</div>
    <p style="margin-top:8px;"><button class="pref-inline-action" data-theme-lab-open>Open Theme Lab</button></p>
    <p style="margin-top:8px;">Themes are CSS-variable only, so they add polish without images, icon fonts, or runtime dependencies.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;margin-top:8px;">
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Focus</td><td style="padding:4px 6px;">${focusMode ? 'Enabled' : 'Disabled'} · command-driven writing chrome</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Compact</td><td style="padding:4px 6px;">${compactMode ? 'Enabled' : 'Disabled'} · tighter sidebar, toolbar, search, tasks, and canvas controls</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Soft wrap</td><td style="padding:4px 6px;">${editorSoftWrap ? 'Enabled' : 'Disabled'} · visual only</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Reading width</td><td style="padding:4px 6px;">${editorReadingWidth ? 'Enabled' : 'Disabled'} · constrained editor/preview lane</td></tr>
      <tr><td style="padding:4px 6px;font-weight:600;">Zoom / Split</td><td style="padding:4px 6px;">${Math.round(fontSize / ZOOM_DEFAULT * 100)}% · ${Math.round(splitRatio)}/${Math.round(100 - splitRatio)}</td></tr>
    </table>
    <h3 style="margin-top:14px;margin-bottom:8px;font-size:13px;font-weight:700;">Local Workspace</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Default folder</td><td style="padding:4px 6px;word-break:break-all;">${localInfo?.path ? escapeHtml(localInfo.path) : 'Not set'}${localInfo?.missing ? ' <span style="color:#c54b33;font-weight:700;">(missing)</span>' : ''}</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Search scope</td><td style="padding:4px 6px;">${escapeHtml(searchScope)} · Loaded / Local / All</td></tr>
      <tr><td style="padding:4px 6px;font-weight:600;">Local tools</td><td style="padding:4px 6px;">Notes, daily/weekly notes, tasks, recents, tags, links, backlinks, canvas maps</td></tr>
    </table>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
      <button data-local-folder-choose style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Choose local folder</button>
      <button data-local-workspace-setup style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Setup guide</button>
      <button data-local-folder-clear ${localInfo?.path ? '' : 'disabled'} style="border:1px solid var(--border);background:var(--editor);color:var(--danger);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Clear local folder</button>
      <button data-export-local-settings style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Export settings</button>
      <button data-copy-local-settings style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Copy settings</button>
      <button data-import-local-settings style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;">Import settings</button>
    </div>
    <h3 style="margin-top:14px;margin-bottom:8px;font-size:13px;font-weight:700;">File Handling</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Markdown</td><td style="padding:4px 6px;">Editor, Split, Preview, formatting toolbar</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Code</td><td style="padding:4px 6px;">Editor + syntax-highlighted Code View</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Text</td><td style="padding:4px 6px;">Direct editor with line/word stats</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">PDF</td><td style="padding:4px 6px;">Rendered pages via pdf.js (read-only)</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Image</td><td style="padding:4px 6px;">Inline preview (read-only)</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Canvas</td><td style="padding:4px 6px;">Native .markcanvas.json export, local JSON canvas view, Obsidian/JSON Canvas import/export, Excalidraw import/export, SVG, PNG viewport/full export, Markdown summary, Write to active .markcanvas.json/.canvas/JSON/draft</td></tr>
      <tr><td style="padding:4px 6px;font-weight:600;">Ebook/Office/Archive</td><td style="padding:4px 6px;">Info card + Open Externally</td></tr>
    </table>
    <h3 style="margin-top:14px;margin-bottom:8px;font-size:13px;font-weight:700;">Canvas</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Grid</td><td style="padding:4px 6px;">${canvasGridVisible ? 'Visible' : 'Hidden'} · ${canvasGridSize}px · stored locally</td></tr>
      <tr style="border-bottom:1px solid #e8e6df;"><td style="padding:4px 6px;font-weight:600;">Snap</td><td style="padding:4px 6px;">${canvasSnapToGrid ? 'Enabled' : 'Disabled'} · ${canvasGridSize}px grid for new shapes/text</td></tr>
      <tr><td style="padding:4px 6px;font-weight:600;">Minimap</td><td style="padding:4px 6px;">${canvasMinimapVisible ? 'Visible' : 'Hidden'} · simplified bounds only</td></tr>
    </table>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Sidebar</h3>
    <p>Favorites, Open, and Recent are collapsible sections. Open files are reorderable tabs with close buttons. Right-click for context actions.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Tasks and Trash</h3>
    <p>Tasks are plain Markdown checkboxes. Deleted drafts and saved files move to local Trash with 30-day retention before permanent cleanup.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Single Instance</h3>
    <p>Only one Markpad window runs at a time. Opening a file while Markpad is running adds it to the existing window.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Storage</h3>
    <p style="font-size:11px;word-break:break-all;color:#6b6e68;">${storagePath}</p>
    <p>Session, drafts, and version history are stored locally. No cloud, no telemetry.</p>
    <h3 style="margin-top:14px;margin-bottom:6px;font-size:13px;font-weight:700;">Performance</h3>
    <p>PDFs render page-by-page via pdf.js (~500 KB CDN). No full PDF engine bundled. Syntax highlighting caps at 5000 lines. Diffs cap at 5000 lines. Local Footprint reports undo snapshot memory, and command palette cleanup actions can release editor/canvas undo history. This keeps the binary under 10 MB and memory low.</p>
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
  window.runtime.EventsOn('menu:help', showHelpModal);
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
    applyEditorWrap(true);
    applyEditorReadingWidth(true);
    applyTheme(currentTheme, true);
    applyFocusMode(true);
    applyCompactMode(true);
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
