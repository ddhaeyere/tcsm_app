import { parseRanking } from "./rankings";
import type { Gender } from "./types";

// One member as read from an imported list.
export interface ImportedMember {
  last_name: string;
  first_name: string;
  gender: Gender | null;
  email: string | null;
  // yyyy-mm-dd
  birth_date: string | null;
  tennis_singles_ranking: string | null;
  tennis_doubles_ranking: string | null;
  padel_ranking: string | null;
}

type Column = keyof ImportedMember;

// Column headings we recognise, in lower case with single spaces. Columns
// mapped to null are known but not imported.
const HEADINGS: Record<string, Column | null> = {
  naam: "last_name",
  achternaam: "last_name",
  familienaam: "last_name",
  voornaam: "first_name",
  geslacht: "gender",
  geboortedatum: "birth_date",
  "geboorte datum": "birth_date",
  enkel: "tennis_singles_ranking",
  "klassement enkel": "tennis_singles_ranking",
  "tennis enkel": "tennis_singles_ranking",
  dubbel: "tennis_doubles_ranking",
  "klassement dubbel": "tennis_doubles_ranking",
  "tennis dubbel": "tennis_doubles_ranking",
  padel: "padel_ranking",
  "klassement padel": "padel_ranking",
  email: "email",
  "e-mail": "email",
  "e-mailadres": "email",
  emailadres: "email",
};

// Splits one line on the delimiter, honouring "quoted, values".
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function readGender(value: string): Gender | null {
  const v = value.trim().toUpperCase();
  if (v.startsWith("M")) return "M";
  if (v.startsWith("V") || v.startsWith("F")) return "V";
  return null;
}

function heading(cell: string): Column | null {
  return HEADINGS[cell.replace(/\s+/g, " ").trim().toLowerCase()] ?? null;
}

// Reads a birth date as "17/04/1980", "17-04-1980", "1980-04-17" or an Excel
// day number (how Excel stores dates). Returns yyyy-mm-dd, or null.
export function parseBirthDate(value: string): string | null {
  const v = value.trim();
  let year: number, month: number, day: number;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    // Excel counts days from 30 December 1899.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000);
    [year, month, day] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900 ||
    date.getTime() > Date.now()
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Reads a member list pasted from a spreadsheet or saved as CSV. The first
// line holds the column headings; tabs, semicolons and commas all work.
export function parseMemberList(text: string): { members: ImportedMember[]; problems: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { members: [], problems: ["De lijst is leeg."] };

  const header = lines[0];
  const delimiter = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
  return parseMemberRows(lines.map((line) => splitLine(line, delimiter)));
}

// Reads a member list given as rows of cells, e.g. from an Excel file. The
// heading row is the first row (within the first ten) that holds both
// "Naam" and "Voornaam"; title rows above it are skipped.
export function parseMemberRows(rows: string[][]): { members: ImportedMember[]; problems: string[] } {
  // Keep each row's line number in the file for messages.
  const filled = rows
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  if (filled.length === 0) return { members: [], problems: ["De lijst is leeg."] };

  const headerIndex = filled.slice(0, 10).findIndex(({ cells }) => {
    const columns = cells.map(heading);
    return columns.includes("last_name") && columns.includes("first_name");
  });
  if (headerIndex < 0) {
    return {
      members: [],
      problems: ['De eerste regel moet de kolomnamen bevatten, minstens "Naam" en "Voornaam".'],
    };
  }
  const columns = filled[headerIndex].cells.map(heading);

  const problems: string[] = [];
  const members: ImportedMember[] = [];
  filled.slice(headerIndex + 1).forEach(({ cells, line: row }) => {
    const member: ImportedMember = {
      last_name: "",
      first_name: "",
      gender: null,
      email: null,
      birth_date: null,
      tennis_singles_ranking: null,
      tennis_doubles_ranking: null,
      padel_ranking: null,
    };

    columns.forEach((column, i) => {
      const value = (cells[i] ?? "").trim();
      if (!column || !value) return;
      if (column === "gender") {
        member.gender = readGender(value);
      } else if (column === "email") {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) member.email = value.toLowerCase();
        else problems.push(`Regel ${row}: "${value}" is geen geldig e-mailadres.`);
      } else if (column === "birth_date") {
        member.birth_date = parseBirthDate(value);
        if (!member.birth_date) problems.push(`Regel ${row}: geboortedatum "${value}" niet herkend.`);
      } else if (column === "last_name" || column === "first_name") {
        member[column] = value;
      } else {
        const sport = column === "padel_ranking" ? "padel" : "tennis";
        const ranking = parseRanking(sport, value);
        if (ranking) member[column] = ranking;
        else problems.push(`Regel ${row}: klassement "${value}" niet herkend.`);
      }
    });

    if (!member.last_name || !member.first_name) {
      problems.push(`Regel ${row}: naam of voornaam ontbreekt, overgeslagen.`);
      return;
    }
    members.push(member);
  });

  return { members, problems };
}
