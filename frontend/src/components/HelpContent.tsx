import { useEffect, useState } from "react";

import { SOURCE_URL, WEBSITE_URL } from "../brand";
import { shortcutLabel } from "../shortcuts";
import { client } from "../workspace/client";
import { UpdateCheck } from "./UpdateCheck";

export function HelpContent({
  onAbout,
  onChangelog,
  onTour,
}: {
  onAbout(): void;
  onChangelog(): void;
  onTour(): void;
}) {
  const [storage, setStorage] = useState("Loading location…");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    client
      .storagePath()
      .then((value) => {
        if (active) setStorage(value);
      })
      .catch(() => {
        if (active) setStorage("Available in the installed desktop app");
      });
    return () => {
      active = false;
    };
  }, []);
  const links = [
    ["Quillpane website", WEBSITE_URL],
    ["Project on GitHub", SOURCE_URL],
    ["Report an issue", `${SOURCE_URL}/issues`],
    ["Shreyam on GitHub", "https://github.com/shreyam1008"],
    ["Shreyam’s website", "https://shreyam1008.com.np/"],
  ];
  return (
    <div className="help-content">
      <UpdateCheck />
      <section className="help-section">
        <h3>Make yourself at home</h3>
        <p>A 16-step tour of your files, writing tools, previews, and settings.</p>
        <div className="help-actions">
          <button className="confirm-btn primary" onClick={onTour}>
            Start guided tour
          </button>
          <button className="confirm-btn" onClick={onAbout}>
            About Quillpane
          </button>
          <button className="confirm-btn" onClick={onChangelog}>
            What’s new
          </button>
        </div>
      </section>
      <section className="help-section">
        <h3>Everyday shortcuts</h3>
        <dl className="help-shortcuts">
          {[
            ["general.palette", "Files & commands"],
            ["file.open", "Open a file"],
            ["file.new", "New note"],
            ["navigation.find", "Find in this file"],
            ["view.split", "Split preview"],
          ].map(([id, label]) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>
                <kbd>{shortcutLabel(id)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Select text in Preview to copy it. Switch off Sync scroll when you want to read each Split
          pane independently.
        </p>
      </section>
      <footer className="help-section help-footer">
        <h3>Your local data</h3>
        <p>
          Recovery drafts, session settings, and version history stay here. Saved documents stay
          where you put them.
        </p>
        <code className="help-storage">{storage}</code>
        <h3>Project & creator</h3>
        <nav className="help-links" aria-label="Project and creator links">
          {links.map(([label, url]) => (
            <a
              key={url}
              href={url}
              onClick={(event) => {
                event.preventDefault();
                void client.openURL(url).catch(() => setError(`Could not open ${label}.`));
              }}
            >
              {label}
              <span aria-hidden="true"> ↗</span>
            </a>
          ))}
        </nav>
        <p>Made by Shreyam Adhikari · Free & open source · MIT License</p>
        <output aria-live="polite">{error}</output>
      </footer>
    </div>
  );
}
