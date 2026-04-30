# Launch Plan

Markpad is positioned as a tiny native Markdown notepad: traditional Notepad speed, modern Markdown viewing, autosaved drafts, and no Electron.

## Messaging

- Small native Markdown notepad.
- Opens fast and restores your last session.
- Plain files stay plain.
- Markdown and Viewer tabs for every note.
- Lightweight Go desktop app with release artifacts for Linux, Windows, and macOS.

## Screenshots to capture

- Main window with sidebar, Markdown tab, and Save/Cancel toolbar.
- Viewer mode rendering headings, tasks, code, and tables.
- Save as modal.
- Help/Tour/About modal.
- Compact or collapsed sidebar.

## Places to share

- GitHub release notes.
- Hacker News `Show HN` when the app is stable enough.
- Reddit: `r/golang`, `r/opensource`, `r/markdown`, `r/linux`, `r/selfhosted` if the post is genuinely useful and not spammy.
- Dev.to or Hashnode build log about a tiny Go/Gio Markdown desktop app.
- Product Hunt only after installers, screenshots, and a polished landing page are ready.
- Linux packaging communities after AppImage and `.deb` smoke tests pass.

## Website content checklist

- Hero with one-line positioning.
- Screenshot placeholder section.
- Download buttons for Linux AppImage, Linux `.deb`, Windows `.exe`, macOS `.dmg`, and source code.
- Feature cards for native speed, session restore, Markdown viewer, drafts, and bookmarks.
- Small technical section explaining Go/Gio and no Electron.
- Link to GitHub issues for feedback.

## Stability checklist before broad launch

- Native open/save dialogs or a clearly documented current save-as path field.
- Keyboard shortcuts for New, Open, Save, Save as, Viewer, Markdown.
- File association on Linux packages.
- Manual smoke test with `.md`, `.markdown`, `.txt`, `.log`, and an extensionless file.
- Large-file benchmark notes in release docs.
