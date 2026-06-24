package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var remoteCDNAndFontHosts = []string{
	"ajax.googleapis.com",
	"cdn.jsdelivr.net",
	"cdn.tailwindcss.com",
	"cdnjs.cloudflare.com",
	"code.jquery.com",
	"esm.sh",
	"fonts.bunny.net",
	"fonts.googleapis.com",
	"fonts.gstatic.com",
	"ga.jspm.io",
	"jspm.dev",
	"kit.fontawesome.com",
	"p.typekit.net",
	"rsms.me",
	"skypack.dev",
	"unpkg.com",
	"use.fontawesome.com",
	"use.typekit.net",
}

var runtimePDFOrHighlightCDNClaims = []string{
	"cdn highlight.js",
	"cdn highlightjs",
	"cdn hljs",
	"cdn pdf.js",
	"cdn pdfjs",
	"cdn pdfjs-dist",
	"highlight.js cdn",
	"highlight.js from a cdn",
	"highlightjs cdn",
	"highlightjs from a cdn",
	"hljs cdn",
	"hljs from a cdn",
	"pdf.js cdn",
	"pdf.js from a cdn",
	"pdfjs cdn",
	"pdfjs from a cdn",
	"pdfjs-dist cdn",
	"pdfjs-dist from a cdn",
}

var hostedTaskVendorMarkers = []string{
	"api.linear.app",
	"api.notion.com",
	"api.todoist.com",
	"api.trello.com",
	"app.asana.com/api",
	"asana.com/api/1.0",
	"graph.microsoft.com/v1.0/me/todo",
	"linear.app/graphql",
	"notion.so/api",
	"todoist.com/oauth",
	"trello.com/1/",
}

var referenceAppRuntimeMarkers = []string{
	"@excalidraw",
	"@tldraw",
	"browserwindow",
	"codemirror",
	"createRoot(",
	"electron-builder",
	"electron-forge",
	"from \"react\"",
	"from \"electron\"",
	"from 'react'",
	"from 'electron'",
	"react-dom",
	"require(\"electron\")",
	"require('electron')",
	"temp/zennotes",
	"zennotes",
}

var selfContainedSVGForbiddenMarkers = []string{
	"<script",
	"<foreignobject",
	"<image",
	"href=\"http://",
	"href=\"https://",
	"xlink:href=\"http://",
	"xlink:href=\"https://",
	"url(http://",
	"url(https://",
	"@font-face",
}

const (
	frontendBundledAssetTotalMaxBytes = 128 * 1024
	frontendRasterAssetMaxBytes       = 48 * 1024
	frontendVectorAssetMaxBytes       = 16 * 1024
)

func TestEmbeddedFrontendAssetsExposeIndexAtRoot(t *testing.T) {
	frontendAssets, err := fs.Sub(assets, "frontend")
	if err != nil {
		t.Fatal(err)
	}
	data, err := fs.ReadFile(frontendAssets, "index.html")
	if err != nil {
		t.Fatalf("embedded frontend root is missing index.html: %v", err)
	}
	if !strings.Contains(string(data), "src/main.js") {
		t.Fatalf("embedded index.html does not reference the Markpad frontend script")
	}
	assertTextOmits(t, "embedded frontend/index.html", string(data), remoteCDNAndFontHosts)
}

func TestFrontendRuntimeAvoidsRemoteCDNLoaders(t *testing.T) {
	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, remoteCDNAndFontHosts)
	})
}

func TestFrontendDoesNotClaimRuntimePDFOrHighlightCDNs(t *testing.T) {
	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, runtimePDFOrHighlightCDNClaims)
	})
}

func TestDocsPageAvoidsCDNFirstPaintDependencies(t *testing.T) {
	data, err := os.ReadFile("docs/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextOmits(t, "docs/index.html", string(data), remoteCDNAndFontHosts)
}

func TestGuardrailDocsAgreeOnRuntimePolicy(t *testing.T) {
	agents, err := os.ReadFile("agents.md")
	if err != nil {
		t.Fatal(err)
	}
	readme, err := os.ReadFile("README.md")
	if err != nil {
		t.Fatal(err)
	}
	budget, err := os.ReadFile("BUNDLE_BUDGET.md")
	if err != nil {
		t.Fatal(err)
	}

	assertTextIncludesAll(t, "agents.md", string(agents), []string{
		"No runtime CDN scripts or styles",
		"800 KiB warning and 900 KiB hard limit",
		"Precompiled local Tailwind CSS",
		"Local read-only card with Open Externally",
	})
	assertTextIncludesAll(t, "README.md", string(readme), []string{
		"do not require runtime CDN fetches",
		"Local read-only PDF cards with Open Externally.",
		"No runtime pdf.js/CDN renderer or bundled PDF engine",
	})
	assertTextIncludesAll(t, "BUNDLE_BUDGET.md", string(budget), []string{
		"800 KiB warning threshold and 900 KiB",
		"No runtime CDN scripts or styles.",
		"PDF: keep read-only cards with Open Externally",
	})
	assertTextOmits(t, "agents.md", strings.ToLower(string(agents)), []string{
		"tailwind css (cdn)",
		"pdf.js (cdn",
		"bundle must stay under 80 kb raw",
	})
}

func TestReferenceAppStaysQuarantinedFromRuntime(t *testing.T) {
	walkRuntimeTextFiles(t, func(path, text string) {
		assertTextOmits(t, path, strings.ToLower(text), referenceAppRuntimeMarkers)
	})
}

func walkRuntimeTextFiles(t *testing.T, visit func(path, text string)) {
	t.Helper()
	for _, root := range []string{"frontend", "internal"} {
		if err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				switch entry.Name() {
				case "dist", "node_modules", "temp":
					return filepath.SkipDir
				}
				return nil
			}
			if !isRuntimeTextFile(path) {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			visit(path, string(data))
			return nil
		}); err != nil {
			t.Fatalf("walk %s: %v", root, err)
		}
	}
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !isRuntimeTextFile(entry.Name()) {
			continue
		}
		data, err := os.ReadFile(entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		visit(entry.Name(), string(data))
	}
}

func isRuntimeTextFile(path string) bool {
	if strings.HasSuffix(path, "_test.go") {
		return false
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".css", ".go", ".html", ".js", ".json":
		return true
	default:
		return false
	}
}

func TestTaskSystemKeepsPortableMarkdownContract(t *testing.T) {
	data, err := os.ReadFile("docs/local-first-format-decisions.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/local-first-format-decisions.md", string(data), []string{
		"Use a Markdown task file as the canonical format.",
		"Task line format: GitHub-style Markdown tasks",
		"No lock-in: users can edit the task file in any Markdown editor.",
		"must be disposable and rebuilt from `tasks.md`",
	})

	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, hostedTaskVendorMarkers)
	})
}

func TestTaskRenderingBoundsAreGuarded(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)

	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"const TASK_RENDER_INITIAL = 200;",
		"const TASK_RENDER_STEP = 200;",
		"const TASK_RENDER_MAX = 1000;",
		"const limit = Math.min(TASK_RENDER_MAX, requestedLimit);",
		"capped: total > shown && shown >= TASK_RENDER_MAX",
		"if (page.capped) {",
		"Refine filters or export all visible tasks to keep the modal responsive.",
		"taskRenderLimit = Math.min(TASK_RENDER_MAX, taskRenderLimit + TASK_RENDER_STEP);",
		"renderTaskCalendar(visibleTasks, page)",
		"renderTaskBoard(visibleTasks, page)",
		"renderTaskList(visibleTasks, page)",
	})
}

func TestTaskKanbanMoveActionsStayMarkdownBacked(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"const TASK_BOARD_ACTIONS = [",
		"function renderTaskBoardActions(task)",
		"function renderTaskBoardRow(task)",
		"data-task-board-card",
		"data-task-board-column=",
		"data-task-board-empty=",
		"Drop Markdown tasks here to move them.",
		"const canMoveLocalTask = !!(task.local && window.go?.main?.App?.MoveLocalFolderTask);",
		"await window.go.main.App.MoveLocalFolderTask(task.localId, status)",
		"Drag to another board column or use the Move buttons",
		`draggable="true"`,
		"data-task-move=",
		"data-task-move-status=",
		"function setTaskStatusAtIndex(markdown, taskIndex, status)",
		"function taskLineWithStatus(line, status)",
		"`due:${todayKey()}`",
		"`due:${tomorrowKey()}`",
		"'@waiting'",
		"function clearTaskBoardDragState()",
		"modalBodyEl.addEventListener('dragstart'",
		"modalBodyEl.addEventListener('dragover'",
		"modalBodyEl.addEventListener('drop'",
		"await moveLoadedTask(taskId, status)",
		"await moveLoadedTask(taskMove.dataset.taskMove, taskMove.dataset.taskMoveStatus)",
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".task-board-row",
		`.task-board-row[draggable="true"]`,
		".task-board-row.dragging",
		".task-board .task-col[data-task-board-column]",
		".task-board .task-col.drag-over",
		".task-board .task-col.drag-over .task-board-drop-hint",
		".task-board .task-col::before",
		".task-board .task-col:nth-child(1)::before",
		".task-board .task-col:nth-child(4) h4::before",
		".task-board-actions",
		".task-board-actions button.active",
		".task-board-actions button:disabled",
		".task-board-drop-hint",
	})
}

func TestFrontendAvoidsHeavyBundledAssets(t *testing.T) {
	var total int64
	walkFrontendAssetFiles(t, func(path string, info fs.FileInfo) {
		ext := strings.ToLower(filepath.Ext(path))
		total += info.Size()
		switch ext {
		case ".woff", ".woff2", ".ttf", ".otf", ".eot":
			t.Fatalf("%s is a bundled font asset; use CSS variables, text labels, or tiny inline SVG instead", path)
		case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico":
			if info.Size() > frontendRasterAssetMaxBytes {
				t.Fatalf("%s is %d bytes, max raster asset budget is %d bytes", path, info.Size(), frontendRasterAssetMaxBytes)
			}
		case ".svg":
			if info.Size() > frontendVectorAssetMaxBytes {
				t.Fatalf("%s is %d bytes, max SVG asset budget is %d bytes", path, info.Size(), frontendVectorAssetMaxBytes)
			}
		}
	})
	if total > frontendBundledAssetTotalMaxBytes {
		t.Fatalf("frontend bundled visual assets total %d bytes, max %d bytes", total, frontendBundledAssetTotalMaxBytes)
	}
}

func TestFrontendSVGAssetsStaySelfContained(t *testing.T) {
	walkFrontendSVGAssets(t, func(path, text string) {
		assertTextOmits(t, path, text, selfContainedSVGForbiddenMarkers)
	})
}

func TestThemeAndIconAssetDocsStayExplicit(t *testing.T) {
	uiDirection, err := os.ReadFile("docs/ui-direction.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/ui-direction.md", string(uiDirection), []string{
		"Themes: CSS-variable themes only.",
		"Do not add theme screenshots, texture PNGs, paper scans, or packaged theme variants.",
		"Icons: prefer inline SVG or short text glyphs.",
		"Do not add icon webfonts, runtime icon loaders, or framework-sized SVG/icon bundles.",
		"Every shipped SVG must stay self-contained: no external hrefs, embedded raster payloads, scripts, or font-face rules.",
	})

	featureDecisions, err := os.ReadFile("docs/local-first-feature-decisions.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/local-first-feature-decisions.md", string(featureDecisions), []string{
		"| Theme/Icon assets | CSS variables plus tiny self-contained SVG only; keep the existing asset budgets as hard guardrails | Theme screenshots, texture packs, icon webfonts, framework-scale icon bundles |",
		"Theme and icon changes must stay in CSS variables, tiny self-contained SVG, and the existing asset budgets rather than new packaged media.",
		"Do not ship theme screenshots, texture packs, icon webfonts, or framework-sized icon bundles.",
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		"/* Text-only asset polish: make file type badges read as tiny documents. */",
		".file-badge::before",
		".file-badge::after",
		"button:hover .file-badge::before",
		".theme-chip:hover::before",
		".pref-theme.active::before",
		".pref-theme-swatch",
		".pref-theme-name",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		`class="theme-lab-swatch pref-theme-swatch"`,
		`data-theme-swatch="${theme.id}"`,
		`<span class="pref-theme-name">${theme.label}</span>`,
	})
}

func TestFileBadgesStayTextOnly(t *testing.T) {
	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		"function fileIcon(path)",
		"if (!path) return 'MD';",
		"return (ext || 'TXT').slice(0, 3);",
		"ico.textContent = fileIcon(note.path);",
		"ico.textContent = fileIcon(recent.path);",
	})
}

func TestCommandPaletteGeneratedEntriesKeepBundleHeadroom(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(data), []string{
		"const COMMAND_CATEGORY_FILTERS = [",
		"const SEARCH_SCOPE_COMMANDS = [",
		"const SEARCH_QUERY_COMMANDS = [",
		"const SEARCH_TASK_QUERY_COMMANDS = [",
		"...COMMAND_CATEGORY_FILTERS.map",
		"...SEARCH_SCOPE_COMMANDS.map",
		"...SEARCH_QUERY_COMMANDS.map",
		"...SEARCH_TASK_QUERY_COMMANDS.map",
		"openCommandPaletteQuery(label === 'Task' ? 'Tasks' : label)",
		"openSearchPaletteScope(scope)",
		"openSearchPaletteQuery('all', query)",
		"'search-markdown', 'SM', 'Search Markdown files'",
		"'search-open-tasks', 'SO', 'Search open tasks'",
	})
}

func TestSearchEmptyStateGuidesNextMoves(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(data), []string{
		"function searchEmptyHtml(message, query = searchLastQuery)",
		"const scopeLabel = { loaded: 'Loaded files', local: 'Local folder', all: 'All local files' }[searchScope] || 'Loaded files';",
		`<span class="search-empty-scope">Current scope: <b>${escapeHtml(scopeLabel)}</b></span>`,
		`<span class="search-empty-group-label">Try another scope</span>`,
		`<span class="search-empty-group-label">Inspect or narrow</span>`,
		`data-search-empty-scope="${scope}"`,
		`data-search-empty-action="${action}"`,
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".search-empty-scope",
		".search-empty-scope b",
		".search-empty-group",
		".search-empty-group-label",
		".search-empty-chip.active",
	})
}

func TestSearchSyntaxStripStaysStaticAndLocalFirst(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="search-filter-hints"`,
		`aria-label="Local search syntax examples"`,
		`class="search-filter-group-label">Filters</span>`,
		`class="search-filter-group-label">Patterns</span>`,
		`data-search-example="type:md"`,
		`data-search-example="ext:md"`,
		`data-search-example="path:notes"`,
		`data-search-example="title:"`,
		`data-search-example="tag:idea"`,
		`data-search-example="task:open"`,
		`data-search-example="task:done"`,
		`data-search-example="&quot;exact phrase&quot;"`,
		`data-search-example="~fuzzy"`,
		`data-search-example="-path:archive"`,
		`data-search-example="-task:done"`,
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".search-filter-group-label",
		".search-filter-group-label:not(:first-child)",
		".search-filter-hints button:focus-visible",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		"^(path|file|title|name|type|kind|ext|tag|task):",
		"if (key === 'kind' || key === 'ext') key = 'type';",
		"else if (key === 'file') key = 'path';",
		"else if (key === 'name') key = 'title';",
	})
}

func TestCanvasContextMenuStaysNativeAndDependencyFree(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="canvas-context-menu"`,
		`class="canvas-context-menu hidden"`,
		`aria-label="Canvas selection actions"`,
		`data-canvas-context-action="duplicate"`,
		`data-canvas-context-action="copy-json"`,
		`data-canvas-context-action="copy-svg"`,
		`data-canvas-context-action="fit"`,
		`data-canvas-context-action="front"`,
		`data-canvas-context-action="back"`,
		`data-canvas-context-action="insert-md"`,
		`data-canvas-context-action="delete"`,
		"Duplicate selected",
		"Copy selected JSON",
		"Copy selected SVG",
		"Fit selected",
		"Insert as Markdown",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		"const canvasContextMenu = $('canvas-context-menu');",
		"function showCanvasContextMenu(event)",
		"function hideCanvasContextMenu()",
		"function updateCanvasContextMenuState()",
		"async function runCanvasContextAction(action)",
		"canvasStage?.addEventListener('contextmenu', showCanvasContextMenu);",
		"if (e.button !== 0) return;",
		"duplicateSelectedCanvasElement();",
		"await copySelectedCanvasElementJson();",
		"await copySelectedCanvasElementSvg();",
		"fitCanvasToSelection();",
		"moveSelectedCanvasLayer('front');",
		"moveSelectedCanvasLayer('back');",
		"insertSelectedCanvasElementMarkdownIntoNote();",
		"deleteSelectedCanvasElement();",
		"hideCanvasContextMenu();",
	})
	assertTextOmits(t, "frontend/src/main.js", strings.ToLower(string(mainJS)), referenceAppRuntimeMarkers)

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".canvas-context-menu",
		".canvas-context-menu.hidden",
		".canvas-context-menu button",
		".canvas-context-menu button:disabled",
		".canvas-context-menu button.danger",
		".canvas-context-sep",
	})
}

func TestDiagnosticActionsUseSharedClassForBudget(t *testing.T) {
	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(mainJS)
	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		`class="diag-action"`,
		`data-copy-canvas-summary-md class="diag-action"`,
		`data-export-local-settings class="diag-action"`,
	})
	assertTextOmits(t, "frontend/src/main.js", text, []string{
		`style="border:1px solid var(--border);background:var(--editor);color:var(--text);border-radius:9px;padding:5px 9px;font-size:11px;font-weight:850;cursor:pointer;"`,
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".diag-action",
		"font-weight: 850;",
	})
}

func TestCreateMenuFilesFirstWorkflowIsGuarded(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="create-menu"`,
		`aria-label="Create local file"`,
		`data-create-kind="note"`,
		`data-create-kind="daily"`,
		`data-create-kind="weekly"`,
		`data-create-kind="task"`,
		`data-create-kind="canvas"`,
		`data-menu-chip="MD"`,
		`data-menu-chip="TODAY"`,
		`data-menu-chip="TASK"`,
		`data-menu-chip="DRAW"`,
		`data-create-kind="open-folder"`,
		`data-create-kind="search-folder"`,
		`data-create-kind="other"`,
		`data-menu-chip="FILE"`,
		"Files first",
		`class="create-menu-section-label">Create</div>`,
		`class="create-menu-section-label">Workspace</div>`,
		`class="create-menu-section-label">More</div>`,
		"Today in the local folder",
		"This week in the local folder",
		"Open Tasks.md or setup list, calendar, kanban",
		"Start scratch canvas; save as .markcanvas.json when ready",
		"Create .markcanvas.json in local folder",
		"Choose extension and lightweight text template",
		"Reveal the configured local workspace",
		"Find text in the configured local workspace",
		"Tasks from loaded files",
		"Open canvas",
		"Load active .markcanvas.json, otherwise scratch",
		"Save canvas file",
		"Save current canvas to local .markcanvas.json",
		"Write canvas JSON to active .markcanvas.json/JSON/draft",
		`aria-pressed="false"`,
		`id="task-workflow-menu"`,
		`id="canvas-workflow-menu"`,
		`data-task-workflow="list"`,
		`data-task-workflow="calendar"`,
		`data-task-workflow="kanban"`,
		`data-task-workflow="quick"`,
		`data-task-workflow="setup"`,
		`data-canvas-workflow="draft"`,
		`data-canvas-workflow="new"`,
		`data-canvas-workflow="save-file"`,
		`data-canvas-workflow="write"`,
		`data-canvas-workflow="draft-file"`,
		`data-canvas-workflow="workspace-map"`,
		`data-menu-chip="OPEN"`,
		`data-menu-chip="FILE"`,
		`data-menu-chip="SAVE"`,
		`data-menu-chip="MAP"`,
		"Portable local JSON. Camera, grid, and tool state stay on this device.",
		"Write canvas to active local canvas document",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		"function createNoteFromMenu()",
		"function createCanvasFromMenu()",
		"function startScratchCanvasFromMenu()",
		"statusText.textContent = 'Scratch canvas opened'",
		"function hasReadyLocalFolder()",
		"async function ensureReadyLocalFolder(message)",
		"const MENU_TRIGGERS = {",
		"function positionMenu(menu, anchor)",
		"menu.offsetHeight || 260",
		"menu.style.maxHeight = `${maxHeight}px`;",
		"function closeAllMenus()",
		"function handleWorkflowMenuKeydown(event)",
		"function focusMenuTextMatch(menu, key)",
		"if (handleWorkflowMenuKeydown(event)) return;",
		"await createLocalFolderNote()",
		"await createLocalFolderDailyNote()",
		"await createLocalFolderWeeklyNote()",
		"await openConfiguredLocalFolder()",
		"await searchLocalFolderPrompt()",
		"await createOtherFileFromMenu()",
		"await doNew()",
		"function openTaskFileSetup()",
		"async function openTaskFileFromMenu()",
		"const target = findTaskTargetNote();",
		"await showTasksView('list')",
		"statusText.textContent = 'Task file opened'",
		"showTaskFileSetup()",
		"async function runTaskWorkflowAction(kind)",
		"function updateCanvasButtonState()",
		"async function openActiveCanvasOrDraft()",
		"getFileType(active.path, active.kind) === 'canvas'",
		"async function runCanvasWorkflowAction(kind)",
		"await showTasksView(kind)",
		"await addQuickTask()",
		"await openActiveCanvasOrDraft()",
		"await saveCanvasToActiveDocument()",
		"await saveCanvasAsDraft()",
		"async function saveCanvasAsLocalFile()",
		"await window.go.main.App.CreateLocalFolderCanvasDocument(title, json)",
		"statusText.textContent = 'Canvas saved as local file'",
		"insertLoadedWorkspaceCanvasMap()",
		"await createLocalFolderCanvas()",
		"startScratchCanvasFromMenu();",
		"function promptOtherFileModal()",
		"const OTHER_FILE_PRESETS = [",
		"data-other-file-extension=",
		"await window.go.main.App.CreateLocalFolderFile(choice.title, choice.extension)",
		"const localNew = e.target.closest('[data-local-folder-new]');",
		"const localTasks = e.target.closest('[data-local-folder-tasks]');",
		"const localCanvas = e.target.closest('[data-local-folder-canvas]');",
		"Notes, daily/weekly notes, tasks, recents, tags, links, backlinks, canvas maps",
		"Choose a local folder for canvas files",
		"Choose a local folder before creating files",
	})

	featureDecisions, err := os.ReadFile("docs/local-first-feature-decisions.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/local-first-feature-decisions.md", string(featureDecisions), []string{
		"| Create workflow | Sidebar-first explicit file-type creation for Note, Task file, Canvas, and validated Other files | Tabs-first workspace model, folder-first navigation model, generic unvalidated extension creation |",
		"Markpad should keep a files-first creation surface in the sidebar.",
		"The sidebar `+ New` menu must keep the concrete file affordances visible: Note, Daily note, Weekly note, Task file, Canvas, Open folder, Search folder, and Other file with validated text-safe extensions.",
		"Task file is a file workflow: open or set up `Tasks.md`, then show list, calendar, and kanban views over Markdown task lines from files.",
		"Task workflow menus should expose List, Calendar, Kanban, Quick task, and Task setup directly from the sidebar.",
		"File-backed canvas creation must produce a native `.markcanvas.json` document. The sidebar `+ New` Canvas action starts a scratch canvas immediately, while the Canvas workflow New canvas file action creates the local file-backed document.",
		"Canvas workflow menus should expose Open canvas, New canvas file, Save canvas file, Write active, Save draft JSON, and Loaded files map without adding a heavy drawing dependency.",
		"Choosing a local folder is a storage prerequisite for file-backed note/canvas creation, not the default product narrative or startup mode.",
		"If open-file chips, recents, or history evolve, they remain secondary to sidebar file navigation and must not redefine Markpad as a tabs app.",
		"Do not introduce a tab system or make folder loading the default mental model.",
	})

	uiDirection, err := os.ReadFile("docs/ui-direction.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/ui-direction.md", string(uiDirection), []string{
		"Sidebar: file/source navigation plus the primary `+ New` create menu for Note, Daily note, Weekly note, Task file, Canvas, Open folder, Search folder, and validated Other file; keep recents, favorites, local folder actions, and compact badges visible here.",
		"Create: keep the sidebar `+ New` menu explicit about Note, Daily note, Weekly note, Task file, Canvas, Open folder, Search folder, and Other file with validated text-safe extensions and lightweight starters.",
		`Tasks: keep the affordance framed as "Tasks from loaded files" and "Tasks.md setup, list, calendar, kanban"; list/calendar/kanban are views over Markdown files, not a separate workspace type.`,
		"Task workflow: sidebar Task actions should expose List, Calendar, Kanban, Quick task, and Task setup without introducing virtual tabs.",
		"Canvas: keep the top-bar canvas positioned as the active canvas opener; it should load the selected `.markcanvas.json` file when active and fall back to the local scratch canvas otherwise.",
		"Canvas workflow: sidebar Canvas actions should distinguish Open canvas, New canvas file, Save canvas file, Write active, Save draft JSON, and Loaded files map.",
		"Local folder: choose/open/reveal actions should support file-backed creation and navigation, not turn the app into a folder-first shell.",
	})
}

func TestWorkflowMenusStayKeyboardFirst(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(data), []string{
		"requestAnimationFrame(() => menu.querySelector('button:not(:disabled)')?.focus())",
		"function menuButtons(menu)",
		"function focusMenuButton(menu, delta)",
		"function focusMenuTextMatch(menu, key)",
		"function handleWorkflowMenuKeydown(event)",
		"case 'ArrowDown':",
		"case 'ArrowUp':",
		"case 'Home':",
		"case 'End':",
		"case 'Enter':",
		"case ' ':",
		"case 'Escape':",
		"const anchor = activeMenuAnchor;",
		"anchor?.focus?.();",
		"if (handleWorkflowMenuKeydown(event)) return;",
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".create-menu button::before",
		".workflow-menu button::before",
		".create-menu button:focus-visible::before",
		".workflow-menu button:focus-visible::before",
		".create-menu button[data-menu-chip]::after",
		".workflow-menu button[data-menu-chip]::after",
		"attr(data-menu-chip)",
		`#create-menu [data-create-kind="canvas"]`,
		"#canvas-workflow-menu [data-canvas-workflow]",
		".create-menu button:focus-visible strong",
		".workflow-menu button:focus-visible strong",
		".create-menu button:disabled::after",
		".other-file-presets",
		".other-file-presets button.active",
		".create-menu-section-label",
		".create-menu-section-label::after",
		".icon-btn.active",
		`.icon-btn[aria-pressed="true"]`,
	})
}

func TestSplitViewControlsStayPolishedAndLightweight(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="split-preset-group"`,
		`<button id="split-live-chip"`,
		`aria-label="Reset split view to 50/50"`,
		`data-split-ratio="38"`,
		`data-split-ratio="50"`,
		`data-split-ratio="62"`,
		`data-split-swap`,
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".split-preset-group",
		".split-preset-group button:focus-visible",
		".split-live-chip::before",
		`content: "Split";`,
		"#resize-divider[data-split-label]::before",
		"#resize-divider::after",
		"repeating-linear-gradient(",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		"Click to reset to 50/50",
		"Reset split view to 50/50",
	})
}

func TestNativeCanvasFilesOpenCanvasSurface(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(data), []string{
		"function isMarkpadCanvasPath(path)",
		"function updateCanvasButtonState()",
		"async function openActiveCanvasOrDraft()",
		"getFileType(active.path, active.kind) === 'canvas'",
		"await loadCurrentDocumentIntoCanvas();",
		"$('btn-canvas').addEventListener('click', openActiveCanvasOrDraft);",
		"if (getFileType(note.path, note.kind) === 'canvas') await openActiveCanvasOrDraft();",
		"if (getFileType(active?.path, active?.kind) === 'canvas') await openActiveCanvasOrDraft();",
		"btn.classList.toggle('active', !!canvasActive);",
		"btn.setAttribute('aria-pressed', canvasActive ? 'true' : 'false');",
	})

	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`title="Open canvas"`,
		`aria-label="Open canvas"`,
		`aria-pressed="false"`,
		"<strong>Open canvas</strong>",
		"Load active .markcanvas.json, otherwise scratch",
	})
}

func TestContextMenuDraftSaveAsIsGuarded(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="ctx-menu"`,
		`data-ctx="canvas"`,
		"Open Canvas",
		`data-ctx="saveas"`,
		"Save As...",
		`data-ctx="folder"`,
		`data-ctx="copypath"`,
		`data-ctx="copywikilink"`,
		`data-ctx="copyembed"`,
		"Copy Wikilink",
		"Copy Embed",
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		`ctxMenu.querySelector('[data-ctx="saveas"]').style.display = hasPath ? 'none' : '';`,
		`ctxMenu.querySelector('[data-ctx="canvas"]').style.display = isCanvas ? '' : 'none';`,
		`ctxMenu.querySelector('[data-ctx="copywikilink"]').style.display = hasPath && getFileType(note.path, note.kind) === 'md' ? '' : 'none';`,
		"let ctxLocalPath = '';",
		"function contextTargetPath()",
		"function contextWikilinkTitle()",
		"function contextEmbedTarget()",
		"function showLocalFileContextMenu(event, path)",
		`ctxMenu.querySelector('[data-ctx="copywikilink"]').style.display = getFileType(path) === 'md' ? '' : 'none';`,
		`ctxMenu.querySelector('[data-ctx="copyembed"]').style.display = '';`,
		"deleteBtn.textContent = 'Move to Trash';",
		"deleteBtn.style.display = window.go?.main?.App?.MoveLocalFolderFileToTrash ? '' : 'none';",
		"modalBodyEl.addEventListener('contextmenu', (e) => {",
		"const localRow = e.target.closest('[data-local-open]');",
		`ctxMenu.querySelector('[data-ctx="saveas"]').addEventListener('click', async () => {`,
		`ctxMenu.querySelector('[data-ctx="canvas"]').addEventListener('click', async () => {`,
		`ctxMenu.querySelector('[data-ctx="copywikilink"]').addEventListener('click', async () => {`,
		`ctxMenu.querySelector('[data-ctx="copyembed"]').addEventListener('click', async () => {`,
		"await navigator.clipboard.writeText(`[[${contextWikilinkTitle()}]]`);",
		"await navigator.clipboard.writeText(`![[${target}]]`);",
		"statusText.textContent = 'Embed copied';",
		"statusText.textContent = 'Wikilink copied';",
		"await window.go.main.App.MoveLocalFolderFileToTrash(ctxLocalPath);",
		"await showLocalFolder(localFolderQuery);",
		"statusText.textContent = 'Local file moved to Trash for 30 days';",
		"if (!note || getFileType(note.path, note.kind) !== 'canvas') {",
		"await openActiveCanvasOrDraft();",
		"statusText.textContent = 'Canvas file opened';",
		"if (!note || note.path) return;",
		"await window.go.main.App.SetActive(ctxNoteId);",
		"loadContent(await window.go.main.App.GetNoteContent(ctxNoteId));",
		"await doSaveAs();",
	})
}

func TestCanvasCreationUsesMarkpadModalPrompt(t *testing.T) {
	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(mainJS)
	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"function promptCanvasTitleModal()",
		"function resolveCanvasTitlePrompt(value)",
		"function submitCanvasTitlePrompt()",
		"const title = await promptCanvasTitleModal();",
		`data-canvas-title-input`,
		`data-canvas-title-create`,
		`data-canvas-title-cancel`,
		`New Canvas File`,
		`Canvas.markcanvas.json`,
		`e.target.closest('[data-canvas-title-input]')`,
		"resolveCanvasTitlePrompt(null);",
	})
	assertTextOmits(t, "frontend/src/main.js", text, []string{
		"window.prompt('New local canvas title')",
	})
}

func TestDraftTrashByteCapContractIsGuarded(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)

	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"const DRAFT_TRASH_BYTES = 1536 * 1024;",
		"const retained = (Array.isArray(items) ? items : []).slice(0, 80);",
		"while (retained.length && byteSize(serialized) > DRAFT_TRASH_BYTES) {",
		"retained.pop();",
		"localStorage.setItem(DRAFT_TRASH_KEY, payload.serialized);",
		"draftCapBytes: DRAFT_TRASH_BYTES",
		"draftOverCap: trashBytes > DRAFT_TRASH_BYTES",
		"Newest 80 drafts stay first; oldest drafts are trimmed to fit the byte cap",
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".trash-row.soon:hover",
		".trash-row.urgent:hover",
		".trash-row.soon::after",
		".trash-row.urgent::after",
		".trash-retention.soon::before",
		".trash-retention.urgent::before",
		".trash-actions button:disabled",
	})
}

func TestCanvasImportCapsContractIsGuarded(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)

	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"const CANVAS_IMPORT_MAX_BYTES = 4 * 1024 * 1024;",
		"const CANVAS_IMPORT_MAX_ELEMENTS = 5000;",
		"const CANVAS_IMPORT_MAX_PATH_POINTS = 10000;",
		"const CANVAS_IMPORT_MAX_TOTAL_PATH_POINTS = 200000;",
		"const CANVAS_IMPORT_MAX_FILES_BYTES = 256 * 1024;",
		"function parseCanvasImportJson(text, sourceLabel = 'canvas import', options = {})",
		"validateCanvasImportDoc(doc, sourceLabel, options);",
		"throw new Error(`${sourceLabel} has too many elements: ${elements.length} / ${maxElements}`);",
		"throw new Error(`${sourceLabel} path has too many points: ${points} / ${maxPathPoints}`);",
		"throw new Error(`${sourceLabel} embedded files are too large: ${formatBytes(filesBytes)} / ${formatBytes(maxFilesBytes)}`);",
		"canvasDoc = parseCanvasImportJson(text, 'current document canvas');",
		"parseCanvasImportJson(await navigator.clipboard.readText(), 'clipboard canvas')",
		"canvasDoc = parseCanvasImportJson(text, file.name || 'canvas file');",
		"importCaps: {",
	})
}

func TestCanvasToolbarGroupsStayStaticAndLightweight(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`<div class="canvas-actions">`,
		`<span class="canvas-action-label" aria-hidden="true">Tools</span>`,
		`<span class="canvas-action-label" aria-hidden="true">Style</span>`,
		`<span class="canvas-action-label" aria-hidden="true">Edit</span>`,
		`<span class="canvas-action-label" aria-hidden="true">View</span>`,
		`<span class="canvas-action-label" aria-hidden="true">Arrange</span>`,
		`<span class="canvas-action-label" aria-hidden="true">Export</span>`,
		`<span class="canvas-action-label" aria-hidden="true">Save</span>`,
		`data-canvas-tool="pen"`,
		`id="canvas-export-svg"`,
		`id="canvas-save-active"`,
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".canvas-action-label",
		".canvas-action-label:first-child",
		"flex-basis: 100%;",
		"border-top: 1px solid var(--border-soft);",
	})
}

func TestCanvasRenderSchedulingAndBoundsCacheAreGuarded(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)

	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"let canvasRenderFrame = 0;",
		"let canvasRenderNeedsStatus = false;",
		"function renderCanvas(options = {})",
		"const shouldUpdateStatus = options.status !== false;",
		"if (options.immediate) {",
		"canvasRenderNeedsStatus = canvasRenderNeedsStatus || shouldUpdateStatus;",
		"if (canvasRenderFrame) return;",
		"canvasRenderFrame = requestAnimationFrame(() => {",
		"renderCanvasNow({ status: updateStatus });",
		"function renderCanvasFast()",
		"renderCanvas({ status: false });",
		"if (options.status !== false) updateCanvasStatus();",
		"function resetCanvasBoundsCache()",
		"canvasBoundsCache = new WeakMap();",
		"const cached = canvasBoundsCache.get(el);",
		"canvasBoundsCache.set(el, bounds);",
		"canvasDoc.elements.filter(el => canvasElementInViewport(el, view)).forEach(el => renderCanvasElement(ctx, el));",
	})
}

func assertTextOmits(t *testing.T, path string, text string, forbidden []string) {
	t.Helper()

	lowerText := strings.ToLower(text)
	for _, value := range forbidden {
		if strings.Contains(lowerText, strings.ToLower(value)) {
			t.Fatalf("%s must not reference %q", path, value)
		}
	}
}

func assertTextIncludesAll(t *testing.T, path string, text string, required []string) {
	t.Helper()

	for _, value := range required {
		if !strings.Contains(text, value) {
			t.Fatalf("%s must include %q", path, value)
		}
	}
}

func walkStaticTextFiles(t *testing.T, root string, check func(path, text string)) {
	t.Helper()

	rootFS := os.DirFS(root)
	if err := fs.WalkDir(rootFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".vite", "build", "dist", "node_modules":
				return fs.SkipDir
			default:
				return nil
			}
		}
		if !isStaticTextFile(path) {
			return nil
		}
		data, err := fs.ReadFile(rootFS, path)
		if err != nil {
			return err
		}
		check(root+"/"+strings.TrimPrefix(path, "./"), string(data))
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func walkFrontendAssetFiles(t *testing.T, check func(path string, info fs.FileInfo)) {
	t.Helper()

	rootFS := os.DirFS("frontend")
	if err := fs.WalkDir(rootFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".vite", "build", "dist", "node_modules", "wailsjs":
				return fs.SkipDir
			default:
				return nil
			}
		}
		if !isBundledVisualAssetFile(path) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		check("frontend/"+strings.TrimPrefix(path, "./"), info)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func walkFrontendSVGAssets(t *testing.T, check func(path, text string)) {
	t.Helper()

	rootFS := os.DirFS("frontend")
	if err := fs.WalkDir(rootFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".vite", "build", "dist", "node_modules", "wailsjs":
				return fs.SkipDir
			default:
				return nil
			}
		}
		if strings.ToLower(filepath.Ext(path)) != ".svg" {
			return nil
		}
		data, err := fs.ReadFile(rootFS, path)
		if err != nil {
			return err
		}
		check("frontend/"+strings.TrimPrefix(path, "./"), string(data))
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func isStaticTextFile(path string) bool {
	for _, suffix := range []string{
		".css",
		".html",
		".js",
		".jsx",
		".mjs",
		".svelte",
		".ts",
		".tsx",
		".vue",
	} {
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}

func isBundledVisualAssetFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".bmp", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".otf", ".png", ".svg", ".ttf", ".webp", ".woff", ".woff2":
		return true
	default:
		return false
	}
}
