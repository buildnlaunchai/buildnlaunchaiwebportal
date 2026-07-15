import { Input, Label } from "@/components/ui/input";
import type { InputField, InputSchema } from "@/lib/tool-schema";

/**
 * A DISABLED render of a tool's form, from its input_schema (route map: "input
 * preview (disabled)"). It shows a visitor exactly what running the tool asks
 * for, without letting them run it. The live, validated version is <ToolForm>
 * in Phase 6 — this shares the field vocabulary but none of the behaviour.
 */
function PreviewField({ field }: { field: InputField }) {
  const common = "pointer-events-none opacity-70";

  return (
    <div className="flex flex-col gap-2">
      <Label required={field.required}>{field.label}</Label>

      {field.type === "textarea" ? (
        <textarea
          disabled
          rows={3}
          placeholder={field.placeholder}
          defaultValue={field.default != null ? String(field.default) : undefined}
          className={`min-h-24 w-full rounded-sm border border-line bg-surface px-3 py-2 text-body text-text placeholder:text-text-faint ${common}`}
        />
      ) : field.type === "select" || field.type === "multiselect" ? (
        <div
          className={`flex h-[38px] items-center rounded-sm border border-line bg-surface px-3 text-body text-text-muted ${common}`}
        >
          {field.options?.find((o) => o.value === field.default)?.label ??
            field.options?.[0]?.label ??
            "Choose…"}
        </div>
      ) : field.type === "checkbox" ? (
        <div className={`flex items-center gap-2 ${common}`}>
          <span className="size-4 rounded-sm border border-line bg-surface" />
          <span className="text-small text-text-muted">{field.help ?? field.label}</span>
        </div>
      ) : (
        <Input
          disabled
          type={field.type === "number" ? "number" : "text"}
          placeholder={field.placeholder}
          defaultValue={field.default != null ? String(field.default) : undefined}
          className={common}
        />
      )}

      {field.help && field.type !== "checkbox" && (
        <p className="text-small text-text-muted">{field.help}</p>
      )}
    </div>
  );
}

export function ToolFormPreview({ schema }: { schema: InputSchema }) {
  if (schema.fields.length === 0) {
    return (
      <p className="text-small text-text-faint">
        This tool runs with no input.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {schema.fields.map((field) => (
        <PreviewField key={field.name} field={field} />
      ))}
    </div>
  );
}
