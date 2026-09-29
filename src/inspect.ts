import type { Page } from "playwright";
import type { FieldSchema, FormSchema, StepSchema } from "./types.js";

/**
 * Extracts a JSON schema of every field in a form: type, label, constraints,
 * options, file accept types, hidden fields, and a best-effort grouping into
 * multi-step sections (wizards use many different markup conventions, so this
 * is informational — fill_and_submit drives steps dynamically instead).
 */
export async function inspectForm(page: Page, formSelector?: string): Promise<FormSchema> {
  const raw = await page.evaluate((sel) => {
    function textOf(el: Element | null): string | null {
      const t = el?.textContent?.trim();
      return t ? t.replace(/\s+/g, " ") : null;
    }

    function labelFor(el: Element): string | null {
      const id = el.getAttribute("id");
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl) return textOf(lbl);
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const lbl = document.getElementById(labelledBy);
        if (lbl) return textOf(lbl);
      }
      const wrappingLabel = el.closest("label");
      if (wrappingLabel) return textOf(wrappingLabel);
      return null;
    }

    function fieldType(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
      const tag = el.tagName.toLowerCase();
      if (tag === "select") return "select";
      if (tag === "textarea") return "textarea";
      const t = (el as HTMLInputElement).type || "text";
      if (["text", "email", "tel", "url", "number", "date", "password", "hidden", "file"].includes(t)) return t;
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio-group";
      return "other";
    }

    const container = sel ? document.querySelector(sel) : document.querySelector("form") ?? document.body;
    if (!container) throw new Error(`No element matches formSelector "${sel}"`);

    const controls = Array.from(
      container.querySelectorAll("input, select, textarea")
    ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];

    const fields: any[] = [];
    const hidden: any[] = [];
    const seenGroups = new Set<string>();

    for (const el of controls) {
      const type = fieldType(el);
      const name = el.name || el.id;
      if (!name) continue;
      if ((el as HTMLInputElement).type === "submit" || (el as HTMLInputElement).type === "button" || (el as HTMLInputElement).type === "reset") continue;

      if (type === "radio-group" || (type === "checkbox" && controls.filter((c) => c.name === el.name && (c as HTMLInputElement).type === "checkbox").length > 1)) {
        const groupKey = `group:${name}`;
        if (seenGroups.has(groupKey)) continue;
        seenGroups.add(groupKey);
        const members = controls.filter((c) => c.name === el.name) as HTMLInputElement[];
        const options = members.map((m) => ({ value: m.value, label: labelFor(m) ?? m.value }));
        fields.push({
          name,
          type: (el as HTMLInputElement).type === "checkbox" ? "checkbox-group" : "radio-group",
          label: labelFor(el),
          placeholder: null,
          required: members.some((m) => m.required),
          pattern: null,
          min: null,
          max: null,
          maxLength: null,
          step: null,
          options,
          accept: null,
          multiple: (el as HTMLInputElement).type === "checkbox",
          selector: `[name="${CSS.escape(name)}"]`,
        });
        continue;
      }

      const input = el as HTMLInputElement;
      const field: any = {
        name,
        type,
        label: labelFor(el),
        placeholder: el.getAttribute("placeholder"),
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        pattern: el.getAttribute("pattern"),
        min: el.getAttribute("min"),
        max: el.getAttribute("max"),
        maxLength: input.maxLength && input.maxLength > 0 ? input.maxLength : null,
        step: el.getAttribute("step"),
        options: null,
        accept: el.getAttribute("accept"),
        multiple: el.hasAttribute("multiple"),
        selector: `[name="${CSS.escape(name)}"]`,
      };

      if (type === "select") {
        const select = el as HTMLSelectElement;
        field.options = Array.from(select.options)
          .filter((o) => o.value !== "")
          .map((o) => ({ value: o.value, label: (o.textContent ?? o.value).trim() }));
      }

      if (type === "hidden") {
        hidden.push({ ...field, value: input.value });
        continue;
      }

      if (type === "checkbox") {
        field.options = [{ value: input.value || "on", label: labelFor(el) ?? "" }];
      }

      fields.push(field);
    }

    // Best-effort step grouping: look for common wizard/step markers.
    const stepSelectors = ['[data-step]', '.step', '.wizard-step', '[role="tabpanel"]', "fieldset"];
    let stepContainers: Element[] = [];
    for (const s of stepSelectors) {
      const found = Array.from(container.querySelectorAll(s));
      if (found.length > 1) {
        stepContainers = found;
        break;
      }
    }

    let steps: any[];
    if (stepContainers.length > 1) {
      steps = stepContainers.map((stepEl, i) => {
        const stepFields = fields.filter((f) => {
          const el = container.querySelector(f.selector);
          return el && stepEl.contains(el);
        });
        const legend = stepEl.querySelector("legend, h1, h2, h3, [data-step-title]");
        return { index: i, label: textOf(legend), fields: stepFields };
      }).filter((s) => s.fields.length > 0);
    } else {
      steps = [{ index: 0, label: null, fields }];
    }

    // Submit button: prefer explicit submit type, fall back to a button whose
    // text looks like a final action rather than "next"/"continue".
    const buttons = Array.from(container.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const nextWords = /next|continue|proceed/i;
    const finalWords = /submit|register|save|create|send|confirm|finish|sign up|apply/i;
    let submitEl: Element | null =
      buttons.find((b) => (b as HTMLInputElement).type === "submit" && !nextWords.test(textOf(b) ?? "")) ??
      buttons.find((b) => finalWords.test(textOf(b) ?? (b as HTMLInputElement).value ?? "")) ??
      buttons.find((b) => (b as HTMLInputElement).type === "submit") ??
      null;

    let submitSelector: string | null = null;
    let submitLabel: string | null = null;
    if (submitEl) {
      const id = submitEl.getAttribute("id");
      submitLabel = textOf(submitEl) ?? (submitEl as HTMLInputElement).value ?? null;
      submitSelector = id ? `#${CSS.escape(id)}` : null;
      if (!submitSelector) {
        // fall back to text-based selector, resolved at click time via Playwright's text engine
        submitSelector = `text=${submitLabel ?? "Submit"}`;
      }
    }

    return {
      formSelector: sel ?? (container.tagName === "FORM" ? "form" : "body"),
      hiddenFields: hidden,
      steps,
      submitSelector,
      submitLabel,
    };
  }, formSelector ?? null);

  return {
    url: page.url(),
    ...raw,
  } as FormSchema;
}
