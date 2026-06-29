# ShreyamNotes for Raycast

Search notes from Raycast and open them in ShreyamNotes or a floating window.

## Requirements

- macOS
- Raycast
- ShreyamNotes desktop app
- ShreyamNotes CLI installed as `zen`

Install the CLI from ShreyamNotes Settings -> CLI, then install the Raycast extension from the `Raycast Extension` section on the same settings page. The app installs the extension locally; it does not require the Raycast Store review.

The local app installer also needs Node.js 22.14 or newer and Bun 1.3.14 or newer available from your login shell. To verify the CLI manually:

```sh
zen list
```

## Local Development

```sh
bun install --frozen-lockfile
bun run dev
```

Run the Raycast command named "Search Notes". Selecting a result opens:

```text
zennotes://open?path=<vault-relative-note-path>
```

The desktop app handles that URL and opens the note in an existing tab or a new tab.

The "Open in Floating Window" action opens:

```text
zennotes://open-window?path=<vault-relative-note-path>
```

The command also includes:

- Folder and tag filters in the search bar dropdown
- Archive and unarchive actions
- Move to Trash with confirmation
- Reveal in Finder, Copy Note Path, and Copy Wikilink actions

Quick note creation is intentionally not part of this extension. Fast capture stays inside ShreyamNotes and the `zen` CLI; Raycast focuses on search, open, and note lifecycle actions.
