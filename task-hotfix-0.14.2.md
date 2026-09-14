# Task-board hotfix 0.14.2

The patch incorporates `ae6f938e8584bdc05e7b8efcce7536849db9f173` from
`fix/ubuntu-task-board`. Linux retains GTK's native drop destination; Windows
and macOS retain their previous Wails drop policy. Active drags route pointer
events to task/column drop zones, including over buttons and empty-state text.
Collapsed headings are contained vertically, and wrapped titles reserve action
space. Cards retain the owner's preferred full-surface tint.

## Verification on 14 September 2026

- Maintainer-provided Ubuntu evidence: native card dragging, category reordering,
  collapsed-column drops, persistence, light/dark themes and narrow layouts passed.
  This is evidence for the incoming commit, not a new Linux test on this Windows host.
- Windows: frozen Bun 1.4.2 install, production frontend build, typecheck, all 93
  frontend tests, lint (existing warnings), formatting, Go tests and vet passed.
- Release metadata checker passed at 0.14.2, including MSIX and both AppStream files.
- Production Windows executable built and opened the isolated Markdown fixture.
  Desktop interaction verification could not proceed: Windows Graphics Capture
  failed with `0x80070057`, then activation failed with `GetCursorPos` access denied
  (`0x80070005`). Native Windows drag/collapse verification remains outstanding.
- Stripped Windows executable: 18,836,992 bytes. Embedded frontend: 6,763,110 bytes.
  These are build sizes, not RAM or startup measurements.

The version checker now reads UTF-8 explicitly on Windows. Scoop compatibility
checks validate the manifest's declared version, canonical installer identity and
non-placeholder SHA256, allowing the previous verified package to remain intact
until new release artifacts exist.

Release CI separately gates publication on Linux checks/native window smoke and
Windows, macOS and Snap package builds. See the
[publication checklist](../packaging/PUBLICATION-TODO.md) for actual channel states.
