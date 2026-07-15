"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { compileInputSchema, defaultValuesFor } from "@/lib/schema";
import type { InputField, InputSchema } from "@/lib/tool-schema";
import { cn } from "@/lib/utils";

/**
 * The generic form renderer (CLAUDE.md §3) — auto-built from a tool's
 * input_schema, validated with the SAME Zod schema startRun re-checks on the
 * server. One of the two components at the heart of the product.
 */
export function ToolForm({
  schema,
  pending,
  disabled,
  onRun,
}: {
  schema: InputSchema;
  pending: boolean;
  disabled?: boolean;
  onRun: (values: Record<string, unknown>) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(compileInputSchema(schema)),
    defaultValues: defaultValuesFor(schema),
  });

  return (
    <form onSubmit={handleSubmit(onRun)} className="flex flex-col gap-5">
      {schema.fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          register={register}
          setValue={setValue}
          watch={watch}
          error={errors[field.name]?.message as string | undefined}
        />
      ))}

      {/* §8: the button says Run → Running. Its pending state shows a spinner at
          the measured width, so nothing jumps; the panel carries the rest of the
          choreography. */}
      <Button type="submit" variant="primary" size="lg" pending={pending} disabled={disabled}>
        {pending ? "Running" : "Run"}
      </Button>
    </form>
  );
}

type FieldProps = {
  field: InputField;
  register: ReturnType<typeof useForm>["register"];
  setValue: ReturnType<typeof useForm>["setValue"];
  watch: ReturnType<typeof useForm>["watch"];
  error?: string;
};

function Field({ field, register, setValue, watch, error }: FieldProps) {
  const describedBy = error ? `${field.name}-error` : field.help ? `${field.name}-help` : undefined;
  const selected = (watch(field.name) as string[]) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name} required={field.required}>
        {field.label}
      </Label>

      {field.type === "textarea" ? (
        <Textarea id={field.name} rows={4} placeholder={field.placeholder} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...register(field.name)} />
      ) : field.type === "select" ? (
        <Select id={field.name} aria-invalid={error ? true : undefined} {...register(field.name)}>
          {!field.required && <option value="">—</option>}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : field.type === "multiselect" ? (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setValue(
                    field.name,
                    on ? selected.filter((v) => v !== o.value) : [...selected, o.value],
                    { shouldValidate: true },
                  )
                }
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-small transition-colors duration-micro ease-default",
                  on
                    ? "border-accent bg-accent-quiet text-accent"
                    : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : field.type === "checkbox" ? (
        <label className="flex items-center gap-2 text-small text-text-muted">
          <input type="checkbox" className="size-4 rounded-sm border-line" {...register(field.name)} />
          {field.help ?? field.label}
        </label>
      ) : (
        <Input
          id={field.name}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          placeholder={field.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...register(field.name)}
        />
      )}

      {error ? (
        <p id={`${field.name}-error`} className="text-small text-danger" role="alert">
          {error}
        </p>
      ) : field.help && field.type !== "checkbox" ? (
        <p id={`${field.name}-help`} className="text-small text-text-muted">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
