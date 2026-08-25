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
    // functions.invoke wraps non-2xx; try to read the function's message. When
    // there isn't one — a network failure, or a gateway rejection that never
    // reached our code — say so with the status rather than falling back to a
    // shrug. A vault action that fails must never look like one that did
    // nothing.
    const ctx = (error as { context?: Response }).context;
    let message = ctx
      ? `The key vault refused that (HTTP ${ctx.status}).`
      : "Couldn't reach the key vault. Check your connection and try again.";
    try {
      if (ctx) message = (await ctx.clone().json())?.error ?? message;
    } catch {
      /* not JSON — keep the status message */
    }
    return { error: message };
  }
  return { data };
}

function KeyRow({
  keyMeta,
  onDeleted,
}: {
  keyMeta: KeyMeta;
  /** Keyed by provider: the vault holds exactly one key per provider (§10). */
  onDeleted: (provider: NonNullable<KeyMeta["provider"]>) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Which action is in flight, not just "something is". Sharing one flag meant
  // Verify's spinner disabled Delete and vice versa.
  const [busy, setBusy] = useState<"verify" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = keyMeta.provider ? PROVIDER_BY_VALUE[keyMeta.provider] : undefined;

  // The request is awaited OUTSIDE the transition, and only the refresh goes
  // inside it. Awaiting in there tied the buttons' enabled state to the RSC
  // refetch as well as the request, so anything that stalled the refresh left
  // the row wedged with no error and nothing visibly happening.
  const act = async (action: "verify" | "delete") => {
    if (busy) return;
    setBusy(action);
    setError(null);

    const res = await invokeVault({ action, provider: keyMeta.provider });
    setBusy(null);

    if ("error" in res) {
      setError(res.error);
      return;
    }

    // A 2xx IS NOT PROOF THE ROW IS GONE, and this code used to assume it was.
    // key-vault returns { deleted: <n> }; only a confirmed n >= 1 may remove the
    // row locally. Anything else refreshes and says so, because the failure this
    // guards against — a delete that matched nothing — is precisely the one that
    // used to look identical to success.
    if (action === "delete") {
      const deleted =
        (res.data as { deleted?: number } | null | undefined)?.deleted ?? 0;

      if (deleted < 1) {
        setError("That key wasn't deleted. Reload the page to see what's there.");
        startTransition(() => router.refresh());
        return;
      }

      // Drop it from the list now rather than trusting the refetch to be what
      // removes it, then reconcile with the server.
      if (keyMeta.provider) onDeleted(keyMeta.provider);
    }

    startTransition(() => router.refresh());
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
          type="button"
          variant="ghost"
          size="sm"
          pending={busy === "verify"}
          disabled={busy !== null}
          onClick={() => act("verify")}
          aria-label="Verify key"
          title="Verify"
        >
          <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          pending={busy === "delete"}
          disabled={busy !== null}
          onClick={() => act("delete")}
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

function AddKeyForm({
  preselect,
  onSaved,
}: {
  preselect?: string;
  /** Un-hides a provider the member deleted and then re-added in one visit. */
  onSaved: (provider: string) => void;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(preselect ?? "openai");
  const [plaintext, setPlaintext] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const meta = PROVIDER_BY_VALUE[provider];

  // Same shape as KeyRow.act: await the request, settle the UI, and only then
  // hand the refresh to a transition. The button re-enables on the response,
  // not on the refetch.
  const save = async () => {
    setError(null);
    setNotice(null);
    if (!plaintext.trim()) {
      setError("Paste your key first.");
      return;
    }
    setPending(true);

    const res = await invokeVault({ action: "save", provider, label, plaintext });
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }

    onSaved(provider);
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
    startTransition(() => router.refresh());
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

        <Button type="button" variant="primary" pending={pending} onClick={save}>
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
  // `keys` is a Server Component prop, so it only changes when the RSC payload
  // is refetched. A confirmed delete removes the row here immediately instead of
  // waiting on that refetch — and because this filters the LIVE prop rather than
  // holding its own copy, the next refresh reconciles it for free: once the
  // server stops sending the row, the filter is a no-op and nothing is stale.
  const [deleted, setDeleted] = useState<string[]>([]);
  const rows = keys.filter((k) => !k.provider || !deleted.includes(k.provider));

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

      <AddKeyForm
        preselect={preselect}
        onSaved={(provider) =>
          setDeleted((prev) => prev.filter((p) => p !== provider))
        }
      />

      <div className="flex flex-col gap-4">
        <SectionHeader icon={KeyRound} title="Connected keys" />
        {rows.length === 0 ? (
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
            {rows.map((k) => (
              <KeyRow
                key={k.id}
                keyMeta={k}
                onDeleted={(provider) =>
                  setDeleted((prev) =>
                    prev.includes(provider) ? prev : [...prev, provider],
                  )
                }
              />
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
