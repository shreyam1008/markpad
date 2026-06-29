# Use ZenNotes with Raycast on macOS

This guide shows how to install the ZenNotes Raycast extension locally from the
desktop app, search notes from Raycast, and open notes back in ZenNotes.

## Requirements

You need:

- macOS
- Raycast
- ZenNotes desktop 1.3.6 or newer
- the ZenNotes CLI installed as `zen`
- Node.js 22.14 or newer and Bun 1.3.14 or newer available from your login shell

Raycast support is macOS-only because Raycast is macOS-only.

## 1. Install the ZenNotes CLI

Open ZenNotes and go to `Settings -> CLI`.

Click `Install`.

ZenNotes prefers a user-writable PATH directory such as `~/.local/bin`, `~/bin`, or Homebrew's bin directory. If the chosen directory is not already on PATH, Settings shows the exact shell command to add it. ZenNotes only falls back to `/usr/local/bin` with an admin prompt when it cannot find a writable PATH location.

Verify the install in a new terminal:

```bash
zen list
```

If a note path contains spaces, quote it or use `--path`:

```bash
zen read "hellointerview/system design.md"
zen read --path "hellointerview/system design.md"
```

## 2. Install the Raycast extension from ZenNotes

Open ZenNotes and stay on `Settings -> CLI`.

In the `Raycast Extension` section, click `Install`.

ZenNotes installs the extension locally. It does not depend on the Raycast Store.
The installer:

- copies the bundled Raycast extension source into ZenNotes app data
- runs `bun install --frozen-lockfile` for the local extension copy
- builds the extension with Raycast tooling
- imports the local extension into Raycast
- opens Raycast's extensions page when the import finishes

The local copy lives under:

```bash
~/Library/Application Support/ZenNotes/integrations/raycast/zennotes
```

After the first install, the same button becomes `Reinstall` when the bundled
extension matches the installed copy, or `Update` when ZenNotes ships a newer
bundled extension.

Run the Raycast command named `Search Notes`.

## Local development

If you are working on the extension source from the repository instead of using
the packaged app installer, run the extension from the repo root:

```bash
cd integrations/raycast
bun install --frozen-lockfile
bun run dev
```

Raycast opens the repository copy in development mode.

## 3. Search and open notes

Use Raycast's `Search Notes` command.

The command lists notes from:

```bash
zen list --json --limit 2000
```

Selecting a result opens the note in ZenNotes through:

```text
zennotes://open?path=<vault-relative-note-path>
```

Use Raycast's action menu for:

- Open in ZenNotes
- Open in Floating Window
- Archive
- Unarchive
- Move to Trash
- Reveal in Finder
- Copy Note Path
- Copy Wikilink

The floating-window action uses:

```text
zennotes://open-window?path=<vault-relative-note-path>
```

The search bar dropdown includes folder and tag filters, so you can narrow search without leaving Raycast.

## Troubleshooting

If Raycast keeps loading:

- run `zen list` in a new terminal and make sure it prints notes
- open `Settings -> CLI` and reinstall the CLI if Raycast cannot find `zen`
- open `Settings -> CLI` and reinstall or update the Raycast extension
- restart Raycast after changing PATH

If the Raycast Extension install button is disabled:

- make sure you are using ZenNotes desktop on macOS
- install Raycast on this Mac
- install the `zen` CLI first from `Settings -> CLI`
- install Node.js 22.14 or newer and Bun 1.3.14 or newer
- reopen ZenNotes after changing your shell PATH

If opening a note fails:

- make sure ZenNotes is installed in `/Applications` or is already running
- update ZenNotes to a release that includes deep-link support
- check that the note path is vault-relative, not an absolute filesystem path

## Related docs

- [Get Started on Desktop](../tutorials/get-started-desktop.md)
- [Settings Reference](../reference/settings-reference.md)
- [Vault and Folder Model](../reference/vault-and-folder-model.md)
