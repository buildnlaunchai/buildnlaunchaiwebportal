"use client";

import { ExternalLink, KeyRound, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { KEY_HONESTY_COPY, PROVIDERS, PROVIDER_BY_VALUE } from "@/lib/providers";
import type { KeyMeta, KeyStatus } from "@/lib/keys";
import { cn } from "@/lib/utils";

/* The three-state key status → pill (DESIGN.md §9). --live only means "actually
   verified"; an unverified key gets no color, an invalid one is danger. */
function statusPill(status: KeyStatus) {
  if (status === "valid") return <StatusPill label="verified" tone="live" dot={false} />;
  if (status === "invalid") return <StatusPill label="invalid" tone="danger" dot={false} />;
  return <StatusPill label="unverified" tone="faint" dot={false} />;
}

type VaultResult = { error: string } | { data: unknown };

async function invokeVault(body: Record<string, unknown>): Promise<VaultResult> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("key-vault", { body });
  if (error) {
    // functions.invoke wraps non-2xx; try to read the function's message.
    let message = "Something went wrong. Try again.";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.json())?.error ?? message;
    } catch {
      /* keep the default */
    }
    return { error: message };
  }
  return { data };
}

function KeyRow({ keyMeta }: { keyMeta: KeyMeta }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const meta = keyMeta.provider ? PROVIDER_BY_VALUE[keyMeta.provider] : undefined;

  const act = (body: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      const res = await invokeVault(body);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
        <KeyRound aria-hidden className="size-[18px]" strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-body-strong text-text">{meta?.name ?? keyMeta.provider}</span>
          {keyMeta.status && statusPill(keyMeta.status)}
        </div>
        <p className="text-mono text-text-faint">
          {keyMeta.key_hint}
          {keyMeta.label ? ` · ${keyMeta.label}` : ""}
        </p>
        {error && <p className="mt-1 text-small text-danger">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          pending={pending}
          onClick={() => act({ action: "verify", provider: keyMeta.provider })}
          aria-label="Verify key"
          title="Verify"
        >
          <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          pending={pending}
          onClick={() => act({ action: "delete", provider: keyMeta.provider })}
          aria-label="Delete key"
          title="Delete"
          className="hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

function AddKeyForm({ preselect }: { preselect?: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState(preselect ?? "openai");
  const [plaintext, setPlaintext] = useState("");
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const meta = PROVIDER_BY_VALUE[provider];

  const save = () => {
    setError(null);
    setNotice(null);
    if (!plaintext.trim()) {
      setError("Paste your key first.");
      return;
    }
    startTransition(async () => {
      const res = await invokeVault({ action: "save", provider, label, plaintext });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const status = (res.data as { status?: string })?.status;
      setPlaintext("");
      setLabel("");
      setNotice(
        status === "valid"
          ? "Saved and verified."
          : status === "invalid"
            ? "Saved — but the provider rejected this key. Double-check and re-paste."
            : "Saved. I couldn't verify it automatically; a run will confirm it.",
      );
      router.refresh();
    });
  };

  return (
    <Panel>
      <SectionHeader icon={KeyRound} title="Connect a key" />

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="provider">Provider</Label>
          <Select
            id="provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setNotice(null);
              setError(null);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Teaching: how to get it, where, and what it costs (§10 rule 3) */}
        {meta && (
          <div className="rounded-sm border border-line bg-sunken p-3">
            <p className="text-small text-text-muted">{meta.howTo}</p>
            <p className="mt-2 text-small text-text-faint">{meta.cost}</p>
            {meta.keyUrl && (
              <a
                href={meta.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-small text-accent hover:text-accent-hover"
              >
                Get a {meta.name} key
                <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.5} />
              </a>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="plaintext" required>
            Your key
          </Label>
          {/* type=password so it's masked as they paste; never round-trips back. */}
          <Input
            id="plaintext"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste it here"
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            placeholder="Personal, work…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-small text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p
            className={cn(
              "text-small",
              notice.startsWith("Saved and verified") ? "text-live" : "text-text-muted",
            )}
          >
            {notice}
          </p>
        )}

        <Button variant="primary" pending={pending} onClick={save}>
          Save key
        </Button>
      </div>
    </Panel>
  );
}

export function KeyVault({
  keys,
  preselect,
}: {
  keys: KeyMeta[];
  preselect?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* The honesty statement — verbatim, nothing stronger anywhere (§10). */}
      <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-quiet/40 px-4 py-3.5 [border-top-color:var(--line-strong)]">
        <ShieldCheck
          aria-hidden
          className="mt-0.5 size-[18px] shrink-0 text-accent"
          strokeWidth={1.6}
        />
        <p className="text-small text-text">{KEY_HONESTY_COPY}</p>
      </div>

      <AddKeyForm preselect={preselect} />

      <div className="flex flex-col gap-4">
        <SectionHeader icon={KeyRound} title="Connected keys" />
        {keys.length === 0 ? (
          <Panel>
            <EmptyState
              icon={KeyRound}
              title="No keys connected"
              description="Tools run on your own API keys, so you pay your provider directly and nothing runs through my bill. Most tools need one key. Some need none."
              className="py-10"
            />
          </Panel>
        ) : (
          <Panel flush>
            {keys.map((k) => (
              <KeyRow key={k.id} keyMeta={k} />
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
