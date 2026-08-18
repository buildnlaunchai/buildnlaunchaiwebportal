import {
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Laptop,
  type LucideIcon,
  Monitor,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, SectionHeader } from "@/components/ui/panel";

/**
 * The public landing page for the "Raw Footage, Real Story" desktop app.
 *
 * WHY THIS IS A STATIC ROUTE AND NOT THE /tools/[slug] PAGE. The slug is in
 * PUBLIC_HIDDEN_SLUGS (lib/tools.ts), so getToolBySlug returns null for it and
 * the dynamic tool page 404s — deliberately: the desktop app exists as a `tools`
 * row so the access engine can answer the licence check, which is a backend
 * need, not a reason to put it in the catalog. But tool_secrets.external_url
 * points here, so the Download button on the dashboard card needs a real page at
 * this exact URL. A static segment outranks the sibling dynamic one, so this
 * file answers /tools/raw-footage-real-story without un-hiding the tool
 * anywhere else — no catalog card, no shipping-log entry, no OG metadata for a
 * product that has not launched publicly yet.
 *
 * It is also not the generic tool page in shape: that page sells a tool you run
 * in the browser, with a form preview and an access CTA. This one hands over a
 * binary and tells you how to get it past Gatekeeper.
 */

export const metadata: Metadata = {
  title: "Raw Footage, Real Story — Build & Launch AI",
  description:
    "A desktop app that turns raw footage into a story-shaped edit on your own machine. Free download for Apple Silicon Macs and 64-bit Windows.",
  openGraph: {
    title: "Raw Footage, Real Story",
    description:
      "Turns raw footage into a story-shaped edit — script, pacing and narration — without uploading your media anywhere.",
    type: "website",
  },
};

// The release data is fetched from GitHub, so refresh the static HTML hourly. A
// new release appears here on its own; nothing needs a redeploy and no asset
// filename is hardcoded.
export const revalidate = 3600;

const REPO = "buildnlaunchai/raw-footage-real-story-releases";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const INSTALL_MD_URL = `https://github.com/${REPO}/blob/main/INSTALL.md`;

type Asset = { name: string; size: number; url: string };
type Release = {
  version: string | null;
  published: string | null;
  mac: Asset | null;
  windows: Asset | null;
};

/**
 * Resolve the current download links from the GitHub releases API.
 *
 * Direct asset links rather than "here's the releases page": one click, and the
 * right file for the machine you're on. They don't go stale, because they are
 * read per release rather than typed in — and every failure path falls back to
 * the releases page, so a rate-limited or unreachable API degrades to the link
 * we'd otherwise have hardcoded instead of to a broken page.
 */
async function getLatestRelease(): Promise<Release> {
  const empty: Release = { version: null, published: null, mac: null, windows: null };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate },
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as {
      tag_name?: string;
      published_at?: string;
      assets?: { name: string; size: number; browser_download_url: string }[];
    };

    const pick = (match: (name: string) => boolean): Asset | null => {
      const hit = (data.assets ?? []).find((a) => match(a.name.toLowerCase()));
      return hit
        ? { name: hit.name, size: hit.size, url: hit.browser_download_url }
        : null;
    };

    return {
      version: data.tag_name ?? null,
      published: data.published_at ?? null,
      mac: pick((n) => n.endsWith(".dmg")),
      windows: pick((n) => n.endsWith(".exe")),
    };
  } catch {
    // Network failure at build or revalidate time. The page still renders.
    return empty;
  }
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function releaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ---- one platform's download card ---------------------------------------- */

function PlatformCard({
  icon: Icon,
  platform,
  requirement,
  asset,
  note,
}: {
  icon: LucideIcon;
  platform: string;
  requirement: string;
  asset: Asset | null;
  note?: string;
}) {
  return (
    <Panel className="flex flex-col gap-5">
      <SectionHeader icon={Icon} title={platform} description={requirement} />

      <div className="flex flex-col gap-3">
        {/* Direct asset when we have one; the releases page when we don't, so
            the button is never dead. */}
        <a
          href={asset?.url ?? RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <Button variant="primary" className="w-full">
            <Download aria-hidden className="size-4" strokeWidth={1.5} />
            Download for {platform.split(" ")[0]}
          </Button>
        </a>

        <p className="text-mono-chip text-text-faint">
          {asset ? `${asset.name} · ${megabytes(asset.size)}` : "On the releases page"}
        </p>
      </div>

      {note && <p className="text-small text-text-muted">{note}</p>}
    </Panel>
  );
}

/* ---- the page ------------------------------------------------------------ */

export default async function RawFootageRealStoryPage() {
  const release = await getLatestRelease();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-16 lg:px-8">
      {/* Hero. No image, no gradient — the restraint is the statement (§10). */}
      <section className="mx-auto max-w-[60ch] text-center">
        <span className="text-eyebrow inline-flex items-center gap-2 rounded-pill border border-line-strong bg-accent-quiet px-3 py-1.5 text-accent">
          <Cpu aria-hidden className="size-3.5" strokeWidth={2} />
          Desktop app
        </span>
        <h1 className="text-display-xl mt-5 text-balance">
          Raw Footage, <span className="text-accent">Real Story.</span>
        </h1>
        <p className="mt-5 text-body text-text-muted">
          A folder of raw clips goes in. A story-shaped edit comes out — script,
          pacing, beats and a narration pass. It reads your footage where it sits
          and never uploads it anywhere.
        </p>
        {(release.version || release.published) && (
          <p className="text-mono-chip mt-6 text-text-faint">
            {[
              release.version,
              release.published ? releaseDate(release.published) : null,
              "free while in beta",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* Download — the point of the page, so it comes before the pitch. */}
      <section id="download" className="mt-14 scroll-mt-24">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <PlatformCard
            icon={Laptop}
            platform="Mac · Apple Silicon"
            requirement="macOS 11 or later, M1 or newer"
            asset={release.mac}
            note="Intel Macs are not supported yet — the speech model's runtime publishes no Intel-macOS build. Apple menu → About This Mac tells you which you have."
          />
          <PlatformCard
            icon={Monitor}
            platform="Windows · 64-bit"
            requirement="Windows 10 or 11"
            asset={release.windows}
            note="Installs for your user only, so it never asks for an administrator password."
          />
        </div>

        <p className="mt-5 text-small text-text-faint">
          Every build is published on{" "}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:text-accent-hover"
          >
            the releases page
            <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.5} />
          </a>
          , with the changelog and every earlier version.
        </p>
      </section>

      {/* What it does. Three short columns, plain language, no icons-in-circles. */}
      <section className="py-24">
        <p className="text-eyebrow text-accent">What it does</p>
        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="text-h3">Your footage stays put</h2>
            <p className="mt-2 text-small text-text-muted">
              Video files are read where they sit. Nothing is uploaded, and
              nothing is copied into the app. If you use the cloud options, only
              the text of your script leaves your machine — and the app says so
              on screen before it sends anything.
            </p>
          </div>
          <div>
            <h2 className="text-h3">It writes the story</h2>
            <p className="mt-2 text-small text-text-muted">
              Not a montage on a beat grid. It drafts a script from what is
              actually in your clips, chooses the beats, and paces the cut around
              them, so the edit has an argument to make.
            </p>
          </div>
          <div>
            <h2 className="text-h3">Narration included</h2>
            <p className="mt-2 text-small text-text-muted">
              English narration runs on a voice model inside the app — 55 voices,
              no account, no internet. Bengali, Hindi, Arabic, Thai, Chinese and
              Japanese need your own ElevenLabs key.
            </p>
          </div>
        </div>
      </section>

      {/* Install. The unsigned-binary warning is the single most important thing
          on this page after the buttons, so it gets a Callout, not a footnote. */}
      <section className="pb-24">
        <p className="text-eyebrow text-text-faint">Installing</p>
        <h2 className="text-display-l mt-3 text-balance">
          Both builds are unsigned. Read this first.
        </h2>

        <Callout tone="warn" icon={ShieldAlert} className="mt-8">
          macOS and Windows will both refuse to open these the first time, in
          wording that suggests the file is dangerous. It isn&rsquo;t — there is
          no signing certificate on these builds yet, so the operating system has
          no way to check who made them. Every unsigned app gets the same
          treatment. You get past it once per machine.
        </Callout>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel className="flex flex-col gap-4">
            <SectionHeader icon={Laptop} title="macOS" />
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-small text-text-muted marker:text-text-faint">
              <li>
                Open the <code className="text-mono">.dmg</code>, drag the app
                into Applications, and eject the disk image.
              </li>
              <li>
                Open it from Applications. macOS refuses, saying it cannot verify
                the app is free of malware. Click{" "}
                <span className="text-text">Done</span> — not &ldquo;Move to
                Trash&rdquo;.
              </li>
              <li>
                Open System Settings → Privacy &amp; Security and scroll to
                Security. There is a line naming the app and a button:{" "}
                <span className="text-text">Open Anyway</span>. Click it.
              </li>
              <li>
                Confirm with your password or Touch ID. Every launch after this
                one is normal.
              </li>
            </ol>
            <p className="text-small text-text-faint">
              On macOS 14 and earlier, Control-click the app → Open is enough.
              Apple removed that shortcut in macOS 15, so on 15 and later the
              System Settings route above is the only one.
            </p>
          </Panel>

          <Panel className="flex flex-col gap-4">
            <SectionHeader icon={Monitor} title="Windows" />
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-small text-text-muted marker:text-text-faint">
              <li>
                Run the installer. SmartScreen shows a blue{" "}
                <span className="text-text">Windows protected your PC</span>{" "}
                window, with Publisher: Unknown publisher.
              </li>
              <li>
                Click <span className="text-text">More info</span> — the small
                link in the body of that window. Without it, the only button you
                get is &ldquo;Don&rsquo;t run&rdquo;.
              </li>
              <li>
                A <span className="text-text">Run anyway</span> button appears.
                Click it, and the installer proceeds normally.
              </li>
            </ol>
            <p className="text-small text-text-faint">
              Your browser may warn during the download too — Chrome and Edge
              label unsigned installers as not commonly downloaded. Choose Keep.
            </p>
          </Panel>
        </div>

        <p className="mt-5 text-small text-text-faint">
          The full guide, including what to do if macOS calls the app damaged,
          lives in{" "}
          <a
            href={INSTALL_MD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:text-accent-hover"
          >
            INSTALL.md
            <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.5} />
          </a>
          .
        </p>
      </section>

      {/* First run. One genuine prerequisite; everything else is optional. */}
      <section className="pb-24">
        <p className="text-eyebrow text-text-faint">Before you start</p>
        <h2 className="text-display-l mt-3 text-balance">One thing to install.</h2>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel className="flex flex-col gap-4">
            <SectionHeader
              icon={Terminal}
              title="ffmpeg"
              description="Required — it builds the video"
            />
            <p className="text-small text-text-muted">
              The app checks on first launch and shows you the command, with a
              Re-check button if you install it while the app is open.
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-mono text-text-muted">
                <span className="text-text-faint">macOS</span>{" "}
                brew install ffmpeg-full
              </p>
              <p className="text-mono text-text-muted">
                <span className="text-text-faint">Windows</span>{" "}
                winget install -e --id Gyan.FFmpeg
              </p>
            </div>
            <p className="text-small text-text-faint">
              Use <code className="text-mono">ffmpeg-full</code> on macOS, not
              plain <code className="text-mono">ffmpeg</code>. The plain build is
              missing the parts that handle HDR footage from newer phones, and
              your video comes out grey.
            </p>
          </Panel>

          <Panel className="flex flex-col gap-4">
            <SectionHeader
              icon={HardDrive}
              title="Script writing"
              description="Optional — pick one"
            />
            <p className="text-small text-text-muted">
              Install{" "}
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                Ollama
              </a>{" "}
              and the script is written on your own machine, at no cost — the app
              offers to download the model it needs.
            </p>
            <p className="text-small text-text-muted">
              Or add your own OpenAI key in the app and skip Ollama entirely.
              Either way you pay the provider directly, and nothing runs through
              my bill.
            </p>
          </Panel>
        </div>
      </section>

      {/* How it relates to the membership — and the honest note about keys. */}
      <section className="border-t border-line pt-10">
        <div className="prose-measure flex flex-col gap-4">
          <h2 className="text-h2">It signs in with your Build &amp; Launch account</h2>
          <p className="text-small text-text-muted">
            The app checks your membership when it starts and keeps working
            offline afterwards. It can read your OpenAI and ElevenLabs keys out
            of your key vault — but only for a provider you have explicitly
            allowed, only while your membership is active, and every read is
            logged where you can see it. You can revoke that at any time from the
            vault.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/pricing">
              <Button variant="secondary">See membership</Button>
            </Link>
            <Link href="/dashboard/keys/desktop">
              <Button variant="ghost">Key permissions</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
