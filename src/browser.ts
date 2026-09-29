import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FormpilotConfig, LoginProfile } from "./types.js";

const STORAGE_DIR = resolve(process.cwd(), ".formpilot", "storage");

export interface Session {
  browser: Browser;
  context: BrowserContext;
}

/** Launches a browser context, logging in via a named profile if given (session is cached on disk). */
export async function openSession(opts: {
  headed?: boolean;
  loginProfile?: string;
  config: FormpilotConfig;
}): Promise<Session> {
  const browser = await chromium.launch({ headless: opts.headed ? false : (opts.config.headless ?? true) });

  if (!opts.loginProfile) {
    const context = await browser.newContext();
    return { browser, context };
  }

  const profile = opts.config.profiles[opts.loginProfile];
  if (!profile) {
    throw new Error(
      `Unknown loginProfile "${opts.loginProfile}". Define it under "profiles" in formpilot.config.json.`
    );
  }

  const storagePath = resolve(STORAGE_DIR, `${opts.loginProfile}.json`);
  if (existsSync(storagePath)) {
    const context = await browser.newContext({ storageState: storagePath });
    return { browser, context };
  }

  const context = await browser.newContext();
  await login(context, profile);
  mkdirSync(dirname(storagePath), { recursive: true });
  await context.storageState({ path: storagePath });
  return { browser, context };
}

async function login(context: BrowserContext, profile: LoginProfile): Promise<void> {
  const page = await context.newPage();
  await page.goto(profile.loginUrl, { waitUntil: "domcontentloaded" });
  for (const [name, value] of Object.entries(profile.fields)) {
    const secret = value.startsWith("$") ? process.env[value.slice(1)] ?? "" : value;
    await page.locator(`[name="${name}"]`).first().fill(secret);
  }
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.locator(profile.submit).first().click(),
  ]);
  await page.close();
}
