import type { Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FieldSchema, FillResult, FormData, ValidationErrorEntry } from "./types.js";
import { inspectForm } from "./inspect.js";
import { generateTestData } from "./generate.js";

const MAX_STEPS = 12;
const CONSENT_TEXTS = [/accept/i, /i agree/i, /got it/i, /allow all/i, /agree and continue/i];
const NEXT_TEXTS = /^(next|continue|proceed)\b/i;

async function dismissModals(page: Page): Promise<void> {
  for (const re of CONSENT_TEXTS) {
    const btn = page.locator("button, a[role='button']").filter({ hasText: re }).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ timeout: 1000 }).catch(() => {});
    }
  }
}

async function fillField(page: Page, field: FieldSchema, value: string | string[] | boolean): Promise<void> {
  switch (field.type) {
    case "hidden":
      return;
    case "checkbox": {
      const loc = page.locator(field.selector).first();
      if (value) await loc.check({ timeout: 2000 }).catch(() => {});
      else await loc.uncheck({ timeout: 2000 }).catch(() => {});
      return;
    }
    case "checkbox-group": {
      for (const v of Array.isArray(value) ? value : [value]) {
        await page.locator(`[name="${field.name}"][value="${v}"]`).first().check({ timeout: 2000 }).catch(() => {});
      }
      return;
    }
    case "radio-group": {
      const v = Array.isArray(value) ? value[0] : value;
      await page.locator(`[name="${field.name}"][value="${v}"]`).first().check({ timeout: 2000 }).catch(() => {});
      return;
    }
    case "select": {
      await page.locator(field.selector).first().selectOption(String(value)).catch(() => {});
      return;
    }
    case "file": {
      await page.locator(field.selector).first().setInputFiles(String(value)).catch(() => {});
      return;
    }
    default: {
      const loc = page.locator(field.selector).first();
      await loc.fill(String(value), { timeout: 2000 }).catch(async () => {
        await loc.click({ timeout: 2000 }).catch(() => {});
        await loc.pressSequentially?.(String(value)).catch(() => {});
      });
    }
  }
}

async function findVisible(page: Page, textRe: RegExp) {
  const loc = page.locator('button, input[type="submit"], input[type="button"], a[role="button"]').filter({ hasText: textRe });
  const count = await loc.count();
  for (let i = 0; i < count; i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) return el;
  }
  return null;
}

async function scanValidationErrors(page: Page): Promise<ValidationErrorEntry[]> {
  return page.evaluate(() => {
    // Selectors that unambiguously mean "this is a validation error".
    const trustedSelectors = [
      "[aria-invalid='true']",
      ".error-message", ".field-error", ".invalid-feedback", ".help-block.error",
      ".is-invalid ~ .invalid-feedback",
    ];
    // Generic alert/status regions are used for success toasts too — only
    // count them if the text itself reads like a validation complaint.
    const looseSelectors = ["[role='alert']", "[role='status']", ".alert-danger", ".alert-error"];
    const errorWords = /error|invalid|required|must|please (enter|select|fill|upload|choose)|cannot be (blank|empty)/i;

    const out: { field: string | null; message: string }[] = [];
    const seen = new Set<string>();

    function collect(sel: string, requireErrorWords: boolean) {
      document.querySelectorAll(sel).forEach((el) => {
        const message = el.textContent?.trim().replace(/\s+/g, " ");
        if (!message) return;
        if (requireErrorWords && !errorWords.test(message)) return;
        if (seen.has(message)) return;
        seen.add(message);
        const fieldEl = el.matches("[aria-invalid='true']")
          ? el
          : el.closest("[data-field], .form-group, .field")?.querySelector("input,select,textarea") ?? null;
        const field = fieldEl?.getAttribute("name") ?? fieldEl?.getAttribute("id") ?? null;
        out.push({ field, message });
      });
    }

    for (const sel of trustedSelectors) collect(sel, false);
    for (const sel of looseSelectors) collect(sel, true);
    return out;
  });
}

function redact(data: FormData, fieldTypes: Map<string, string>): FormData {
  const clone: FormData = {};
  for (const [k, v] of Object.entries(data)) {
    clone[k] = fieldTypes.get(k) === "password" ? "[redacted]" : v;
  }
  return clone;
}

export async function fillAndSubmit(
  page: Page,
  opts: { url: string; data?: FormData; formSelector?: string; dryRun?: boolean; runDir: string; seed?: number }
): Promise<FillResult> {
  mkdirSync(opts.runDir, { recursive: true });
  const fixtureDir = resolve(opts.runDir, "fixtures");

  const consoleErrors: string[] = [];
  const failedRequests: { url: string; status: number | null; error: string | null }[] = [];
  const redirectChain: string[] = [];
  const fieldTypes = new Map<string, string>();

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), status: null, error: req.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push({ url: res.url(), status: res.status(), error: null });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) redirectChain.push(frame.url());
  });

  const response = await page.goto(opts.url, { waitUntil: "domcontentloaded" });
  const httpStatus = response?.status() ?? null;

  const submittedData: FormData = { ...(opts.data ?? {}) };
  let clickedSubmit = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    await dismissModals(page);
    const schema = await inspectForm(page, opts.formSelector);
    const currentFields = schema.steps.flatMap((s) => s.fields);
    for (const f of currentFields) fieldTypes.set(f.name, f.type);

    const missing = currentFields.filter((f) => !(f.name in submittedData));
    if (missing.length > 0) {
      const generated = generateTestData(
        { ...schema, steps: [{ index: 0, label: null, fields: missing }] },
        { fixtureDir, seed: opts.seed }
      );
      Object.assign(submittedData, generated);
    }

    for (const field of currentFields) {
      const visible = await page.locator(field.selector).first().isVisible().catch(() => false);
      if (!visible || !(field.name in submittedData)) continue;
      await fillField(page, field, submittedData[field.name]);
    }

    await dismissModals(page);

    const nextBtn = await findVisible(page, NEXT_TEXTS);
    if (nextBtn) {
      await nextBtn.click().catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      continue;
    }

    // No "Next" — this is the final step.
    if (opts.dryRun) break;

    const submitLoc = schema.submitSelector ? page.locator(schema.submitSelector).first() : null;
    if (submitLoc && (await submitLoc.isVisible().catch(() => false))) {
      await submitLoc.click().catch(() => {});
      clickedSubmit = true;
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    }
    break;
  }

  const validationErrors = opts.dryRun ? [] : await scanValidationErrors(page);
  const screenshotPath = resolve(opts.runDir, "screenshot.png");
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const success = !opts.dryRun && clickedSubmit && validationErrors.length === 0;

  const result: FillResult = {
    finalUrl: page.url(),
    httpStatus,
    redirectChain: [...new Set(redirectChain)],
    success,
    validationErrors,
    consoleErrors,
    failedRequests,
    screenshotPath,
    runDir: opts.runDir,
    dryRun: !!opts.dryRun,
    submittedData: redact(submittedData, fieldTypes),
  };

  writeFileSync(resolve(opts.runDir, "payload.json"), JSON.stringify(result.submittedData, null, 2));
  writeFileSync(resolve(opts.runDir, "result.json"), JSON.stringify(result, null, 2));

  return result;
}
