export interface TaskColor {
  l: number;
  c: number;
  h: number;
}
export interface TaskColors {
  categories: Record<string, TaskColor>;
  tags: Record<string, TaskColor>;
}
const PREFIX = "<!-- quillpane:colors ";
export const emptyTaskColors = (): TaskColors => ({
  categories: Object.create(null),
  tags: Object.create(null),
});
export function validTaskColor(value: unknown): TaskColor {
  if (!value || typeof value !== "object") throw Error("Invalid task color.");
  const { l, c, h } = value as TaskColor;
  if (
    ![l, c, h].every(Number.isFinite) ||
    l < 0.25 ||
    l > 0.9 ||
    c < 0 ||
    c > 0.25 ||
    h < 0 ||
    h > 360
  )
    throw Error("Invalid OKLCH color.");
  return { l, c, h };
}
function colorRecords(content: string) {
  const records: { text: string; start: number; end: number }[] = [];
  let fence = "",
    size = 0,
    offset = 0;
  for (const raw of content.split(/(?<=\n)/)) {
    const text = raw.replace(/\r?\n$/, "");
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (match) {
      if (!fence) {
        fence = match[1][0];
        size = match[1].length;
      } else if (match[1][0] === fence && match[1].length >= size && !match[2].trim()) fence = "";
    } else if (!fence && text.startsWith(PREFIX))
      records.push({ text, start: offset, end: offset + raw.length });
    offset += raw.length;
  }
  return records;
}
export function readTaskColors(content: string): TaskColors {
  const records = colorRecords(content);
  if (!records.length) return emptyTaskColors();
  if (records.length > 1 || !records[0].text.endsWith(" -->"))
    throw Error("Keep one valid task color record in Editor.");
  const raw = JSON.parse(records[0].text.slice(PREFIX.length, -4));
  const result = emptyTaskColors();
  for (const kind of ["categories", "tags"] as const) {
    if (!raw[kind] || typeof raw[kind] !== "object" || Array.isArray(raw[kind]))
      throw Error("Invalid task color map.");
    const entries = Object.entries(raw[kind]);
    if (entries.length > 256) throw Error("Use up to 256 custom colors per group.");
    for (const [name, value] of entries) {
      if (
        !name.trim() ||
        name.length > 40 ||
        /[<>]/.test(name) ||
        [...name].some((c) => c.charCodeAt(0) < 32)
      )
        throw Error("Invalid color label.");
      Object.defineProperty(result[kind], name, {
        value: validTaskColor(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result;
}
export function setTaskColor(
  content: string,
  kind: keyof TaskColors,
  name: string,
  color?: TaskColor,
): string {
  const colors = readTaskColors(content);
  if (color)
    Object.defineProperty(colors[kind], name, {
      value: validTaskColor(color),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  else delete colors[kind][name];
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const record = PREFIX + JSON.stringify(colors) + " -->";
  const existing = colorRecords(content)[0];
  const result = existing
    ? content.slice(0, existing.start) +
      record +
      (content.slice(existing.start, existing.end).endsWith("\n") ? eol : "") +
      content.slice(existing.end)
    : content.replace(/\r?\n/, eol + record + eol);
  readTaskColors(result);
  return result;
}
export function automaticTaskColor(name: string): TaskColor {
  if (!name) return { l: 0.65, c: 0, h: 0 };
  const defaults: Record<string, number> = {
    backlog: 285,
    "to do": 245,
    today: 75,
    done: 155,
    work: 245,
    personal: 325,
  };
  let hash = 0;
  for (const c of name.toLowerCase()) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  return {
    l: 0.65,
    c: 0.14,
    h: Object.hasOwn(defaults, name.toLowerCase()) ? defaults[name.toLowerCase()] : hash % 360,
  };
}
/** OKLCH to sRGB, clamped at the display gamut boundary. */
export function colorRGB({ l, c, h }: TaskColor): number[] {
  const a = c * Math.cos((h * Math.PI) / 180),
    b = c * Math.sin((h * Math.PI) / 180);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ].map((v) =>
    Math.round(
      255 * Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)),
    ),
  );
}
