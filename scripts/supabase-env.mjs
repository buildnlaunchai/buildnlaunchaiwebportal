#!/usr/bin/env node
/**
 * Runs the Supabase CLI with .env.local already loaded.
 *
 * Invoked as:
 *   node --env-file-if-exists=.env.local scripts/supabase-env.mjs [opts] -- <cli args>
 *
 * The env loading is NOT done by this file — it is done by Node's own
 * `--env-file-if-exists` flag in the package.json script, which populates
 * process.env before a line of this runs. spawnSync inherits process.env, so the
 * CLI sees SUPABASE_DB_PASSWORD without anyone exporting it. This mirrors the
 * `node --env-file=.env.local scripts/verify-*.mjs` convention already used
 * throughout package.json, and adds no dependency.
 *
 * `--env-file-if-exists`, not `--env-file`: a teammate who is logged in via
 * `supabase login` can legitimately run `pnpm db:types` with no .env.local at
 * all, and the hard variant aborts on a missing file.
 *
 * Options (before the `--`):
 *
 *   --require VAR   Fail with an actionable message if VAR is missing or empty.
 *                   Repeatable. Used for db:push, which cannot work without the
 *                   database password.
 *
 *   --out FILE      Capture stdout and write it to FILE only if the CLI exits 0
 *                   AND produced output. This exists because the shell form it
 *                   replaces — `supabase gen types … > lib/database.types.ts` —
 *                   truncates the target to zero bytes BEFORE the CLI runs. Any
 *                   failure (expired login, no network, wrong project ref) left
 *                   you with an empty database.types.ts and a codebase that no
 *                   longer typechecks, with nothing on screen explaining why.
 *                   Now a failed run leaves the previous types exactly as they
 *                   were.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep === -1) {
  console.error("supabase-env: expected `--` separating options from CLI args.");
  process.exit(64);
}

const opts = argv.slice(0, sep);
const cliArgs = argv.slice(sep + 1);

const required = [];
let outFile = null;
for (let i = 0; i < opts.length; i += 1) {
  if (opts[i] === "--require") {
    required.push(opts[i + 1]);
    i += 1;
  } else if (opts[i] === "--out") {
    outFile = opts[i + 1];
    i += 1;
  } else {
    console.error(`supabase-env: unknown option ${opts[i]}`);
    process.exit(64);
  }
}

// The clear-error path. Without this, a missing password surfaces either as an
// interactive prompt (which hangs CI) or as the CLI's own terse one-liner, and
// neither says WHERE to put the value.
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  const names = missing.join(", ");
  console.error(
    [
      "",
      `  ✖  Missing required environment variable: ${names}`,
      "",
      "     This is read from .env.local, which is gitignored and local to you.",
      "",
      `     Add it to .env.local in the project root:`,
      ...missing.map((name) => `         ${name}=<value>`),
      "",
      "     SUPABASE_DB_PASSWORD is the Postgres database password from the",
      "     Supabase dashboard → Project Settings → Database → Database password.",
      "     It is not the service-role key and not your account password.",
      "",
      "     See .env.example for the full list of variables this project uses.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync("supabase", cliArgs, {
  // stdout is piped only when we need to capture it for --out; otherwise the CLI
  // writes straight through so progress and prompts behave normally.
  stdio: outFile ? ["inherit", "pipe", "inherit"] : "inherit",
  encoding: "utf8",
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      "\n  ✖  The `supabase` CLI was not found on your PATH." +
        "\n     Install it: https://supabase.com/docs/guides/cli\n",
    );
    process.exit(127);
  }
  console.error(`supabase-env: failed to run supabase — ${result.error.message}`);
  process.exit(1);
}

const code = result.status ?? 1;

if (outFile) {
  const stdout = result.stdout ?? "";
  // Both guards matter: a non-zero exit obviously must not overwrite, but the CLI
  // can also exit 0 having written nothing useful, and an empty types file breaks
  // the build just as thoroughly as a missing one.
  if (code !== 0 || stdout.trim() === "") {
    console.error(
      `\n  ✖  supabase ${cliArgs[0] ?? ""} produced no output — ${outFile} left unchanged.\n`,
    );
    process.exit(code === 0 ? 1 : code);
  }
  writeFileSync(outFile, stdout);
}

process.exit(code);
