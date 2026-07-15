import { z } from "zod";

import type { InputField, InputSchema } from "@/lib/tool-schema";

/**
 * Compile a tool's input_schema (JSON) into a Zod validator (CLAUDE.md §6, §9).
 * Shared: the ToolForm uses it for client-side validation, and startRun uses the
 * SAME compiled schema to re-validate on the server. One source of truth for
 * what a tool accepts — never two copies that can drift.
 */
function fieldToZod(field: InputField): z.ZodTypeAny {
  const required = field.required ?? false;

  switch (field.type) {
    case "number": {
      let n = z.coerce.number({ message: `${field.label} must be a number.` });
      if (typeof field.validation?.min === "number") n = n.min(field.validation.min);
      if (typeof field.validation?.max === "number") n = n.max(field.validation.max);
      return required ? n : n.optional();
    }

    case "checkbox":
      return z.coerce.boolean().optional().default(false);

    case "select": {
      const values = (field.options ?? []).map((o) => o.value);
      if (values.length === 0) return z.string().optional();
      const e = z.enum(values as [string, ...string[]]);
      return required ? e : e.optional();
    }

    case "multiselect": {
      const values = (field.options ?? []).map((o) => o.value);
      const arr =
        values.length > 0
          ? z.array(z.enum(values as [string, ...string[]]))
          : z.array(z.string());
      return required ? arr.min(1, `Pick at least one ${field.label}.`) : arr.optional();
    }

    case "url": {
      const u = z.string().url(`${field.label} must be a full URL (https://…).`);
      return withText(u, field, required);
    }

    case "email": {
      const em = z.string().email(`${field.label} must be an email address.`);
      return withText(em, field, required);
    }

    case "date":
    case "text":
    case "textarea":
    default: {
      let s = z.string();
      if (field.validation?.pattern) {
        try {
          s = s.regex(new RegExp(field.validation.pattern), `${field.label} isn't in the expected format.`);
        } catch {
          /* a bad pattern in the schema shouldn't crash the form */
        }
      }
      return withText(s, field, required);
    }
  }
}

/** Required → min(1) with a friendly message; optional → "" becomes undefined. */
function withText(base: z.ZodString, field: InputField, required: boolean): z.ZodTypeAny {
  if (required) return base.min(1, `${field.label} is required.`);
  return base.optional().or(z.literal("").transform(() => undefined));
}

// Return the concrete ZodObject (not a widened ZodType) so @hookform/resolvers
// accepts it directly.
export function compileInputSchema(schema: InputSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of schema.fields) {
    shape[field.name] = fieldToZod(field);
  }
  return z.object(shape);
}

/** Default form values from the schema, for react-hook-form. */
export function defaultValuesFor(schema: InputSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.default !== undefined) out[field.name] = field.default;
    else if (field.type === "multiselect") out[field.name] = [];
    else if (field.type === "checkbox") out[field.name] = false;
    else out[field.name] = "";
  }
  return out;
}
