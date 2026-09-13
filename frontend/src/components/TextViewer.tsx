import { memo, useMemo } from "react";

import { textBlocks } from "../preview/text-blocks";

export const TextViewer = memo(function TextViewer({ content }: { content: string }) {
  const blocks = useMemo(
    () =>
      (content.length > 200_000 ? textBlocks(content) : [content]).map((text) => {
        let lines = text.endsWith("\n") ? 0 : 1;
        for (let index = 0; index < text.length; index++) {
          if (text.charCodeAt(index) === 10) lines++;
        }
        return { text, lines: Math.max(1, lines) };
      }),
    [content],
  );
  return (
    <pre className="plain-text-view">
      {blocks.length === 1
        ? content
        : blocks.map((block, index) => (
            <span
              className="text-view-block"
              key={index}
              style={{ containIntrinsicBlockSize: `auto ${block.lines * 1.75}em` }}
            >
              {block.text}
            </span>
          ))}
    </pre>
  );
});
