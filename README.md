# formpilot

Lets an AI coding agent (Claude Code, Codex) fill out and submit web forms for
testing, by driving a real browser — no database access, no app code changes.

```
"test the register-as-supplier form on dropee_enterprise.test"
  → formpilot opens the page, understands the form, fills every field with
    valid realistic test data, uploads required files, submits, and reports
    exactly what happened.
```

## What it is

- Node.js + TypeScript, Playwright (Chromium).
- An MCP server (stdio) exposing three tools — `inspect_form`,
  `generate_test_data`, `fill_and_submit` — plus a `formpilot fill <url>` CLI
  for humans.
- Headless by default; pass `headed: true` (MCP) or `--headed` (CLI) to watch.

## Setup (one command)

```bash
git clone <this repo> formpilot
cd formpilot
npm run setup
```

That installs dependencies (including a Chromium build via Playwright),
builds the project, creates `formpilot.config.json` from the example if you
don't already have one, links the `formpilot` CLI onto your PATH, **and
registers the MCP server with whichever of Claude Code or Codex is installed
on your machine** — no manual `claude mcp add` / config.toml editing. It's
safe to re-run; every step is a no-op if already done.

All it leaves you to do: open `formpilot.config.json` and add the host(s)
you want to test to `allowedHosts` (and a login profile, if the form needs
auth — see [Login](#login) below).

Prefer to do it piece by piece, or just connect one client?

```bash
npm run build    # compile
npm run claude   # register with Claude Code only (user-scoped: any project)
npm run codex    # register with Codex only
npm start        # run the MCP server directly over stdio (debugging only —
                  # Claude Code/Codex launch it themselves, you don't need
                  # this for normal use)
```

`npm run claude` / `npm run codex` are safe to re-run — they no-op if
already registered.

Then in Claude Code or Codex, just ask:

> "use formpilot to dry-run the register-as-supplier form, show me the data,
> then submit it"

The agent calls `inspect_form`, then `generate_test_data` (so you can
see/edit the values first), then `fill_and_submit`.

### Manual setup

If you'd rather do it by hand, or `npm run setup` skipped something because
neither CLI was detected:

```bash
npm install && npm run build
cp formpilot.config.example.json formpilot.config.json
claude mcp add formpilot -- node /absolute/path/to/formpilot/dist/src/index.js
```

or, for Codex, add to `~/.codex/config.toml`:

```toml
[mcp_servers.formpilot]
command = "node"
args = ["/absolute/path/to/formpilot/dist/src/index.js"]
```

### CLI

```bash
formpilot fill http://dropee_enterprise.test/register-as-supplier
formpilot fill http://dropee_enterprise.test/register-as-supplier --dry-run --headed
formpilot fill http://dropee_enterprise.test/register-as-supplier --data overrides.json --login mgmt
```

## MCP tools

- **`inspect_form(url, formSelector?, loginProfile?, headed?)`** — loads the
  page (logging in first if `loginProfile` is given) and returns a JSON
  schema of every field: name, type, label, placeholder, required,
  pattern/min/max/maxlength, select/radio/checkbox options, file `accept`
  types, hidden fields, and a best-effort multi-step grouping.
- **`generate_test_data(schema, overrides?, seed?)`** — returns only the data
  object (no browser involved), so the agent/human can review or edit values
  before anything is submitted.
- **`fill_and_submit(url, data?, formSelector?, loginProfile?, dryRun?, seed?, headed?)`**
  — fills the form (generating any data not supplied), dismisses consent
  modals, walks multi-step "Next" wizards, uploads generated fixture files,
  and submits via the real submit button (not `form.submit()`, so page JS
  runs). Returns final URL, HTTP status, redirect chain, a success/failure
  guess, every visible validation error mapped to its field, console errors,
  failed network requests, and a full-page screenshot path.

## Data generation

Values are derived from each field's name, label, type, and constraints:
emails (`qa+<timestamp>@mailinator.com`, unique per run so "already
registered" errors don't happen), `+60` phone numbers, 5-digit postcodes,
Malaysian states matched into `<select>` options, dates in the right format
(future for "expiry", past for "birth"/"dob"), company reg numbers sized to
`maxlength`, and tiny valid fixture files (PDF/PNG/JPG/CSV) for file inputs
based on `accept`. "Confirm email"/"repeat password" style fields are
mirrored from their base field automatically. Pass `overrides` to pin
specific values, `seed` to make a run repeatable.

## Login

Define named profiles in `formpilot.config.json`:

```json
{
  "profiles": {
    "mgmt": {
      "loginUrl": "https://dropee_enterprise.test/login",
      "fields": { "email": "qa@example.com", "password": "$FORMPILOT_MGMT_PASSWORD" },
      "submit": "button[type=submit]"
    }
  }
}
```

A field value starting with `$` is read from that environment variable at
run time — secrets never live in the config file and are never logged. The
resulting session is cached to `.formpilot/storage/<profile>.json` and reused
across calls.

## Safety

- Refuses to run against any host not in `allowedHosts` (default:
  `localhost`, `127.0.0.1`, `*.test`, `*.localhost` — add staging domains in
  `formpilot.config.json`). Production is never one typo away.
- `dryRun: true` fills everything and screenshots but never clicks submit.
- Every run's payload (passwords redacted) and screenshot are logged to
  `./formpilot-runs/<timestamp>/`, so you can see — and clean up — what a run
  created.

## Test

```bash
npm test
```

Runs the bundled end-to-end test: a self-contained sample form
(`test/fixtures/sample-form.html`) with required fields, a `<select>`, a
required file upload, and a two-step wizard, served locally and driven
through the full `fill_and_submit` path.

## Known limits

- `pattern` regex constraints aren't solved generically — common ones fall
  out of the name/label rules, unusual ones may need an `overrides` value.
- No LLM-assisted field filling yet; deterministic rules + faker only.
