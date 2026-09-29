import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Smallest-possible-but-valid bytes for each format, so real parsers (image
// decoders, PDF readers) don't choke on the fixture.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

// Minimal grayscale 1x1 JPEG.
const JPG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64"
);

function minimalPdf(text: string): Buffer {
  // A hand-built, spec-valid single-page PDF with one line of text.
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 44>>stream
BT /F1 12 Tf 10 50 Td (${text}) Tj ET
endstream
endobj
trailer<</Root 1 0 R/Size 6>>
`;
  return Buffer.from(body, "utf-8");
}

export type FixtureKind = "pdf" | "png" | "jpg" | "csv" | "txt";

/** Picks a fixture kind supported by an <input accept> string (falls back to txt). */
export function pickFixtureKind(accept: string | null): FixtureKind {
  const a = (accept ?? "").toLowerCase();
  if (a.includes("pdf")) return "pdf";
  if (a.includes("png")) return "png";
  if (a.includes("jpg") || a.includes("jpeg") || a.includes("image/")) return "jpg";
  if (a.includes("csv")) return "csv";
  return "txt";
}

/** Writes a tiny valid fixture file of the given kind and returns its path. */
export function writeFixtureFile(dir: string, fieldName: string, kind: FixtureKind): string {
  mkdirSync(dir, { recursive: true });
  const base = `${fieldName.replace(/[^a-z0-9_-]/gi, "_")}.${kind}`;
  const path = resolve(dir, base);
  switch (kind) {
    case "pdf":
      writeFileSync(path, minimalPdf("formpilot test upload"));
      break;
    case "png":
      writeFileSync(path, PNG_1X1);
      break;
    case "jpg":
      writeFileSync(path, JPG_1X1);
      break;
    case "csv":
      writeFileSync(path, "id,name\n1,formpilot test\n", "utf-8");
      break;
    case "txt":
      writeFileSync(path, "formpilot test upload\n", "utf-8");
      break;
  }
  return path;
}
