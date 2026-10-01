#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "node:path";
import { loadConfig, assertHostAllowed } from "./config.js";
import { openSession } from "./browser.js";
import { inspectForm } from "./inspect.js";
import { generateTestData } from "./generate.js";
import { fillAndSubmit } from "./fill.js";
import type { FormData, FormSchema } from "./types.js";

const server = new McpServer({ name: "formpilot", version: "0.1.0" });

function newRunDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(process.cwd(), "formpilot-runs", stamp);
}

server.registerTool(
  "inspect_form",
  {
    description:
      "Load a page (optionally logging in via a configured profile first) and return a JSON schema of every field in its form(s): name, type, label, placeholder, required, pattern/min/max/maxlength, select/radio/checkbox options, file accept types, hidden fields, and best-effort multi-step grouping.",
    inputSchema: {
      url: z.string().url().describe("Page URL to inspect"),
      formSelector: z.string().optional().describe("CSS selector for the form; defaults to the first <form>"),
      loginProfile: z.string().optional().describe("Named profile from formpilot.config.json to log in with first"),
      headed: z.boolean().optional().describe("Show the browser window instead of running headless"),
    },
  },
  async ({ url, formSelector, loginProfile, headed }) => {
    const config = loadConfig();
    assertHostAllowed(url, config);
    const { browser, context } = await openSession({ headed, loginProfile, config });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const schema = await inspectForm(page, formSelector);
      return { content: [{ type: "text" as const, text: JSON.stringify(schema, null, 2) }] };
    } finally {
      await browser.close();
    }
  }
);

server.registerTool(
  "generate_test_data",
  {
    description:
      "Generate realistic, valid test data for a form schema (as returned by inspect_form) without touching the browser — lets the agent review/edit data before submitting.",
    inputSchema: {
      schema: z.record(z.any()).describe("A FormSchema object, as returned by inspect_form"),
      overrides: z.record(z.any()).optional().describe("Field values to pin instead of generating"),
      seed: z.number().optional().describe("Make faker-generated values repeatable across runs"),
    },
  },
  async ({ schema, overrides, seed }) => {
    const data = generateTestData(schema as FormSchema, { overrides: overrides as FormData, seed });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.registerTool(
  "fill_and_submit",
  {
    description:
      "Fill a form with valid test data (generated from its schema if `data` is omitted) and submit it via the real submit button (not form.submit()), handling multi-step wizards and consent modals along the way. Reports final URL, HTTP status, redirect chain, a success/failure guess, every visible validation error mapped to its field, console errors, failed network requests, and a full-page screenshot path.",
    inputSchema: {
      url: z.string().url(),
      data: z.record(z.any()).optional().describe("Field values by name; missing fields are generated"),
      formSelector: z.string().optional(),
      loginProfile: z.string().optional(),
      dryRun: z.boolean().optional().describe("Fill and screenshot but do not click submit"),
      seed: z.number().optional().describe("Seed for any auto-generated field values"),
      headed: z.boolean().optional(),
    },
  },
  async ({ url, data, formSelector, loginProfile, dryRun, seed, headed }) => {
    const config = loadConfig();
    assertHostAllowed(url, config);
    const { browser, context } = await openSession({ headed, loginProfile, config });
    try {
      const page = await context.newPage();
      const result = await fillAndSubmit(page, {
        url,
        data: data as FormData,
        formSelector,
        dryRun,
        seed,
        runDir: newRunDir(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } finally {
      await browser.close();
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
