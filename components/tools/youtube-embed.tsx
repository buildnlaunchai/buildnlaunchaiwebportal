/**
 * Embeds a YouTube build video on a tool page. Uses youtube-nocookie and only
 * renders if we can parse a video id — a malformed URL degrades to nothing
 * rather than a broken frame.
 */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const id = youtubeId(url);
  if (!id) return null;

  return (
    // §5: --radius-md, 1px --line. 16:9 without a layout shift.
    <div className="aspect-video w-full overflow-hidden rounded-md border border-line bg-sunken">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={`${title} — build video`}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="size-full"
      />
    </div>
  );
}
