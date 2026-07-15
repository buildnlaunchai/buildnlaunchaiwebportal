import { z } from "zod";

/* One schema, used on the client (react-hook-form) and re-checked on the server
   (the Server Action). CLAUDE.md §5: Zod validation is shared, never duplicated. */

// The spec-default option sets (CLAUDE.md §6.4). Exported so the form renders
// from the same source the schema validates against.
export const WILLINGNESS_TO_PAY = [
  { value: "$0", label: "$0 — free only" },
  { value: "<$20", label: "Under $20/mo" },
  { value: "$20-50", label: "$20–50/mo" },
  { value: "$50-100", label: "$50–100/mo" },
  { value: "$100+", label: "$100+/mo" },
] as const;

export const HEARD_FROM = [
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "skool", label: "Skool" },
  { value: "referral", label: "A referral" },
  { value: "other", label: "Somewhere else" },
] as const;

const wtpValues = WILLINGNESS_TO_PAY.map((o) => o.value) as [string, ...string[]];
const heardValues = HEARD_FROM.map((o) => o.value) as [string, ...string[]];

// Optional text field that treats "" as "not provided" and trims. A URL field
// is validated only when non-empty — an optional field must not punish leaving
// it blank.
const optionalText = z
  .string()
  .trim()
  .max(300, "Keep it under 300 characters.")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .url("That doesn't look like a full URL — include https://")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const applicationSchema = z.object({
  // The only required qualification answer (§6.4: use_case is not null).
  use_case: z
    .string()
    .trim()
    .min(20, "A sentence or two, so I know what you'd build.")
    .max(2000, "Keep it under 2000 characters."),

  tools_wanted: z.array(z.string()).max(50).optional(),

  willingness_to_pay: z.enum(wtpValues).optional(),
  heard_from: z.enum(heardValues).optional(),

  role_title: optionalText,
  company: optionalText,
  website_url: optionalUrl,
  socials: optionalText,
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
