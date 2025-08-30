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

type viewMode int

const (
	viewSource viewMode = iota
	viewPreview
)

type App struct {
	store *session.Store
	sess  *session.Session

	notes map[string]*noteState

	mode viewMode

	sidebar layout.List
	preview layout.List

	newButton  widget.Clickable
	saveButton widget.Clickable
	sourceTab  widget.Clickable
	previewTab widget.Clickable

	status string
}

type noteState struct {
	doc *session.Document

	editor widget.Editor
	row    widget.Clickable

	pendingDraft bool
	lastFlush    time.Time
	lastPreview  string
	blocks       []preview.Block
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
		store:   store,
		sess:    sess,
		notes:   make(map[string]*noteState),
		mode:    viewSource,
		sidebar: layout.List{Axis: layout.Vertical},
		preview: layout.List{Axis: layout.Vertical},
	}
	for _, doc := range sess.Documents {
		ui.ensureNote(doc)
	}
	ui.status = fmt.Sprintf("Drafts: %s", store.Root())
	return ui
}

func (a *App) OpenPath(path string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		a.status = fmt.Sprintf("Could not open %s: %v", path, err)
		return
	}
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	doc := a.sess.AddFile(path, string(data))
	note := a.ensureNote(doc)
	note.editor.SetText(string(data))
	note.pendingDraft = true
	a.flushNote(note)
	a.status = "Opened " + filepath.Base(path)
}

func (a *App) Layout(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.background)
	a.handleToolbarActions(gtx)
	if active := a.activeNote(); active != nil {
		a.handleEditorEvents(gtx, active)
	}
	a.flushPending(false)

	return layout.Flex{Axis: layout.Horizontal}.Layout(gtx,
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			width := gtx.Dp(unit.Dp(276))
			gtx.Constraints.Min.X = width
			gtx.Constraints.Max.X = width
			return a.layoutSidebar(gtx, th)
		}),
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			gtx.Constraints.Min = gtx.Constraints.Max
			return a.layoutMain(gtx, th)
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
	}
	note.editor.WrapPolicy = text.WrapGraphemes
	note.editor.SetText(content)
	a.notes[doc.ID] = note
	if content == "" {
		note.pendingDraft = true
	}
	return note
}

func (a *App) handleToolbarActions(gtx layout.Context) {
	if a.newButton.Clicked(gtx) {
		doc := session.NewDocument("", "# Untitled\n\n")
		a.sess.Add(doc)
		note := a.ensureNote(doc)
		note.pendingDraft = true
		a.flushNote(note)
		a.status = "New draft created"
	}
	if a.saveButton.Clicked(gtx) {
		a.saveActive()
	}
	if a.sourceTab.Clicked(gtx) {
		a.mode = viewSource
	}
	if a.previewTab.Clicked(gtx) {
		a.mode = viewPreview
	}
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
		a.status = "Draft save failed: " + err.Error()
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
		a.flushNote(note)
		a.status = "Draft autosaved. Save-as UI is in TODO.md; open with a file path to save to disk."
		return
	}
	if err := a.store.SaveToDisk(note.doc, note.editor.Text()); err != nil {
		a.status = "Save failed: " + err.Error()
		return
	}
	note.pendingDraft = false
	_ = a.store.Save(a.sess)
	a.status = "Saved " + filepath.Base(note.doc.Path)
}

func (a *App) layoutSidebar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.sidebar)
	return layout.UniformInset(unit.Dp(16)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				title := material.H6(th, "Markpad")
				title.Color = palette.text
				return title.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Height: unit.Dp(14)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				btn := material.Button(th, &a.newButton, "New note")
				btn.CornerRadius = unit.Dp(8)
				btn.Background = palette.accent
				btn.Color = palette.accentText
				return btn.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Height: unit.Dp(16)}.Layout),
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				return a.sidebar.Layout(gtx, len(a.sess.Documents), func(gtx layout.Context, i int) layout.Dimensions {
					doc := a.sess.Documents[i]
					note := a.ensureNote(doc)
					if note.row.Clicked(gtx) {
						a.sess.ActiveID = doc.ID
						_ = a.store.Save(a.sess)
					}
					return a.layoutNoteRow(gtx, th, note)
				})
			}),
		)
	})
}

func (a *App) layoutNoteRow(gtx layout.Context, th *material.Theme, note *noteState) layout.Dimensions {
	height := gtx.Dp(unit.Dp(64))
	gtx.Constraints.Min.Y = height
	gtx.Constraints.Max.Y = height

	selected := a.sess.ActiveID == note.doc.ID
	return note.row.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		if selected {
			fillRounded(gtx, palette.selected, 8)
		}
		return layout.UniformInset(unit.Dp(10)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					title := material.Body1(th, note.doc.Title)
					title.Color = palette.text
					title.MaxLines = 1
					title.Truncator = "..."
					return title.Layout(gtx)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					status := "saved"
					if note.doc.Dirty {
						status = "unsaved"
					}
					if note.doc.Path == "" {
						status += " draft"
					}
					label := material.Caption(th, status)
					label.Color = palette.muted
					label.MaxLines = 1
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

func (a *App) layoutTopBar(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.UniformInset(unit.Dp(16)).Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				note := a.activeNote()
				title := "Untitled"
				if note != nil {
					title = note.doc.Title
				}
				label := material.H6(th, title)
				label.Color = palette.text
				label.MaxLines = 1
				label.Truncator = "..."
				return label.Layout(gtx)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutTab(gtx, th, &a.sourceTab, "Markdown", a.mode == viewSource)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return a.layoutTab(gtx, th, &a.previewTab, "Viewer", a.mode == viewPreview)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(12)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				btn := material.Button(th, &a.saveButton, "Save")
				btn.CornerRadius = unit.Dp(8)
				btn.Background = palette.button
				btn.Color = palette.text
				return btn.Layout(gtx)
			}),
		)
	})
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

func (a *App) layoutStatus(gtx layout.Context, th *material.Theme) layout.Dimensions {
	fill(gtx, palette.surface)
	return layout.Inset{Top: unit.Dp(6), Bottom: unit.Dp(8), Left: unit.Dp(18), Right: unit.Dp(18)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		label := material.Caption(th, a.status)
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
		case preview.Quote:
			return quoteBlock(gtx, th, block.Text)
		case preview.Code:
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

var palette = struct {
	background color.NRGBA
	sidebar    color.NRGBA
	surface    color.NRGBA
	editor     color.NRGBA
	selected   color.NRGBA
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
}{
	background: color.NRGBA{R: 0xE7, G: 0xE5, B: 0xDF, A: 0xFF},
	sidebar:    color.NRGBA{R: 0xF2, G: 0xF0, B: 0xEA, A: 0xFF},
	surface:    color.NRGBA{R: 0xFA, G: 0xFA, B: 0xF7, A: 0xFF},
	editor:     color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFC, A: 0xFF},
	selected:   color.NRGBA{R: 0xDD, G: 0xE8, B: 0xDF, A: 0xFF},
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
}
