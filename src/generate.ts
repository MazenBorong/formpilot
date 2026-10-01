import { faker } from "@faker-js/faker";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { FieldSchema, FormData, FormSchema } from "./types.js";
import { pickFixtureKind, writeFixtureFile } from "./fixtures.js";

const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
];

function clamp(value: string, maxLength: number | null): string {
  return maxLength && value.length > maxLength ? value.slice(0, maxLength) : value;
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function uniqueEmail(): string {
  return `qa+${Date.now()}${Math.floor(Math.random() * 1000)}@mailinator.com`;
}

function myPhone(): string {
  return `+601${faker.string.numeric(8)}`;
}

function myPostcode(): string {
  return faker.string.numeric(5);
}

function matchOption(options: { value: string; label: string }[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const hit = options.find((o) => o.label.toLowerCase().includes(candidate) || o.value.toLowerCase().includes(candidate));
    if (hit) return hit.value;
  }
  return null;
}

/** Heuristic value for one field, keyed off its name/label/type/constraints. en-MY locale defaults. */
function valueFor(field: FieldSchema, fixtureDir: string): string | string[] | boolean | null {
  const leafName = field.name.match(/\[([^\]]+)\]\s*$/)?.[1] ?? field.name;
  const hint = `${leafName} ${field.label ?? ""} ${field.placeholder ?? ""}`.toLowerCase();

  switch (field.type) {
    case "hidden":
      return null; // left untouched — server-set

    case "checkbox":
      return field.required; // tick required consents/agreements, leave opt-ins alone

    case "checkbox-group": {
      if (!field.required || !field.options?.length) return null;
      return [field.options[0].value];
    }

    case "radio-group": {
      if (!field.options?.length) return null;
      return field.options[0].value;
    }

    case "select": {
      if (!field.options?.length) return null;
      if (hint.includes("state") || hint.includes("province")) {
        const m = matchOption(field.options, MY_STATES.map((s) => s.toLowerCase()));
        if (m) return m;
      }
      if (hint.includes("country")) {
        const m = matchOption(field.options, ["malaysia"]);
        if (m) return m;
      }
      return field.options[0].value;
    }

    case "file": {
      const kind = pickFixtureKind(field.accept);
      return writeFixtureFile(fixtureDir, field.name, kind);
    }

    case "email":
      return uniqueEmail();

    case "tel":
      return myPhone();

    case "url":
      return faker.internet.url();

    case "password":
      return clamp("TestPass123!", field.maxLength);

    case "number": {
      const min = field.min ? Number(field.min) : 1;
      const max = field.max ? Number(field.max) : min + 100;
      return String(faker.number.int({ min, max }));
    }

    case "date": {
      if (hint.includes("expiry") || hint.includes("expire") || hint.includes("exp")) return isoDate(365);
      if (hint.includes("birth") || hint.includes("dob")) return isoDate(-365 * 30);
      return isoDate(7);
    }

    case "textarea":
      return clamp(faker.lorem.sentences(2), field.maxLength);

    case "text":
    case "other":
    default: {
      if (hint.includes("postcode") || hint.includes("zip")) return clamp(myPostcode(), field.maxLength);
      if (leafName.includes("ssm") || leafName.includes("registration_no") || leafName.includes("reg_no")) {
        return clamp(faker.string.numeric(12), field.maxLength);
      }
      if (hint.includes("company") || hint.includes("business name")) return clamp(faker.company.name(), field.maxLength);
      if (hint.includes("first name")) return clamp(faker.person.firstName(), field.maxLength);
      if (hint.includes("last name") || hint.includes("surname")) return clamp(faker.person.lastName(), field.maxLength);
      if (hint.includes("name")) return clamp(faker.person.fullName(), field.maxLength);
      if (hint.includes("address")) return clamp(faker.location.streetAddress(), field.maxLength);
      if (hint.includes("city")) return clamp(faker.location.city(), field.maxLength);
      if (hint.includes("phone") || hint.includes("mobile") || hint.includes("office_no")) return clamp(myPhone(), field.maxLength);
      if (hint.includes("website")) return clamp(faker.internet.url(), field.maxLength);
      return clamp(faker.lorem.words(3), field.maxLength);
    }
  }
}

function flattenFields(schema: FormSchema): FieldSchema[] {
  return schema.steps.flatMap((s) => s.fields);
}

/** Generates realistic valid data for every field in a form schema (see valueFor for the rules). */
export function generateTestData(
  schema: FormSchema,
  opts: { overrides?: FormData; seed?: number; fixtureDir?: string } = {}
): FormData {
  if (opts.seed !== undefined) faker.seed(opts.seed);
  const fixtureDir = opts.fixtureDir ?? resolve(tmpdir(), "formpilot-fixtures", String(opts.seed ?? Date.now()));

  const fields = flattenFields(schema);
  const data: FormData = {};
  const generatedByBaseName = new Map<string, string | string[] | boolean>();

  for (const field of fields) {
    // Mirror "confirm email" / "repeat password" style fields onto the value
    // already generated for their base field, so pairs stay consistent.
    const confirmMatch = field.name.match(/^(.*?)[-_ ]?(confirm|verify|repeat)$/i) ?? field.label?.match(/confirm|verify|repeat/i);
    if (confirmMatch) {
      const base = [...generatedByBaseName.keys()].find((k) => field.name.toLowerCase().includes(k.toLowerCase()) || (field.label ?? "").toLowerCase().includes(k.toLowerCase()));
      if (base) {
        data[field.name] = generatedByBaseName.get(base)!;
        continue;
      }
    }

    const value = valueFor(field, fixtureDir);
    if (value === null) continue;
    data[field.name] = value;
    generatedByBaseName.set(field.name, value);
  }

  return { ...data, ...(opts.overrides ?? {}) };
}
