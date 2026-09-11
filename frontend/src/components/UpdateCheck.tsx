import { useEffect, useRef, useState } from "react";

import { SOURCE_URL, VERSION } from "../brand";
import { client } from "../workspace/client";
import type { UpdateInfo } from "../workspace/types";

export function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateInfo>();
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
          : `You're up to date (${VERSION}).`,
      );
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const download = async () => {
    try {
      await client.openURL(`${SOURCE_URL}/releases/latest`);
      if (mounted.current)
        setMessage("Downloads opened in your browser. Install the update, then reopen Quillpane.");
    } catch {
      if (mounted.current) setMessage("Could not open downloads. Please try again.");
    }
  };

  return (
    <section className="space-y-2" aria-label="Application updates" aria-busy={busy}>
      <h3 className="font-bold pt-2">Updates · {VERSION}</h3>
      <p>Check the latest release on GitHub. Your documents stay on this computer.</p>
      <div className="flex gap-2">
        <button className="confirm-btn" disabled={busy} onClick={() => void check()}>
          {busy ? "Checking…" : "Check for updates"}
        </button>
        {result?.available && (
          <button className="confirm-btn primary" onClick={() => void download()}>
            Download update
          </button>
        )}
      </div>
      <output aria-live="polite">{message}</output>
      {result?.available && (
        <p>
          Save your work before installing. Windows: run the setup installer. macOS: replace the app
          in Applications from the DMG. Linux: update through your package manager, or replace your
          portable binary or AppImage. Existing notes and settings are preserved.
        </p>
      )}
    </section>
  );
}
