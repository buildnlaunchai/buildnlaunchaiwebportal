/**
 * TypeScript shapes for tools.input_schema and tools.output_schema.
 *
 * These describe the JSON stored on a tool row (CLAUDE.md §3). Phase 2 uses them
 * only to render a DISABLED preview of a tool's form on the public page. The real
 * work — compiling input_schema into a Zod validator, and driving live forms —
 * is Phase 6 (lib/schema.ts). Keep these two in sync when that lands.
 */

export type InputFieldType =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "number"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date";
// Note: no "file". File upload is out of the MVP (CLAUDE.md §3).

export type SelectOption = { value: string; label: string };

export type InputField = {
  name: string;
  label: string;
  type: InputFieldType;
  placeholder?: string;
  required?: boolean;
  help?: string;
  default?: string | number | boolean;
  options?: SelectOption[];
  validation?: { pattern?: string; min?: number; max?: number };
};

export type InputSchema = { fields: InputField[] };

export type OutputBlockType =
  | "markdown"
  | "table"
  | "json"
  | "file"
  | "image";

export type OutputBlock = {
  type: OutputBlockType;
  key: string;
  label?: string;
  columns?: string[];
  collapsed?: boolean;
};

export type OutputSchema = { type: "blocks"; blocks: OutputBlock[] };

/**
 * Parse the jsonb from the database into a typed schema. Defensive: a tool row
 * authored by hand (or by a future admin editor) might be malformed, and a
 * public page must degrade to "no fields" rather than throw.
 */
export function parseInputSchema(value: unknown): InputSchema {
  if (value && typeof value === "object" && Array.isArray((value as InputSchema).fields)) {
    return value as InputSchema;
  }
  return { fields: [] };
}

export function parseOutputSchema(value: unknown): OutputSchema {
  if (value && typeof value === "object" && Array.isArray((value as OutputSchema).blocks)) {
    return value as OutputSchema;
  }
  return { type: "blocks", blocks: [] };
}
