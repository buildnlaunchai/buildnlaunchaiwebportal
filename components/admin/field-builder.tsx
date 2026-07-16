"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { InputField, InputFieldType, SelectOption } from "@/lib/tool-schema";

const TYPES: InputFieldType[] = [
  "text", "textarea", "url", "email", "number",
  "select", "multiselect", "checkbox", "date",
];

/**
 * The visual input_schema builder (§8). Add, edit, and reorder fields — the
 * admin never hand-writes JSON. Emits an InputField[]; the editor wraps it as
 * { fields }.
 */
export function FieldBuilder({
  fields,
  onChange,
}: {
  fields: InputField[];
  onChange: (fields: InputField[]) => void;
}) {
  const update = (i: number, patch: Partial<InputField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([
      ...fields,
      { name: `field_${fields.length + 1}`, label: "New field", type: "text", required: false },
    ]);

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 && (
        <p className="text-small text-text-faint">No fields yet. Add the first input.</p>
      )}

      {fields.map((field, i) => (
        <div key={i} className="rounded-md border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-mono text-text-faint">{field.name || "unnamed"}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ChevronUp aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down">
                <ChevronDown aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="sm" className="size-8 px-0 hover:text-danger" onClick={() => remove(i)} aria-label="Remove field">
                <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Label</Label>
              <Input value={field.label} onChange={(e) => update(i, { label: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Name (key)</Label>
              <Input value={field.name} onChange={(e) => update(i, { name: e.target.value })} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={field.type} onChange={(e) => update(i, { type: e.target.value as InputFieldType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Placeholder</Label>
              <Input value={field.placeholder ?? ""} onChange={(e) => update(i, { placeholder: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Help text</Label>
              <Input value={field.help ?? ""} onChange={(e) => update(i, { help: e.target.value })} />
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-small text-text-muted">
            <input type="checkbox" checked={field.required ?? false} onChange={(e) => update(i, { required: e.target.checked })} className="size-4 rounded-sm border-line" />
            Required
          </label>

          {(field.type === "select" || field.type === "multiselect") && (
            <OptionsEditor
              options={field.options ?? []}
              onChange={(options) => update(i, { options })}
            />
          )}
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={add} className="self-start">
        <Plus aria-hidden className="size-4" strokeWidth={1.5} />
        Add field
      </Button>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (o: SelectOption[]) => void;
}) {
  return (
    <div className="mt-3 border-t border-line pt-3">
      <Label>Options</Label>
      <div className="mt-2 flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input placeholder="value" value={o.value} onChange={(e) => onChange(options.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} className="font-mono" />
            <Input placeholder="label" value={o.label} onChange={(e) => onChange(options.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
            <Button variant="ghost" size="sm" className="size-8 shrink-0 px-0 hover:text-danger" onClick={() => onChange(options.filter((_, idx) => idx !== i))} aria-label="Remove option">
              <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...options, { value: "", label: "" }])}>
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          Add option
        </Button>
      </div>
    </div>
  );
}
