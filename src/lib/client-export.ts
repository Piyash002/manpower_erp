'use client';

export type SortDir = 'asc' | 'desc';

export type CellValue = string | number | boolean | null | undefined;

/**
 * Downloads a real OOXML .xlsx spreadsheet using the server's buildXlsxBuffer endpoint.
 * Falls back cleanly to a UTF-8 CSV download if the request fails.
 */
export async function downloadExcel(opts: {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: CellValue[][];
}): Promise<void> {
  const cleanName =
    opts.filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.xlsx$/i, '') || 'export';

  try {
    const res = await fetch('/api/export/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: cleanName,
        sheetName: opts.sheetName || 'Sheet1',
        headers: opts.headers,
        rows: opts.rows,
      }),
    });

    if (!res.ok) throw new Error('Excel export endpoint returned error');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Fallback to BOM-prefixed CSV so Excel still opens it cleanly
    const escapeCsv = (val: CellValue) => {
      const s = val === null || val === undefined ? '' : String(val);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      opts.headers.map(escapeCsv).join(','),
      ...opts.rows.map((r) => r.map(escapeCsv).join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

function escapeHtml(val: CellValue): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Opens an Excel-style clean tabular print preview window and triggers print().
 */
export function printTableReport(opts: {
  title: string;
  subtitle?: string;
  meta?: string;
  headers: string[];
  rows: CellValue[][];
  rightAlignCols?: number[];
  summaryRow?: CellValue[];
  landscape?: boolean;
}): void {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', 'width=1100,height=780');
  if (!win) {
    window.print();
    return;
  }

  const rightSet = new Set(opts.rightAlignCols || []);
  const nowStr = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const headHtml = opts.headers
    .map(
      (h, idx) =>
        `<th class="${rightSet.has(idx) ? 'right' : ''}">${escapeHtml(h)}</th>`
    )
    .join('');

  const bodyHtml =
    opts.rows.length === 0
      ? `<tr><td colspan="${opts.headers.length}" class="empty">No matching records found.</td></tr>`
      : opts.rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (cell, idx) =>
                    `<td class="${rightSet.has(idx) ? 'right' : ''}">${escapeHtml(cell)}</td>`
                )
                .join('')}</tr>`
          )
          .join('');

  const footHtml = opts.summaryRow
    ? `<tfoot><tr>${opts.summaryRow
        .map(
          (cell, idx) =>
            `<td class="${rightSet.has(idx) ? 'right' : ''}">${escapeHtml(cell)}</td>`
        )
        .join('')}</tr></tfoot>`
    : '';

  const pageOrientation =
    opts.landscape || opts.headers.length > 7 ? 'A4 landscape' : 'A4 portrait';

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    @page { size: ${pageOrientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 16px;
      font-size: 11px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .org { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #047857; }
    h1 { margin: 2px 0 0; font-size: 17px; color: #0f172a; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; color: #475569; }
    .filter-bar {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 5px 8px;
      margin-bottom: 10px;
      font-size: 10px;
      color: #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    thead th {
      background: #e2e8f0;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9.5px;
      color: #1e293b;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tfoot td {
      background: #f1f5f9;
      font-weight: 700;
      border-top: 2px solid #64748b;
    }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { text-align: center; padding: 24px; color: #64748b; }
    .actions {
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .btn {
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 5px;
      border: 1px solid #cbd5e1;
      background: #fff;
      cursor: pointer;
    }
    .btn-primary { background: #059669; color: #fff; border-color: #059669; }
    @media print {
      body { padding: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn btn-primary" onclick="window.print()">Print / Save PDF</button>
    <button class="btn" onclick="window.close()">Close</button>
  </div>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="/images/codezenx-logo.jpg" alt="CodeZenX ERP" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" />
      <div>
        <div class="org">CodeZenX ERP — Official Report</div>
        <h1>${escapeHtml(opts.title)}</h1>
        ${opts.subtitle ? `<div class="sub">${escapeHtml(opts.subtitle)}</div>` : ''}
      </div>
    </div>
    <div class="meta">
      <div>Printed: ${escapeHtml(nowStr)}</div>
      <div>Total Rows: <strong>${opts.rows.length}</strong></div>
    </div>
  </div>
  ${opts.meta ? `<div class="filter-bar">${escapeHtml(opts.meta)}</div>` : ''}
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
    ${footHtml}
  </table>
  <script>setTimeout(function(){ window.focus(); window.print(); }, 250);</script>
</body>
</html>`);
  win.document.close();
}

/**
 * Shared client-side comparator supporting numbers, Dates, and case-insensitive strings.
 */
export function sortTableItems<T>(
  items: T[],
  sortKey: string,
  sortDir: SortDir,
  accessors: Record<string, (item: T) => string | number | Date | boolean | null | undefined>
): T[] {
  const getter = accessors[sortKey];
  if (!getter) return items;

  const mult = sortDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);

    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    if (va instanceof Date || vb instanceof Date) {
      const ta = va instanceof Date ? va.getTime() : new Date(String(va)).getTime() || 0;
      const tb = vb instanceof Date ? vb.getTime() : new Date(String(vb)).getTime() || 0;
      return (ta - tb) * mult;
    }

    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * mult;
    }

    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * mult;
  });
}

/**
 * Helper to check whether any searchable field on an item matches query.
 */
export function matchesSearch(query: string, fields: CellValue[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f !== null && f !== undefined && String(f).toLowerCase().includes(q));
}
