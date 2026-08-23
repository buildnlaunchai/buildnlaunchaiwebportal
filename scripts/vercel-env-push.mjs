#!/usr/bin/env node
/**
 * Push variables from .env.local into a Vercel environment, non-interactively.
 *
 *   pnpm vercel:env <production|preview|development> VAR_NAME [VAR_NAME...]
 *   pnpm vercel:env preview CREEM_API_KEY CREEM_WEBHOOK_SECRET
 *
 * Replaces stepping through the CLI's "Value / Sensitive? / Git branch?" prompts
 * once per variable.
 *
 * THE VALUE IS PIPED ON STDIN, NEVER PASSED AS --value.
 * `vercel env add NAME env --value "$SECRET"` is the documented non-interactive
 * form and it is the wrong one: the secret lands in the process table, where any
 * other process on the machine can read it, and in your shell history. stdin
 * leaves no such trace. This script never prints a value either — only names,
 * lengths, and outcomes.
 *
 * Values are read through Node's own --env-file parser (see the package.json
 * script), not by grepping the file. That matters: a generated secret containing
 * a `#` is silently truncated at that character by naive parsing, and the symptom
 * is not a parse error but a signature-verification failure in production.
 *
 * --sensitive is the default here, matching every existing variable on this
 * project. Sensitive values are write-only: Vercel will not read them back, so
 * there is no way to diff what was stored against what you meant to store. Get it
 * right on the way in — this script's length report is the last chance to notice
 * a truncated value.
 */
import { spawnSync } from "node:child_process";

const VALID_ENVS = new Set(["production", "preview", "development"]);

const [target, ...names] = process.argv.slice(2);

if (!target || names.length === 0 || !VALID_ENVS.has(target)) {
  console.error(
    [
      "",
      "  Usage: pnpm vercel:env <production|preview|development> VAR [VAR...]",
      "",
      "  Example:",
      "    pnpm vercel:env preview CREEM_API_KEY CREEM_WEBHOOK_SECRET",
      "",
    ].join("\n"),
  );
  process.exit(64);
}

// Refuse to push anything that is not actually set locally, rather than writing
// an empty variable to Vercel — an empty value is worse than a missing one,
// because the app's `if (!process.env.X)` guards still fire but `vercel env ls`
// shows the variable as present and you go looking in the wrong place.
const missing = names.filter((n) => !process.env[n]);
if (missing.length > 0) {
  console.error(
    `\n  ✖  Not set in .env.local: ${missing.join(", ")}\n` +
      `     Add them there first — nothing was pushed.\n`,
  );
  process.exit(1);
}

let failed = 0;

for (const name of names) {
  const value = process.env[name];

  if (/^\s|\s$/.test(value)) {
    console.error(
      `  ⚠  ${name} has leading/trailing whitespace. Quote it in .env.local — ` +
        `a stray newline breaks HMAC comparisons. Skipped.`,
    );
    failed += 1;
    continue;
  }

  // --force so re-running is idempotent: rotating a secret is the same command.
  const result = spawnSync(
    "pnpm",
    [
      "dlx",
      "vercel@latest",
      "env",
      "add",
      name,
      target,
      "--sensitive",
      "--force",
      "--yes",
    ],
    // The value goes in on stdin and nowhere else. stdout is swallowed so the
    // CLI's echo can never surface a value; stderr stays visible for real errors.
    { input: value, stdio: ["pipe", "ignore", "inherit"] },
  );

  if (result.status === 0) {
    console.log(`  ✓  ${name} → ${target}  (${value.length} chars, sensitive)`);
  } else {
    console.error(`  ✖  ${name} → ${target} FAILED (exit ${result.status})`);
    failed += 1;
  }
}

console.log(
  `\n  ${names.length - failed}/${names.length} pushed to ${target}.` +
    (failed ? " See errors above.\n" : "\n"),
);
process.exit(failed > 0 ? 1 : 0);
