"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";

import { submitApplication } from "@/actions/applications";
import { Turnstile } from "@/components/apply/turnstile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  applicationSchema,
  HEARD_FROM,
  WILLINGNESS_TO_PAY,
  type ApplicationInput,
} from "@/lib/validation/application";

type ToolOption = { slug: string; name: string };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-small text-danger" role="alert">
      {message}
    </p>
  );
}

export function ApplyForm({ tools }: { tools: ToolOption[] }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
  });

  const [token, setToken] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // tools_wanted is a custom chip multiselect, not a native field, so it lives in
  // local state and is merged in on submit. It's optional and re-validated
  // server-side, so it doesn't need to flow through react-hook-form.
  const [selected, setSelected] = useState<string[]>([]);
  const toggleTool = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  const turnstileConfigured = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  const canSubmit = !pending && (!turnstileConfigured || token !== "");

  const onSubmit: SubmitHandler<ApplicationInput> = (values, event) => {
    setServerError(null);
    // Read the honeypot from the submitted form, not a ref — a bot fills it, a
    // human never sees it.
    const form = event?.target as HTMLFormElement | undefined;
    const honeypot = form
      ? new FormData(form).get("company_url")?.toString()
      : undefined;

    startTransition(async () => {
      // Redirects on success; only returns on a rejection worth showing.
      const res = await submitApplication(
        { ...values, tools_wanted: selected },
        token,
        honeypot,
      );
      if (res && "error" in res) setServerError(res.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Honeypot: off-screen, not a tab stop, not announced. A human never
          fills it; a bot fills everything. Not in the zod schema — read by ref. */}
      <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="company_url">Company URL</label>
        <input
          id="company_url"
          name="company_url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Use case — the one required answer */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="use_case" required>
          What would you automate first?
        </Label>
        <Textarea
          id="use_case"
          rows={4}
          placeholder="The repetitive thing you'd hand to a tool tomorrow if you could."
          aria-invalid={errors.use_case ? true : undefined}
          aria-describedby={errors.use_case ? "use_case-error" : undefined}
          {...register("use_case")}
        />
        <FieldError id="use_case-error" message={errors.use_case?.message} />
      </div>

      {/* Tools wanted — multiselect from the live catalog */}
      {tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Which tools are you most interested in?</Label>
          <div className="flex flex-wrap gap-2">
            {tools.map((tool) => {
              const on = selected.includes(tool.slug);
              return (
                <button
                  key={tool.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTool(tool.slug)}
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-small transition-colors duration-micro ease-default",
                    on
                      ? "border-accent bg-accent-quiet text-accent"
                      : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text",
                  )}
                >
                  {tool.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Two selects, side by side on wider screens */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="willingness_to_pay" required>
            If these tools saved you real time, what would you pay?
          </Label>
          <Select
            id="willingness_to_pay"
            defaultValue=""
            aria-invalid={errors.willingness_to_pay ? true : undefined}
            aria-describedby={
              errors.willingness_to_pay ? "willingness_to_pay-error" : undefined
            }
            {...register("willingness_to_pay")}
          >
            <option value="" disabled>
              Choose one
            </option>
            {WILLINGNESS_TO_PAY.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <FieldError
            id="willingness_to_pay-error"
            message={errors.willingness_to_pay?.message}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="heard_from">How did you find this?</Label>
          <Select id="heard_from" defaultValue="" {...register("heard_from")}>
            <option value="">Choose one</option>
            {HEARD_FROM.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Optional details */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="role_title">Your role</Label>
          <Input id="role_title" placeholder="Founder, marketer, developer…" {...register("role_title")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" placeholder="Optional" {...register("company")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="website_url">Website</Label>
          <Input id="website_url" type="url" placeholder="https://…" aria-invalid={errors.website_url ? true : undefined} {...register("website_url")} />
          <FieldError id="website_url-error" message={errors.website_url?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="socials">Socials</Label>
          <Input id="socials" placeholder="@handle, or a link" {...register("socials")} />
        </div>
      </div>

      <Turnstile onToken={setToken} />

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-quiet px-4 py-3 text-small text-danger"
        >
          {serverError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          disabled={!canSubmit}
        >
          Send my application
        </Button>
        <p className="text-small text-text-faint">
          I review these personally, usually within a day.
        </p>
      </div>
    </form>
  );
}
