import { deflateRawSync } from "node:zlib";

/** A spreadsheet cell: text, a number, or empty. */
export type Cell = string | number | null;

export interface Sheet {
  /** The tab's name (Excel allows 31 characters) */
  name: string;
  header: string[];
  rows: Cell[][];
  /** Column widths in characters; a sensible width is used where left out */
  widths?: number[];
}

/**
 * CSV that Excel and Google Sheets open cleanly, with a byte-order mark so ₹ and Hindi names
 * read right. Text that looks like a formula gets a leading apostrophe, so a name like
 * "=HYPERLINK(...)" can't run anything.
 */
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null) return "";
    if (typeof v === "number") return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `\uFEFF${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Excel (.xlsx): a zip of a few XML files. Text is stored as plain strings, never formulas,
// so nothing a client typed can run when the file is opened.
// ---------------------------------------------------------------------------

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Escapes text for XML, dropping the control characters XML can't hold. */
const xml = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 0 -> A, 25 -> Z, 26 -> AA */
function column(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(sheet: Sheet): string {
  const cell = (v: Cell, ref: string, style?: number) => {
    if (v === null || v === "") return "";
    const s = style ? ` s="${style}"` : "";
    if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${s === "" ? ' s="2"' : s}><v>${v}</v></c>` : "";
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(v.slice(0, 32767))}</t></is></c>`;
  };
  const row = (cells: Cell[], r: number, style?: number) =>
    `<row r="${r}">${cells.map((v, i) => cell(v, `${column(i)}${r}`, style)).join("")}</row>`;
  const last = `${column(Math.max(sheet.header.length - 1, 0))}${sheet.rows.length + 1}`;
  const cols = sheet.header
    .map((h, i) => {
      const w = sheet.widths?.[i] ?? Math.min(40, Math.max(10, h.length + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${row(sheet.header, 1, 1)}${sheet.rows.map((r, i) => row(r, i + 2)).join("")}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    `</worksheet>`
  );
}

/** One sheet, a bold first row that stays put while scrolling, and a filter on every column. */
export function toXlsx(sheet: Sheet): Buffer {
  const name = xml(sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const last = `$${column(Math.max(sheet.header.length - 1, 0))}$${sheet.rows.length + 1}`;
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${MAIN}" xmlns:r="${REL}">` +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:${last}</definedName></definedNames>` +
        `</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${MAIN}">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(sheet)],
  ];
  return zip(files.map(([path, text]) => [path, Buffer.from(text, "utf8")]));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A plain zip file (deflate, UTF-8 names), enough for an .xlsx. */
function zip(entries: [string, Buffer][]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // 1 Jan 2026, 00:00 in DOS time: the files inside carry no real date.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [path, data] of entries) {
    const name = Buffer.from(path, "utf8");
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
