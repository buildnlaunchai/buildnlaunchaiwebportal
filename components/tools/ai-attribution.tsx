import { PROVIDERS, type ApiProvider } from "@/lib/providers";

/**
 * The third-party AI attribution line shown under a tool's title, on the public
 * tool page and in the dashboard runner.
 *
 * WHY THIS EXISTS: payment providers reviewing "AI wrapper" businesses require
 * that a product built on third-party models says so, and says plainly that it
 * is not affiliated with them. The site-wide statement lives in the footer; this
 * is the per-tool half — the specific model behind THIS tool.
 *
 * It is derived from `required_providers` wherever that column tells the truth,
 * which is every edge_function tool. It cannot be derived for the two iframe
 * tools: their apps bring their own compute, so `required_providers` is empty and
 * says nothing about what they run. Those get explicit entries below, and they
 * have to be maintained by hand — if you change what an embedded app uses, change
 * it here too. A stale attribution is worse than none.
 */

/** Tools whose stack the `tools` row cannot describe. Keyed by slug. */
const EXPLICIT: Record<string, { line: string; unaffiliated?: string[] }> = {
  // Runs entirely client-side via Transformers.js: onnx-community/ormbg-ONNX for
  // background removal and onnx-community/depth-anything-v2-small for depth.
  // Open models, loaded from a public CDN into the browser — no API, no vendor.
  image_animator: {
    line: "Runs open-source models (ORMBG, Depth Anything V2) in your browser via Transformers.js. No AI service receives your image.",
    unaffiliated: ["Hugging Face"],
  },
  // Verified against the app's own source: no AI dependency, no model, no AI
  // provider call. It is a video review tool. Saying "no AI" plainly is both
  // accurate and the strongest thing we can say to a reviewer.
  cinematic_workflow: {
    line: "No AI model is used. Video review and collaboration only — your files stay in your own storage.",
  },
};

/** Providers that are AI model vendors; the rest are data APIs, not models. */
const MODEL_PROVIDERS = new Set<ApiProvider>([
  "openai",
  "anthropic",
  "google_ai",
  "openrouter",
  "elevenlabs",
  "replicate",
  "fal",
  "perplexity",
]);

const nameOf = (p: ApiProvider) =>
  PROVIDERS.find((x) => x.value === p)?.name ?? p;

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function AiAttribution({
  slug,
  providers,
  className,
}: {
  slug: string;
  providers: ApiProvider[];
  className?: string;
}) {
  const explicit = EXPLICIT[slug];

  let line: string;
  let unaffiliated: string[];

  if (explicit) {
    line = explicit.line;
    unaffiliated = explicit.unaffiliated ?? [];
  } else {
    const models = providers.filter((p) => MODEL_PROVIDERS.has(p)).map(nameOf);
    const data = providers.filter((p) => !MODEL_PROVIDERS.has(p)).map(nameOf);

    if (models.length === 0 && data.length === 0) {
      // A keyless tool with no providers at all. Still worth stating: "no AI" is
      // a trust signal, not an omission.
      line = "No third-party AI model is used.";
      unaffiliated = [];
    } else {
      const parts: string[] = [];
      if (models.length > 0) parts.push(`Powered by ${list(models)}`);
      if (data.length > 0) parts.push(`${list(data)} for data`);
      line = `${parts.join(" · ")}.`;
      unaffiliated = [...models, ...data];
    }
  }

  return (
    <p className={className}>
      {line}
      {unaffiliated.length > 0 && (
        <>
          {" "}
          Build &amp; Launch AI is not affiliated with, endorsed by, or sponsored
          by {list(unaffiliated)}.
        </>
      )}
    </p>
  );
}
