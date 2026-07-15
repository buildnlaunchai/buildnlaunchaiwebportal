import type { Database } from "@/lib/database.types";

export type ApiProvider = Database["public"]["Enums"]["api_provider"];

/**
 * Per-provider teaching content for the key vault (CLAUDE.md §10, rule 3): a
 * one-paragraph "how to get this key", a direct link to the provider's key page,
 * and an honest note on likely cost. Not a legal disclaimer — a straight answer.
 *
 * `verifiable` marks providers the key-vault function can actually check with a
 * cheap call; the rest save as unverified and get proven by a real run.
 */
export type ProviderMeta = {
  value: ApiProvider;
  name: string;
  keyUrl: string;
  howTo: string;
  cost: string;
  verifiable: boolean;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    value: "openai",
    name: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    howTo: "Sign in, open API keys, and create a new secret key. Copy it once — OpenAI won't show it again.",
    cost: "Pennies per run for most text tools. You pay OpenAI directly, at their rates.",
    verifiable: true,
  },
  {
    value: "anthropic",
    name: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    howTo: "In the Anthropic console, go to API keys and create one. Copy it before you close the dialog.",
    cost: "Similar to OpenAI — a few cents per run on the smaller models.",
    verifiable: true,
  },
  {
    value: "google_ai",
    name: "Google AI (Gemini)",
    keyUrl: "https://aistudio.google.com/app/apikey",
    howTo: "In Google AI Studio, click Get API key and create one in a project. Copy the key.",
    cost: "Has a generous free tier; many runs cost nothing at all.",
    verifiable: true,
  },
  {
    value: "openrouter",
    name: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    howTo: "Create a key on OpenRouter. It routes to many models behind one key.",
    cost: "You pre-pay credits; per-run cost depends on the model the tool uses.",
    verifiable: true,
  },
  {
    value: "elevenlabs",
    name: "ElevenLabs",
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    howTo: "In ElevenLabs settings, open API keys and create one.",
    cost: "Voice generation is priced per character; a short clip is a fraction of a cent.",
    verifiable: true,
  },
  {
    value: "perplexity",
    name: "Perplexity",
    keyUrl: "https://www.perplexity.ai/settings/api",
    howTo: "In Perplexity API settings, generate a key. You'll need a small credit balance.",
    cost: "A few cents per search-grounded answer.",
    verifiable: true,
  },
  {
    value: "youtube_data",
    name: "YouTube Data API",
    keyUrl: "https://console.cloud.google.com/apis/credentials",
    howTo: "In Google Cloud, enable the YouTube Data API v3, then create an API key under Credentials.",
    cost: "Free within a daily quota. Most tools stay well inside it.",
    verifiable: false,
  },
  {
    value: "serper",
    name: "Serper",
    keyUrl: "https://serper.dev/api-key",
    howTo: "Sign up at serper.dev and copy your API key from the dashboard.",
    cost: "Free tier covers ~2,500 searches; then a few cents per hundred.",
    verifiable: false,
  },
  {
    value: "replicate",
    name: "Replicate",
    keyUrl: "https://replicate.com/account/api-tokens",
    howTo: "In your Replicate account, create an API token.",
    cost: "Billed per second of model compute — varies a lot by model.",
    verifiable: false,
  },
  {
    value: "fal",
    name: "fal.ai",
    keyUrl: "https://fal.ai/dashboard/keys",
    howTo: "Create a key in the fal.ai dashboard.",
    cost: "Per-run, mostly for image and video models.",
    verifiable: false,
  },
  {
    value: "apify",
    name: "Apify",
    keyUrl: "https://console.apify.com/settings/integrations",
    howTo: "In Apify settings → Integrations, copy your API token.",
    cost: "Free monthly credits; scraping-heavy runs can use more.",
    verifiable: false,
  },
  {
    value: "custom",
    name: "Custom",
    keyUrl: "",
    howTo: "For a tool that needs a key from a provider not listed here.",
    cost: "Whatever that provider charges.",
    verifiable: false,
  },
];

export const PROVIDER_BY_VALUE: Record<string, ProviderMeta> = Object.fromEntries(
  PROVIDERS.map((p) => [p.value, p]),
);

export function providerName(value: string): string {
  return PROVIDER_BY_VALUE[value]?.name ?? value;
}

// The honesty statement — verbatim from CLAUDE.md §10 / DESIGN.md §12. Nothing
// stronger than this may appear anywhere in the product.
export const KEY_HONESTY_COPY =
  "Your key is encrypted before it's stored. No screen in this product can show it back to you — or to me. A leaked database is useless without a key I keep off the server.";
