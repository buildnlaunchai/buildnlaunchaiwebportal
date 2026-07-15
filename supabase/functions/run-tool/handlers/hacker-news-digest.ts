import type { Handler } from "../../_shared/types.ts";

// A REAL tool that runs on the free Hacker News (Algolia) API — no key, no
// account, nothing to connect. It's the funnel: a stranger can run something
// useful in 30 seconds. It's also what lets the runner be verified end to end
// without a provider key.

const WINDOW_SECONDS: Record<string, number> = {
  today: 86_400,
  week: 7 * 86_400,
  month: 30 * 86_400,
};

type HNHit = {
  title: string | null;
  points: number | null;
  num_comments: number | null;
  objectID: string;
  url: string | null;
};

const handler: Handler = async ({ input }) => {
  const topic = String(input.topic ?? "").trim();
  const timeframe = String(input.timeframe ?? "today");
  const maxItems = Math.min(Math.max(Number(input.max_items ?? 10) || 10, 1), 30);

  const since =
    Math.floor(Date.now() / 1000) - (WINDOW_SECONDS[timeframe] ?? WINDOW_SECONDS.today);

  const url = new URL("https://hn.algolia.com/api/v1/search");
  if (topic) url.searchParams.set("query", topic);
  url.searchParams.set("tags", "story");
  url.searchParams.set("numericFilters", `created_at_i>${since},points>2`);
  url.searchParams.set("hitsPerPage", String(maxItems));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hacker News is unavailable right now (${res.status}).`);
  const data = (await res.json()) as { hits: HNHit[] };

  const stories = (data.hits ?? [])
    .filter((h) => h.title)
    .map((h) => ({
      title: h.title!,
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    }));

  if (stories.length === 0) {
    return {
      digest: `No Hacker News stories about **${topic || "anything"}** in that window. Try a broader topic or a longer timeframe.`,
      stories: [],
    };
  }

  // The digest is a plain formatted summary — no LLM, because this tool takes no
  // key. Honest for a keyless tool: it organizes, it doesn't opine.
  const top = stories.slice(0, 5);
  const label = topic ? `about “${topic}”` : "on Hacker News";
  const digest = [
    `## ${stories.length} stories ${label}`,
    "",
    ...top.map(
      (s, i) => `${i + 1}. **${s.title}** — ${s.points} points, ${s.comments} comments`,
    ),
    "",
    stories.length > top.length
      ? `_…and ${stories.length - top.length} more in the table below._`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { digest, stories };
};

export default handler;
