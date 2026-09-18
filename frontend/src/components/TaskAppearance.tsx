import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  automaticTaskColor,
  colorRGB,
  emptyTaskColors,
  type TaskColor,
  type TaskColors,
} from "../workspace/task-colors";
import { X } from "./icons";

export const TaskColorContext = createContext<TaskColors>(emptyTaskColors());
const COLOR_STYLE_CACHE_LIMIT = 256;
const colorStyles = new WeakMap<
  TaskColors,
  Map<string, { color?: TaskColor; l: number; c: number; h: number; style: CSSProperties }>
>();

export function colorStyle(
  colors: TaskColors,
  kind: keyof TaskColors,
  name: string,
): CSSProperties {
  const custom = Object.hasOwn(colors[kind], name) ? colors[kind][name] : undefined;
  const key = `${kind}\0${name}`;
  let cache = colorStyles.get(colors);
  const cached = cache?.get(key);
  if (
    cached &&
    cached.color === custom &&
    (!custom || (cached.l === custom.l && cached.c === custom.c && cached.h === custom.h))
  )
    return cached.style;
  const color = custom ?? automaticTaskColor(name);
  const style = Object.freeze({
    "--task-custom-light": `rgb(${colorRGB({ ...color, l: 0.42, c: Math.min(color.c, 0.13) }).join(" ")})`,
    "--task-custom-dark": `rgb(${colorRGB({ ...color, l: 0.82, c: Math.min(color.c, 0.13) }).join(" ")})`,
    "--task-custom-rgb": colorRGB(color).join(" "),
  }) as CSSProperties;
  if (!cache) {
    cache = new Map();
    colorStyles.set(colors, cache);
  }
  // Parsed color objects disappear with their document generation. Bound each
  // live object's cache too, including arbitrary automatically colored tags.
  if (!cache.has(key) && cache.size >= COLOR_STYLE_CACHE_LIMIT)
    cache.delete(cache.keys().next().value!);
  cache.set(key, { color: custom, l: color.l, c: color.c, h: color.h, style });
  return style;
}
export function useTaskColor(kind: keyof TaskColors, name: string) {
  return colorStyle(useContext(TaskColorContext), kind, name);
}
export function TaskHighlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const result: ReactNode[] = [];
  let start = 0,
    index = text.toLowerCase().indexOf(q);
  while (index >= 0) {
    result.push(
      text.slice(start, index),
      <mark key={index}>{text.slice(index, index + q.length)}</mark>,
    );
    start = index + q.length;
    index = text.toLowerCase().indexOf(q, start);
  }
  result.push(text.slice(start));
  return <>{result}</>;
}
export function TaskDialog({
  children,
  label,
  close,
}: {
  children: ReactNode;
  label: string;
  close(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    // Native Escape and the close button are the keyboard equivalents of backdrop dismissal.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="task-document task-manager-dialog"
      aria-label={label}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <header>
        <h2>{label}</h2>
        <button
          type="button"
          aria-label="Close categories and tags"
          className="task-quiet"
          onClick={close}
        >
          <X />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
export function TaskColorEditor({
  name,
  kind,
  value,
  onChange,
}: {
  name: string;
  kind: keyof TaskColors;
  value?: TaskColor;
  onChange(color?: TaskColor): void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value ?? automaticTaskColor(name));
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!open || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    if (!ctx) return;
    const size = 180,
      data = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2,
          dy = y - size / 2,
          r = Math.hypot(dx, dy) / (size / 2);
        if (r > 1) continue;
        const rgb = colorRGB({
          l: draft.l,
          c: r * 0.25,
          h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
        });
        const i = (y * size + x) * 4;
        data.data.set([...rgb, 255], i);
      }
    ctx.putImageData(data, 0, 0);
  }, [open, draft.l]);
  const pick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.type === "pointermove" && !event.buttons) return;
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    const r = event.currentTarget.getBoundingClientRect(),
      x = (event.clientX - r.left) / r.width - 0.5,
      y = (event.clientY - r.top) / r.height - 0.5;
    setDraft({
      ...draft,
      h: Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360),
      c: Math.min(0.25, Math.hypot(x, y) * 0.5),
    });
  };
  return (
    <div className="task-color-editor">
      <button
        type="button"
        className="task-color-swatch"
        aria-label={`Color for ${kind === "tags" ? "tag" : "category"} ${name}`}
        style={{ background: `rgb(${colorRGB(value ?? automaticTaskColor(name)).join(" ")})` }}
        onClick={() => {
          setDraft(value ?? automaticTaskColor(name));
          setOpen(!open);
        }}
      />
      {open && (
        <fieldset className="task-color-panel">
          <legend>{name} color</legend>
          <div className="task-color-wheel">
            <canvas
              ref={canvas}
              width={180}
              height={180}
              aria-label="OKLCH hue and chroma wheel; use the sliders for keyboard control"
              onPointerDown={pick}
              onPointerMove={pick}
            />
            <span
              style={{
                left: `${50 + ((Math.cos((draft.h * Math.PI) / 180) * draft.c) / 0.25) * 50}%`,
                top: `${50 + ((Math.sin((draft.h * Math.PI) / 180) * draft.c) / 0.25) * 50}%`,
              }}
            />
          </div>
          <div className="task-color-sliders">
            {(
              [
                ["h", "Hue", 0, 360, 1],
                ["c", "Chroma", 0, 0.25, 0.005],
                ["l", "Lightness", 0.25, 0.9, 0.01],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  type="range"
                  aria-label={`${name} ${label}`}
                  min={min}
                  max={max}
                  step={step}
                  value={draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
                />
              </label>
            ))}
            <output>
              oklch({draft.l.toFixed(2)} {draft.c.toFixed(3)} {draft.h}°)
            </output>
            <div>
              <button
                type="button"
                className="confirm-btn primary"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Apply color
              </button>
              <button
                type="button"
                className="task-quiet"
                onClick={() => {
                  onChange();
                  setOpen(false);
                }}
              >
                Automatic
              </button>
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}
