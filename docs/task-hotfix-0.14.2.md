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
  After reconnecting the remote desktop, vertical collapsed headings, contained
  counts, expanded card colors and keyboard column reordering passed visually.
  The session disconnected again before verifying save/reopen.
- Automated native dragging reached the target but did not move a card or column.
  A temporary diagnostic build showed `dragenter` followed by `dragend`, without
  `dragover` or `drop`. Changing WebView2's external-drop policy did not resolve
  the automated result. That speculative change and all diagnostics were removed;
  the release retains Windows' original policy. A manual Windows drag test remains
  necessary to distinguish application behavior from remote input delivery.
- Windows Graphics Capture/activation intermittently failed with `0x80070057`
  and `GetCursorPos` access denied (`0x80070005`). These are automation failures,
  not evidence that an interaction passed or that application code is defective.
- Stripped Windows executable: 18,836,992 bytes. Embedded frontend: 6,763,110 bytes.
  These are build sizes, not RAM or startup measurements.

The version checker now reads UTF-8 explicitly on Windows. Scoop compatibility
checks validate the manifest's declared version, canonical installer identity and
non-placeholder SHA256, allowing the previous verified package to remain intact
until new release artifacts exist.

Source `28334ce5a04b5ee86e257e7e7aae1adfc3be094e` and annotated tag `v0.14.2`
were pushed atomically. [Release run 34804710420](https://github.com/shreyam1008/markpad/actions/runs/34804710420)
passed its version, Linux, Windows and macOS jobs but was intentionally cancelled
before publication while the native drag result was investigated. Snap was cancelled;
publication and APT deployment did not run. [Linux CI](https://github.com/shreyam1008/markpad/actions/runs/34804709729)
passed. No 0.14.2 release assets have been published. See the
[publication checklist](../packaging/PUBLICATION-TODO.md) for actual channel states.
