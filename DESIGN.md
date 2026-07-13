# DESIGN.md — Build & Launch AI

> This file is the single source of truth for how the product looks, moves, and speaks.
> Read it fully before writing any component. Every value used in the codebase comes from
> here. If you need something that isn't in this file, **add it to this file first**, then
> use it. Never style ad hoc, never invent a hex code inline, never eyeball a spacing value.
>
> The point of this document is that six months from now, adding a new screen requires zero
> design decisions.

---

## 1. The thesis

Most tool platforms look like a dashboard. This one is a **workshop that ships**.

The product is one person shipping automation tools on a relentless cadence, in public. Two
things follow from that, and they drive every decision below:

**The signature is the run.** The moment a member clicks Run is the emotional core of this
product. It's the payoff for applying, waiting, getting approved, connecting a key. That
moment gets a designed choreography — a small, precise, satisfying sequence. This is where
the entire boldness budget is spent. *Everything else stays quiet.*

**The proof is the cadence.** The landing page doesn't argue that the tools are good. It
shows a vertical, dated, versioned log of everything shipped, newest first. The design's job
is to make velocity legible.

Restraint everywhere else is not timidity — it's what makes those two things land. When in
doubt, remove.

### What this is not

A hard no-list. If a design decision drifts toward any of these, it's wrong:

- Purple-to-pink gradients. Any gradient used as decoration.
- Glassmorphism, frosted panels, backdrop blur on cards.
- Floating 3D blobs, orbs, meshes, particles, or an animated starfield.
- Emoji used as interface icons.
- Drop shadows on flat cards. (Shadows belong to floating layers only — see §6.)
- More than one accent color visible on a single screen.
- "AI-powered", "supercharge", "unleash", "revolutionize", "seamlessly" anywhere in the copy.
- Rounded-full buttons. Big border radii. Anything over 14px except pills and avatars.
- A spinner as the answer to any wait longer than one second.
- Hero copy that says what the company believes instead of what the product does.

---

## 2. Color

Dark is the primary mode and gets built first. Light mode is a real, supported, equal mode —
plenty of members work in light, and shipping only dark halves the audience. Build both from
the same tokens.

The base is not black. It's a soft graphite with a faint blue cast, which reads calmer at
night and lets the hairlines sit properly. Pure `#000` with white text is harsh and cheap.

### Tokens

```css
:root[data-theme="dark"] {
  /* surfaces — four steps, no more */
  --canvas:        #0F1013;   /* page background */
  --surface:       #17181D;   /* cards, panels, inputs */
  --elevated:      #1F2128;   /* dropdowns, dialogs, popovers, hover states */
  --sunken:        #0A0B0D;   /* code blocks, output wells, terminal areas */

  /* lines — cards are defined by a border, not a shadow */
  --line:          #2B2E37;   /* default hairline */
  --line-strong:   #3A3E4A;   /* hover, focus-within, active row */

  /* text */
  --text:          #ECEDF1;   /* primary */
  --text-muted:    #8E94A3;   /* secondary, labels, meta */
  --text-faint:    #5D6270;   /* placeholders, disabled, timestamps */

  /* accent — exactly one. Actions, links, focus rings, selected states. */
  --accent:        #6366F1;
  --accent-hover:  #7175F3;
  --accent-quiet:  rgba(99, 102, 241, 0.12);   /* tinted backgrounds */
  --accent-text:   #FFFFFF;                     /* text on top of --accent */

  /* status — semantic only. Never decorative. */
  --live:          #34D399;   /* running, success, active membership, verified key */
  --live-quiet:    rgba(52, 211, 153, 0.12);
  --warn:          #FBBF24;   /* pending, locked, coming soon, missing key */
  --warn-quiet:    rgba(251, 191, 36, 0.12);
  --danger:        #F87171;   /* error, invalid key, destructive */
  --danger-quiet:  rgba(248, 113, 113, 0.12);
}

:root[data-theme="light"] {
  --canvas:        #FAFAFC;
  --surface:       #FFFFFF;
  --elevated:      #FFFFFF;
  --sunken:        #F4F5F8;

  --line:          #E5E7EE;
  --line-strong:   #CDD1DC;

  --text:          #14161C;
  --text-muted:    #5D6474;
  --text-faint:    #949AA8;

  --accent:        #4F46E5;
  --accent-hover:  #4338CA;
  --accent-quiet:  rgba(79, 70, 229, 0.09);
  --accent-text:   #FFFFFF;

  --live:          #059669;
  --live-quiet:    rgba(5, 150, 105, 0.10);
  --warn:          #B45309;
  --warn-quiet:    rgba(180, 83, 9, 0.10);
  --danger:        #DC2626;
  --danger-quiet:  rgba(220, 38, 38, 0.10);
}
```

### Rules

- **One accent per screen.** `--accent` marks the single most important action. If a screen
  has two indigo buttons, one of them is wrong.
- **Status colors are never decoration.** Green means it's actually running or actually
  succeeded. Amber means the user actually has to do something. Red means something actually
  broke. Nothing is colored to look nice.
- Tinted backgrounds (`--*-quiet`) are for chips, banners, and selected rows. Never for
  large surfaces.
- Every colored chip and banner also carries a text label or an icon. Color alone never
  carries meaning — 8% of your male users can't reliably distinguish red from green.
- Contrast floor: 4.5:1 for body text, 3:1 for text ≥ 18px and for UI borders. Check it.

---

## 3. Typography

Type is where this product gets its personality. Three faces, three jobs, no exceptions.

```css
--font-display: 'Sora', system-ui, sans-serif;          /* 600, 700 */
--font-sans:    'Instrument Sans', system-ui, sans-serif; /* 400, 500, 600 */
--font-mono:    'JetBrains Mono', ui-monospace, monospace; /* 400, 500 */
```

**Sora** for display: geometric, slightly unusual letterforms, technical without being cold.
Used only for page titles and the landing page. Never for UI chrome.

**Instrument Sans** for everything in the interface. It is not Inter. It has a little more
character in the terminals and a tighter rhythm, and it stops the app from looking like every
other Tailwind starter.

**JetBrains Mono** is the thread that ties the product together, and it is used *with meaning,
never for texture*. Mono says "this is machinery, this is a real value, this came from a
system." It appears on exactly these things and nothing else:

- tool slugs (`youtube-lead-finder`)
- run IDs (`run_a1b2c3d4`)
- timestamps and durations (`2.4s`, `14 Jul 2026`)
- version numbers (`v1.2.0`)
- status labels in chips (`RUNNING`, `LOCKED`)
- provider names on key chips (`needs: openai`)
- webhook URLs, JSON output, code blocks
- shipping-log dates

If it isn't a machine-generated or machine-shaped value, it isn't mono.

### Scale

Base is **15px**, not 16. It's deliberate: a denser, more instrument-like rhythm, and it
reads as considered rather than default.

| Token | Size / line-height | Weight | Tracking | Face | Use |
|---|---|---|---|---|---|
| `display-xl` | 52 / 1.02 | 700 | -0.03em | display | Landing hero only |
| `display-l` | 36 / 1.1 | 600 | -0.02em | display | Section heads, tool page title |
| `h1` | 26 / 1.25 | 600 | -0.01em | display | Page titles in the app |
| `h2` | 20 / 1.35 | 600 | -0.005em | sans | Card headers, section titles |
| `h3` | 16 / 1.4 | 600 | 0 | sans | Sub-sections, dialog titles |
| `body` | 15 / 1.6 | 400 | 0 | sans | Default |
| `body-strong` | 15 / 1.6 | 500 | 0 | sans | Emphasis inside body |
| `small` | 13 / 1.5 | 400 | 0 | sans | Secondary text, help text |
| `label` | 13 / 1.4 | 500 | 0 | sans | Form labels |
| `eyebrow` | 11 / 1.3 | 600 | 0.08em | sans | UPPERCASE section markers |
| `mono` | 13 / 1.5 | 400 | 0 | mono | Values, IDs, code |
| `mono-chip` | 11 / 1 | 500 | 0.04em | mono | Status chips |

### Rules

- **Sentence case everywhere.** Buttons, headings, labels, menu items. Never Title Case, never
  ALL CAPS except `eyebrow` and `mono-chip`.
- Body text maxes out at **68 characters** per line. Set `max-width: 62ch` on prose.
- Never center-align a paragraph longer than two lines.
- Numbers in tables use `font-variant-numeric: tabular-nums`. Always.
- No text below 11px. Ever.

---

## 4. Space

4px base unit. These are the only spacing values that exist:

```
4  8  12  16  20  24  32  40  56  72  96
```

If a gap wants to be 18px, it is 16 or 20. There is no 18.

| Context | Value |
|---|---|
| Icon → label | 8 |
| Inside a chip | 4 / 8 |
| Inside an input | 10 / 12 |
| Inside a button (md) | 10 / 16 |
| Inside a card | 20 |
| Between form fields | 20 |
| Between cards in a grid | 16 |
| Between sections in a page | 40 |
| Between sections on the landing page | 96 |
| Page gutter (mobile / desktop) | 20 / 32 |

**Content width:** app pages max out at 1200px. The tool runner uses the full width. Prose
(tool descriptions, guides, emails) maxes at 720px.

---

## 5. Shape

```css
--radius-sm:  6px;    /* inputs, buttons, chips, checkboxes */
--radius-md:  10px;   /* cards, panels, output blocks */
--radius-lg:  14px;   /* dialogs, sheets, popovers */
--radius-pill: 999px; /* status pills, avatars, tag filters */
```

That's the whole vocabulary. Nothing is square. Nothing is a giant blob.

**Borders are the primary structural device.** Every card, input, panel, and table is defined
by a `1px solid var(--line)`. Not by a shadow, not by a fill difference. This is what gives
the product its precise, instrument-panel feel, and it's why the palette needs a real
hairline color instead of a translucent white.

---

## 6. Elevation

Shadows are **only** for things that float above the page. A card that sits in the layout gets
a border and nothing else.

```css
--shadow-pop:   0 4px 12px -2px rgba(0,0,0,0.28);   /* dropdown, tooltip, toast */
--shadow-modal: 0 24px 56px -16px rgba(0,0,0,0.55); /* dialog, sheet */
```

In light mode, halve the opacity. There is no `--shadow-sm` for cards, because cards do not
get shadows.

---

## 7. Motion

Motion is what makes this feel expensive. It is also the fastest way to make it feel cheap.
The discipline: **short, few, purposeful.**

```css
--dur-micro:  120ms;   /* hover, press, checkbox, color change */
--dur-enter:  200ms;   /* dropdowns, dialogs, toasts, tooltips */
--dur-layout: 320ms;   /* panels, drawers, height changes, reordering */
--dur-moment: 640ms;   /* the run choreography ONLY. Nothing else earns this. */

--ease:       cubic-bezier(0.2, 0.8, 0.2, 1);    /* default */
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);     /* things arriving */
--ease-exit:  cubic-bezier(0.4, 0, 1, 1);        /* things leaving, faster */
```

### Rules

- **Animate `transform` and `opacity` only.** Never `width`, `height`, `top`, `left`,
  `margin`, or `box-shadow`. If you need a height transition, use `grid-template-rows: 0fr →
  1fr`, which is GPU-cheap.
- Cards on hover: `border-color` shifts to `--line-strong` and `translateY(-1px)`. Never
  `scale()`. Scaling cards is the single most common tell of an AI-generated interface.
- Exits are faster than entrances (`--dur-micro` out, `--dur-enter` in). Things should feel
  eager to get out of the way.
- Lists that appear together stagger at **40ms** intervals, capped at 8 items. Beyond that,
  everything after the 8th arrives at once. A 30-item stagger is a loading screen pretending
  to be a design.
- Nothing loops forever except a genuine indeterminate progress indicator.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Opacity fades may remain. Everything else snaps. The run choreography degrades to: status
text changes, output appears. It still communicates; it just doesn't perform.

---

## 8. The run choreography — the signature

This is the one screen to get perfect. Read it twice.

**Layout.** On desktop, a two-panel split: the form on the left (420px, fixed), the output on
the right (fluid, fills the rest). A `1px` divider between. On mobile, they stack: form first,
output below, and the Run button becomes a sticky bottom bar.

**Before the run.** The output panel is not empty-grey-nothing. It shows a `--sunken` well
with a single centered line in `--text-faint`, `mono`: the tool's slug, and under it, in
`small`, one line describing what will appear here. It's a stage waiting for its actor.

**The sequence, on click:**

1. **0ms** — The Run button's label swaps to `Running` and a small indeterminate dot begins
   pulsing to its left. The button width is locked (measured before the swap) so nothing
   jumps. The button stays enabled-looking but is not clickable.
2. **0ms** — A **2px indeterminate progress line** appears along the top edge of the output
   panel, in `--accent`. It sweeps left-to-right on a 1.4s loop. This is the only infinite
   animation in the product, and it is honest: we truly don't know how long n8n will take.
3. **80ms** — The waiting well cross-fades out and a **skeleton of the actual output shape**
   fades in, built from the tool's `output_schema`. If the tool returns a table, the skeleton
   is a table. If it returns markdown, the skeleton is text lines of varying width. The user
   sees the shape of their answer before the answer arrives. Skeletons shimmer with a slow
   opacity pulse — `0.5 → 0.8 → 0.5` over 1.6s. **Never a shimmer-gradient sweep.**
4. **A status pill** sits at the top-right of the output panel, `mono-chip`, tracking state:
   `QUEUED` (faint) → `RUNNING` (accent, with a pulsing dot) → `DONE` (live) or `FAILED`
   (danger). The transitions are colour + text, 120ms, no movement.
5. **On success** — the progress line completes to 100% and fades. The skeleton cross-fades
   out over 160ms. Then the real output blocks arrive: each one fades in from
   `opacity: 0, translateY(8px)` over 200ms with `--ease-enter`, staggered 40ms apart.
6. **The receipt.** Under the last output block, a single quiet mono line appears:
   `2.4s · run_a1b2c3d4 · openai` — duration, run ID, provider used. Small, faint, factual.
   This detail is why the product feels like real machinery instead of a wrapper. Do not skip
   it, and do not make it big.
7. **The button** returns to `Run again`, and a `Save` / `Copy` / `Download` row appears
   beside the receipt.

**On failure** — the progress line turns `--danger` and fades. The output panel border goes
`--danger`. The panel shows, in order: what happened, in plain words; what to check; a Retry
button. See §12 for the exact voice.

**The 401 case is special.** If the provider rejected the member's key, this is not a generic
error. The panel says which provider rejected it, that the key has been marked invalid, and
gives a button that goes straight to the key vault, filtered to that provider. Most BYOK
failures are this. Design for it as a first-class path, not an edge case.

### The run is not a page state. It's a row.

Runs are async (CLAUDE.md §9): the member clicks Run, we hand the job to n8n, and n8n calls back
minutes later. The run lives in the database, not in a React state variable. **They can close the
tab. They can close the laptop.** The run keeps going without them and it will be there when they
come back. This is a feature, and the design has to make them believe it.

So the choreography above is not "what happens after you click". It is **a rendering of whatever
state the row is in, whenever you happen to look at it.** Build it that way and the hard cases
disappear.

**Resumed, still running** — a cold load of a run that's still going. This is the state that
proves the promise, so it gets designed, not defaulted. It renders the *identical* live UI:
progress line sweeping, skeleton in the shape of this tool's output, `RUNNING` pill pulsing —
and subscribes to the row over Realtime. The **only** difference from a live run is a single
`--text-faint` `small` line under the status pill:

> Started 4 minutes ago. You can close this — it'll keep going.

No "reconnecting", no "restoring session", no spinner-before-the-spinner. The member must not be
able to tell whether they have been watching for two minutes or just walked back to their desk.
Any UI that reveals the difference is a bug.

**Resumed, finished** — a cold load of a completed run. **No choreography.** The output is simply
*there*, on first paint, with the receipt line. Do not replay the entrance stagger. The
choreography is the payoff for *waiting*; performing it for someone who wasn't waiting is a lie,
and worse, it's a lie that costs them 640ms before they can read their answer. Animation earned
by an event, never by a page load.

**Leaving mid-run** — nothing to do, and that's the point. No "are you sure?" dialog, no beforeunload
prompt. The Run button's state, after the row is created, is a link, not a lock. If the member
navigates away, a toast: *"Still running. It'll be in your run history."* with a `[View run]`
action. One toast, then silence.

**Coming back to a run they missed** — the notification bell and `/dashboard/runs` are the
recovery path. A finished run they never saw is not "unread"; it's just a run. Don't badge it,
don't celebrate it, don't make them dismiss anything.

### The three states, plainly

| Row state | What the panel shows |
|---|---|
| `queued` / `running`, started by you, in this tab | The full choreography, live |
| `queued` / `running`, loaded cold | The same live UI + "Started N minutes ago. You can close this." |
| `success` / `error` / `timeout`, loaded cold | The finished output, instantly, no animation |

One component. Three inputs. If you find yourself writing a second output panel for the "resumed"
case, stop — you've built the wrong thing.

**`timeout` is its own state, not an error.** n8n died and never called back; the reaper marked
it. The member did nothing wrong and their key wasn't charged. Say so. See §12.

---

## 9. Components

The complete inventory. Nothing outside this list gets built without adding it here first.

### Button

Sizes: `sm` (32px tall, 13px text) · `md` (38px, 15px) · `lg` (44px, 15px, landing CTAs only).

| Variant | Fill | Border | Text | Use |
|---|---|---|---|---|
| `primary` | `--accent` | none | `--accent-text` | The one main action per screen |
| `secondary` | `--surface` | `--line` | `--text` | Everything else |
| `ghost` | transparent | none | `--text-muted` | Toolbar, icon buttons, table row actions |
| `danger` | transparent | `--danger` | `--danger` | Destructive. Fills `--danger` on hover. |

Every button implements six states: **rest, hover, active (`translateY(1px)`), focus-visible,
disabled, pending.**

**Pending state:** the label is replaced by a spinner *at the measured width of the label*, so
the button does not resize. Every button that triggers an async action has one. No exceptions.

**A disabled button always has a tooltip explaining why.** A dead button with no explanation is
a bug, not a design.

### Input / Textarea / Select

- `--surface` fill, `1px --line` border, `--radius-sm`, 38px tall (textarea: min 96px).
- Hover: border → `--line-strong`. Focus: border → `--accent` + a 2px `--accent-quiet` ring.
- **Labels are always visible, above the field.** Placeholders are examples, never labels. A
  placeholder-as-label disappears the moment someone types, and then they can't check their
  own work.
- Help text sits *below* the field in `small`/`--text-muted`. Errors replace it in
  `--danger` with a small icon.
- Errors appear on blur, not on keystroke. Nobody wants to be shouted at mid-word.
- Required fields get a `--danger` asterisk. Optional is the exception; mark the exception.

### Card

`--surface` fill, `1px --line`, `--radius-md`, 20px padding. Hover (only if interactive):
border → `--line-strong`, `translateY(-1px)`, 120ms.

### ToolCard — three states, and they matter

The tool card is the most-seen component in the product. It appears on the landing page, the
public catalog, and the member dashboard. It has exactly three states:

**Unlocked** — icon, name, `mono` slug, tagline, category chip, and the key chip (below).
Primary action: **Run**.

**Locked** — the exact same card, at full opacity, **with the name and tagline fully legible**.
Do not blur it. Do not grey it out. Desire needs an object; hiding the tool from someone who
wants it is how you lose them. The only differences: a small lock icon top-right, and the Run
button is replaced by a `secondary` button reading **Apply for access**. A `--warn-quiet` mono
chip explains the gate: `members only`.

**Coming soon** — same card. Instead of a slug, a `--warn-quiet` chip reading `coming soon`.
The action is **Notify me**, which toggles to `We'll tell you` on click, optimistically. This
is your demand-measurement instrument; make it a single, frictionless click.

### The key chip — three states, not two

A tool's `required_providers` chip has to distinguish *verified*, *present but unproven*, and
*missing*. Two states can't, and the difference is not cosmetic: a key we've never verified might
be a typo, and the member deserves to know that *before* they wait four minutes for a run to fail
on a 401.

`--live` in this system means "actually verified" — §2 is explicit that status colors are never
decoration — so an unverified key must not be green. It gets no color at all.

| Key state | Chip | Run button |
|---|---|---|
| **Verified** (`status = 'valid'`) | `--live-quiet` / `--live`, `mono-chip`: `openai ✓` | Enabled |
| **Unverified** (`status = 'unverified'`) | `--surface` + `--line` border, `--text-muted`, `mono-chip`: `openai` — no tick, no color. A *button*: clicking verifies it in place. | **Enabled.** We don't block on verification — a run is a verification, and blocking here would be friction for a key that's probably fine. |
| **Missing or invalid** | `--warn-quiet` / `--warn`, `mono-chip`: `needs: openai`. A *button* → key vault, pre-filtered to that provider. | Disabled, tooltip: *"Connect your OpenAI key to run this."* |

A tool with `required_providers = '{}'` shows **no chip at all** — not a chip reading "no key
needed". The absence is the message, and it's the quietest card on the page, which is exactly
right for the one a brand-new signup should click first.

A tool needing multiple providers shows one chip per provider, in schema order. Three chips is
the practical ceiling; if a tool needs four keys, the tool is the problem, not the card.

### Status pill

`--radius-pill`, `mono-chip`, 4px/8px padding, `--*-quiet` background, `--*` text. A 6px dot
before the label. The dot pulses (opacity 0.4 → 1 → 0.4, 1.6s) only in `RUNNING`.

`QUEUED` faint · `RUNNING` accent · `DONE` live · `FAILED` danger · `TIMEOUT` danger ·
`ACTIVE` live · `PENDING` warn · `LOCKED` warn · `INVALID` danger

### Table

Sticky header, `eyebrow` column labels, `1px --line` row dividers, **no zebra striping**
(the hairlines already do that job, and stripes make dense data noisy). Row hover: background
→ `--elevated`. Numbers tabular. Row actions live in a `ghost` icon button that appears on
hover but is *always present in the DOM* for keyboard users.

**On mobile, tables become cards.** Not horizontal scroll. Never horizontal scroll.

### Dialog

`--elevated`, `--radius-lg`, `--shadow-modal`, max 520px. Enters at `opacity 0, scale 0.98`,
200ms, `--ease-enter`. Backdrop `rgba(0,0,0,0.6)`, no blur. Focus trapped. Escape closes.
Title is `h3`. The primary action goes on the right.

**Destructive dialogs require typed confirmation** only when the action is irreversible and
affects someone else (revoking a membership, deleting a tool with run history). Otherwise a
plain confirm is enough — don't make me type "DELETE" to remove a draft.

### Toast

Bottom-right on desktop, top on mobile. `--elevated`, `--shadow-pop`, `--radius-md`. Slides in
from 12px, 200ms. Auto-dismiss at 4s. **One at a time** — a stack of toasts is a failure of
design. Every destructive toast carries an **Undo** for 4s, and Undo must actually work.

### Skeleton

`--elevated` fill, `--radius-sm`, matching the exact dimensions of what's coming. Pulses
opacity 0.5 → 0.8 → 0.5 over 1.6s. **No shimmer sweep gradient.**

### Empty state

Not a shrug. A centered block, max 400px: a small icon in `--text-faint`, an `h3`, one line of
`small`/`--text-muted` explaining what goes here, and one `primary` button. See §12 for the
copy.

### Command palette (⌘K)

**Build it in Phase 4**, not Phase 1. It is still the single highest-leverage perceived-quality
feature in the product and it still costs about half a day — but in Phase 1 there are no tools,
no runs and no users, so it would fuzzy-search an empty array. Build it when there is something
to find. Fuzzy search across: tools, runs, admin pages, settings, theme toggle. For the admin, it
also searches users by name and email.

---

## 10. Layout

### App shell (`/dashboard`, `/admin`)

- **Left sidebar**, 240px, `--canvas` background, `1px --line` right edge. Collapses to icons
  at 1024px, becomes a bottom sheet under 768px.
- Nav items: 36px tall, `--radius-sm`, `body` text. Active: `--accent-quiet` background,
  `--accent` text, and a 2px `--accent` bar on the left edge.
- **Top bar**, 56px: page title (`h1`), then, pushed right — search (⌘K), notification bell,
  theme toggle, avatar menu.
- Admin gets a persistent `--warn-quiet` chip in the top bar reading `ADMIN`. You will
  eventually forget which account you're in. This prevents that.

### Landing page

**This order is the one that ships.** CLAUDE.md §8 summarizes the landing page in passing and
lists the sections in a different order; that summary is not the spec. This file is. The
difference matters: "how access works" has to land *before* the tool grid, so that a stranger
scrolling into a wall of locked cards already knows why they're locked and what to do about it.
A locked card is only frustrating if you don't yet know the door has a handle.

The order, and nothing else:

1. **Hero.** The headline states what the product does in one plain sentence. Under it, one
   sentence on how access works. Two buttons: `Apply for access` (primary), `Browse the tools`
   (secondary). No image. No video. No gradient. The restraint *is* the statement.
2. **The Shipping Log** — the signature. A vertical rail down the left, hairline, with a small
   node at each entry. Each entry: the launch date in `mono` on the left of the rail, and on
   the right, the tool name (`h2`), its version chip, its one-line tagline, and a link. Newest
   first. It renders straight from the `tools` table, so it grows every time you ship — a
   design that gets *better* the more you work is the correct design for this business.
   Numbering is legitimate here: the content genuinely is a dated sequence, and the sequence
   is the argument.
3. **What you get.** Three short columns. Plain language. No icons-in-circles.
4. **How access works.** Four steps: Apply → Get approved → Connect your keys → Run.
   Numbered, because it is genuinely a sequence.
5. **Tool grid.** The full catalog, locked cards, full opacity.
6. **One closing CTA.** The same apply button. Same words.

No testimonials until real ones exist. No logo bar. No stats you had to invent.

---

## 11. Responsive

Breakpoints: `640` `768` `1024` `1280`.

Design mobile-first for the app, desktop-first for the admin (nobody approves applications on
a phone — but make it *work* there anyway, because you will).

Non-negotiable mobile rules:

- Tap targets ≥ 44px.
- Tool runner: form stacks above output, Run button is a sticky bottom bar.
- Tables become cards.
- Sidebar becomes a bottom sheet.
- The command palette is reachable from a top-bar icon, since there's no ⌘K.
- Nothing scrolls horizontally. Nothing.

---

## 12. Voice and copy

Copy is design material. It's most of what the user actually experiences.

### Rules

- **Sentence case.** Everywhere.
- **Active voice, always.** The button says what happens: `Save changes`, not `Submit`.
- **A word keeps its meaning through the whole flow.** The button says `Run` → the state says
  `Running` → the toast says `Run complete`. Never `Run` → `Processing` → `Success!`.
- **Name things the way the user thinks about them.** They connect a *key*, not a credential.
  They *run* a tool, they don't *execute a workflow*. They *apply*, they don't *submit an
  application request*.
- **Errors don't apologize and are never vague.** Say what happened, then what to do. No
  "Oops!" No "Something went wrong." No exclamation marks.
- **No filler.** Delete "please", "simply", "just", "easily". If a sentence survives its own
  deletion, delete it.

### The screens that matter most

**Dashboard, no access yet:**
> **Nothing here yet**
> Tools unlock when your application is approved. It usually takes a day.
> `[Check your application]`

**Dashboard, application pending:**
> **You're in the queue**
> Applied 2 days ago. I review these personally, usually within 48 hours. In the meantime,
> three tools are open to everyone — no approval, no key needed.
> `[Try the open tools]`

**Dashboard, approved, tools waiting:**
> **3 tools unlocked**
> `[grid]`

**Key vault, empty:**
> **No keys connected**
> Tools run on your own API keys, so you pay your provider directly and nothing runs through
> my bill. Most tools need one key. Some need none.
> `[Connect a key]`

**Key vault, what we do with the key — this exact wording, and nothing stronger, anywhere:**
> Your key is encrypted before it's stored. No screen in this product can show it back to you —
> or to me. A leaked database is useless without a key I keep off the server.

> The temptation is to write "not even I can read it." Don't. I hold the encryption key and the
> database credentials; with enough determination I could decrypt anything in here, and the
> people this product is for know that. The sentence above is true in every clause, and a claim
> that survives scrutiny is worth more than one that flatters us. Never soften it and never
> inflate it.

**Run history, empty:**
> **No runs yet**
> Every tool you run is saved here — inputs, outputs, and the exact time it took.
> `[Pick a tool]`

**Run still going, on a page you just opened:**
> Started 4 minutes ago. You can close this — it'll keep going.

**Navigating away mid-run (toast):**
> Still running. It'll be in your run history.
> `[View run]`

**Run failed on a bad key:**
> **OpenAI rejected your key**
> The key ending in `••••a9F2` was refused. It may have been revoked, or it may be out of
> credit on OpenAI's side. Your run wasn't charged to anything.
> `[Update your key]`

**Run failed, tool error:**
> **The tool didn't finish**
> It ran for 38 seconds and returned an error: `rate limit exceeded`. This usually clears in
> a minute.
> `[Run again]`

**Run timed out — the tool never reported back:**
> **The tool never came back**
> It's been running for 10 minutes with no response, so I've stopped waiting. This is on my
> side, not yours, and nothing was charged to your key.
> `[Run again]`

**A file output that has aged out (30 days):**
> **File expired**
> Files are kept for 30 days. Everything else from this run is still here.
> `[Run again]`

(And on the runner, before they ever hit it, in `small` / `--text-muted` under the output:
*Files are kept for 30 days. Text output is kept forever.*)

**Tool in maintenance:**
> **Being rebuilt**
> This tool is offline while I fix something. It'll be back — you'll get a notification.

**Applications closed:**
> **Applications are closed right now**
> I open them up as I add capacity. Leave your email and you'll be first to know.

Notice what none of these do: apologize, use an exclamation mark, or make the user feel
stupid. The timeout copy takes the blame, because the blame is ours.

---

## 13. Accessibility — the floor, not the ceiling

Not a checklist to feel good about. These are bugs if they're missing.

- Every interactive element is reachable and operable by keyboard, in a sensible order.
- `:focus-visible` is a 2px `--accent` ring at 2px offset. **Never** `outline: none` without
  a replacement.
- Contrast: 4.5:1 body, 3:1 large text and UI borders.
- Labels are real `<label>` elements bound to their input. Placeholders are not labels.
- Icon-only buttons have an `aria-label`.
- The run status pill is an `aria-live="polite"` region, so a screen reader announces when a
  run finishes.
- Errors are tied to their field with `aria-describedby`.
- Dialogs trap focus and return it to the trigger on close.
- Color never carries meaning alone.
- `prefers-reduced-motion` is honoured, fully.

---

## 14. Implementation

### Tailwind v4, CSS-first

We are on **Tailwind v4**. There is **no `tailwind.config.ts`** — v4 is configured in CSS. The
tokens in §2–§7 are the source of truth and they live in `globals.css`, exposed to Tailwind
through `@theme`, so `bg-surface`, `text-muted`, `rounded-md`, and `duration-enter` all resolve
to the values in this document and nowhere else.

Theme switching stays on the **`[data-theme]` attribute**, exactly as §2 declares it. shadcn/ui
and Tailwind both default to a `.dark` *class*; we override that with a custom variant rather
than rewriting the selectors in this file, because the token block above is the contract and the
tooling bends to it, not the reverse:

```css
/* globals.css */
@import "tailwindcss";

/* Make `dark:` mean [data-theme="dark"], not .dark */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root[data-theme="dark"] { /* ...the §2 dark tokens, verbatim... */ }
:root[data-theme="light"] { /* ...the §2 light tokens, verbatim... */ }

@theme inline {
  --color-canvas:      var(--canvas);
  --color-surface:     var(--surface);
  --color-elevated:    var(--elevated);
  --color-sunken:      var(--sunken);
  --color-line:        var(--line);
  --color-line-strong: var(--line-strong);
  --color-text:        var(--text);
  --color-text-muted:  var(--text-muted);
  --color-text-faint:  var(--text-faint);
  --color-accent:      var(--accent);
  /* ...and so on. Every token in §2. No exceptions, no extras. */

  --radius-sm:   6px;
  --radius-md:  10px;
  --radius-lg:  14px;

  --font-display: 'Sora', system-ui, sans-serif;
  --font-sans:    'Instrument Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;
}
```

`@theme inline` (not plain `@theme`) is what lets a utility resolve through the `var()` chain, so
one attribute flip on `<html>` reskins the entire app with no class churn and no flash.

The theme is set on `<html>` before first paint by a tiny blocking script reading
`localStorage` → `prefers-color-scheme`. A theme flash is a bug, not a tradeoff.

### The rest

- **Never a raw hex in a component. Never an arbitrary value** like `p-[18px]` — §4 says there
  is no 18.
- **shadcn/ui as the base**, restyled to these tokens. Do not use its defaults — the whole
  point is not looking like the default. Its generated components ship with `.dark` selectors
  and its own token names; retoken them on the way in, once, rather than patching them per screen.
- One component, one file, in `components/ui/` (primitives) or `components/tools/` (domain).
- If you write the same three Tailwind classes twice, it's a component.
- Every component supports both themes from day one. Never hardcode a dark-mode color.
- Fonts self-hosted via `next/font` with `display: swap`. No FOUT, no layout shift.
- Icons: **Lucide**, 16px in UI, 20px in nav, `1.5` stroke. Never mix icon sets. Never emoji.

### Before you call any screen done

- [ ] Zero raw hex codes, zero arbitrary spacing values in the component.
- [ ] Every async action has a pending state; every button that can be disabled has a tooltip.
- [ ] Loading is a skeleton shaped like the real content, not a spinner.
- [ ] The empty state sells and directs. It does not say "No data".
- [ ] The error state says what broke and what to do.
- [ ] It works at 375px wide.
- [ ] Tab through it with the mouse untouched. Everything is reachable, focus is always visible.
- [ ] Turn on reduced motion. It still works.
- [ ] Switch to light mode. It still looks intentional.
- [ ] Remove one thing. It's probably better now.
