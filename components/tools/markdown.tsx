import { Fragment } from "react";

/**
 * A minimal, dependency-free markdown renderer for tool output and the digest
 * blocks. Handles the subset tools actually emit: ## headings, - / 1. lists,
 * **bold**, `code`, and paragraphs. It never renders raw HTML — every node is
 * built as JSX from parsed text, so there's no injection surface from tool
 * output. A fuller renderer can replace this later if a tool needs it.
 */
function inline(text: string, keyBase: string) {
  // Split on **bold** and `code`, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={`${keyBase}-${i}`} className="font-semibold text-text">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={`${keyBase}-${i}`} className="text-mono rounded-sm bg-sunken px-1 py-0.5">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={`${keyBase}-${i}`}>{p}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={`${key}-li-${i}`} className="text-body text-text-muted">
        {inline(it, `${key}-li-${i}`)}
      </li>
    ));
    nodes.push(
      list.ordered ? (
        <ol key={key} className="ml-5 flex list-decimal flex-col gap-1">
          {items}
        </ol>
      ) : (
        <ul key={key} className="ml-5 flex list-disc flex-col gap-1">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const key = `md-${i}`;

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);

    if (heading) {
      flushList(`${key}-fl`);
      nodes.push(
        <h3 key={key} className="text-h3 mt-2">
          {inline(heading[2], key)}
        </h3>,
      );
    } else if (ordered) {
      if (!list || !list.ordered) {
        flushList(`${key}-fl`);
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
    } else if (bullet) {
      if (!list || list.ordered) {
        flushList(`${key}-fl`);
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
    } else if (line.trim() === "") {
      flushList(`${key}-fl`);
    } else {
      flushList(`${key}-fl`);
      nodes.push(
        <p key={key} className="text-body text-text-muted">
          {inline(line, key)}
        </p>,
      );
    }
  });
  flushList("md-final");

  return <div className="flex flex-col gap-3">{nodes}</div>;
}
