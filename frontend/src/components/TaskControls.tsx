/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom stage choices retain ARIA listbox semantics and arrow-key navigation. */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  calendarDays,
  localDateKey,
  parseLocalDay,
  taskCategoryTone,
  taskTags,
  type TaskItem,
} from "../workspace/tasks";
import { CalendarDays, Check, ChevronDown, ChevronRight, ArrowLeft, Plus, Tags, X } from "./icons";
import { TaskColorContext, colorStyle, useTaskColor } from "./TaskAppearance";

const TaskNow = createContext(Date.now());
export function TaskClock({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return <TaskNow.Provider value={now}>{children}</TaskNow.Provider>;
}

export function TaskPopup({
  anchor,
  close,
  label,
  children,
  point,
}: {
  point?: { x: number; y: number };
  anchor: RefObject<HTMLButtonElement | null>;
  close(): void;
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const latestClose = useRef(close);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    latestClose.current = close;
  }, [close]);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect(),
      p = panel.current;
    if (!a || !p) return;
    const r = p.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(point?.x ?? a.left, innerWidth - r.width - 8)),
      top: point
        ? Math.max(8, Math.min(point.y, innerHeight - r.height - 8))
        : Math.max(8, a.bottom + r.height + 6 < innerHeight ? a.bottom + 6 : a.top - r.height - 6),
    });
    p.querySelector<HTMLElement>('input, [aria-selected="true"], button')?.focus({
      preventScroll: true,
    });
    const outside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        latestClose.current();
        return;
      }
      if (!p.contains(target) && !anchor.current?.contains(target)) latestClose.current();
    };
    const scroll = (event: Event) => {
      if (!p.contains(event.target as Node)) latestClose.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", outside);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", outside);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [anchor, point]);
  return createPortal(
    // Escape and arrow keys are handled by this nonmodal chooser's native controls.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      open
      ref={panel}
      aria-label={label}
      data-task-popup
      className="task-document task-popup"
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          latestClose.current();
          anchor.current?.focus({ preventScroll: true });
        }
        if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
          (event.target as HTMLElement).matches('[role="option"]')
        ) {
          event.preventDefault();
          const options = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
          ];
          const i = options.indexOf(event.target as HTMLButtonElement);
          options[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : (i + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length
          ]?.focus({ preventScroll: true });
        }
      }}
    >
      <div className="task-popup-heading">{label}</div>
      {children}
    </dialog>,
    document.body,
  );
}

export function CategoryPicker({
  value,
  options,
  label,
  onChange,
  emptyLabel = "No category",
}: {
  value: string;
  options: string[];
  label: string;
  onChange(value: string): void;
  emptyLabel?: string;
}) {
  const colors = useContext(TaskColorContext);
  const style = useTaskColor("categories", value);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="task-stage"
        style={style}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-value={value}
        onClick={() => setOpen(!open)}
      >
        <span className="task-category-dot" data-tone={taskCategoryTone(value)} />
        <span>{value || emptyLabel}</span>
        <ChevronDown />
      </button>
      {open && (
        <TaskPopup anchor={anchor} close={() => setOpen(false)} label="Move to category">
          <div role="listbox" aria-label="Category choices">
            {["", ...options].map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                data-value={option}
                aria-selected={value === option}
                className="task-menu-option"
                style={colorStyle(colors, "categories", option)}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  anchor.current?.focus({ preventScroll: true });
                }}
              >
                <span className="task-category-dot" data-tone={taskCategoryTone(option)} />
                <span>{option || emptyLabel}</span>
                {value === option && <Check />}
              </button>
            ))}
          </div>
        </TaskPopup>
      )}
    </>
  );
}

export function TaskTagPicker({
  value,
  options,
  onChange,
  label = "Tags",
  disabled = false,
  showPills = true,
}: {
  value: string[];
  options: string[];
  onChange(value: string[]): void;
  label?: string;
  disabled?: boolean;
  showPills?: boolean;
}) {
  const colors = useContext(TaskColorContext);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const names = [...new Set([...value, ...options])]
    .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);
  const choose = (name: string) => {
    try {
      onChange(taskTags(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]));
      setQuery("");
      setError("");
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  };
  return (
    <div className="task-tag-control">
      {showPills && (
        <div className="task-pills" aria-label="Tags">
          {value.map((tag) => (
            <span
              className="task-pill"
              key={tag}
              data-tone={taskCategoryTone(tag)}
              style={colorStyle(colors, "tags", tag)}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <button
          ref={anchor}
          type="button"
          className="task-meta-button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Tags />
          {!value.length && <span>Tags</span>}
        </button>
      )}
      {open && (
        <TaskPopup anchor={anchor} close={() => setOpen(false)} label="Tags">
          <input
            aria-label="Find or create tag"
            placeholder="Find or create a tag…"
            value={query}
            maxLength={40}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (query.trim())
                  choose(
                    names.find((n) => n.toLowerCase() === query.trim().toLowerCase()) ||
                      query.trim(),
                  );
              }
            }}
          />
          <div className="task-tag-options">
            {names.map((name) => (
              <button
                type="button"
                key={name}
                className="task-pill"
                data-tone={taskCategoryTone(name)}
                style={colorStyle(colors, "tags", name)}
                aria-pressed={value.includes(name)}
                onClick={() => choose(name)}
              >
                {value.includes(name) && <Check />}
                {name}
              </button>
            ))}
          </div>
          {query.trim() && !names.some((n) => n.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" className="task-menu-option" onClick={() => choose(query.trim())}>
              <Plus />
              Create “{query.trim()}”
            </button>
          )}
          {error && (
            <p role="alert" className="task-error">
              {error}
            </p>
          )}
          <button
            className="task-quiet"
            type="button"
            onClick={() => {
              setOpen(false);
              anchor.current?.focus({ preventScroll: true });
            }}
          >
            Done
          </button>
        </TaskPopup>
      )}
    </div>
  );
}

const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
export function MonthGrid({
  month,
  selected,
  onMonth,
  onSelect,
  tasks = [],
}: {
  month: Date;
  selected: string;
  onMonth(value: Date): void;
  onSelect(value: string): void;
  tasks?: TaskItem[];
}) {
  const today = localDateKey(new Date(useContext(TaskNow)));
  const groups = new Map<string, TaskItem[]>();
  for (const task of tasks) {
    if (task.due) {
      const day = task.due.slice(0, 10);
      const group = groups.get(day);
      if (group) group.push(task);
      else groups.set(day, [task]);
    }
  }
  return (
    <>
      <div className="task-month-heading">
        <button
          type="button"
          className="task-icon-button"
          aria-label="Previous month"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}
        >
          <ArrowLeft />
        </button>
        <strong>{monthLabel.format(month)}</strong>
        <button
          type="button"
          className="task-icon-button"
          aria-label="Next month"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="task-month-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className="task-weekday" key={day}>
            {day}
          </span>
        ))}
        {calendarDays(month).map((day) => {
          const key = localDateKey(day),
            items = groups.get(key) || [];
          return (
            <button
              type="button"
              key={key}
              aria-label={`Choose ${key}${items.length ? `, ${items.length} tasks` : ""}`}
              aria-pressed={key === selected}
              aria-current={key === today ? "date" : undefined}
              className={`task-day${day.getMonth() !== month.getMonth() ? " is-other-month" : ""}`}
              onClick={() => onSelect(key)}
              onKeyDown={(event) => {
                const offset = (
                  { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
                    string,
                    number
                  >
                )[event.key];
                if (offset) {
                  event.preventDefault();
                  const target = new Date(
                      day.getFullYear(),
                      day.getMonth(),
                      day.getDate() + offset,
                      12,
                    ),
                    next = localDateKey(target);
                  onMonth(new Date(target.getFullYear(), target.getMonth(), 1, 12));
                  onSelect(next);
                  const grid = event.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    grid
                      ?.querySelector<HTMLButtonElement>(`[aria-label^="Choose ${next}"]`)
                      ?.focus(),
                  );
                }
              }}
            >
              <span>{day.getDate()}</span>
              {items.length > 0 && <span className="task-day-count">{items.length}</span>}
              <span className="task-day-titles">
                {items.slice(0, 2).map((task) => (
                  <span key={task.start}>
                    {task.due.slice(11)} {task.title}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

const shortDueFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const longDueFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
export function dueLabel(value: string): string {
  if (!value) return "Due date";
  const date = parseLocalDay(value);
  return (
    (date.getFullYear() !== new Date().getFullYear() ? longDueFormat : shortDueFormat).format(
      date,
    ) + (value.includes("T") ? ` · ${value.slice(11)}` : "")
  );
}
export function DuePicker({
  value,
  onChange,
  label,
  checked = false,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
  checked?: boolean;
}) {
  const now = useContext(TaskNow);
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(value.slice(0, 10)),
    [time, setTime] = useState(value.slice(11)),
    [month, setMonth] = useState(() => (value ? parseLocalDay(value) : new Date()));
  const anchor = useRef<HTMLButtonElement>(null);
  const overdue =
    !!value &&
    !checked &&
    (value.includes("T") ? new Date(value).getTime() < now : value < localDateKey(new Date(now)));
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`task-meta-button task-due${value ? " has-due" : ""}${overdue ? " is-overdue" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          value ? `${value.replace("T", " ")} · local time` : "Set a due date and optional time"
        }
        onClick={() => {
          setDate(value.slice(0, 10));
          setTime(value.slice(11));
          setMonth(value ? parseLocalDay(value) : new Date());
          setOpen(!open);
        }}
      >
        <CalendarDays />
        <span>{dueLabel(value)}</span>
      </button>
      {open && (
        <TaskPopup anchor={anchor} close={() => setOpen(false)} label="Due date & time">
          <div className="task-date-shortcuts">
            {[0, 1].map((offset) => (
              <button
                className="task-quiet"
                type="button"
                key={offset}
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  setDate(localDateKey(d));
                  setMonth(d);
                }}
              >
                {offset ? "Tomorrow" : "Today"}
              </button>
            ))}
          </div>
          <MonthGrid month={month} selected={date} onMonth={setMonth} onSelect={setDate} />
          <div className="task-date-fields">
            <label>
              Date
              <input
                type="date"
                aria-label="Due date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Time · optional
              <input
                type="time"
                aria-label="Due time"
                disabled={!date}
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          </div>
          <div className="task-popup-actions">
            <button
              type="button"
              className="task-quiet"
              onClick={() => {
                onChange("");
                setOpen(false);
                anchor.current?.focus({ preventScroll: true });
              }}
            >
              <X />
              Clear
            </button>
            <button
              type="button"
              className="confirm-btn primary"
              disabled={!date}
              onClick={() => {
                onChange(date + (time ? `T${time}` : ""));
                setOpen(false);
                anchor.current?.focus({ preventScroll: true });
              }}
            >
              Apply
            </button>
          </div>
        </TaskPopup>
      )}
    </>
  );
}
