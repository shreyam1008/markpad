/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Cards receive focus for Shift+F10 and the standard keyboard context menu. */
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { writeClipboard } from "../preview/clipboard";
import { setTaskColor, type TaskColors } from "../workspace/task-colors";
import {
  addTask,
  addTaskCategory,
  changeTaskCategory,
  emptyTaskTrash,
  moveTask,
  parseTaskDocument,
  restoreTask,
  trashTask,
  updateTask,
  taskCategoryTone,
  reorderTaskCategory,
  moveCompletedToTrash,
  restoreAllTasks,
  upgradeTaskWorkflow,
  WORKFLOW_MARKER,
  moveTaskCategory,
  localDateKey,
  type TaskPatch,
  type TaskItem,
} from "../workspace/tasks";
import {
  Kanban,
  ListTodo,
  Trash2,
  Pencil,
  Plus,
  Tags,
  Search,
  RotateCcw,
  GripVertical,
  ArrowLeft,
  Code2,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Ellipsis,
  X,
} from "./icons";
import {
  TaskColorContext,
  colorStyle,
  useTaskColor,
  TaskDialog,
  TaskColorEditor,
  TaskHighlight,
} from "./TaskAppearance";
import {
  TaskPopup,
  CategoryPicker,
  TaskTagPicker,
  DuePicker,
  MonthGrid,
  TaskClock,
} from "./TaskControls";

type Perform = (change: () => string, message: string) => boolean;

function TaskCard({
  task,
  source,
  categories,
  perform,
  dragged,
  onDrag,
  onDrop,
  previous,
  next,
  onEditSource,
  workflow,
  tagOptions,
  mode,
  query,
}: {
  task: TaskItem;
  source: string;
  categories: string[];
  perform: Perform;
  dragged: TaskItem | null;
  onDrag(task: TaskItem | null): void;
  onDrop(task: TaskItem): void;
  previous?: TaskItem;
  next?: TaskItem;
  onEditSource(offset: number): void;
  workflow: boolean;
  tagOptions: string[];
  mode: "list" | "board" | "calendar";
  query: string;
}) {
  const colors = useContext(TaskColorContext);
  const cardColor = useTaskColor("categories", task.category);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const [contextMove, setContextMove] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(task.title),
    [tags, setTags] = useState(task.tags),
    [description, setDescription] = useState(task.details),
    [due, setDue] = useState(task.due),
    [over, setOver] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null),
    titleInput = useRef<HTMLInputElement>(null);
  const changed =
    title !== task.title ||
    tags.join() !== task.tags.join() ||
    description !== task.details ||
    due !== task.due;
  const patch = (): TaskPatch => ({
    title,
    tags,
    due,
    ...(description !== task.details ? { details: description } : {}),
  });
  const finish = () => {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };
  useEffect(() => {
    if (editing) titleInput.current?.focus();
  }, [editing]);
  const tagControl = (
    <TaskTagPicker
      value={task.tags}
      options={tagOptions}
      disabled={task.trashed}
      showPills={false}
      label={`Tags for ${task.title}`}
      onChange={(value) => perform(() => updateTask(source, task, { tags: value }), "Tags updated")}
    />
  );
  return (
    // Native dragging supplements the custom category menu and keyboard ordering.
    // Focusable cards expose the standard keyboard context menu.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
    <article
      className={`task-card${task.checked ? " is-complete" : ""}${over ? " is-drop-target" : ""}${dragged?.start === task.start ? " is-dragging" : ""}`}
      data-task-title={task.title}
      data-category={task.category}
      style={cardColor}
      tabIndex={0}
      onContextMenu={(event) => {
        if (editing || task.trashed) return;
        event.preventDefault();
        event.stopPropagation();
        setContextMove(false);
        setContext({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (
          !editing &&
          !task.trashed &&
          (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
        ) {
          event.preventDefault();
          const r = event.currentTarget.getBoundingClientRect();
          setContextMove(false);
          setContext({ x: r.left + 16, y: r.top + 30 });
        }
      }}
      data-tone={taskCategoryTone(task.category)}
      draggable={!editing && !task.trashed}
      onDragStart={(event) => {
        if (
          editing ||
          task.trashed ||
          (event.target instanceof Element && event.target.closest("button,input,textarea"))
        ) {
          event.preventDefault();
          return;
        }
        event.stopPropagation();
        onDrag(task);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.title);
      }}
      onDragEnd={() => {
        onDrag(null);
        setOver(false);
      }}
      onDragOver={(event) => {
        if (dragged && dragged.start !== task.start && !task.trashed) {
          event.preventDefault();
          event.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!dragged || task.trashed) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop(task);
        setOver(false);
      }}
    >
      {actionError && (
        <p role="alert" className="task-error">
          {actionError}
        </p>
      )}
      {context && (
        <TaskPopup
          anchor={editButton}
          point={context}
          label={contextMove ? "Move to category" : "Task actions"}
          close={() => setContext(null)}
        >
          {contextMove ? (
            ["", ...categories].map((name) => (
              <button
                type="button"
                className="task-menu-option"
                key={name}
                onClick={() => {
                  perform(() => updateTask(source, task, { category: name }), "Task moved");
                  setContext(null);
                }}
              >
                {name || "No category"}
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                className="task-menu-option"
                onClick={() => {
                  setContext(null);
                  setTitle(task.title);
                  setTags(task.tags);
                  setDescription(task.details);
                  setDue(task.due);
                  setEditing(true);
                }}
              >
                Edit task
              </button>
              <button
                type="button"
                className="task-menu-option"
                onClick={() => {
                  perform(
                    () => updateTask(source, task, { checked: !task.checked }),
                    "Task updated",
                  );
                  setContext(null);
                }}
              >
                {task.checked ? "Reopen task" : "Complete task"}
              </button>
              <button
                type="button"
                className="task-menu-option"
                onClick={() => setContextMove(true)}
              >
                Move to category…
              </button>
              <button
                type="button"
                className="task-menu-option"
                onClick={() => {
                  void writeClipboard(task.title).catch((reason) =>
                    setActionError(reason instanceof Error ? reason.message : String(reason)),
                  );
                  setContext(null);
                }}
              >
                Copy title
              </button>
              <button
                type="button"
                className="task-menu-option task-danger"
                onClick={() => {
                  perform(() => trashTask(source, task), "Moved to Trash");
                  setContext(null);
                }}
              >
                Move to Trash
              </button>
            </>
          )}
        </TaskPopup>
      )}
      {editing ? (
        // Form-level blur retains valid changes; native fields own text input.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <form
          className="task-edit"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              finish();
            }
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null) &&
              !(
                event.relatedTarget instanceof Element &&
                event.relatedTarget.closest("[data-task-popup]")
              ) &&
              changed &&
              title.trim()
            ) {
              if (perform(() => updateTask(source, task, patch()), "Task edits kept in draft"))
                setEditing(false);
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (perform(() => updateTask(source, task, patch()), "Task updated")) finish();
          }}
        >
          <label>
            Task title
            <input
              ref={titleInput}
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label={`Description for ${task.title}`}
              value={description}
              maxLength={10000}
              rows={3}
              placeholder="Add a little context…"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="task-edit-metadata">
            <TaskTagPicker
              value={tags}
              options={tagOptions}
              onChange={setTags}
              label={`Tags for ${task.title}`}
            />
            <DuePicker value={due} onChange={setDue} label={`Due date for ${task.title}`} />
          </div>
          <div className="task-edit-actions">
            <button type="submit" className="confirm-btn primary">
              Save task
            </button>
            <button type="button" className="confirm-btn" onClick={finish}>
              Cancel
            </button>
            <button
              type="button"
              className="task-quiet"
              disabled={!previous || changed}
              title="Save changes before reordering"
              onClick={() => {
                if (
                  previous &&
                  perform(() => moveTask(source, task, task.category, previous), "Task moved up")
                )
                  setEditing(false);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              className="task-quiet"
              disabled={!next || changed}
              title="Save changes before reordering"
              onClick={() => {
                if (
                  next &&
                  perform(
                    () => moveTask(source, task, task.category, next, "after"),
                    "Task moved down",
                  )
                )
                  setEditing(false);
              }}
            >
              Move down
            </button>
            <button
              type="button"
              className="task-quiet"
              onClick={() => {
                if (perform(() => updateTask(source, task, patch()), "Task updated"))
                  onEditSource(task.start);
              }}
            >
              <Code2 />
              Edit source
            </button>
          </div>
        </form>
      ) : (
        <>
          <label className="task-check">
            <input
              type="checkbox"
              checked={task.checked}
              disabled={task.trashed}
              onChange={() =>
                perform(
                  () => updateTask(source, task, { checked: !task.checked }),
                  task.checked ? "Task reopened" : "Task completed",
                )
              }
            />
            <span>
              <TaskHighlight text={task.title} query={query} />
            </span>
          </label>
          {task.details && (
            <p className="task-description" title={task.details}>
              <TaskHighlight text={task.details} query={query} />
            </p>
          )}
          {!!task.tags.length && (
            <div className="task-tag-control">
              <div className="task-pills" aria-label="Tags">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="task-pill"
                    data-tone={taskCategoryTone(tag)}
                    style={colorStyle(colors, "tags", tag)}
                  >
                    <TaskHighlight text={tag} query={query} />
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="task-card-actions">
            {task.trashed ? (
              <>
                <span className="task-tag" data-tone={taskCategoryTone(task.category)}>
                  {task.category || (workflow ? "No category" : "Untagged")}
                </span>
                <button
                  type="button"
                  className="confirm-btn"
                  onClick={() => perform(() => restoreTask(source, task), "Task restored")}
                >
                  <RotateCcw />
                  Restore
                </button>
              </>
            ) : (
              <>
                {mode !== "board" && (
                  <CategoryPicker
                    value={task.category}
                    options={categories}
                    label={`Category for ${task.title}`}
                    emptyLabel={workflow ? "No category" : "Untagged"}
                    onChange={(value) =>
                      perform(
                        () => updateTask(source, task, { category: value }),
                        "Category updated",
                      )
                    }
                  />
                )}
                <DuePicker
                  value={task.due}
                  checked={task.checked}
                  label={`Due date for ${task.title}`}
                  onChange={(value) =>
                    perform(() => updateTask(source, task, { due: value }), "Due date updated")
                  }
                />
                {tagControl}
                <button
                  type="button"
                  ref={editButton}
                  className="task-quiet"
                  aria-label={`Edit ${task.title}`}
                  title="Edit task"
                  onClick={() => {
                    setTitle(task.title);
                    setTags(task.tags);
                    setDescription(task.details);
                    setDue(task.due);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                </button>
                <button
                  type="button"
                  className="task-icon-button"
                  aria-label={`Move ${task.title} to Trash`}
                  title="Move to Trash"
                  onClick={() =>
                    perform(() => trashTask(source, task), "Moved to Trash — you can restore it")
                  }
                >
                  <Trash2 />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function CategoryRow({
  name,
  source,
  perform,
  first,
  last,
  workflow,
  colors,
}: {
  colors: TaskColors;
  name: string;
  source: string;
  perform: Perform;
  first: boolean;
  last: boolean;
  workflow: boolean;
}) {
  const [value, setValue] = useState(name);
  const [removing, setRemoving] = useState(false);
  return (
    <form
      className="task-category-row"
      onSubmit={(event) => {
        event.preventDefault();
        perform(() => changeTaskCategory(source, name, value), "Category renamed");
      }}
    >
      <input
        aria-label={`Rename category ${name}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={40}
      />
      <TaskColorEditor
        name={name}
        kind="categories"
        value={colors.categories[name]}
        onChange={(color) =>
          perform(() => setTaskColor(source, "categories", name, color), "Category color updated")
        }
      />
      <button className="confirm-btn" disabled={value === name}>
        Rename
      </button>
      <button
        type="button"
        className="task-quiet"
        aria-label={`Move category ${name} earlier`}
        disabled={first}
        onClick={() =>
          perform(() => reorderTaskCategory(source, name, -1), "Category moved earlier")
        }
      >
        Earlier
      </button>
      <button
        type="button"
        className="task-quiet"
        aria-label={`Move category ${name} later`}
        disabled={last}
        onClick={() => perform(() => reorderTaskCategory(source, name, 1), "Category moved later")}
      >
        Later
      </button>
      <button type="button" className="task-quiet" onClick={() => setRemoving(!removing)}>
        Remove…
      </button>
      {removing && (
        <div className="task-inline-confirm">
          <span>Keep the tasks with {workflow ? "no category" : "Untagged"}?</span>
          <button
            type="button"
            className="confirm-btn"
            onClick={() =>
              perform(
                () => changeTaskCategory(source, name, ""),
                "Category removed; tasks and tags are preserved",
              )
            }
          >
            Remove category
          </button>
          <button type="button" className="confirm-btn" onClick={() => setRemoving(false)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

function initialMode(workflow: boolean): "list" | "board" | "calendar" {
  try {
    const stored = localStorage.getItem("quillpane-task-view");
    return stored === "board" || stored === "list" || stored === "calendar"
      ? stored
      : workflow
        ? "board"
        : "list";
  } catch {
    return workflow ? "board" : "list";
  }
}

export function TaskDocument({
  content,
  onChange,
  textSize,
  onEditSource,
  documentId,
  findOpen = false,
  onCloseFind,
}: {
  content: string;
  onChange(value: string): void;
  textSize: number;
  onEditSource(offset: number): void;
  documentId: string;
  findOpen?: boolean;
  onCloseFind?(): void;
}) {
  const [mode, setMode] = useState(() => initialMode(content.includes(WORKFLOW_MARKER)));
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [composer, setComposer] = useState<string | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newDue, setNewDue] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarDay, setCalendarDay] = useState(() => localDateKey(new Date()));
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem("quillpane-collapsed-columns") || "{}",
      )[documentId];
      return Array.isArray(stored)
        ? stored.filter((name): name is string => typeof name === "string").slice(0, 24)
        : [];
    } catch {
      return [];
    }
  });
  const [categoryName, setCategoryName] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [clearConfirmed, setClearConfirmed] = useState(false);
  const [tidyConfirmed, setTidyConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!findOpen) return;
    searchInput.current?.focus();
    searchInput.current?.select();
    onCloseFind?.();
  }, [findOpen, onCloseFind]);
  const [filter, setFilter] = useState("all");
  const [dragged, setDragged] = useState<TaskItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const newTaskInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (composer !== null) newTaskInput.current?.focus();
  }, [composer, mode]);
  const parsed = useMemo(() => {
    try {
      return { doc: parseTaskDocument(content), error: "" };
    } catch (reason) {
      return { doc: undefined, error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [content]);
  if (!parsed.doc)
    return (
      <div className="task-document task-unavailable">
        <h2>Task view unavailable</h2>
        <p>{parsed.error}</p>
      </div>
    );
  const doc = parsed.doc;
  const tagOptions = [...new Set(["Work", "Personal", ...doc.tasks.flatMap((task) => task.tags)])];
  const active = doc.tasks.filter((task) => !task.trashed);
  const trash = doc.tasks.filter((task) => task.trashed);
  const complete = active.filter((task) => task.checked).length;
  const selectedCategory = doc.categories.includes(category) ? category : "";
  const visible = (trashOpen ? trash : active).filter(
    (task) =>
      (trashOpen || filter === "all" || task.checked === (filter === "done")) &&
      `${task.title} ${task.category} ${task.tags.join(" ")} ${task.details}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const neighbors = new Map<number, { previous?: TaskItem; next?: TaskItem }>();
  const lastInCategory = new Map<string, TaskItem>();
  for (const task of visible) {
    const group = mode === "board" ? task.category : "";
    const previous = lastInCategory.get(group);
    neighbors.set(task.start, { previous });
    if (previous) neighbors.get(previous.start)!.next = task;
    lastInCategory.set(group, task);
  }
  const groups = new Map<string, TaskItem[]>();
  for (const task of visible) {
    const group = groups.get(task.category);
    if (group) group.push(task);
    else groups.set(task.category, [task]);
  }
  const perform: Perform = (change, message) => {
    try {
      const next = change();
      parseTaskDocument(next);
      const focused = document.activeElement;
      onChange(next);
      requestAnimationFrame(() => {
        // Restore focus only if removal left it nowhere. A newer picker or user
        // interaction may already have focused another control before this frame.
        if (focused && !focused.isConnected && document.activeElement === document.body)
          root.current
            ?.querySelector<HTMLButtonElement>(".task-header-actions button")
            ?.focus({ preventScroll: true });
      });
      setError("");
      setAnnouncement(message);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  };
  const changeMode = (value: "list" | "board" | "calendar") => {
    setMode(value);
    try {
      localStorage.setItem("quillpane-task-view", value);
    } catch {
      /* View preferences are optional; file data is unaffected. */
    }
  };
  const drop = (category: string, before?: TaskItem) => {
    if (dragged)
      perform(
        () => moveTask(content, dragged, category, before),
        `Moved to ${category || "Untagged"}`,
      );
    setDragged(null);
    setOver(null);
  };
  const card = (task: TaskItem) => {
    return (
      <TaskCard
        key={task.start}
        task={task}
        source={content}
        categories={doc.categories}
        perform={perform}
        dragged={dragged}
        onDrag={(value) => {
          setDragged(value);
          if (!value) setOver(null);
        }}
        onDrop={(before) =>
          drop(mode === "board" ? before.category : (dragged?.category ?? ""), before)
        }
        previous={neighbors.get(task.start)?.previous}
        next={neighbors.get(task.start)?.next}
        onEditSource={onEditSource}
        workflow={doc.workflow}
        tagOptions={tagOptions}
        mode={mode}
        query={query}
      />
    );
  };
  const toggleColumn = (name: string) => {
    const next = collapsed.includes(name)
      ? collapsed.filter((item) => item !== name)
      : [...collapsed, name];
    setCollapsed(next);
    try {
      const stored = JSON.parse(localStorage.getItem("quillpane-collapsed-columns") || "{}");
      const entries = Object.entries(stored)
        .filter(([id]) => id !== documentId)
        .slice(-63);
      localStorage.setItem(
        "quillpane-collapsed-columns",
        JSON.stringify(Object.fromEntries([...entries, [documentId, next]])),
      );
    } catch {
      /* Collapsing remains available without local storage. */
    }
  };
  const commitNewTask = (close: boolean) => {
    if (!title.trim()) {
      if (close) {
        setComposer(null);
        setNewDue("");
        setNewTags([]);
      }
      return;
    }
    if (
      perform(
        () => addTask(content, title, composer ?? selectedCategory, newTags, newDue),
        "Task added",
      )
    ) {
      setTitle("");
      setNewTags([]);
      setQuery("");
      setFilter("all");
      if (close) {
        setComposer(null);
        setNewDue("");
      } else newTaskInput.current?.focus();
    }
  };
  const composerCard = (name: string) => (
    // Native inputs own editing; Escape/blur also work from the tag field.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      className="task-compose-card"
      aria-label={`New card in ${name || "No category"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setTitle("");
          setNewTags([]);
          setComposer(null);
          setNewDue("");
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        commitNewTask(false);
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !(
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest("[data-task-popup]")
          )
        )
          commitNewTask(true);
      }}
    >
      <input
        ref={newTaskInput}
        aria-label="New task"
        placeholder="Write a task…"
        value={title}
        maxLength={500}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setTitle("");
            setNewTags([]);
            setComposer(null);
            setNewDue("");
          }
        }}
      />
      <div className="task-compose-metadata">
        <TaskTagPicker
          value={newTags}
          options={tagOptions}
          onChange={setNewTags}
          label="New task tags"
        />
        <DuePicker value={newDue} onChange={setNewDue} label="New task due date" />
      </div>
      <div className="task-compose-actions">
        <button type="submit" className="confirm-btn primary" disabled={!title.trim()}>
          Add card
        </button>
        <button
          type="button"
          className="task-quiet"
          onClick={() => {
            setTitle("");
            setNewTags([]);
            setComposer(null);
            setNewDue("");
          }}
        >
          Cancel
        </button>
        <span>Enter to add</span>
      </div>
    </form>
  );
  return (
    <TaskColorContext.Provider value={doc.colors}>
      <TaskClock>
        {/* Native text undo stays local without intercepting document shortcuts. */}
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          ref={root}
          className={`task-document task-${trashOpen ? "list" : mode}${doc.workflow ? " task-workflow" : ""}${dragged || draggedColumn !== null ? " has-active-drag" : ""}`}
          style={{ fontSize: textSize }}
          onKeyDown={(event) => {
            // Keep native text-field undo local; saved task changes use document undo.
            if (
              (event.ctrlKey || event.metaKey) &&
              ["z", "y"].includes(event.key.toLowerCase()) &&
              (event.target instanceof HTMLTextAreaElement ||
                (event.target instanceof HTMLInputElement && event.target.type === "text"))
            )
              event.stopPropagation();
          }}
        >
          {!trashOpen && (
            <nav className="task-view-toolbar" aria-label="Task layouts">
              {" "}
              <fieldset className="task-view-switch" aria-label="Task view">
                <button
                  type="button"
                  aria-pressed={mode === "list"}
                  onClick={() => changeMode("list")}
                >
                  <ListTodo />
                  List
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "board"}
                  onClick={() => changeMode("board")}
                >
                  <Kanban />
                  Board
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "calendar"}
                  onClick={() => changeMode("calendar")}
                >
                  <CalendarDays />
                  Calendar
                </button>
              </fieldset>
            </nav>
          )}
          <header className="task-header">
            <div className="task-heading">
              <span className="task-heading-icon" aria-hidden="true">
                {trashOpen ? <Trash2 /> : <Kanban />}
              </span>
              <div>
                <div className="task-title-line">
                  <h1>{trashOpen ? "Trash" : doc.title}</h1>
                  {!trashOpen && (
                    <button
                      type="button"
                      className="task-quiet"
                      aria-label="Edit board title in Editor"
                      title="Edit board title in Editor"
                      onClick={() => onEditSource(doc.titleStart)}
                    >
                      <Pencil />
                    </button>
                  )}
                </div>
                <div className="task-heading-meta">
                  <p>
                    {trashOpen
                      ? `${trash.length} ${trash.length === 1 ? "task" : "tasks"} · restore anytime`
                      : active.length
                        ? `${active.length - complete} open · ${complete} completed`
                        : "A little space for what’s next."}
                  </p>
                  {!trashOpen && (
                    <progress
                      className="task-progress"
                      aria-label="Task completion"
                      max={active.length || 1}
                      value={complete}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="task-header-actions">
              {trashOpen ? (
                <button
                  type="button"
                  className="confirm-btn"
                  onClick={() => {
                    setTrashOpen(false);
                    setClearConfirmed(false);
                    setQuery("");
                  }}
                >
                  <ArrowLeft />
                  Back to tasks
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="task-quiet"
                    aria-expanded={categoriesOpen}
                    onClick={() => setCategoriesOpen(!categoriesOpen)}
                  >
                    <Tags />
                    Categories
                  </button>
                  <button
                    type="button"
                    className="task-trash-button"
                    onClick={() => {
                      setTrashOpen(true);
                      setCategoriesOpen(false);
                      setQuery("");
                    }}
                  >
                    <Trash2 />
                    Trash<span>{trash.length}</span>
                  </button>
                </>
              )}
            </div>
          </header>
          {categoriesOpen && !trashOpen && (
            <TaskDialog label="Categories & tags" close={() => setCategoriesOpen(false)}>
              <section className="task-category-manager" aria-label="Manage categories">
                <h2>Categories</h2>
                <p>
                  {doc.workflow
                    ? "Workflow columns for Backlog, Today, Done and your own stages. Tags belong to individual tasks."
                    : "Columns on your board. Upgrade below to separate workflow stages from tags."}
                </p>
                {doc.categories.map((name, index) => (
                  <CategoryRow
                    key={name}
                    name={name}
                    source={content}
                    perform={perform}
                    first={index === 0}
                    last={index === doc.categories.length - 1}
                    workflow={doc.workflow}
                    colors={doc.colors}
                  />
                ))}
                <form
                  className="task-category-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (perform(() => addTaskCategory(content, categoryName), "Category added"))
                      setCategoryName("");
                  }}
                >
                  <input
                    aria-label="New category"
                    placeholder={
                      doc.workflow ? "e.g. In progress, Waiting" : "e.g. Work, Personal, Ideas"
                    }
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    maxLength={40}
                  />
                  <button type="submit" className="confirm-btn" disabled={!categoryName.trim()}>
                    Add category
                  </button>
                </form>
                <h2>Tags</h2>
                <p>Select tags on a card. Change their shared colors here.</p>
                <div className="task-managed-tags">
                  {tagOptions.map((name) => (
                    <div key={name}>
                      <span className="task-pill" style={colorStyle(doc.colors, "tags", name)}>
                        {name}
                      </span>
                      <TaskColorEditor
                        name={name}
                        kind="tags"
                        value={doc.colors.tags[name]}
                        onChange={(color) =>
                          perform(
                            () => setTaskColor(content, "tags", name, color),
                            "Tag color updated",
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            </TaskDialog>
          )}
          {!doc.workflow && !trashOpen && (
            <div className="task-upgrade">
              <span>Use workflow columns and keep your existing categories as tags.</span>
              <button
                className="confirm-btn"
                onClick={() =>
                  perform(
                    () => upgradeTaskWorkflow(content),
                    "Board upgraded; existing categories are now tags",
                  )
                }
              >
                Separate columns and tags
              </button>
            </div>
          )}
          {!doc.workflow && !trashOpen && (
            <form
              className="task-add"
              onSubmit={(event) => {
                event.preventDefault();
                if (perform(() => addTask(content, title, selectedCategory), "Task added")) {
                  setTitle("");
                  setQuery("");
                  setFilter("all");
                  newTaskInput.current?.focus();
                }
              }}
            >
              <input
                ref={newTaskInput}
                aria-label="New task"
                placeholder="What needs doing?"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={500}
              />
              <select
                aria-label="New task category"
                value={selectedCategory}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Untagged</option>
                {doc.categories.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <button type="submit" className="confirm-btn primary" disabled={!title.trim()}>
                <Plus />
                Add task
              </button>
            </form>
          )}
          <div className="task-filter">
            <button
              type="button"
              ref={toolsButton}
              className="task-quiet task-overflow"
              aria-label="Board actions"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Ellipsis />
            </button>
            <div className="task-search">
              <Search aria-hidden="true" />
              <input
                ref={searchInput}
                aria-label="Filter tasks"
                placeholder="Filter tasks…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setQuery("");
                    onCloseFind?.();
                  }
                }}
              />
              <button
                type="button"
                className="task-quiet task-search-clear"
                aria-label="Clear task filter"
                disabled={!query}
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <X />
              </button>
            </div>
            {doc.workflow && !trashOpen && mode === "list" && (
              <button
                className="task-quiet"
                onClick={() => {
                  setNewDue("");
                  setComposer(
                    doc.categories.includes("Backlog") ? "Backlog" : doc.categories[0] || "",
                  );
                }}
              >
                <Plus /> Add task
              </button>
            )}
            {!trashOpen && (
              <fieldset className="task-status-pills" aria-label="Task completion filter">
                {[
                  ["all", "All"],
                  ["open", "Open"],
                  ["done", "Done"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="task-quiet"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            )}
            {trashOpen && (
              <button
                type="button"
                className="task-quiet"
                onClick={() => perform(() => restoreAllTasks(content), "All tasks restored")}
              >
                Restore all
              </button>
            )}
            {trashOpen && (
              <button
                type="button"
                className="task-quiet task-danger"
                disabled={!trash.length}
                onClick={() => setClearConfirmed(true)}
              >
                Empty Trash…
              </button>
            )}
          </div>
          {menuOpen && (
            <TaskPopup anchor={toolsButton} label="Board actions" close={() => setMenuOpen(false)}>
              <button
                type="button"
                className="task-menu-option"
                disabled={!complete}
                onClick={() => {
                  setMenuOpen(false);
                  setTidyConfirmed(true);
                }}
              >
                Move completed to Trash…
              </button>
            </TaskPopup>
          )}
          {tidyConfirmed && !trashOpen && (
            <fieldset className="task-inline-confirm" aria-label="Confirm move completed tasks">
              <span>
                Move {complete} completed {complete === 1 ? "task" : "tasks"} to Trash, including
                hidden tasks? You can restore them.
              </span>
              <button
                type="button"
                className="confirm-btn"
                onClick={() => {
                  if (
                    perform(() => moveCompletedToTrash(content), "Completed tasks moved to Trash")
                  )
                    setTidyConfirmed(false);
                }}
              >
                Move completed
              </button>
              <button type="button" className="confirm-btn" onClick={() => setTidyConfirmed(false)}>
                Cancel
              </button>
            </fieldset>
          )}
          {clearConfirmed && trashOpen && (
            <fieldset
              className="task-inline-confirm is-destructive"
              aria-label="Confirm empty Trash"
            >
              <span>
                Delete {trash.length} {trash.length === 1 ? "task" : "tasks"} from this file’s
                Trash?
              </span>
              <button
                type="button"
                className="confirm-btn danger"
                onClick={() => {
                  if (perform(() => emptyTaskTrash(content), "Trash emptied"))
                    setClearConfirmed(false);
                }}
              >
                Empty Trash
              </button>
              <button
                type="button"
                className="confirm-btn"
                onClick={() => setClearConfirmed(false)}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {error && (
            <p role="alert" className="task-error">
              {error}
            </p>
          )}
          <output className="task-announcement" aria-live="polite">
            {announcement}
          </output>
          <div className="task-workspace">
            <div className="task-main">
              {mode === "calendar" && !trashOpen ? (
                <section className="task-calendar" aria-label="Task calendar">
                  <div className="task-calendar-month">
                    <div className="task-calendar-tools">
                      <button
                        type="button"
                        className="task-quiet"
                        onClick={() => {
                          setCalendarMonth(new Date());
                          setCalendarDay(localDateKey(new Date()));
                        }}
                      >
                        Today
                      </button>
                      <span>Choose a day to see its tasks</span>
                    </div>
                    <MonthGrid
                      month={calendarMonth}
                      selected={calendarDay}
                      onMonth={setCalendarMonth}
                      onSelect={setCalendarDay}
                      tasks={visible}
                    />
                  </div>
                  <div className="task-calendar-agendas">
                    <div className="task-agenda">
                      <div className="task-agenda-heading">
                        <h2>
                          {new Date(`${calendarDay}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </h2>
                        <button
                          type="button"
                          className="task-quiet"
                          onClick={() => {
                            setNewDue(calendarDay);
                            setComposer(
                              doc.categories.includes("To do") ? "To do" : doc.categories[0] || "",
                            );
                          }}
                        >
                          <Plus />
                          Add task on this day
                        </button>
                      </div>
                      {composer !== null && composerCard(composer)}
                      {visible
                        .filter((task) => task.due.slice(0, 10) === calendarDay)
                        .sort((a, b) => a.due.localeCompare(b.due))
                        .map(card)}
                      {!visible.some((task) => task.due.slice(0, 10) === calendarDay) && (
                        <p className="task-empty">Nothing scheduled for this day.</p>
                      )}
                    </div>
                    <details className="task-other-days">
                      <summary>Other scheduled days</summary>
                      {[
                        ...new Set(
                          visible
                            .filter((task) => task.due && task.due.slice(0, 10) !== calendarDay)
                            .map((task) => task.due.slice(0, 10)),
                        ),
                      ]
                        .sort()
                        .map((day) => (
                          <section key={day}>
                            <h3>
                              {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </h3>
                            {visible
                              .filter((task) => task.due.slice(0, 10) === day)
                              .sort((a, b) => a.due.localeCompare(b.due))
                              .map(card)}
                          </section>
                        ))}
                    </details>
                    <details className="task-unscheduled">
                      <summary>Unscheduled · {visible.filter((task) => !task.due).length}</summary>
                      {visible.filter((task) => !task.due).map(card)}
                    </details>
                  </div>
                </section>
              ) : mode === "board" && !trashOpen ? (
                <div className="task-columns">
                  {[
                    ...(!doc.workflow ||
                    active.some((task) => !task.category) ||
                    !doc.categories.length
                      ? [""]
                      : []),
                    ...doc.categories,
                  ].map((name) => (
                    // Native drops have equivalent category-select controls on every card.
                    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                    <section
                      key={name}
                      className={`task-column${over === name ? " is-drop-target" : ""}${collapsed.includes(name) ? " is-collapsed" : ""}`}
                      aria-label={name || (doc.workflow ? "No category" : "Untagged")}
                      data-tone={taskCategoryTone(name)}
                      style={colorStyle(doc.colors, "categories", name)}
                      onDragOver={(event) => {
                        if (dragged || draggedColumn !== null) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setOver(name);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                          setOver(null);
                      }}
                      onDrop={(event) => {
                        if (draggedColumn !== null && name) {
                          event.preventDefault();
                          const bounds = event.currentTarget.getBoundingClientRect();
                          perform(
                            () =>
                              moveTaskCategory(
                                content,
                                draggedColumn,
                                name,
                                event.clientX > bounds.left + bounds.width / 2 ? "after" : "before",
                              ),
                            "Column moved",
                          );
                          setDraggedColumn(null);
                          setOver(null);
                          return;
                        }
                        if (dragged) {
                          event.preventDefault();
                          drop(name);
                        }
                      }}
                    >
                      <h2>
                        {name && (
                          <button
                            type="button"
                            draggable
                            className="task-column-grip"
                            aria-label={`Move ${name} column`}
                            title="Drag to reorder · Alt+Left/Right"
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDraggedColumn(name);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", name);
                            }}
                            onDragEnd={() => {
                              setDraggedColumn(null);
                              setOver(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
                                event.preventDefault();
                                perform(
                                  () =>
                                    reorderTaskCategory(
                                      content,
                                      name,
                                      event.key === "ArrowLeft" ? -1 : 1,
                                    ),
                                  "Column moved",
                                );
                              }
                            }}
                          >
                            <GripVertical />
                          </button>
                        )}
                        <button
                          type="button"
                          className="task-column-toggle"
                          aria-label={`${collapsed.includes(name) ? "Expand" : "Collapse"} ${name || "No category"}`}
                          aria-expanded={!collapsed.includes(name)}
                          onClick={() => toggleColumn(name)}
                        >
                          {collapsed.includes(name) ? <ChevronRight /> : <ChevronDown />}
                          <span className="task-column-name">
                            <span className="task-category-dot" aria-hidden="true" />
                            {name || (doc.workflow ? "No category" : "Untagged")}
                          </span>
                          <span className="task-count">{groups.get(name)?.length ?? 0}</span>
                        </button>
                      </h2>
                      {!collapsed.includes(name) && (
                        <>
                          <div className="task-cards">
                            {groups.get(name)?.map(card)}
                            {!groups.has(name) && (
                              <p className="task-empty">
                                {query || filter !== "all"
                                  ? "No matching tasks."
                                  : doc.workflow
                                    ? "No tasks yet."
                                    : name
                                      ? "Drop a task here, or choose this category when adding one."
                                      : "Tasks without a category appear here."}
                              </p>
                            )}
                          </div>
                          {doc.workflow && composer === name ? (
                            composerCard(name)
                          ) : (
                            <button
                              type="button"
                              className="task-column-add"
                              aria-label={`Add task to ${name || "Untagged"}`}
                              onClick={() => {
                                if (doc.workflow) {
                                  setNewDue("");
                                  setComposer(name);
                                  return;
                                }
                                setCategory(name);
                                newTaskInput.current?.focus();
                                newTaskInput.current?.scrollIntoView({ block: "nearest" });
                              }}
                            >
                              <Plus />
                              Add task
                            </button>
                          )}
                        </>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="task-rows">
                  {doc.workflow && !trashOpen && composer !== null && composerCard(composer)}
                  {visible.map(card)}
                  {!visible.length && (
                    <div className="task-empty-state">
                      {trashOpen ? <Trash2 /> : <ListTodo />}
                      <h2>
                        {query || (!trashOpen && filter !== "all")
                          ? "No matching tasks"
                          : trashOpen
                            ? "Trash is empty"
                            : "Room for your next task"}
                      </h2>
                      <p>
                        {query || (!trashOpen && filter !== "all")
                          ? "Try another search, or choose All and clear the text filter."
                          : trashOpen
                            ? "Removed tasks stay here until you restore them or empty Trash."
                            : "Add a task to get started. Tags are optional."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="task-file-hint">
            {trashOpen ? (
              "Restore a task anytime. Empty Trash removes it from this file."
            ) : mode === "board" ? (
              <>
                <GripVertical />
                Drag to organize · Right-click a card for more actions
              </>
            ) : (
              "Your tasks, one Markdown file. Changes are saved with Save."
            )}
          </p>
        </div>
      </TaskClock>
    </TaskColorContext.Provider>
  );
}
