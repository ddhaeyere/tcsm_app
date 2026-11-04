import { strFromU8, unzipSync } from "fflate";

// A small reader for Excel (.xlsx) files: returns the cells of the first
// worksheet as text, row by row. Numbers come back as written in the file
// (dates as Excel day numbers), which is enough for a member list.

function decode(text: string): string {
  return text
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// The text of a <si> or <is> element: all <t> runs, without phonetic hints.
function richText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
  return decode(text);
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// "C12" -> 2
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const workbook = files["xl/workbook.xml"];
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (workbook && rels) {
    const sheet = strFromU8(workbook).match(/<sheet\b[^>]*>/)?.[0];
    const id = sheet && attr(sheet, "r:id");
    if (id) {
      for (const m of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
        if (attr(m[0], "Id") !== id) continue;
        const target = attr(m[0], "Target") ?? "";
        const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
        if (files[path]) return path;
      }
    }
  }
  const fallback = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/[^/]+\.xml$/.test(p))
    .sort();
  return fallback[0] ?? null;
}

export function readXlsx(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) =>
        f.name === "xl/workbook.xml" ||
        f.name === "xl/_rels/workbook.xml.rels" ||
        f.name === "xl/sharedStrings.xml" ||
        f.name.startsWith("xl/worksheets/"),
    });
  } catch {
    throw new Error("Dit bestand is geen geldig Excel-bestand (.xlsx).");
  }

  const sheetPath = firstSheetPath(files);
  if (!sheetPath) throw new Error("Geen werkblad gevonden in het Excel-bestand.");

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    for (const m of strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push(richText(m[1]));
    }
  }

  const rows: string[][] = [];
  const sheet = strFromU8(files[sheetPath]);
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    const body = rowMatch[1] ?? "";
    for (const cell of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cell[1];
      const inner = cell[2] ?? "";
      const ref = attr(tag, "r");
      const index = ref ? columnIndex(ref) : row.length;
      const type = attr(tag, "t");
      const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];

      let value = "";
      if (type === "s") value = raw !== undefined ? (shared[Number(raw)] ?? "") : "";
      else if (type === "inlineStr") value = richText(inner);
      else if (type === "b") value = raw === "1" ? "WAAR" : raw === "0" ? "ONWAAR" : "";
      else if (raw !== undefined) value = decode(raw);

      while (row.length < index) row.push("");
      row[index] = value.trim();
    }
    rows.push(row);
  }
  return rows;
}
