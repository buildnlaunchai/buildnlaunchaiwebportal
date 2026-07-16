import { type Handler, ProviderAuthError, providerFetch } from "../../_shared/types.ts";

// Google/YouTube returns 400 (not 401) with an "API key not valid" body for a
// bad key — providerFetch only catches 401/403, so we detect that here and turn
// it into the same first-class "your key stopped working" path.
async function youtubeFetch(url: URL): Promise<Response> {
  const res = await providerFetch("youtube_data", url);
  if (res.ok) return res;
  if (res.status === 400 || res.status === 403) {
    const body = await res.clone().text();
    if (/api key not valid|API_KEY_INVALID|keyInvalid/i.test(body)) {
      throw new ProviderAuthError("youtube_data");
    }
  }
  return res;
}

// Real tool: searches YouTube for channels in a niche (YouTube Data API), then
// writes a short read on who's worth reaching (OpenAI). Runs on the member's own
// youtube_data + openai keys. Untested by CI (no keys in CI); the admin verifies
// it with their own keys.

type YTSearchItem = { snippet?: { channelId?: string } };
type YTChannel = {
  id: string;
  snippet?: { title?: string; description?: string; customUrl?: string };
  statistics?: { subscriberCount?: string };
};

const handler: Handler = async ({ input, secrets }) => {
  const query = String(input.query ?? "").trim();
  const minSubs = Number(input.min_subscribers ?? 0) || 0;
  const maxResults = Math.min(Math.max(Number(input.max_results ?? 25) || 25, 1), 50);
  const yt = secrets.youtube_data;
  const openai = secrets.openai;

  // 1. Find channels matching the niche.
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("key", yt);

  const searchRes = await youtubeFetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube search failed (${searchRes.status}).`);
  const search = (await searchRes.json()) as { items?: YTSearchItem[] };
  const channelIds = (search.items ?? [])
    .map((i) => i.snippet?.channelId)
    .filter((v): v is string => Boolean(v));

  if (channelIds.length === 0) {
    return { summary: `No channels found for “${query}”.`, leads: [], raw: search };
  }

  // 2. Pull stats for those channels.
  const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  chUrl.searchParams.set("part", "snippet,statistics");
  chUrl.searchParams.set("id", channelIds.join(","));
  chUrl.searchParams.set("key", yt);
  const chRes = await youtubeFetch(chUrl);
  if (!chRes.ok) throw new Error(`YouTube channels lookup failed (${chRes.status}).`);
  const channels = (await chRes.json()) as { items?: YTChannel[] };

  const leads = (channels.items ?? [])
    .map((c) => ({
      channel: c.snippet?.title ?? "—",
      subscribers: Number(c.statistics?.subscriberCount ?? 0),
      contact: c.snippet?.customUrl ? `youtube.com/${c.snippet.customUrl}` : "—",
      url: `https://www.youtube.com/channel/${c.id}`,
    }))
    .filter((l) => l.subscribers >= minSubs)
    .sort((a, b) => b.subscribers - a.subscribers);

  // 3. A short read on who's worth the time (OpenAI).
  let summary = `Found ${leads.length} channels over ${minSubs.toLocaleString()} subscribers.`;
  if (leads.length > 0 && openai) {
    const prompt =
      `You're helping someone find creators to partner with in "${query}". ` +
      `Here are channels (name — subscribers): ` +
      leads.slice(0, 15).map((l) => `${l.channel} — ${l.subscribers}`).join("; ") +
      `. In 3-4 sentences, say which look most worth reaching out to and why. Be specific, no fluff.`;

    const aiRes = await providerFetch("openai", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openai}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 220,
      }),
    });
    if (aiRes.ok) {
      const ai = (await aiRes.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      summary = ai.choices?.[0]?.message?.content?.trim() || summary;
    }
  }

  return { summary, leads };
};

export default handler;
