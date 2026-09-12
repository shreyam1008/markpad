# Linux publication checkpoint — 12 September 2026

The owner requested stopping local Ubuntu work and continuing from Windows.

- Snap revision 1 (v0.13.4) is on candidate/beta/edge; stable is empty.
- Installed candidate on Ubuntu 24.04. An isolated X11 display and separate Snap
  config passed launch, native file open, edit, save, process restart and restored
  document content. History displayed saved versions. Full history restore,
  folder and uninstall/reinstall acceptance remain; no stable promotion occurred.
- Flatpak PR #12 remains a draft. Run 34685706022 passed runtime ABI, pinned/offline
  build and metadata validation, but failed the portal UI step. Do not merge as
  fully verified. Builder now has a host bus; canonical runtime paths avoid the
  inaccessible temporary portal path found in a local test. No host/home grant.
- Use GitHub-hosted Ubuntu CI from Windows for follow-up work. No further local
  builds or SDK installs requested. No Flathub listing exists; provenance review
  and human-authored submission remain.

[Full Windows handoff](https://github.com/shreyam1008/buggy/blob/master/docs/projects/flagship-windows-handoff-2026-09-12.md)

Local evidence: `/home/shre/publication/2026-09-12/snap-local/acceptance.log`,
`saved.png`, `reopened.png`, `history.png`. These files do not travel through Git.
Use GitHub Actions artifacts for Flatpak evidence. Quillpane and Markpad retain
one repository, package identity, data compatibility contract and update stream.
