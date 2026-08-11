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

export function fuzzyMatch(query: string, value: string): FuzzyMatch | null {
  const needle = query.replace(/\s+/g, "").toLocaleLowerCase();
  const haystack = value.toLocaleLowerCase();
  if (!needle) return { score: 0, indices: [] };

  const indices: number[] = [];
  let cursor = 0;
  let previous = -2;
  let score = 0;

  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index === -1) return null;

    const before = index === 0 ? "" : value[index - 1];
    const boundary = index === 0 || /[\s/\\_.-]/.test(before);
    const consecutive = index === previous + 1;
    const gap = previous < 0 ? index : index - previous - 1;

    score += 10;
    if (boundary) score += 14;
    if (consecutive) score += 9;
    score -= Math.min(gap, 12);

    indices.push(index);
    previous = index;
    cursor = index + 1;
  }

  score -= Math.max(0, value.length - needle.length) * 0.04;
  return { score, indices };
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
    return [...this.commands.values()].flatMap((command) => {
      if (command.enabled && !command.enabled()) return [];
      const haystack = [command.title, command.category, ...(command.keywords ?? [])]
        .join(" ")
      const match = fuzzyMatch(query, haystack);
      return match ? [{ command, score: match.score }] : [];
    }).sort((a, b) => b.score - a.score).map(({ command }) => command);
  }

  async execute(id: string) {
    const command = this.commands.get(id);
    if (!command || (command.enabled && !command.enabled())) return false;
    await command.run();
    return true;
  }
}
