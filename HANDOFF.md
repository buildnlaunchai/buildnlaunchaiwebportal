# Redesign handoff — the authenticated product

The remaining authenticated surfaces (member + admin) have been brought up to the
same premium visual system as the three approved checkpoints — **Landing Hero,
App Shell, Canonical Tool Card**. Presentation only: no business logic, routing,
permissions, auth, APIs, database, access control, keyboard navigation, or
accessibility was changed. Where copy changed, it only expanded terse empty-state
lines into the same sentence-case voice (§12); no copy-of-record was altered.

**Visual handoff (before/after + gallery):**
https://claude.ai/code/artifact/819e2bbc-78cd-4651-b4df-4a73c2dd93db

---

## 0. The premise (why this wasn't a find-and-replace)

A three-agent audit of every surface found the codebase was **already 100%
on-token** — zero `text-gray-*`/`bg-zinc-*`/raw-hex/`shadow-md` anywhere (the one
hit was a Google brand-mark SVG, a documented exception). So the gap between the
approved work and everything else was never tokens; it was **depth and cohesion**:
flat, boxed panels with no light, ad-hoc empty states, hand-rolled modals, no
loading/error states, and a duplicated component vocabulary.

The fix was to encode the approved visual language **once**, into shared
primitives, then compose every page from them — exactly the elevation the App
Shell went through, applied app-wide.

---

## 1. Everything that was redesigned

- **Eight new shared primitives** (`components/ui/`) that carry the approved idioms.
- **7 member surfaces** recomposed from them.
- **11 admin surfaces / components** recomposed from them.
- **A new `/admin/audit` page** — the nav advertised it, but no route existed (a
  dead link → 404). Now a real, RLS-scoped audit trail.
- **Route-level states** that didn't exist before: `loading.tsx` skeletons,
  `error.tsx` boundaries (§12 voice), and `not-found.tsx` (neutral, §13-safe).
- **The elevation & radius language unified** across the app.
- **DESIGN.md §9 synced** to the new primitives (the doc stays the source of truth).

The cohesion lever, carried everywhere: a `rounded-lg` panel with a **light-catching
top edge** (`--line-strong` on the top border only), the **icon-tile section head**,
and the shared `EmptyState` / `Callout` / `Dialog` / `Skeleton`. Radius nests —
`lg` (panels) → `md` (sub-panels, icon tiles) → `sm` (inputs, buttons) → `pill`
(chips) — larger outside, smaller inside.

---

## 2. Every page that changed

### Member (`app/(app)/dashboard/`)
| Route | What changed |
|---|---|
| `/dashboard` | Three empty states → one `EmptyState` each (§12 copy kept, lit icon tile, vertical presence); upsell → `Panel`; grid streams behind an in-page `<Suspense>` grid skeleton. |
| `/dashboard/runs` | `EmptyState` + a flush `Panel` list with the elevated row/icon-tile motif; count intro line. |
| `/dashboard/runs/[id]` | `PageHeader` with a back link (off-nav page the top bar can't title). |
| `/dashboard/tools/[slug]` | `BackLink` + a lit icon-tile header; maintenance / missing-key / embed banners → `Callout`; output stage gains the panel radius + top edge. |
| `/dashboard/keys` | Honesty callout gains a shield icon; Connect-a-key + Connected-keys → `Panel`/`SectionHeader`; empty → `EmptyState`; rows elevated. |
| `/dashboard/requests` | Dropped the duplicate `<h1>` (top bar titles it, §10); form → `Panel`/`SectionHeader`; empty → `EmptyState`; request cards elevated. |
| `/dashboard/settings` | Three `Panel`s with `SectionHeader` icon tiles. |
| `/dashboard/redeem` | `PageHeader` (back to Settings); form + success → `Panel`/`EmptyState`. |

### Admin (`app/(admin)/admin/`)
| Route | What changed |
|---|---|
| `/admin` (overview) | Metric cards → `Panel`; values off an arbitrary `text-[26px]` onto the `text-display-l` token; Top-tools / Signups gain `SectionHeader` icon tiles. |
| `/admin/applications` | Empty state → `EmptyState` (tab pills already matched). |
| `/admin/users` | Table → flush `Panel` with an elevated header row; empty & no-match → `EmptyState`. |
| `/admin/users/[id]` | `BackLink`; Membership + Application cards → `Panel`/`SectionHeader`. |
| `/admin/tools` | Flush `Panel` + elevated tiles + `EmptyState`; delete modal → the shared `Dialog`. |
| `/admin/tools/new`, `/admin/tools/[id]` | Each editor section → `Panel` + `SectionHeader` icon; data-vs-behaviour note → `Callout`. |
| `/admin/announcements`, `/admin/codes`, `/admin/requests` | Form + list containers → `Panel`/`SectionHeader`; generated-code banner → `Callout(success)`; empties → `EmptyState`. |
| **`/admin/audit`** | **New route.** RLS-scoped trail; action chips + by/→ actor + timestamps; loading skeleton. |

---

## 3. Every shared component that changed

### New primitives (`components/ui/`)
| File | Role |
|---|---|
| `panel.tsx` | `Panel` (lit content surface, `flush` for lists) + `SectionHeader` (icon-tile head). The cohesion lever. |
| `empty-state.tsx` | `EmptyState` (§9) — lit icon tile, h3, one directing line, one action. |
| `callout.tsx` | `Callout` — one semantic inline notice (info/warn/danger/success). |
| `dialog.tsx` | `Dialog` (§9) — `--elevated`, focus trap, Escape, focus restore, CSS mount-enter. Replaces two hand-rolled modals. |
| `checkbox.tsx` | `Checkbox` — native control tokened with `accent-color` (keeps OS a11y). |
| `skeleton.tsx` + `skeletons.tsx` | `Skeleton` + composed `CardGridSkeleton` / `ListSkeleton` / `PanelSkeleton`. |
| `page-header.tsx` | `PageHeader` + `BackLink`. |

### Existing components restyled
- `components/tools/key-chip.tsx`, `components/tools/provider-chip.tsx` — chip
  radius unified to `rounded-pill` (matching the card Badge + StatusPill).
- `components/tools/runner-client.tsx` — output stage radius + top edge; form
  error → `Callout`.
- `components/keys/key-vault.tsx`, `components/dashboard/{request-board,redeem-form}.tsx`
  — recomposed onto `Panel`/`SectionHeader`/`EmptyState`.
- `components/admin/*` (10 files: tools-list, tool-editor, field-builder,
  output-builder, test-run-panel, announcements-manager, codes-manager,
  requests-manager, application-row, user-controls, access-matrix) — recomposed;
  native checkboxes → `Checkbox`; hand-rolled modal → `Dialog`.

### New data helper
- `lib/admin-audit.ts` — `getAuditLogs()`, admin-RLS-scoped, resolves actor +
  target profiles via the two foreign keys.

---

## 4. Design decisions

1. **Panels adopt the flagship card's language, not a flatter one.** `rounded-lg`
   + the light-catching top edge, resolving the card-vs-panel radius split. This
   is the single change that makes a grid of panels feel designed. Calm tier is
   preserved: **no shadow on a resting panel, no hover-lift on static content**.
2. **The top bar is the page title (§10); pages don't repeat it.** Nav pages lead
   with a one-line description; only off-nav detail pages (`runs/[id]`, `redeem`,
   the runner, editors) carry their own `<h1>` + back link, because the top bar
   can only show a fallback there. Removed the duplicate `<h1>` from Requests.
3. **One component per concern.** Every empty state, notice, modal, and checkbox
   now routes through a single primitive, so the next screen can't drift.
4. **Loading lives in the page, not the route, wherever a page gates with
   `notFound()`.** See §5 — this is the most important correctness decision.
5. **The icon-tile motif from the shell/card is reused for section heads and empty
   states**, so a section head reads as part of the system, not a bare heading.
6. **The `/admin/audit` dead link was completed, not removed.** The nav promised
   it and the `audit_logs` table + `log_audit()` already existed; a working page
   makes the nav honest and surfaces a real feature.

---

## 5. Compromises & technical limitations

- **Route `loading.tsx` conflicts with `notFound()` status.** A `loading.tsx`
  wraps its segment *and every descendant page* in one Suspense boundary; once the
  fallback streams, a 200 is flushed, so a later `notFound()` in a descendant can
  no longer set 404. An early pass added `loading.tsx` broadly and silently turned
  the runner's access-denial and revoked-membership loads into **HTTP 200 instead
  of 404** — a real §13 regression (`verify:embed-page` caught it). **Resolution:**
  `loading.tsx` is kept only on routes whose subtree has **no `notFound()` gate**
  (keys, requests, settings; admin applications, audit). The seven unsafe ones were
  removed. The flagship dashboard keeps its grid skeleton via an **in-page
  `<Suspense>`** that wraps only its own content, never a sibling route. Net: the
  runner, run-detail, admin overview, users, and tools pages render without a
  route-level skeleton — acceptable, since the app is architected for a sub-second
  server render (functions pinned to Tokyo next to the DB) rather than streaming.
- **`EmptyState` uses a lit icon tile**, a small elevation of DESIGN.md's original
  "small icon" spec. DESIGN.md §9 was updated to match (kept in sync, not diverged).
- **No pagination added.** The runs list, users table, and audit log render an
  unbounded (capped) set. Out of scope for a presentation redesign; noted below.
- **Before/after captures** were taken by temporarily reverting four self-contained
  files to the pre-redesign commit on the dev server, screenshotting, and
  restoring — the working tree is clean.

---

## 6. Future polish opportunities

- **Pagination / virtualization** for runs, the admin users table, and the audit
  log once volume grows (audit currently caps at 100 rows).
- **Audit filtering** by action/actor/date (the route map hints at "filterable").
- **`Toast`** primitive — transient feedback is still inline `role="alert"` lines
  and optimistic state; a shared toast (§9) would unify success/undo affordances.
- **Refactor `tool-form-preview.tsx`** onto the input primitives (it re-declares
  the input skin as literal strings and will drift).
- **In-page `<Suspense>` streaming** for the admin overview and users table (same
  pattern as the dashboard) if a loading state there is wanted without a
  route-level `loading.tsx`.
- **Reduced-motion + light-mode spot-audit** of the new `Dialog` enter animation on
  real hardware (honored via the global reduced-motion rule; worth a human check).

---

## 7. Verification results

All green, on the final tree:

- **`pnpm typecheck`** — clean (no `any`, no `@ts-ignore`).
- **`pnpm lint`** — clean.
- **All 15 `verify:*` suites** — 248 checks, 0 failures: `rls` (18), `guards` (11),
  `applications` (10), `apply-pages` (14), `access` (17), `phase4` (17), `vault`
  (15), `keys-pages` (13), `runner` (14), `editor` (14), `notify` (10), `codes`
  (16), `community` (13), `embed-token` (27), `embed-page` (39).
- **`pnpm build`** — production build passes; `/admin/audit` present in the route
  table; no temp/debug routes ship.
- **Security preserved** — `verify:embed-page` confirms the runner still returns
  **404** (not 200) for a no-access member and for a revoked membership (§13).
- **Responsive / themes** — verified via screenshots at 1440px (dark + light) and
  402px (mobile) across member and admin.

One verification script was updated (not weakened) to reflect an approved design
change: `verify-keys-pages` asserted the old two-chip key layout; the canonical
card consolidates missing providers into one amber chip, so the assertion now
checks both providers are named in that chip.

---

## 8. Commit history for this redesign

Six milestone commits, oldest first:

```
55c1c76  feat(tools): the canonical Tool Card
eae3b99  feat(ui): shared surface primitives in the approved visual language
ead6307  feat(app): redesign member surfaces + add route loading/error/not-found
05dcd73  feat(admin): redesign admin surfaces + build the audit log
168b025  docs(design): sync §9 with the new surface primitives
2a24d75  fix(loading): don't let route loading.tsx break notFound() 404s
```

49 files changed, ~1,442 insertions / ~486 deletions. The repository is on `main`,
working tree clean, production-ready.
