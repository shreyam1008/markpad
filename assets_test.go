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
		"data-task-move=",
		"data-task-move-status=",
		"function setTaskStatusAtIndex(markdown, taskIndex, status)",
		"function taskLineWithStatus(line, status)",
		"`due:${todayKey()}`",
		"`due:${tomorrowKey()}`",
		"'@waiting'",
		"await moveLoadedTask(taskMove.dataset.taskMove, taskMove.dataset.taskMoveStatus)",
	})

	styles, err := os.ReadFile("frontend/src/styles.css")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/styles.css", string(styles), []string{
		".task-board-row",
		".task-board-actions",
		".task-board-actions button.active",
		".task-board-actions button:disabled",
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
		`data-create-kind="task"`,
		`data-create-kind="canvas"`,
		`data-create-kind="other" disabled`,
		"Files first",
		"Open Tasks.md setup, list, calendar, kanban",
		"Native .markcanvas.json board",
		"Tasks from loaded files",
		"Canvas draft",
		`id="task-workflow-menu"`,
		`id="canvas-workflow-menu"`,
		`data-task-workflow="list"`,
		`data-task-workflow="calendar"`,
		`data-task-workflow="kanban"`,
		`data-task-workflow="quick"`,
		`data-task-workflow="setup"`,
		`data-canvas-workflow="draft"`,
		`data-canvas-workflow="new"`,
		`data-canvas-workflow="write"`,
		`data-canvas-workflow="draft-file"`,
		`data-canvas-workflow="workspace-map"`,
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
		"function hasReadyLocalFolder()",
		"const MENU_TRIGGERS = {",
		"function positionMenu(menu, anchor)",
		"menu.offsetHeight || 260",
		"menu.style.maxHeight = `${maxHeight}px`;",
		"function closeAllMenus()",
		"await createLocalFolderNote()",
		"await doNew()",
		"showTaskFileSetup()",
		"async function runTaskWorkflowAction(kind)",
		"async function runCanvasWorkflowAction(kind)",
		"await showTasksView(kind)",
		"await addQuickTask()",
		"await saveCanvasToActiveDocument()",
		"await saveCanvasAsDraft()",
		"insertLoadedWorkspaceCanvasMap()",
		"await createLocalFolderCanvas()",
		"const localNew = e.target.closest('[data-local-folder-new]');",
		"const localTasks = e.target.closest('[data-local-folder-tasks]');",
		"const localCanvas = e.target.closest('[data-local-folder-canvas]');",
		"Notes, daily/weekly notes, tasks, recents, tags, links, backlinks, canvas maps",
		"Write to active .markcanvas.json/JSON/draft",
		"Choose a local folder before creating canvas files",
		"Other file creation is coming next",
	})

	featureDecisions, err := os.ReadFile("docs/local-first-feature-decisions.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/local-first-feature-decisions.md", string(featureDecisions), []string{
		"| Create workflow | Sidebar-first explicit file-type creation for Note, Task file, Canvas, and later Other files | Tabs-first workspace model, folder-first navigation model, generic unvalidated extension creation |",
		"Markpad should keep a files-first creation surface in the sidebar.",
		"The sidebar `+ New` menu must keep the concrete file affordances visible: Note, Task file, Canvas, and a disabled Other file placeholder until the remaining rules are specified.",
		"Task file is a file workflow: open or set up `Tasks.md`, then show list, calendar, and kanban views over Markdown task lines from files.",
		"Task workflow menus should expose List, Calendar, Kanban, Quick task, and Task setup directly from the sidebar.",
		"Canvas creation must produce a native `.markcanvas.json` document. The top-bar Canvas draft remains a separate scratch surface, not the primary create path.",
		"Canvas workflow menus should expose Draft canvas, New canvas file, Write active, Save draft JSON, and Loaded files map without adding a heavy drawing dependency.",
		"Choosing a local folder is a storage prerequisite for file-backed note/canvas creation, not the default product narrative or startup mode.",
		"If open-file chips, recents, or history evolve, they remain secondary to sidebar file navigation and must not redefine Markpad as a tabs app.",
		"Do not introduce a tab system or make folder loading the default mental model.",
	})

	uiDirection, err := os.ReadFile("docs/ui-direction.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/ui-direction.md", string(uiDirection), []string{
		"Sidebar: file/source navigation plus the primary `+ New` create menu for Note, Task file, Canvas, and later Other file once validated; keep recents, favorites, local folder actions, and compact badges visible here.",
		"Create: keep the sidebar `+ New` menu explicit about Note, Task file, Canvas, and a disabled Other file placeholder until extension rules are defined.",
		`Tasks: keep the affordance framed as "Tasks from loaded files" and "Tasks.md setup, list, calendar, kanban"; list/calendar/kanban are views over Markdown files, not a separate workspace type.`,
		"Task workflow: sidebar Task actions should expose List, Calendar, Kanban, Quick task, and Task setup without introducing virtual tabs.",
		"Canvas: keep the top-bar canvas positioned as a draft scratch surface while sidebar creation writes native local canvas documents with clear Write/Draft actions.",
		"Canvas workflow: sidebar Canvas actions should distinguish Draft canvas, New canvas file, Write active, Save draft JSON, and Loaded files map.",
		"Local folder: choose/open/reveal actions should support file-backed creation and navigation, not turn the app into a folder-first shell.",
	})
}

func TestContextMenuDraftSaveAsIsGuarded(t *testing.T) {
	indexHTML, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/index.html", string(indexHTML), []string{
		`id="ctx-menu"`,
		`data-ctx="saveas"`,
		"Save As...",
		`data-ctx="folder"`,
		`data-ctx="copypath"`,
	})

	mainJS, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "frontend/src/main.js", string(mainJS), []string{
		`ctxMenu.querySelector('[data-ctx="saveas"]').style.display = hasPath ? 'none' : '';`,
		`ctxMenu.querySelector('[data-ctx="saveas"]').addEventListener('click', async () => {`,
		"if (!note || note.path) return;",
		"await window.go.main.App.SetActive(ctxNoteId);",
		"loadContent(await window.go.main.App.GetNoteContent(ctxNoteId));",
		"await doSaveAs();",
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
