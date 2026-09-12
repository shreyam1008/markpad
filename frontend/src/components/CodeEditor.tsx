import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, Transaction, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";

import { fileExtension } from "../workspace/documents";

/**
 * The small imperative surface shared with the legacy textarea editor.
 * Keeping this contract means save-position, find, history, and formatting
 * do not need to know which editor implementation is mounted.
 */
export interface EditorHandle {
  scrollTop: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly lineHeight?: number;
  focus(): void;
  setSelectionRange(start: number, end: number): void;
  undo?(): boolean;
  redo?(): boolean;
}

interface Props {
  value: string;
  path: string;
  textSize: number;
  readOnly?: boolean;
  initialCursor?: number;
  initialScrollTop?: number;
  onChange(value: string, start: number, end: number): void;
  onScroll?(): void;
  onSelectionChange?(): void;
  onHistoryAvailability?(undo: boolean, redo: boolean): void;
}

type StreamParserLoader = () => Promise<import("@codemirror/language").StreamParser<unknown>>;
type LanguageLoader = () => Promise<Extension>;

const streamLanguage =
  (load: StreamParserLoader): LanguageLoader =>
  () =>
    load().then((parser) =>
      StreamLanguage.define({
        ...parser,
        // Some CM5 legacy modes (notably JSON) emit `property`, while
        // Lezer's modern tag is `propertyName`. Mapping it here keeps the
        // lazy legacy parsers warning-free and on the shared syntax palette.
        tokenTable: { ...parser.tokenTable, property: tags.propertyName },
      }),
    );

/**
 * Keep the initial bundle small. Each legacy mode is a separate import chunk,
 * and the full JavaScript parser is loaded only for JavaScript/TypeScript
 * documents. Unsupported extensions still get the same editor UX as plain
 * source instead of falling back to an unscrollable textarea.
 */
const languageLoaders: Record<string, LanguageLoader> = {
  javascript: () =>
    import("@codemirror/lang-javascript").then(({ javascript }) => javascript({ jsx: true })),
  typescript: () =>
    import("@codemirror/lang-javascript").then(({ javascript }) =>
      javascript({ jsx: true, typescript: true }),
    ),
  json: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/javascript").then(({ json }) => json),
  ),
  yaml: streamLanguage(() => import("@codemirror/legacy-modes/mode/yaml").then(({ yaml }) => yaml)),
  xml: streamLanguage(() => import("@codemirror/legacy-modes/mode/xml").then(({ xml }) => xml)),
  css: streamLanguage(() => import("@codemirror/legacy-modes/mode/css").then(({ css }) => css)),
  scss: streamLanguage(() => import("@codemirror/legacy-modes/mode/css").then(({ sCSS }) => sCSS)),
  less: streamLanguage(() => import("@codemirror/legacy-modes/mode/css").then(({ less }) => less)),
  python: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/python").then(({ python }) => python),
  ),
  go: streamLanguage(() => import("@codemirror/legacy-modes/mode/go").then(({ go }) => go)),
  rust: streamLanguage(() => import("@codemirror/legacy-modes/mode/rust").then(({ rust }) => rust)),
  java: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/clike").then(({ java }) => java),
  ),
  c: streamLanguage(() => import("@codemirror/legacy-modes/mode/clike").then(({ c }) => c)),
  cpp: streamLanguage(() => import("@codemirror/legacy-modes/mode/clike").then(({ cpp }) => cpp)),
  sql: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/sql").then(({ standardSQL }) => standardSQL),
  ),
  shell: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/shell").then(({ shell }) => shell),
  ),
  powershell: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/powershell").then(({ powerShell }) => powerShell),
  ),
  ruby: streamLanguage(() => import("@codemirror/legacy-modes/mode/ruby").then(({ ruby }) => ruby)),
  toml: streamLanguage(() => import("@codemirror/legacy-modes/mode/toml").then(({ toml }) => toml)),
  kotlin: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/clike").then(({ kotlin }) => kotlin),
  ),
  csharp: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/clike").then(({ csharp }) => csharp),
  ),
  properties: streamLanguage(() =>
    import("@codemirror/legacy-modes/mode/properties").then(({ properties }) => properties),
  ),
};

const languageCache = new Map<string, Promise<Extension>>();

function loadLanguage(key: string): Promise<Extension> | undefined {
  const loader = languageLoaders[key];
  if (!loader) return undefined;
  const cached = languageCache.get(key);
  if (cached) return cached;
  const loaded = loader().catch(() => [] as Extension);
  languageCache.set(key, loaded);
  return loaded;
}

/** Resolve a file extension to the parser family used by the editor. */
export function languageKeyForPath(path = ""): string {
  const extension = fileExtension(path);
  if (["js", "mjs", "cjs", "jsx"].includes(extension)) return "javascript";
  if (["ts", "tsx"].includes(extension)) return "typescript";
  if (["json", "jsonc"].includes(extension)) return "json";
  if (["html", "htm", "svg", "vue", "svelte"].includes(extension)) return "xml";
  if (extension === "scss") return "scss";
  if (extension === "less") return "less";
  if (["yml", "yaml"].includes(extension)) return "yaml";
  if (["py"].includes(extension)) return "python";
  if (["rs"].includes(extension)) return "rust";
  if (["rb"].includes(extension)) return "ruby";
  if (["kt"].includes(extension)) return "kotlin";
  if (["cs"].includes(extension)) return "csharp";
  if (["h"].includes(extension)) return "c";
  if (["hpp"].includes(extension)) return "cpp";
  if (["gradle"].includes(extension)) return "groovy";
  if (["sh", "bash", "zsh", "fish"].includes(extension)) return "shell";
  if (["ps1"].includes(extension)) return "powershell";
  if (["ini", "cfg", "conf", "env", "gitignore", "editorconfig"].includes(extension)) {
    return "properties";
  }
  if (["bat", "cmd"].includes(extension)) return "shell";
  if (["patch"].includes(extension)) return "diff";
  return extension;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--mp-editor)",
    color: "var(--mp-syntax-text)",
    fontFamily: "var(--mp-font-code)",
    fontSize: "var(--markpad-code-size, 14px)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--mp-font-code)",
    lineHeight: "var(--mp-editor-line-height)",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "24px 28px 64px",
    caretColor: "var(--mp-accent)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--mp-editor)",
    borderRight: "1px solid var(--mp-border-soft)",
    color: "var(--mp-faint)",
    fontFamily: "var(--mp-font-code)",
    fontSize: "calc(var(--markpad-code-size, 14px) - 1px)",
    padding: "0 8px 0 14px",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--mp-hover)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--mp-selected-strong) !important",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--mp-accent)",
    borderLeftWidth: "2px",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--mp-accent-soft)",
    outline: "1px solid var(--mp-selected-border)",
  },
  ".cm-placeholder": {
    color: "var(--mp-faint)",
    fontStyle: "normal",
  },
});

const markpadHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--mp-syntax-comment)",
    fontStyle: "italic",
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
    ],
    color: "var(--mp-syntax-keyword)",
    fontWeight: "600",
  },
  {
    tag: [tags.string, tags.docString, tags.character, tags.attributeValue],
    color: "var(--mp-syntax-string)",
  },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--mp-syntax-number)" },
  { tag: [tags.bool, tags.null, tags.atom, tags.literal], color: "var(--mp-syntax-literal)" },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "var(--mp-syntax-type)",
    fontWeight: "600",
  },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--mp-syntax-title)",
  },
  { tag: [tags.variableName, tags.local(tags.variableName)], color: "var(--mp-syntax-variable)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--mp-syntax-attribute)" },
  {
    tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.compareOperator],
    color: "var(--mp-syntax-meta)",
  },
  {
    tag: [tags.meta, tags.processingInstruction, tags.labelName, tags.macroName],
    color: "var(--mp-syntax-meta)",
  },
  {
    tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
    color: "var(--mp-syntax-title)",
    fontWeight: "700",
  },
  { tag: [tags.link, tags.url], color: "var(--mp-syntax-attribute)", textDecoration: "underline" },
  { tag: tags.invalid, color: "var(--mp-syntax-deletion)", textDecoration: "underline wavy" },
]);

const clamp = (value: number, max: number) => Math.max(0, Math.min(Math.trunc(value), max));

export const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor(
  {
    value,
    path,
    textSize,
    readOnly = false,
    initialCursor = 0,
    initialScrollTop = 0,
    onChange,
    onScroll,
    onSelectionChange,
    onHistoryAvailability,
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const initialValue = useRef(value);
  const initialPath = useRef(path);
  const initialCursorRef = useRef(initialCursor);
  const initialScrollRef = useRef(initialScrollTop);
  const syncing = useRef(false);
  const languageRequest = useRef(0);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onHistoryAvailabilityRef = useRef(onHistoryAvailability);

  onChangeRef.current = onChange;
  onScrollRef.current = onScroll;
  onSelectionChangeRef.current = onSelectionChange;
  onHistoryAvailabilityRef.current = onHistoryAvailability;

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !syncing.current) {
        const next = update.state.doc.toString();
        const selection = update.state.selection.main;
        onChangeRef.current(next, selection.from, selection.to);
      }
      if (update.selectionSet) onSelectionChangeRef.current?.();
      if (update.docChanged) {
        onHistoryAvailabilityRef.current?.(
          undoDepth(update.state) > 0,
          redoDepth(update.state) > 0,
        );
      }
    });
    const state = EditorState.create({
      doc: initialValue.current,
      extensions: [
        language.current.of([]),
        editorTheme,
        syntaxHighlighting(markpadHighlightStyle),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        history(),
        indentOnInput(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({
          "aria-label": `${languageKeyForPath(initialPath.current) || "plain text"} editor`,
          spellcheck: "false",
        }),
        EditorView.editorAttributes.of({
          "data-editor": "codemirror",
        }),
        updateListener,
        ...(readOnly ? [] : [placeholder("Start writing…")]),
      ],
    });
    const currentView = new EditorView({ state, parent: target });
    const handleScroll = () => onScrollRef.current?.();
    currentView.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
    view.current = currentView;
    currentView.dispatch({
      selection: {
        anchor: clamp(initialCursorRef.current, currentView.state.doc.length),
      },
    });
    currentView.scrollDOM.scrollTop = Math.max(0, initialScrollRef.current);
    return () => {
      currentView.scrollDOM.removeEventListener("scroll", handleScroll);
      currentView.destroy();
      if (view.current === currentView) view.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    const currentView = view.current;
    if (!currentView) return;
    const current = currentView.state.doc.toString();
    if (current === value) return;
    syncing.current = true;
    currentView.dispatch({
      changes: { from: 0, to: currentView.state.doc.length, insert: value },
      selection: {
        anchor: clamp(currentView.state.selection.main.anchor, value.length),
        head: clamp(currentView.state.selection.main.head, value.length),
      },
      annotations: Transaction.addToHistory.of(false),
    });
    syncing.current = false;
  }, [value]);

  useEffect(() => {
    const currentView = view.current;
    if (!currentView) return;
    const key = languageKeyForPath(path);
    const request = ++languageRequest.current;
    currentView.contentDOM.setAttribute("aria-label", `${key || "plain text"} editor`);
    currentView.dispatch({ effects: language.current.reconfigure([]) });
    const loaded = loadLanguage(key);
    if (!loaded) return;
    void loaded.then((extension) => {
      if (request !== languageRequest.current || view.current !== currentView) return;
      currentView.dispatch({ effects: language.current.reconfigure(extension) });
    });
  }, [path]);

  useEffect(() => {
    host.current?.style.setProperty("--markpad-code-size", `${textSize}px`);
  }, [textSize]);

  useImperativeHandle(
    ref,
    () => ({
      get scrollTop() {
        return view.current?.scrollDOM.scrollTop ?? 0;
      },
      set scrollTop(value) {
        if (view.current) view.current.scrollDOM.scrollTop = Math.max(0, value);
      },
      get selectionStart() {
        return view.current?.state.selection.main.from ?? 0;
      },
      get selectionEnd() {
        return view.current?.state.selection.main.to ?? 0;
      },
      get clientHeight() {
        return view.current?.scrollDOM.clientHeight ?? 0;
      },
      get scrollHeight() {
        return view.current?.scrollDOM.scrollHeight ?? 0;
      },
      get lineHeight() {
        return view.current?.defaultLineHeight;
      },
      focus() {
        view.current?.focus();
      },
      setSelectionRange(start, end) {
        const currentView = view.current;
        if (!currentView) return;
        const max = currentView.state.doc.length;
        currentView.dispatch({
          selection: { anchor: clamp(start, max), head: clamp(end, max) },
          scrollIntoView: false,
        });
      },
      undo() {
        const currentView = view.current;
        return currentView ? undo(currentView) : false;
      },
      redo() {
        const currentView = view.current;
        return currentView ? redo(currentView) : false;
      },
    }),
    [],
  );

  const key = languageKeyForPath(path);
  const style = { "--markpad-code-size": `${textSize}px` } as CSSProperties;
  return (
    <div
      ref={host}
      id="editor"
      className="code-editor-host w-full h-full"
      data-language={key || "plain-text"}
      aria-label={`${key || "plain text"} editor`}
      style={style}
    />
  );
});
