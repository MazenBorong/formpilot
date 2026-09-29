#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, assertHostAllowed } from "./config.js";
import { openSession } from "./browser.js";
import { fillAndSubmit } from "./fill.js";
import type { FormData } from "./types.js";

const [, , cmd, url, ...rest] = process.argv;

function usageAndExit(): never {
  console.error(
    "Usage: formpilot fill <url> [--data <file.json>] [--form <selector>] [--login <profile>] [--seed <n>] [--dry-run] [--headed]"
  );
  process.exit(1);
}

if (cmd !== "fill" || !url) usageAndExit();

const { values } = parseArgs({
  args: rest,
  options: {
    data: { type: "string" },
    form: { type: "string" },
    login: { type: "string" },
    seed: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
  },
});

try {
  const config = loadConfig();
  assertHostAllowed(url, config);

  const data: FormData | undefined = values.data ? JSON.parse(readFileSync(values.data, "utf-8")) : undefined;

  const { browser, context } = await openSession({ headed: values.headed, loginProfile: values.login, config });
  try {
    const page = await context.newPage();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runDir = resolve(process.cwd(), "formpilot-runs", stamp);
    const result = await fillAndSubmit(page, {
      url,
      data,
      formSelector: values.form,
      dryRun: values["dry-run"],
      seed: values.seed ? Number(values.seed) : undefined,
      runDir,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.dryRun || result.success ? 0 : 1;
  } finally {
    await browser.close();
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
