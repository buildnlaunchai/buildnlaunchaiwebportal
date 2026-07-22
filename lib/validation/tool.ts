import { z } from "zod";

/* The tool draft the editor saves. Shared between the editor form and the
   Server Action, so validation is defined once. tool_secrets fields
   (function_name, embed_url, external_url) travel WITH the draft but are written
   to the separate table by the action, never exposed to a client (§6.6b). */

const PROVIDERS = [
  "openai", "anthropic", "google_ai", "openrouter", "elevenlabs",
  "replicate", "fal", "perplexity", "serper", "apify", "youtube_data", "custom",
] as const;

const inputField = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/i, "Field name: letters, numbers, underscore."),
  label: z.string().min(1),
  type: z.enum([
    "text", "textarea", "url", "email", "number",
    "select", "multiselect", "checkbox", "date",
  ]),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  help: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
  validation: z
    .object({
      pattern: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
});

const outputBlock = z.object({
  type: z.enum(["markdown", "table", "json", "file", "image"]),
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/i, "Block key: letters, numbers, underscore."),
  label: z.string().optional(),
  columns: z.array(z.string()).optional(),
  collapsed: z.boolean().optional(),
});

export const toolDraftSchema = z.object({
  slug: z
    .string()
    .min(1)
    // Allow BOTH hyphen and underscore separators: existing tools were seeded
    // with underscore slugs (image_animator, cinematic_workflow) that are used
    // in live URLs, embed tokens, and handler dispatch — hyphen-only rejected
    // them on save.
    .regex(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
      "Slug: lowercase words separated by hyphens or underscores.",
    ),
  name: z.string().min(1, "Name is required."),
  tagline: z.string().min(1, "A one-line tagline is required."),
  description: z.string().optional().or(z.literal("")),
  category: z.string().optional().or(z.literal("")),
  icon: z.string().optional().or(z.literal("")),
  cover_image_url: z.string().url().optional().or(z.literal("")),
  video_url: z.string().url().optional().or(z.literal("")),

  status: z.enum(["draft", "coming_soon", "published", "maintenance", "archived"]),
  access_type: z.enum(["public_preview", "members", "plan", "manual"]),
  runtime: z.enum(["edge_function", "internal", "iframe", "external_link"]),

  // Showcase this tool in the catalog's featured hero.
  is_featured: z.boolean().optional(),

  timeout_seconds: z.coerce.number().int().min(5).max(400),
  rate_limit_per_day: z.coerce.number().int().min(1).nullable().optional(),

  required_providers: z.array(z.enum(PROVIDERS)),

  input_schema: z.object({ fields: z.array(inputField) }),
  output_schema: z.object({
    type: z.literal("blocks"),
    blocks: z.array(outputBlock),
  }),

  // tool_secrets — written to the separate table by the action.
  function_name: z.string().optional().or(z.literal("")),
  embed_url: z.string().url().optional().or(z.literal("")),
  external_url: z.string().url().optional().or(z.literal("")),
});

export type ToolDraft = z.infer<typeof toolDraftSchema>;
export { PROVIDERS };
