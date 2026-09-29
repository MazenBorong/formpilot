import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { fillAndSubmit } from "../src/fill.js";

// Bundled sample-form.html has required fields, a select, a required file
// upload, and a two-step wizard (Next button gates step 2) — exercises the
// full fill/generate/multi-step/upload/submit path end to end.
test("fills and submits the bundled sample supplier form", async () => {
  const html = readFileSync(resolve(process.cwd(), "test/fixtures/sample-form.html"), "utf-8");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const runDir = resolve(process.cwd(), "formpilot-runs", "e2e-test-run");
    const result = await fillAndSubmit(page, { url, runDir });

    assert.equal(result.validationErrors.length, 0, JSON.stringify(result.validationErrors));
    assert.equal(result.success, true, JSON.stringify(result));
    assert.ok(result.submittedData.companyName, "companyName should be generated");
    assert.ok(String(result.submittedData.email).startsWith("qa+"), "email should use the unique qa+ pattern");
    assert.ok(result.submittedData.regCert, "file input should get a generated fixture path");
    assert.equal(result.submittedData.terms, true, "required checkbox should be ticked");
    assert.equal(result.submittedData.state, "JHR");
  } finally {
    await browser.close();
    server.close();
  }
});
