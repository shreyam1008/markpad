export type Command = {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  keywords?: string[];
  enabled?: () => boolean;
  run: () => void | Promise<void>;
};

export type FuzzyMatch = {
  score: number;
  indices: number[];
};

export interface PaletteFileMatch {
  id: string;
  title: string;
  category: string;
  score: number;
  indices: number[];
  noteId?: string;
  path?: string;
}

export function fuzzyMatch(query: string, value: string): FuzzyMatch | null {
  const needle = query.replace(/\s+/g, "").toLocaleLowerCase();
  const haystack = value.toLocaleLowerCase();
  if (!needle) return { score: 0, indices: [] };

  const indices: number[] = [];
  let cursor = 0;
  let previous = -2;
  let previousWidth = 1;
  let score = 0;

  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index === -1) return null;

    const before = index === 0 ? "" : value[index - 1];
    const boundary = index === 0 || /[\s/\\_.-]/.test(before);
    const consecutive = index === previous + previousWidth;
    const gap = previous < 0 ? index : index - previous - previousWidth;

    score += 10;
    if (boundary) score += 14;
    if (consecutive) score += 9;
    score -= Math.min(gap, 12);

    for (let offset = 0; offset < character.length; offset++) indices.push(index + offset);
    previous = index;
    previousWidth = character.length;
    cursor = index + character.length;
  }

  score -= Math.max(0, value.length - needle.length) * 0.04;
  return { score, indices };
}

export function rankPaletteFiles(
  query: string,
  notes: NoteInfo[],
  workspaceFiles: WorkspaceFile[],
  activeId: string,
  limit = 60,
): PaletteFileMatch[] {
  const matches: PaletteFileMatch[] = [];
  const openPaths = new Set<string>();

  if (!query.trim()) {
    const orderedNotes = [...notes].sort((left, right) => {
      if (left.id === activeId) return -1;
      if (right.id === activeId) return 1;
      return 0;
    });
    for (const note of orderedNotes) {
      if (matches.length >= limit) return matches;
      if (note.path) openPaths.add(note.path);
      matches.push({
        id: `document.${note.id}`,
        title: note.title || "Untitled",
        category: note.id === activeId ? "Current file" : note.path ? note.path : "Unsaved draft",
        score: note.id === activeId ? 2 : 1,
        indices: [],
        noteId: note.id,
      });
    }
    for (const file of workspaceFiles) {
      if (matches.length >= limit) break;
      if (openPaths.has(file.path)) continue;
      matches.push({
        id: `workspace.${file.path}`,
        title: file.name,
        category: file.relative,
        score: 0,
        indices: [],
        path: file.path,
      });
    }
    return matches;
  }

  for (const note of notes) {
    if (note.path) openPaths.add(note.path);
    const title = note.title || "Untitled";
    const category = note.id === activeId ? "Current file" : note.path || "Unsaved draft";
    const titleMatch = fuzzyMatch(query, title);
    const fullMatch = titleMatch ?? fuzzyMatch(query, `${title} ${category}`);
    if (!fullMatch) continue;
    matches.push({
      id: `document.${note.id}`,
      title,
      category,
      score: fullMatch.score + (titleMatch ? 40 : 0) + (note.id === activeId ? 4 : 12),
      indices: titleMatch?.indices ?? [],
      noteId: note.id,
    });
  }

  for (const file of workspaceFiles) {
    if (openPaths.has(file.path)) continue;
    const titleMatch = fuzzyMatch(query, file.name);
    const fullMatch = titleMatch ?? fuzzyMatch(query, file.relative);
    if (!fullMatch) continue;
    matches.push({
      id: `workspace.${file.path}`,
      title: file.name,
      category: file.relative,
      score: fullMatch.score + (titleMatch ? 30 : 0),
      indices: titleMatch?.indices ?? [],
      path: file.path,
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  register(...commands: Command[]) {
    for (const command of commands) this.commands.set(command.id, command);
  }

  available(query = "") {
    if (!query.trim()) {
      return [...this.commands.values()].filter((command) => !command.enabled || command.enabled());
    }
    return [...this.commands.values()]
      .flatMap((command) => {
        if (command.enabled && !command.enabled()) return [];
        const haystack = [command.title, command.category, ...(command.keywords ?? [])].join(" ");
        const match = fuzzyMatch(query, haystack);
        return match ? [{ command, score: match.score }] : [];
      })
      .sort((a, b) => b.score - a.score)
      .map(({ command }) => command);
  }

  async execute(id: string) {
    const command = this.commands.get(id);
    if (!command || (command.enabled && !command.enabled())) return false;
    await command.run();
    return true;
  }
}
import type { NoteInfo, WorkspaceFile } from "./workspace/types";
