# Open Markdown Files with ZenNotes

ZenNotes can open any `.md` or `.markdown` file on your computer — not just notes that live inside a vault. Double-click a file in Finder/Explorer, use "Open With", or drag it onto the ZenNotes dock/taskbar icon.

## What happens when you open a file

ZenNotes decides what to do based on where the file lives:

- **The file is inside a vault you use.** It opens as a normal note in that vault's window, with the full sidebar, tabs, and editing experience. If the vault isn't open yet, ZenNotes opens it.
- **The file is anywhere else** (for example `~/Downloads/notes.md`). It opens in a standalone editor window. You get the same editor and live preview as usual, but without a sidebar — it's just that one file, edited in place. Saving writes straight back to the original file.

This means you can keep loose markdown files wherever you like and still edit them with ZenNotes.

## Move a loose file into your vault

When a file is open in a standalone window, the header has a **Move to Vault** button. Clicking it:

1. Saves your latest edits to the original file.
2. Moves the file into your active vault (its primary notes area — the inbox, or the vault root if the vault is configured that way), renaming it if a note with the same name already exists.
3. Opens the moved note in the vault window and closes the standalone window.

If no vault is open, ZenNotes asks you to open one first, then try again.

## From the terminal

If you've installed the `zen` CLI (Settings → CLI), you can open files from a shell:

```bash
zen open ~/Downloads/notes.md
zen open inbox/Today.md other.markdown   # one or more files
```

`zen open` hands the files to the ZenNotes app, which opens each one the same way as a double-click — as a vault note if it's inside a vault, otherwise in a standalone editor window.

## Make ZenNotes the default app for markdown

Once ZenNotes is installed it registers itself as a handler for `.md` and `.markdown` files, so it shows up under "Open With". To make it the default for every markdown file:

### macOS

1. Select a `.md` file in Finder and press <kbd>Cmd</kbd>+<kbd>I</kbd> (Get Info).
2. Under **Open with**, choose **ZenNotes**.
3. Click **Change All…** to apply it to all `.md` files.

### Windows

1. Right-click a `.md` file and choose **Open with → Choose another app**.
2. Pick **ZenNotes** and check **Always use this app to open .md files**.

### Linux

The installed `.desktop` entry advertises the `text/markdown` MIME type. Set ZenNotes as the default with your file manager's "Open With" dialog, or:

```bash
xdg-mime default zennotes.desktop text/markdown
```

## The macOS "Apple could not verify…" warning

If you downloaded a markdown file from the internet (or received it via AirDrop/messaging), macOS may quarantine it and show:

> "Filename.md" Not Opened — Apple could not verify "Filename.md" is free of malware…

This is macOS Gatekeeper acting on the **file's** quarantine flag, not on ZenNotes. It typically appears when a quarantined file has no trusted default app. After you set ZenNotes (a notarized app) as the default handler for `.md` files, double-clicking routes to ZenNotes normally.

If a specific file is still blocked, clear its quarantine flag:

- **Finder:** right-click the file → **Open**, then confirm — or move it out of Downloads.
- **Terminal:**

  ```bash
  xattr -d com.apple.quarantine /path/to/Filename.md
  ```

You can also review blocked items under **System Settings → Privacy & Security**.
