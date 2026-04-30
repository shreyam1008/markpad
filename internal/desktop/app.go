package desktop

import (
	"fmt"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gioui.org/app"
	"gioui.org/layout"
	"gioui.org/op"
	"gioui.org/op/clip"
	"gioui.org/op/paint"
	"gioui.org/text"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"

	"markpad/internal/preview"
	"markpad/internal/session"
)

const appName = "markpad"
const version = "0.2.0-dev"

type viewMode int

const (
	viewSource viewMode = iota
	viewPreview
)

type pageMode int

const (
	pageEditor pageMode = iota
	pageHelp
	pageAbout
	pageSettings
)

type menuKind int

const (
	menuNone menuKind = iota
	menuFile
	menuView
	menuHelp
)

type App struct {
	store *session.Store
	sess  *session.Session

	notes     map[string]*noteState
	bookmarks map[string]*bookmarkState

	mode viewMode
	page pageMode

	openMenu   menuKind
	saveAsOpen bool

	sidebar  layout.List
	preview  layout.List
	pageList layout.List

	newButton        widget.Clickable
	saveButton       widget.Clickable
	saveAsButton     widget.Clickable
	cancelButton     widget.Clickable
	collapseButton   widget.Clickable
	sourceTab        widget.Clickable
	previewTab       widget.Clickable
	modalCloseButton widget.Clickable

	fileMenuButton widget.Clickable
	viewMenuButton widget.Clickable
	helpMenuButton widget.Clickable

	fileNewItem      widget.Clickable
	fileSaveItem     widget.Clickable
	fileSaveAsItem   widget.Clickable
	fileBookmarkItem widget.Clickable
	viewSourceItem   widget.Clickable
	viewPreviewItem  widget.Clickable
	viewSettingsItem widget.Clickable
	viewSidebarItem  widget.Clickable
	helpHelpItem     widget.Clickable
	helpAboutItem    widget.Clickable

	reducedMotionToggle widget.Clickable
	compactModeToggle   widget.Clickable

	saveAsEditor widget.Editor
	saveAsSubmit widget.Clickable
	saveAsCancel widget.Clickable

	status   string
	statusAt time.Time
}

type noteState struct {
	doc *session.Document

	editor widget.Editor
	row    widget.Clickable
	star   widget.Clickable

	pendingDraft bool
	lastFlush    time.Time
	committed    string
	lastPreview  string
	blocks       []preview.Block
}

type bookmarkState struct {
	bookmark *session.Bookmark
	row      widget.Clickable
}

func Run(paths []string) error {
	store, err := session.NewStore(appName)
	if err != nil {
		return err
	}
	sess, err := store.Load()
	if err != nil {
		return err
	}

	ui := NewApp(store, sess)
	for _, path := range paths {
		ui.OpenPath(path)
	}

	w := new(app.Window)
	w.Option(
		app.Title("Markpad"),
		app.Size(unit.Dp(1180), unit.Dp(760)),
		app.MinSize(unit.Dp(720), unit.Dp(480)),
	)

	th := material.NewTheme()
	th.Palette.Bg = palette.surface
	th.Palette.Fg = palette.text
	th.Palette.ContrastBg = palette.accent
	th.Palette.ContrastFg = palette.accentText

	var ops op.Ops
	for {
		switch e := w.Event().(type) {
		case app.DestroyEvent:
			ui.Flush()
			return e.Err
		case app.FrameEvent:
			gtx := app.NewContext(&ops, e)
			ui.Layout(gtx, th)
			e.Frame(gtx.Ops)
		}
	}
}

func NewApp(store *session.Store, sess *session.Session) *App {
	ui := &App{
		store:     store,
		sess:      sess,
		notes:     make(map[string]*noteState),
		bookmarks: make(map[string]*bookmarkState),
		mode:      viewPreview,
		page:      pageEditor,
		sidebar:   layout.List{Axis: layout.Vertical},
		preview:   layout.List{Axis: layout.Vertical},
		pageList:  layout.List{Axis: layout.Vertical},
	}
	ui.saveAsEditor.SingleLine = true
	for _, doc := range sess.Documents {
		ui.ensureNote(doc)
	}
	for _, bookmark := range sess.Bookmarks {
		ui.ensureBookmark(bookmark)
	}
	ui.setStatus(fmt.Sprintf("Drafts: %s", store.Root()))
	return ui
}

func (a *App) OpenPath(path string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		a.setStatus(fmt.Sprintf("Could not open %s: %v", path, err))
		return
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	doc := a.sess.AddFile(path, string(data))
	note := a.ensureNote(doc)
	note.editor.SetText(string(data))
	note.committed = string(data)
	note.pendingDraft = true
	a.flushNote(note)
	a.page = pageEditor
	a.mode = viewPreview
	a.setStatus("Opened " + filepath.Base(path))
}

func (a *App) Layout(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.background)
	a.handleToolbarActions(gtx)
	if active := a.activeNote(); active != nil {
		a.handleEditorEvents(gtx, active)
	}
	a.flushPending(false)

	return layout.Stack{Alignment: layout.NW}.Layout(gtx,
		layout.Expanded(func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					return a.layoutMenuBar(gtx, th)
				}),
				layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
					gtx.Constraints.Min = gtx.Constraints.Max
					return layout.Flex{Axis: layout.Horizontal}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							if a.sess.Preferences.SidebarCollapsed {
								width := gtx.Dp(unit.Dp(52))
								gtx.Constraints.Min.X = width
								gtx.Constraints.Max.X = width
								return a.layoutCollapsedSidebar(gtx, th)
							}
							widthDp := unit.Dp(276)
							if a.sess.Preferences.CompactMode {
								widthDp = unit.Dp(238)
							}
							width := gtx.Dp(widthDp)
							gtx.Constraints.Min.X = width
							gtx.Constraints.Max.X = width
							return a.layoutSidebar(gtx, th)
						}),
						layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
							gtx.Constraints.Min = gtx.Constraints.Max
							return a.layoutMain(gtx, th)
						}),
					)
				}),
			)
		}),
		layout.Stacked(func(gtx layout.Context) layout.Dimensions {
			if a.openMenu == menuNone {
				return layout.Dimensions{}
			}
			return layout.Inset{Top: unit.Dp(42), Left: unit.Dp(8)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				gtx.Constraints.Min.X = gtx.Dp(unit.Dp(248))
				gtx.Constraints.Max.X = gtx.Dp(unit.Dp(248))
				return a.layoutOpenMenu(gtx, th)
			})
		}),
		layout.Stacked(func(gtx layout.Context) layout.Dimensions {
			if a.saveAsOpen {
				return a.layoutSaveAsModal(gtx, th)
			}
			if a.page != pageEditor {
				return a.layoutModalPage(gtx, th)
			}
			return layout.Dimensions{}
		}),
	)
}

func (a *App) Flush() {
	a.flushPending(true)
	_ = a.store.Save(a.sess)
}

func (a *App) activeNote() *noteState {
	doc := a.sess.Active()
	if doc == nil {
		return nil
	}
	return a.ensureNote(doc)
}

func (a *App) ensureNote(doc *session.Document) *noteState {
	if note := a.notes[doc.ID]; note != nil {
		note.doc = doc
		return note
	}
	content, err := a.store.ReadDraft(doc)
	if err != nil {
		content = ""
		a.status = "Could not read draft: " + err.Error()
	}
	note := &noteState{
		doc:       doc,
		lastFlush: time.Now(),
		committed: content,
	}
	note.editor.WrapPolicy = text.WrapHeuristically
	note.editor.SetText(content)
	a.notes[doc.ID] = note
	if content == "" {
		note.pendingDraft = true
	}
	return note
}

func (a *App) ensureBookmark(bookmark *session.Bookmark) *bookmarkState {
	if state := a.bookmarks[bookmark.ID]; state != nil {
		state.bookmark = bookmark
		return state
	}
	state := &bookmarkState{bookmark: bookmark}
	a.bookmarks[bookmark.ID] = state
	return state
}

func (a *App) handleToolbarActions(gtx layout.Context) {
	if a.newButton.Clicked(gtx) {
		a.newNote()
	}
	if a.saveButton.Clicked(gtx) {
		a.saveActive()
	}
	if a.saveAsButton.Clicked(gtx) {
		a.openSaveAs()
	}
	if a.cancelButton.Clicked(gtx) {
		a.cancelActiveChanges()
	}
	if a.collapseButton.Clicked(gtx) {
		a.toggleSidebar()
	}
	if a.modalCloseButton.Clicked(gtx) {
		a.page = pageEditor
		a.saveAsOpen = false
	}
	if a.sourceTab.Clicked(gtx) {
		a.showEditor(viewSource)
	}
	if a.previewTab.Clicked(gtx) {
		a.showEditor(viewPreview)
	}
	if a.fileMenuButton.Clicked(gtx) {
		a.toggleMenu(menuFile)
	}
	if a.viewMenuButton.Clicked(gtx) {
		a.toggleMenu(menuView)
	}
	if a.helpMenuButton.Clicked(gtx) {
		a.toggleMenu(menuHelp)
	}
	if a.fileNewItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.newNote()
	}
	if a.fileSaveItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.saveActive()
	}
	if a.fileSaveAsItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.openSaveAs()
	}
	if a.fileBookmarkItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.toggleActiveBookmark()
	}
	if a.viewSourceItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.showEditor(viewSource)
	}
	if a.viewPreviewItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.showEditor(viewPreview)
	}
	if a.viewSettingsItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.page = pageSettings
		a.setStatus("Settings")
	}
	if a.viewSidebarItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.toggleSidebar()
	}
	if a.helpHelpItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.page = pageHelp
		a.setStatus("Help")
	}
	if a.helpAboutItem.Clicked(gtx) {
		a.openMenu = menuNone
		a.page = pageAbout
		a.setStatus("About Markpad")
	}
	if a.reducedMotionToggle.Clicked(gtx) {
		a.sess.Preferences.ReducedMotion = !a.sess.Preferences.ReducedMotion
		_ = a.store.Save(a.sess)
		a.setStatus("Reduced motion updated")
	}
	if a.compactModeToggle.Clicked(gtx) {
		a.sess.Preferences.CompactMode = !a.sess.Preferences.CompactMode
		_ = a.store.Save(a.sess)
		a.setStatus("Compact mode updated")
	}
	if a.saveAsCancel.Clicked(gtx) {
		a.saveAsOpen = false
		a.setStatus("Save as cancelled")
	}
	if a.saveAsSubmit.Clicked(gtx) {
		a.submitSaveAs()
	}
}

func (a *App) newNote() {
	doc := session.NewDocument("", "# Untitled\n\n")
	a.sess.Add(doc)
	note := a.ensureNote(doc)
	note.pendingDraft = true
	a.flushNote(note)
	a.page = pageEditor
	a.mode = viewSource
	a.setStatus("New draft created")
}

func (a *App) showEditor(mode viewMode) {
	a.mode = mode
	a.page = pageEditor
}

func (a *App) toggleMenu(kind menuKind) {
	if a.openMenu == kind {
		a.openMenu = menuNone
		return
	}
	a.openMenu = kind
}

func (a *App) toggleSidebar() {
	a.sess.Preferences.SidebarCollapsed = !a.sess.Preferences.SidebarCollapsed
	_ = a.store.Save(a.sess)
	if a.sess.Preferences.SidebarCollapsed {
		a.setStatus("Sidebar collapsed")
		return
	}
	a.setStatus("Sidebar expanded")
}

func (a *App) handleEditorEvents(gtx layout.Context, note *noteState) {
	for {
		ev, ok := note.editor.Update(gtx)
		if !ok {
			break
		}
		if _, changed := ev.(widget.ChangeEvent); changed {
			content := note.editor.Text()
			note.doc.Title = session.TitleFromContent(content, note.doc.Path)
			note.doc.Dirty = true
			note.doc.UpdatedAt = time.Now()
			note.pendingDraft = true
			if bookmark := a.sess.FindBookmark(note.doc.Path); bookmark != nil {
				bookmark.Title = note.doc.Title
			}
		}
	}
}

func (a *App) flushPending(force bool) {
	for _, note := range a.notes {
		if !note.pendingDraft {
			continue
		}
		if !force && time.Since(note.lastFlush) < 350*time.Millisecond {
			continue
		}
		a.flushNote(note)
	}
}

func (a *App) flushNote(note *noteState) {
	if err := a.store.WriteDraft(note.doc, note.editor.Text()); err != nil {
		a.setStatus("Draft save failed: " + err.Error())
		return
	}
	note.pendingDraft = false
	note.lastFlush = time.Now()
	_ = a.store.Save(a.sess)
}

func (a *App) saveActive() {
	note := a.activeNote()
	if note == nil {
		return
	}
	if note.doc.Path == "" {
		a.openSaveAs()
		return
	}
	if err := a.store.SaveToDisk(note.doc, note.editor.Text()); err != nil {
		a.setStatus("Save failed: " + err.Error())
		return
	}
	note.pendingDraft = false
	note.committed = note.editor.Text()
	_ = a.store.Save(a.sess)
	a.setStatus("Saved " + filepath.Base(note.doc.Path))
}

func (a *App) openSaveAs() {
	note := a.activeNote()
	if note == nil {
		return
	}
	path := note.doc.Path
	if path == "" {
		path = defaultSaveAsPath(note.doc.Title)
	}
	a.saveAsEditor.SetText(path)
	a.saveAsOpen = true
	a.openMenu = menuNone
	a.setStatus("Choose where to save this note")
}

func (a *App) submitSaveAs() {
	note := a.activeNote()
	if note == nil {
		a.saveAsOpen = false
		return
	}
	path := strings.TrimSpace(a.saveAsEditor.Text())
	if err := a.store.SaveAs(note.doc, path, note.editor.Text()); err != nil {
		a.setStatus("Save as failed: " + err.Error())
		return
	}
	note.pendingDraft = false
	note.committed = note.editor.Text()
	a.saveAsOpen = false
	_ = a.store.Save(a.sess)
	a.setStatus("Saved as " + filepath.Base(note.doc.Path))
}

func (a *App) cancelActiveChanges() {
	note := a.activeNote()
	if note == nil {
		return
	}
	note.editor.SetText(note.committed)
	note.doc.Title = session.TitleFromContent(note.committed, note.doc.Path)
	note.doc.Dirty = note.doc.Path == ""
	note.pendingDraft = true
	a.flushNote(note)
	a.setStatus("Changes reverted")
}

func (a *App) toggleActiveBookmark() {
	note := a.activeNote()
	if note == nil {
		return
	}
	a.toggleNoteBookmark(note)
}

func (a *App) toggleNoteBookmark(note *noteState) {
	if note.doc.Path == "" {
		a.setStatus("Save this note to a file before starring")
		return
	}
	if a.sess.ToggleBookmark(note.doc.Path, note.editor.Text()) {
		if bookmark := a.sess.FindBookmark(note.doc.Path); bookmark != nil {
			a.ensureBookmark(bookmark)
		}
		a.setStatus("Starred " + filepath.Base(note.doc.Path))
	} else {
		a.setStatus("Unstarred")
	}
	_ = a.store.Save(a.sess)
}

func (a *App) setStatus(message string) {
	a.status = message
	a.statusAt = time.Now()
}

func (a *App) layoutSidebar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.sidebar)
	return layout.UniformInset(unit.Dp(16)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						btn := material.Button(th, &a.newButton, "+ New")
						btn.CornerRadius = unit.Dp(8)
						btn.Inset = layout.Inset{Top: unit.Dp(7), Bottom: unit.Dp(7), Left: unit.Dp(12), Right: unit.Dp(12)}
						btn.Background = palette.accent
						btn.Color = palette.accentText
						return btn.Layout(gtx)
					}),
					layout.Flexed(1, layout.Spacer{}.Layout),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutSoftButton(gtx, th, &a.collapseButton, "<<")
					}),
				)
			}),
			layout.Rigid(layout.Spacer{Height: unit.Dp(14)}.Layout),
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				count := len(a.sess.Documents) + len(a.sess.Bookmarks)
				if len(a.sess.Bookmarks) > 0 {
					count += 2
				} else {
					count++
				}
				return a.sidebar.Layout(gtx, count, func(gtx layout.Context, i int) layout.Dimensions {
					if len(a.sess.Bookmarks) > 0 {
						if i == 0 {
							return a.layoutSectionLabel(gtx, th, "Favorites")
						}
						if i <= len(a.sess.Bookmarks) {
							bookmark := a.sess.Bookmarks[i-1]
							state := a.ensureBookmark(bookmark)
							if state.row.Clicked(gtx) {
								a.OpenPath(bookmark.Path)
							}
							return a.layoutBookmarkRow(gtx, th, state)
						}
						if i == len(a.sess.Bookmarks)+1 {
							return a.layoutSectionLabel(gtx, th, "Notes")
						}
						i -= len(a.sess.Bookmarks) + 2
					} else {
						if i == 0 {
							return a.layoutSectionLabel(gtx, th, "Notes")
						}
						i--
					}
					doc := a.sess.Documents[i]
					note := a.ensureNote(doc)
					if note.row.Clicked(gtx) {
						a.sess.ActiveID = doc.ID
						a.page = pageEditor
						_ = a.store.Save(a.sess)
					}
					if note.star.Clicked(gtx) {
						a.toggleNoteBookmark(note)
					}
					return a.layoutNoteRow(gtx, th, note)
				})
			}),
		)
	})
}

func (a *App) layoutCollapsedSidebar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.sidebar)
	return layout.Inset{Top: unit.Dp(12), Bottom: unit.Dp(12), Left: unit.Dp(8), Right: unit.Dp(8)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Vertical, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutSoftButton(gtx, th, &a.collapseButton, ">>")
			}),
			layout.Rigid(layout.Spacer{Height: unit.Dp(12)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutSoftButton(gtx, th, &a.newButton, "+")
			}),
		)
	})
}

func (a *App) layoutSectionLabel(gtx layout.Context, th *material.Theme, value string) layout.Dimensions {
	return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(6)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		label := material.Caption(th, value)
		label.Color = palette.muted
		return label.Layout(gtx)
	})
}

func (a *App) layoutNoteRow(gtx layout.Context, th *material.Theme, note *noteState) layout.Dimensions {
	height := gtx.Dp(unit.Dp(54))
	gtx.Constraints.Min.Y = height
	gtx.Constraints.Max.Y = height

	selected := a.sess.ActiveID == note.doc.ID
	return note.row.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if note.row.Hovered() && !a.sess.Preferences.ReducedMotion {
			gtx.Execute(op.InvalidateCmd{})
		}
		if selected {
			fillRounded(gtx, palette.selected, 8)
		} else if note.row.Hovered() {
			fillRounded(gtx, palette.hover, 8)
		}
		return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(10), Right: unit.Dp(6)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
				layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							title := material.Body2(th, note.doc.Title)
							title.Color = palette.text
							title.MaxLines = 1
							title.Truncator = "..."
							return title.Layout(gtx)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							status := "saved"
							statusColor := palette.muted
							if note.doc.Dirty {
								status = "not saved"
								statusColor = palette.unsaved
							}
							if note.doc.Path == "" {
								status = "draft"
								statusColor = palette.unsaved
							}
							label := material.Caption(th, status)
							label.Color = statusColor
							label.MaxLines = 1
							return label.Layout(gtx)
						}),
					)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					if note.doc.Path == "" {
						return layout.Dimensions{}
					}
					starred := a.sess.IsBookmarked(note.doc.Path)
					icon := "+"
					iconColor := palette.muted
					if starred {
						icon = "*"
						iconColor = palette.starred
					}
					return note.star.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
						label := material.Body1(th, icon)
						label.Color = iconColor
						return layout.Inset{Left: unit.Dp(4), Right: unit.Dp(4)}.Layout(gtx, label.Layout)
					})
				}),
			)
		})
	})
}

func (a *App) layoutBookmarkRow(gtx layout.Context, th *material.Theme, state *bookmarkState) layout.Dimensions {
	height := gtx.Dp(unit.Dp(58))
	if a.sess.Preferences.CompactMode {
		height = gtx.Dp(unit.Dp(50))
	}
	gtx.Constraints.Min.Y = height
	gtx.Constraints.Max.Y = height
	active := a.activeNote()
	selected := active != nil && sameDisplayPath(active.doc.Path, state.bookmark.Path)
	return state.row.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if state.row.Hovered() && !a.sess.Preferences.ReducedMotion {
			gtx.Execute(op.InvalidateCmd{})
		}
		if selected {
			fillRounded(gtx, palette.selected, 8)
		} else if state.row.Hovered() {
			fillRounded(gtx, palette.hover, 8)
		}
		return layout.UniformInset(unit.Dp(10)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					label := material.Body2(th, state.bookmark.Title)
					label.Color = palette.text
					label.MaxLines = 1
					label.Truncator = "..."
					return label.Layout(gtx)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					label := material.Caption(th, filepath.Base(filepath.Dir(state.bookmark.Path))+"/"+filepath.Base(state.bookmark.Path))
					label.Color = palette.muted
					label.MaxLines = 1
					label.Truncator = "..."
					return label.Layout(gtx)
				}),
			)
		})
	})
}

func (a *App) layoutMain(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return a.layoutTopBar(gtx, th)
		}),
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			gtx.Constraints.Min = gtx.Constraints.Max
			note := a.activeNote()
			if note == nil {
				return layout.Dimensions{Size: gtx.Constraints.Min}
			}
			switch a.mode {
			case viewPreview:
				return a.layoutPreview(gtx, th, note)
			default:
				return a.layoutEditor(gtx, th, note)
			}
		}),
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return a.layoutStatus(gtx, th)
		}),
	)
}

func (a *App) layoutMenuBar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.Inset{Top: unit.Dp(5), Bottom: unit.Dp(5), Left: unit.Dp(8), Right: unit.Dp(14)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutMenuButton(gtx, th, &a.fileMenuButton, "File", a.openMenu == menuFile)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(4)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutMenuButton(gtx, th, &a.viewMenuButton, "View", a.openMenu == menuView)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(4)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutMenuButton(gtx, th, &a.helpMenuButton, "Help", a.openMenu == menuHelp)
			}),
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				label := material.Body2(th, "Markpad")
				label.Color = palette.muted
				label.Alignment = text.Middle
				label.MaxLines = 1
				return label.Layout(gtx)
			}),
		)
	})
}

func (a *App) layoutTopBar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.Inset{Top: unit.Dp(10), Bottom: unit.Dp(10), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				title := "Untitled"
				if note := a.activeNote(); note != nil {
					title = note.doc.Title
				}
				label := material.Body1(th, title)
				label.Color = palette.text
				label.MaxLines = 1
				label.Truncator = "..."
				return label.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(10)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				note := a.activeNote()
				if note == nil || !note.doc.Dirty {
					return layout.Dimensions{}
				}
				label := material.Caption(th, "not saved")
				label.Color = palette.unsaved
				return label.Layout(gtx)
			}),
			layout.Flexed(1, layout.Spacer{}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutTab(gtx, th, &a.sourceTab, "Markdown", a.mode == viewSource)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutTab(gtx, th, &a.previewTab, "Viewer", a.mode == viewPreview)
			}),
			layout.Flexed(1, layout.Spacer{}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutSoftButton(gtx, th, &a.cancelButton, "Cancel")
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutAccentButton(gtx, th, &a.saveButton, "Save")
			}),
		)
	})
}

func (a *App) layoutMenuButton(gtx layout.Context, th *material.Theme, click *widget.Clickable, label string, selected bool) layout.Dimensions {
	btn := material.Button(th, click, label)
	btn.CornerRadius = unit.Dp(8)
	btn.Inset = layout.Inset{Top: unit.Dp(7), Bottom: unit.Dp(7), Left: unit.Dp(12), Right: unit.Dp(12)}
	if selected {
		btn.Background = palette.accent
		btn.Color = palette.accentText
	} else {
		btn.Background = palette.surface
		btn.Color = palette.text
	}
	return btn.Layout(gtx)
}

func (a *App) layoutTab(gtx layout.Context, th *material.Theme, click *widget.Clickable, label string, selected bool) layout.Dimensions {
	btn := material.Button(th, click, label)
	btn.CornerRadius = unit.Dp(8)
	btn.Inset = layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(14), Right: unit.Dp(14)}
	if selected {
		btn.Background = palette.accent
		btn.Color = palette.accentText
	} else {
		btn.Background = palette.button
		btn.Color = palette.text
	}
	return btn.Layout(gtx)
}

func (a *App) layoutSoftButton(gtx layout.Context, th *material.Theme, click *widget.Clickable, label string) layout.Dimensions {
	btn := material.Button(th, click, label)
	btn.CornerRadius = unit.Dp(8)
	btn.Inset = layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(13), Right: unit.Dp(13)}
	btn.Background = palette.button
	btn.Color = palette.text
	return btn.Layout(gtx)
}

func (a *App) layoutAccentButton(gtx layout.Context, th *material.Theme, click *widget.Clickable, label string) layout.Dimensions {
	btn := material.Button(th, click, label)
	btn.CornerRadius = unit.Dp(8)
	btn.Inset = layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(16), Right: unit.Dp(16)}
	btn.Background = palette.accent
	btn.Color = palette.accentText
	return btn.Layout(gtx)
}

func (a *App) layoutOpenMenu(gtx layout.Context, th *material.Theme) layout.Dimensions {
	return layout.Background{}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		fillRounded(gtx, palette.menu, 8)
		return layout.Dimensions{Size: gtx.Constraints.Min}
	}, func(gtx layout.Context) layout.Dimensions {
		return layout.UniformInset(unit.Dp(8)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			switch a.openMenu {
			case menuFile:
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.fileNewItem, "New note")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.fileSaveItem, "Save")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.fileSaveAsItem, "Save as...")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.fileBookmarkItem, "Bookmark file")
					}),
				)
			case menuView:
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.viewSourceItem, "Markdown")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.viewPreviewItem, "Viewer")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.viewSettingsItem, "Settings")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.viewSidebarItem, "Toggle sidebar")
					}),
				)
			case menuHelp:
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.helpHelpItem, "Help")
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return a.layoutMenuItem(gtx, th, &a.helpAboutItem, "About")
					}),
				)
			default:
				return layout.Dimensions{}
			}
		})
	})
}

func (a *App) layoutMenuItem(gtx layout.Context, th *material.Theme, click *widget.Clickable, title string) layout.Dimensions {
	height := gtx.Dp(unit.Dp(42))
	gtx.Constraints.Min.Y = height
	gtx.Constraints.Max.Y = height
	return click.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if click.Hovered() && !a.sess.Preferences.ReducedMotion {
			gtx.Execute(op.InvalidateCmd{})
			fillRounded(gtx, palette.hover, 6)
		}
		return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(10), Right: unit.Dp(10)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			label := material.Body1(th, title)
			label.Color = palette.text
			label.MaxLines = 1
			return label.Layout(gtx)
		})
	})
}

func (a *App) layoutEditor(gtx layout.Context, th *material.Theme, note *noteState) layout.Dimensions {
	return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		fillRounded(gtx, palette.editor, 8)
		return layout.UniformInset(unit.Dp(18)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			editor := material.Editor(th, &note.editor, "Write Markdown...")
			editor.TextSize = unit.Sp(16)
			editor.Color = palette.text
			editor.HintColor = palette.muted
			editor.SelectionColor = palette.selection
			return editor.Layout(gtx)
		})
	})
}

func (a *App) layoutPreview(gtx layout.Context, th *material.Theme, note *noteState) layout.Dimensions {
	source := note.editor.Text()
	if source != note.lastPreview {
		note.blocks = preview.Parse(source)
		note.lastPreview = source
	}
	return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		fillRounded(gtx, palette.editor, 8)
		return layout.UniformInset(unit.Dp(24)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return a.preview.Layout(gtx, len(note.blocks), func(gtx layout.Context, i int) layout.Dimensions {
				return layoutBlock(gtx, th, note.blocks[i])
			})
		})
	})
}

func (a *App) layoutModalPage(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, withAlpha(palette.text, 36))
	return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		gtx.Constraints.Max.X = minInt(gtx.Constraints.Max.X-gtx.Dp(unit.Dp(80)), gtx.Dp(unit.Dp(520)))
		gtx.Constraints.Max.Y = minInt(gtx.Constraints.Max.Y-gtx.Dp(unit.Dp(80)), gtx.Dp(unit.Dp(420)))
		gtx.Constraints.Min = gtx.Constraints.Max
		return layout.Background{}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			fillRounded(gtx, palette.menu, 16)
			return layout.Dimensions{Size: gtx.Constraints.Min}
		}, func(gtx layout.Context) layout.Dimensions {
			return layout.UniformInset(unit.Dp(24)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
							layout.Flexed(1, layout.Spacer{}.Layout),
							layout.Rigid(func(gtx layout.Context) layout.Dimensions {
								return a.layoutSoftButton(gtx, th, &a.modalCloseButton, "Close")
							}),
						)
					}),
					layout.Rigid(layout.Spacer{Height: unit.Dp(8)}.Layout),
					layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
						return a.layoutPage(gtx, th)
					}),
				)
			})
		})
	})
}

func (a *App) layoutSaveAsModal(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, withAlpha(palette.text, 54))
	return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		gtx.Constraints.Max.X = minInt(gtx.Constraints.Max.X-gtx.Dp(unit.Dp(48)), gtx.Dp(unit.Dp(680)))
		gtx.Constraints.Max.Y = minInt(gtx.Constraints.Max.Y-gtx.Dp(unit.Dp(48)), gtx.Dp(unit.Dp(260)))
		gtx.Constraints.Min = gtx.Constraints.Max
		return layout.Background{}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			fillRounded(gtx, palette.menu, 14)
			return layout.Dimensions{Size: gtx.Constraints.Min}
		}, func(gtx layout.Context) layout.Dimensions {
			return layout.UniformInset(unit.Dp(24)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						label := material.H5(th, "Save as")
						label.Color = palette.text
						return label.Layout(gtx)
					}),
					layout.Rigid(layout.Spacer{Height: unit.Dp(14)}.Layout),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						label := material.Caption(th, "Enter a full path. Any extension is allowed, for example .md, .markdown, .txt, .log, or none.")
						label.Color = palette.muted
						label.WrapPolicy = text.WrapHeuristically
						return label.Layout(gtx)
					}),
					layout.Rigid(layout.Spacer{Height: unit.Dp(12)}.Layout),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						fillRounded(gtx, palette.editor, 8)
						return layout.UniformInset(unit.Dp(12)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							editor := material.Editor(th, &a.saveAsEditor, "Full file path")
							editor.TextSize = unit.Sp(15)
							editor.Color = palette.text
							editor.HintColor = palette.muted
							editor.SelectionColor = palette.selection
							return editor.Layout(gtx)
						})
					}),
					layout.Flexed(1, layout.Spacer{}.Layout),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
							layout.Flexed(1, layout.Spacer{}.Layout),
							layout.Rigid(func(gtx layout.Context) layout.Dimensions {
								return a.layoutSoftButton(gtx, th, &a.saveAsCancel, "Cancel")
							}),
							layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
							layout.Rigid(func(gtx layout.Context) layout.Dimensions {
								return a.layoutSoftButton(gtx, th, &a.saveAsSubmit, "Save")
							}),
						)
					}),
				)
			})
		})
	})
}

func (a *App) layoutPage(gtx layout.Context, th *material.Theme) layout.Dimensions {
	switch a.page {
	case pageAbout:
		return a.layoutInfoPage(gtx, th, "About", []string{
			"Markpad " + version,
			"A small native Markdown notepad.",
			"Built with Go and Gio.",
			"Session store: " + a.store.Root(),
			"MIT License",
		})
	case pageSettings:
		return a.layoutSettingsPage(gtx, th)
	default:
		return a.layoutInfoPage(gtx, th, "Help", []string{
			"Open .md, .txt, or other text files from the command line or File > New.",
			"Star notes in the sidebar to pin them to Favorites.",
			"Switch between Markdown editing and Viewer with the tabs.",
			"Unsaved drafts are kept locally and restored with the session.",
			"Use File > Save As to choose any path and extension.",
		})
	}
}

func (a *App) layoutInfoPage(gtx layout.Context, th *material.Theme, title string, lines []string) layout.Dimensions {
	return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		fillRounded(gtx, palette.editor, 8)
		return layout.UniformInset(unit.Dp(28)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return a.pageList.Layout(gtx, len(lines)+1, func(gtx layout.Context, i int) layout.Dimensions {
				if i == 0 {
					return layout.Inset{Bottom: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
						label := material.H4(th, title)
						label.Color = palette.text
						label.WrapPolicy = text.WrapHeuristically
						return label.Layout(gtx)
					})
				}
				return layout.Inset{Bottom: unit.Dp(12)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
					label := material.Body1(th, lines[i-1])
					label.Color = palette.text
					label.WrapPolicy = text.WrapHeuristically
					label.LineHeightScale = 1.22
					return label.Layout(gtx)
				})
			})
		})
	})
}

func (a *App) layoutSettingsPage(gtx layout.Context, th *material.Theme) layout.Dimensions {
	lines := []layout.Widget{
		func(gtx layout.Context) layout.Dimensions {
			label := material.H4(th, "Settings")
			label.Color = palette.text
			return label.Layout(gtx)
		},
		func(gtx layout.Context) layout.Dimensions {
			return a.layoutSettingToggle(gtx, th, &a.reducedMotionToggle, "Reduced motion", a.sess.Preferences.ReducedMotion)
		},
		func(gtx layout.Context) layout.Dimensions {
			return a.layoutSettingToggle(gtx, th, &a.compactModeToggle, "Compact sidebar", a.sess.Preferences.CompactMode)
		},
	}
	return layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		fillRounded(gtx, palette.editor, 8)
		return layout.UniformInset(unit.Dp(28)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return a.pageList.Layout(gtx, len(lines), func(gtx layout.Context, i int) layout.Dimensions {
				return layout.Inset{Bottom: unit.Dp(14)}.Layout(gtx, lines[i])
			})
		})
	})
}

func (a *App) layoutSettingToggle(gtx layout.Context, th *material.Theme, click *widget.Clickable, label string, enabled bool) layout.Dimensions {
	height := gtx.Dp(unit.Dp(54))
	gtx.Constraints.Min.Y = height
	gtx.Constraints.Max.Y = height
	return click.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if click.Hovered() && !a.sess.Preferences.ReducedMotion {
			gtx.Execute(op.InvalidateCmd{})
			fillRounded(gtx, palette.hover, 8)
		}
		return layout.Inset{Top: unit.Dp(10), Bottom: unit.Dp(10), Left: unit.Dp(12), Right: unit.Dp(12)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			state := "Off"
			if enabled {
				state = "On"
			}
			return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
				layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
					title := material.Body1(th, label)
					title.Color = palette.text
					return title.Layout(gtx)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					badge := material.Body2(th, state)
					badge.Color = palette.muted
					return badge.Layout(gtx)
				}),
			)
		})
	})
}

func (a *App) layoutStatus(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.Inset{Top: unit.Dp(6), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if !a.sess.Preferences.ReducedMotion && !a.statusAt.IsZero() {
			elapsed := gtx.Now.Sub(a.statusAt)
			if elapsed >= 0 && elapsed < 850*time.Millisecond {
				gtx.Execute(op.InvalidateCmd{At: gtx.Now.Add(time.Second / 60)})
				alpha := uint8(32 - int(24*elapsed/(850*time.Millisecond)))
				fillRounded(gtx, withAlpha(palette.accent, alpha), 6)
			}
		}
		value := a.status
		if note := a.activeNote(); note != nil {
			value = value + "   " + documentStats(note.editor.Text())
		}
		label := material.Caption(th, value)
		label.Color = palette.muted
		label.MaxLines = 1
		label.Truncator = "..."
		return label.Layout(gtx)
	})
}

func layoutBlock(gtx layout.Context, th *material.Theme, block preview.Block) layout.Dimensions {
	return layout.Inset{Bottom: unit.Dp(12)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		switch block.Kind {
		case preview.Heading:
			label := headingStyle(th, block)
			label.Color = palette.text
			label.WrapPolicy = text.WrapHeuristically
			return label.Layout(gtx)
		case preview.Bullet:
			return bodyLabel(gtx, th, "- "+block.Text)
		case preview.Ordered:
			return bodyLabel(gtx, th, fmt.Sprintf("%d. %s", block.Level, block.Text))
		case preview.Task:
			marker := "[ ] "
			if block.Checked {
				marker = "[x] "
			}
			return bodyLabel(gtx, th, marker+block.Text)
		case preview.Quote:
			return quoteBlock(gtx, th, block.Text)
		case preview.Code:
			return codeBlock(gtx, th, block.Text)
		case preview.Table:
			return codeBlock(gtx, th, block.Text)
		case preview.Rule:
			gtx.Constraints.Min.Y = gtx.Dp(unit.Dp(1))
			fill(gtx, palette.rule)
			return layout.Dimensions{Size: image.Pt(gtx.Constraints.Max.X, gtx.Dp(unit.Dp(1)))}
		default:
			return bodyLabel(gtx, th, block.Text)
		}
	})
}

func headingStyle(th *material.Theme, block preview.Block) material.LabelStyle {
	switch block.Level {
	case 1:
		return material.H3(th, block.Text)
	case 2:
		return material.H4(th, block.Text)
	case 3:
		return material.H5(th, block.Text)
	default:
		return material.H6(th, block.Text)
	}
}

func bodyLabel(gtx layout.Context, th *material.Theme, value string) layout.Dimensions {
	label := material.Body1(th, value)
	label.Color = palette.text
	label.WrapPolicy = text.WrapHeuristically
	label.LineHeightScale = 1.25
	return label.Layout(gtx)
}

func quoteBlock(gtx layout.Context, th *material.Theme, value string) layout.Dimensions {
	fillRounded(gtx, palette.quote, 6)
	return layout.Inset{Top: unit.Dp(10), Bottom: unit.Dp(10), Left: unit.Dp(14), Right: unit.Dp(14)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		label := material.Body1(th, value)
		label.Color = palette.text
		label.WrapPolicy = text.WrapHeuristically
		return label.Layout(gtx)
	})
}

func codeBlock(gtx layout.Context, th *material.Theme, value string) layout.Dimensions {
	fillRounded(gtx, palette.code, 6)
	return layout.UniformInset(unit.Dp(14)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		label := material.Body2(th, value)
		label.Color = palette.codeText
		label.WrapPolicy = text.WrapGraphemes
		return label.Layout(gtx)
	})
}

func fill(gtx layout.Context, c color.NRGBA) {
	paint.FillShape(gtx.Ops, c, clip.Rect{Max: gtx.Constraints.Max}.Op())
}

func fillRounded(gtx layout.Context, c color.NRGBA, radius int) {
	rr := clip.UniformRRect(image.Rectangle{Max: gtx.Constraints.Max}, gtx.Dp(unit.Dp(radius)))
	paint.FillShape(gtx.Ops, c, rr.Op(gtx.Ops))
}

func withAlpha(c color.NRGBA, alpha uint8) color.NRGBA {
	c.A = alpha
	return c
}

func fileKind(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown", ".mkd":
		return "markdown"
	case ".txt", ".text", ".log":
		return "text"
	default:
		return "file"
	}
}

func sameDisplayPath(a string, b string) bool {
	if a == "" || b == "" {
		return false
	}
	aa, errA := filepath.Abs(a)
	bb, errB := filepath.Abs(b)
	if errA == nil {
		a = aa
	}
	if errB == nil {
		b = bb
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func documentStats(content string) string {
	lines := 1
	if content != "" {
		lines = strings.Count(content, "\n") + 1
	}
	words := len(strings.Fields(content))
	return fmt.Sprintf("%d lines, %d words, %d chars", lines, words, len(content))
}

func defaultSaveAsPath(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Untitled"
	}
	name := strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			return '-'
		default:
			return r
		}
	}, title)
	if filepath.Ext(name) == "" {
		name += ".md"
	}
	dir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(dir) == "" {
		dir = "."
	}
	return filepath.Join(dir, name)
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

var palette = struct {
	background color.NRGBA
	sidebar    color.NRGBA
	surface    color.NRGBA
	editor     color.NRGBA
	selected   color.NRGBA
	hover      color.NRGBA
	menu       color.NRGBA
	button     color.NRGBA
	accent     color.NRGBA
	accentText color.NRGBA
	text       color.NRGBA
	muted      color.NRGBA
	selection  color.NRGBA
	quote      color.NRGBA
	code       color.NRGBA
	codeText   color.NRGBA
	rule       color.NRGBA
	unsaved    color.NRGBA
	starred    color.NRGBA
}{
	background: color.NRGBA{R: 0xE7, G: 0xE5, B: 0xDF, A: 0xFF},
	sidebar:    color.NRGBA{R: 0xF2, G: 0xF0, B: 0xEA, A: 0xFF},
	surface:    color.NRGBA{R: 0xFA, G: 0xFA, B: 0xF7, A: 0xFF},
	editor:     color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFC, A: 0xFF},
	selected:   color.NRGBA{R: 0xDD, G: 0xE8, B: 0xDF, A: 0xFF},
	hover:      color.NRGBA{R: 0xE7, G: 0xEC, B: 0xE5, A: 0xFF},
	menu:       color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFC, A: 0xFF},
	button:     color.NRGBA{R: 0xEB, G: 0xED, B: 0xE8, A: 0xFF},
	accent:     color.NRGBA{R: 0x2F, G: 0x6F, B: 0x61, A: 0xFF},
	accentText: color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFB, A: 0xFF},
	text:       color.NRGBA{R: 0x21, G: 0x23, B: 0x22, A: 0xFF},
	muted:      color.NRGBA{R: 0x73, G: 0x76, B: 0x70, A: 0xFF},
	selection:  color.NRGBA{R: 0xBE, G: 0xD8, B: 0xD0, A: 0xFF},
	quote:      color.NRGBA{R: 0xEC, G: 0xF2, B: 0xF4, A: 0xFF},
	code:       color.NRGBA{R: 0x29, G: 0x2D, B: 0x32, A: 0xFF},
	codeText:   color.NRGBA{R: 0xEA, G: 0xEF, B: 0xEC, A: 0xFF},
	rule:       color.NRGBA{R: 0xD8, G: 0xD6, B: 0xCE, A: 0xFF},
	unsaved:    color.NRGBA{R: 0xC5, G: 0x79, B: 0x33, A: 0xFF},
	starred:    color.NRGBA{R: 0xD4, G: 0x9E, B: 0x2A, A: 0xFF},
}
