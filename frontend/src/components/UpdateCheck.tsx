import { useEffect, useRef, useState } from "react";

import markURL from "../assets/markpad-mark.svg";
import { SOURCE_URL, VERSION, VERSION_NAME } from "../brand";
import { client } from "../workspace/client";
import type { UpdateInfo } from "../workspace/types";

export function UpdateCheck() {
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<UpdateInfo>();

  const [message, setMessage] = useState("");

  const [downloading, setDownloading] = useState(false);

  const [progress, setProgress] = useState(0);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(
    () =>
      window.runtime?.EventsOn("update:progress", (value) => {
        if (!value || typeof value !== "object") return;

        const update = value as { phase?: unknown; percent?: unknown };

        if (typeof update.percent === "number")
          setProgress(Math.max(0, Math.min(100, update.percent)));

        if (typeof update.phase === "string") setMessage(`${update.phase}…`);
      }),
    [],
  );

  const check = async () => {
    if (busy) return;

    setBusy(true);

    setMessage("Checking for updates…");

    setResult(undefined);

    try {
      const update = await client.checkForUpdates();

      if (!mounted.current) return;

      setResult(update);

      setMessage(
        update.available
          ? `Version ${update.latest} is available.`
          : update.latest === VERSION
            ? `You're up to date (${VERSION}).`
            : `This build (${VERSION}) is newer than the latest published release.`,
      );
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const download = async () => {
    if (busy || downloading) return;

    setDownloading(true);

    setProgress(0);

    setMessage("Preparing verified update…");

    try {
      const message = await client.downloadAndOpenUpdate();

      if (mounted.current) setMessage(message);
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      if (mounted.current) setDownloading(false);
    }
  };

  return (
    <section
      className="update-panel"
      aria-label="Application updates"
      aria-busy={busy || downloading}
    >
      <div className="update-brand">
        <img src={markURL} alt="" width="40" height="40" />
        <div>
          <h3>Quillpane</h3>
          <p>Local Markdown notepad · Formerly Markpad</p>
        </div>
      </div>
      <div className="update-versions">
        <div>
          <span>Installed version:</span>
          <strong className="version-badge">{VERSION}</strong>
          <small>{VERSION_NAME}</small>
        </div>
        <div>
          <span>Latest GitHub release:</span>
          <strong className="version-latest">{result?.latest ?? "Not checked"}</strong>
          <small>
            {result
              ? result.available
                ? "Update available"
                : "Version checked"
              : "Check when you’re ready"}
          </small>
        </div>
      </div>
      <p>Check the latest release on GitHub. Your documents stay on this computer.</p>
      <div className="flex flex-wrap gap-2">
        <button className="confirm-btn" disabled={busy || downloading} onClick={() => void check()}>
          {busy ? "Checking…" : "Check for updates"}
        </button>
        {result?.available && !result.managed && result.asset && (
          <button
            className="confirm-btn primary"

            disabled={downloading}

            onClick={() => void download()}
          >
            {downloading ? `Downloading ${progress}%` : "Download & install update"}
          </button>
        )}
      </div>
      {downloading && <progress aria-label="Update download" max="100" value={progress} />}
      <output className="update-status" aria-live="polite">
        {message}
      </output>
      {result?.managed && (
        <p>
          This is a {result.managed} installation. Update through that store to preserve its package
          identity. GitHub and store availability can differ while a store reviews a release.
        </p>
      )}
      {result?.managed === "microsoft-store" && (
        <button
          className="confirm-btn primary"

          onClick={() =>
            void client

              .openURL("https://apps.microsoft.com/detail/9MZDJLQ6V8L3")

              .catch(() => setMessage("Could not open Microsoft Store"))
          }
        >
          Open Microsoft Store
        </button>
      )}
      <button
        className="confirm-btn"

        onClick={() =>
          void client

            .openURL(`${SOURCE_URL}/releases/latest`)

            .catch(() => setMessage("Could not open release notes"))
        }
      >
        Release notes & downloads
      </button>
      {result?.available && (
        <p>
          The download is checked against its release checksum before opening. Save your work and
          close Quillpane before completing installation. Windows opens Setup; macOS opens the DMG;
          Linux updates the existing binary, AppImage or Debian package, with a system authorization
          prompt when needed. Store installations use their store updater. Existing notes and
          settings are preserved.
        </p>
      )}
    </section>
  );
}
