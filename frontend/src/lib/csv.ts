// Shared CSV export helper.
//
// Excel (unlike WPS and Google Sheets) parses any cell that begins with
// - = + @ as a formula, so a description whose bullet lines start with "- "
// shows up as an error / blank instead of the text. Prefixing such a line with
// a single space keeps it plain text in Excel while still reading fine
// everywhere else. Rows are joined with CRLF and the file gets a UTF-8 BOM,
// which is what Excel expects for multi-line cells and non-ASCII characters.

const BOM = '﻿';

/** Neutralise leading formula characters on every line of a cell value. */
export function csvSafe(value: any): string {
  const s = value == null ? '' : String(value);
  return s.replace(/^[-=+@]/gm, ' $&');
}

function esc(value: any): string {
  const s = csvSafe(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, any>[]): string {
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ].join('\r\n');
}

/** Build the CSV and trigger a browser download. */
export function saveCsv(filename: string, rows: Record<string, any>[]) {
  const blob = new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
