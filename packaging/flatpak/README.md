# Quillpane Flatpak build workspace

This directory is upstream packaging work, **not a Flathub submission PR**.
The original `packaging/linux/io.github.markpad.flatpak.yml` is a legacy draft;
use `io.github.shreyam1008.markpad.yml` here for testing.

The manifest targets GNOME 50 and Linux x86_64, pins the v0.13.3 application
source, and compiles frontend assets before the Go application. It downloads
checksum-pinned npm archives and Go module cache files before the offline build.
Bun is a build-only tool and is removed from the exported app. No dependency
install scripts are run. The generator does not change the application lockfiles.

Regenerate dependencies from the matching stable source using:

```sh
bun packaging/flatpak/generate-sources.ts
```

Run the **Flatpak offline build and smoke test** GitHub workflow. It checks the
runtime ABI, downloads sources, builds with downloads disabled and no build
network permission, validates metadata, and launches the installed package in
an isolated CI desktop. Logs and window evidence are retained as artifacts.
Successful compilation is not a claim of Flathub acceptance.

## Human checkpoints — not yet submission text

1. Once CI produces a working bundle, test it on your Linux desktop with **copies**
   of notes: open folder, edit/save, history/restore, close/reopen, and file dialogs.
   Do not test migration using the only copy of existing data.
2. The Flatpak has a new sandbox config directory. Existing native Markpad
   settings are not automatically imported. Confirm whether a migration UI is
   needed before recommending it to existing users.
3. Review the AI provenance of application code, docs and packaging. This
   directory's generator, manifest and CI preparation include AI-generated work.
   The owner must establish the history and approximate extent in the rest of
   the app; automated inspection cannot reliably infer those percentages.
4. Only after technical gates pass: the owner must personally author/open and
   manage the Flathub submission, including commit message, description and
   reviewer replies. This README must not be copied as PR text.

## Submission-readiness gates

- [ ] Offline source build and metadata validation pass.
- [ ] Actual exported application launches and renders under Flatpak.
- [ ] Human file open/save/history/restart tests pass.
- [ ] Review filesystem=home against mandatory portal requirements; remove it
  if portal-based folder/file access covers the workspace use case.
- [ ] Metadata is fetched from an immutable upstream source, not copied into
  the Flathub submission; add verified app screenshots and flathub.json.
- [ ] Verify dependency redistribution licenses and generated license exports.
- [ ] Owner completes AI provenance audit and maintenance commitment.

Policy: https://docs.flathub.org/docs/for-app-authors/requirements
