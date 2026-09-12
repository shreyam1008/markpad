import { expect, test } from "bun:test";

import { pairedScrollTop } from "../src/preview/scroll";

test("split scrolling maps progress in either direction and reaches the end", () => {
  const source = { scrollTop: 400, scrollHeight: 1000, clientHeight: 200 };
  const target = { scrollTop: 0, scrollHeight: 2000, clientHeight: 400 };
  expect(pairedScrollTop(source, target)).toBe(800);
  expect(pairedScrollTop({ ...target, scrollTop: 800 }, source)).toBe(400);
  expect(pairedScrollTop({ ...source, scrollTop: 800 }, target)).toBe(1600);
});

test("short panes and overscroll never produce invalid positions", () => {
  const short = { scrollTop: 0, scrollHeight: 100, clientHeight: 200 };
  const long = { scrollTop: -20, scrollHeight: 1000, clientHeight: 200 };
  expect(pairedScrollTop(short, long)).toBe(0);
  expect(pairedScrollTop(long, short)).toBe(0);
  expect(pairedScrollTop(long, long)).toBe(0);
  expect(pairedScrollTop({ ...long, scrollTop: 2000 }, long)).toBe(800);
});
