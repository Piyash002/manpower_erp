import zlib from 'zlib';
import { amountInWords, formatDateDMY } from '@/lib/formatters';

// ============================================================================
// CRC32 + PKZIP BUILDER / PARSER (Zero external dependencies)
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZipBuffer(files: Array<{ name: string; data: Buffer | string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const rawData = typeof file.data === 'string' ? Buffer.from(file.data, 'utf8') : file.data;
    const compressed = zlib.deflateRawSync(rawData);
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(rawData);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function readZipEntries(zipBuf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Locate End of Central Directory (0x06054b50) from end
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65558); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP/XLSX archive.');
  }

  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  let cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  for (let idx = 0; idx < totalEntries; idx++) {
    if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(cdOffset + 10);
    const compSize = zipBuf.readUInt32LE(cdOffset + 20);
    const nameLen = zipBuf.readUInt16LE(cdOffset + 28);
    const extraLen = zipBuf.readUInt16LE(cdOffset + 30);
    const commentLen = zipBuf.readUInt16LE(cdOffset + 32);
    const localOffset = zipBuf.readUInt32LE(cdOffset + 42);
    const name = zipBuf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);

    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lNameLen = zipBuf.readUInt16LE(localOffset + 26);
    const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const slice = zipBuf.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      entries.set(name, Buffer.from(slice));
    } else if (method === 8) {
      entries.set(name, zlib.inflateRawSync(slice));
    }
  }
  return entries;
}

// ============================================================================
// CSV & XLSX HELPERS
// ============================================================================

export function csvEscape(v: any): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function buildCsvString(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n');
}

export function parseCsvText(text: string): string[][] {
  const clean = (text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

  return lines.map((line) => {
    if (delimiter === '\t') {
      return line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    }
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  });
}

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(s: string): string {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colIndexToLetter(idx: number): string {
  let n = idx + 1;
  let str = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    str = String.fromCharCode(65 + rem) + str;
    n = Math.floor((n - 1) / 26);
  }
  return str;
}

function colLetterToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Generates a real OOXML .xlsx spreadsheet buffer cleanly with zero npm dependencies.
 */
export function buildXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): Buffer {
  const safeSheet = xmlEscape(sheetName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'Sheet1');
  const allRows = [headers, ...rows];

  const rowXmls = allRows
    .map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellXml = cells
        .map((val, cIdx) => {
          const ref = `${colIndexToLetter(cIdx)}${rowNum}`;
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<c r="${ref}" t="n"><v>${val}</v></c>`;
          }
          const txt = val === null || val === undefined ? '' : String(val);
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(txt)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${cellXml}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXmls}</sheetData></worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  return buildZipBuffer([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ]);
}

/**
 * Parses an OOXML .xlsx buffer's first sheet into a 2D string array.
 */
export function parseXlsxBuffer(buf: Buffer): string[][] {
  const entries = readZipEntries(buf);

  // Parse shared strings if present
  const sharedStrings: string[] = [];
  const ssBuf = entries.get('xl/sharedStrings.xml');
  if (ssBuf) {
    const ssXml = ssBuf.toString('utf8');
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1]));
      sharedStrings.push(tMatches.join(''));
    }
  }

  const sheetBuf = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetBuf) {
    throw new Error('Could not find worksheet 1 inside uploaded Excel (.xlsx) file.');
  }
  const sheetXml = sheetBuf.toString('utf8');
  const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];

  const rows: string[][] = [];
  for (const rowXml of rowMatches) {
    const rowCells: string[] = [];
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m: RegExpExecArray | null;
    while ((m = cellRegex.exec(rowXml)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const colIdx = refMatch ? colLetterToIndex(refMatch[1]) : rowCells.length;
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';
      if (cellType === 'inlineStr') {
        const tMatch = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlUnescape(x[1]));
        value = tMatch.join('');
      } else {
        const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw = vMatch ? xmlUnescape(vMatch[1]) : '';
        if (cellType === 's') {
          const idx = parseInt(raw, 10);
          value = Number.isFinite(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        } else {
          value = raw;
        }
      }

      while (rowCells.length <= colIdx) rowCells.push('');
      rowCells[colIdx] = value.trim();
    }
    if (rowCells.some((c) => c !== '')) {
      rows.push(rowCells);
    }
  }

  return rows;
}

// ============================================================================
// PURE PDF 1.4 SINGLE-PAGE PAYSLIP GENERATOR
// ============================================================================

function pdfAscii(text: string): string {
  return String(text || '')
    .replace(/৳/g, 'BDT ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatPdfMoney(n: number | null | undefined): string {
  const rounded = Math.round(Number(n) || 0);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toString();
  let last3 = abs.slice(-3);
  const rest = abs.slice(0, -3);
  if (rest) last3 = ',' + last3;
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
  return `${sign}BDT ${formatted}`;
}

/**
 * Generates a print-friendly single-page PDF 1.4 buffer for an employee payslip.
 */
export function buildPayslipPdfBuffer(payslip: any, companyName = 'Dreams ERP — Manpower & Recruitment'): Buffer {
  const emp = payslip.employee_id || {};
  const contract = payslip.contract_id || {};
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const periodLabel = `${monthNames[(payslip.month || 1) - 1] || payslip.month} ${payslip.year}`;
  const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
  const empCode = emp.employee_id || '';
  const payMethod = payslip.payment_method || emp.payment_method || 'Bank';
  const acctNo = emp.bank_account_no || contract.bank_account_no || 'N/A';

  const cmds: string[] = [];
  const text = (x: number, y: number, str: string, size = 10, bold = false) => {
    cmds.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfAscii(str)}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    cmds.push(`0.75 w 0.8 0.82 0.85 RG ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const rect = (x: number, y: number, w: number, h: number, fillRgb = '0.96 0.97 0.98') => {
    cmds.push(`${fillRgb} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
  };

  // Header bar
  rect(40, 745, 515, 55, '0.06 0.09 0.16');
  cmds.push('1 1 1 rg');
  text(52, 778, companyName, 14, true);
  text(52, 760, `MONTHLY PAYSLIP  |  Period: ${periodLabel}  |  No: ${payslip.payslip_no}`, 10, false);
  text(460, 770, `STATUS: ${String(payslip.status || 'Draft').toUpperCase()}`, 10, true);
  cmds.push('0 0 0 rg');

  // Employee Details
  rect(40, 655, 515, 78, '0.97 0.98 0.99');
  text(52, 718, `Employee: ${empName} (${empCode})`, 10, true);
  text(330, 718, `Department: ${emp.department || '-'}`, 9, false);
  text(52, 702, `Designation: ${emp.designation || '-'}`, 9, false);
  text(330, 702, `Payment Method: ${payMethod} (${acctNo})`, 9, false);
  const att = payslip.attendance_summary || {};
  text(
    52,
    686,
    `Attendance: Present ${att.presentDays || 0}d | Late ${att.lateDays || 0}d | Absent ${att.absentDays || 0}d | Paid Leave ${att.paidLeaveDays || 0}d | Unpaid Leave ${att.unpaidLeaveDays || 0}d`,
    9,
    false
  );
  text(
    52,
    670,
    `Basis: ${payslip.days_in_month || 30} days (${payslip.days_basis || 'calendar'}) | Prorated: ${payslip.prorated_days || payslip.days_in_month || 30}d | Per Day: ${formatPdfMoney(payslip.per_day_rate || 0)} | OT: ${payslip.inputs_snapshot?.overtime_hours || 0}h`,
    8.5,
    false
  );

  // Earnings & Deductions Columns
  let y = 630;
  rect(40, y - 4, 250, 18, '0.91 0.96 0.93');
  rect(305, y - 4, 250, 18, '0.99 0.93 0.93');
  text(48, y + 1, 'EARNINGS', 9.5, true);
  text(230, y + 1, 'AMOUNT', 9.5, true);
  text(313, y + 1, 'DEDUCTIONS', 9.5, true);
  text(495, y + 1, 'AMOUNT', 9.5, true);

  const earnings = (payslip.lines || []).filter((l: any) => l.category === 'BASIC' || l.category === 'ALLOWANCE');
  const deductions = (payslip.lines || []).filter((l: any) => l.category === 'DEDUCTION');
  const maxRows = Math.max(earnings.length, deductions.length, 1);

  y -= 20;
  for (let i = 0; i < Math.min(maxRows, 10); i++) {
    const er = earnings[i];
    const ded = deductions[i];
    if (er) {
      text(48, y, String(er.name || '').slice(0, 28), 9, true);
      text(220, y, formatPdfMoney(er.amount), 9, false);
      if (er.calculation_note) {
        text(48, y - 9, String(er.calculation_note).slice(0, 48), 7, false);
      }
    }
    if (ded) {
      text(313, y, String(ded.name || '').slice(0, 28), 9, true);
      text(485, y, formatPdfMoney(ded.amount), 9, false);
      if (ded.calculation_note) {
        text(313, y - 9, String(ded.calculation_note).slice(0, 48), 7, false);
      }
    }
    line(40, y - 13, 555, y - 13);
    y -= 24;
  }

  // Totals
  y -= 6;
  rect(40, y - 4, 250, 20, '0.94 0.96 0.98');
  rect(305, y - 4, 250, 20, '0.94 0.96 0.98');
  text(48, y + 2, 'GROSS EARNINGS', 9.5, true);
  text(215, y + 2, formatPdfMoney(payslip.gross_pay), 9.5, true);
  text(313, y + 2, 'TOTAL DEDUCTIONS', 9.5, true);
  text(480, y + 2, formatPdfMoney(payslip.total_deductions), 9.5, true);

  // Net Pay Box
  y -= 44;
  rect(40, y, 515, 36, '0.92 0.98 0.95');
  text(52, y + 20, `NET PAYABLE: ${formatPdfMoney(payslip.net_pay)}`, 12, true);
  const words = payslip.amount_in_words || amountInWords(payslip.net_pay || 0);
  text(52, y + 6, `In Words: ${words}`, 9, false);

  // Payment & Footer
  y -= 28;
  if (payslip.payment_date || payslip.payment_reference) {
    text(
      40,
      y,
      `Disbursement: ${payMethod}  |  Date: ${formatDateDMY(payslip.payment_date)}  |  Ref: ${payslip.payment_reference || 'N/A'}`,
      8.5,
      false
    );
    y -= 16;
  }
  text(40, 48, `Generated on: ${formatDateDMY(new Date())}  |  System-generated payslip (Dreams ERP Payroll)`, 8, false);
  text(430, 48, 'Authorized Signature', 8.5, true);
  line(415, 62, 545, 62);

  const streamContent = cmds.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, 'latin1')} >> stream\n${streamContent}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Generates a print-ready A4 PDF Money Receipt buffer for Accounts Fee Collections.
 */
export function buildMoneyReceiptPdfBuffer(receipt: {
  receiptNo: string;
  voucherNo?: string;
  receiptDate: string | Date;
  amountTaka: number;
  method: string;
  reference?: string;
  note?: string;
  createdBy: string;
  studentName: string;
  studentNo: string;
  mobile?: string;
  tradeName?: string;
  country?: string;
  netPayableTaka: number;
  totalPaidTaka: number;
  totalDueTaka: number;
  allocations?: Array<{ label: string; amountTaka: number }>;
}): Buffer {
  const cmds: string[] = [];
  const text = (x: number, y: number, str: string, size = 10, bold = false) => {
    const safe = String(str || '')
      .replace(/\u09F3/g, 'BDT ')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    cmds.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${safe}) Tj ET`);
  };
  const rect = (x: number, y: number, w: number, h: number, fillRgb?: string) => {
    if (fillRgb) {
      cmds.push(`${fillRgb} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
    } else {
      cmds.push(`0.82 0.85 0.9 RG 0.7 w ${x} ${y} ${w} ${h} re S`);
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    cmds.push(`0.82 0.85 0.9 RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
  };

  const formatNum = (n: number) => {
    const rounded = Math.round(Number(n || 0) * 100) / 100;
    return `BDT ${rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Header
  rect(40, 748, 515, 58, '0.07 0.11 0.18');
  cmds.push('1 1 1 rg');
  text(54, 782, 'DREAMS MANPOWER & TRAINING ACADEMY', 14, true);
  text(54, 764, 'Accounts Department - Official Money Receipt', 9, false);
  text(415, 782, receipt.receiptNo, 12, true);
  text(415, 764, receipt.voucherNo ? `JV/RV: ${receipt.voucherNo}` : 'Posted Receipt', 8.5, false);
  cmds.push('0 0 0 rg');

  // Receipt Meta & Candidate Card
  rect(40, 628, 515, 105);
  text(52, 714, `Candidate: ${receipt.studentName} (${receipt.studentNo})`, 10, true);
  text(360, 714, `Receipt Date: ${formatDateDMY(receipt.receiptDate)}`, 9.5, true);
  text(52, 695, `Trade: ${receipt.tradeName || '-'}  |  Destination: ${receipt.country || '-'}`, 9, false);
  text(360, 695, `Mobile: ${receipt.mobile || '-'}`, 9, false);
  line(40, 682, 555, 682);
  text(52, 664, `Payment Method: ${receipt.method}`, 9.5, true);
  text(250, 664, `Reference / TrxID: ${receipt.reference || '-'}`, 9, false);
  text(52, 644, `Note: ${String(receipt.note || '-').slice(0, 82)}`, 8.5, false);

  // Stage Allocations
  let y = 595;
  rect(40, y - 4, 515, 20, '0.94 0.96 0.98');
  text(52, y + 2, 'STAGE / INSTALLMENT ALLOCATION', 9, true);
  text(450, y + 2, 'APPLIED AMOUNT', 9, true);

  y -= 20;
  const allocs =
    receipt.allocations && receipt.allocations.length > 0
      ? receipt.allocations
      : [{ label: 'Candidate Receivable Settlement (1210)', amountTaka: receipt.amountTaka }];

  for (const a of allocs.slice(0, 8)) {
    text(52, y, String(a.label).slice(0, 56), 9, false);
    text(450, y, formatNum(a.amountTaka), 9, true);
    line(40, y - 6, 555, y - 6);
    y -= 20;
  }

  // Highlight Box: Received Amount
  y -= 22;
  rect(40, y, 515, 42, '0.92 0.98 0.95');
  text(52, y + 23, `AMOUNT RECEIVED: ${formatNum(receipt.amountTaka)}`, 12, true);
  text(52, y + 8, `In Words: ${amountInWords(receipt.amountTaka)}`, 9, false);

  // Account Balance Summary
  y -= 48;
  rect(40, y, 515, 34);
  text(52, y + 13, `Total Net Payable: ${formatNum(receipt.netPayableTaka)}`, 9, false);
  text(230, y + 13, `Total Paid To Date: ${formatNum(receipt.totalPaidTaka)}`, 9, true);
  text(405, y + 13, `Balance Due: ${formatNum(receipt.totalDueTaka)}`, 9, true);

  // Footer
  text(40, 58, `Received By: ${receipt.createdBy}  |  Printed: ${formatDateDMY(new Date())}`, 8, false);
  text(425, 58, 'Accounts Officer Signature', 8.5, true);
  line(415, 72, 545, 72);

  const streamContent = cmds.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, 'latin1')} >> stream\n${streamContent}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

