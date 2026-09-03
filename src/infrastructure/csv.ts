export interface CsvParseResult {
  rows: string[][];
  errors: string[];
}

export function parseCsv(source: string): CsvParseResult {
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) errors.push(`Guillemet inattendu au caractère ${index + 1}.`);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) errors.push("Champ entre guillemets non terminé.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return { rows, errors };
}

export function stringifyCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))
  ].join("\n") + "\n";
}

export function csvToRecords(source: string): Array<Record<string, string>> {
  const parsed = parseCsv(source);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join(" "));
  const [headers, ...rows] = parsed.rows;
  if (!headers) return [];
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function escapeCell(value: unknown): string {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
