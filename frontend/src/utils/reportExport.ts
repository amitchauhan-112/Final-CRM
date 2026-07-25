import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';

// ─── Consolidated report export ──────────────────────────────────────────────
// Replaces three previously-separate, copy-pasted implementations:
//   - utils/export.ts's server-driven `downloadSheet` (rows fetched from a
//     dedicated /export endpoint)
//   - Finance ReportsPage.tsx's inline client-side `exportToExcel`
//   - Admin ReportsPage.tsx's inline client-side `exportToExcel`
// Same underlying `xlsx` library, same output — this just gives every report
// page one shared implementation (plus a new CSV option) instead of three.

export function exportRowsToExcel(filename: string, rows: Record<string, unknown>[], sheetName = 'Report') {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function exportRowsToCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Server-driven variant — the endpoint returns `{ success, data: rows[] }`;
// this converts client-side, matching the app's existing /export endpoints
// (no file is streamed from the server).
export async function downloadSheetFromEndpoint(endpoint: string, filename: string) {
  const { data } = await api.get(endpoint);
  const rows: Record<string, unknown>[] = data.data;
  exportRowsToExcel(filename, rows);
}

export function exportRowsToPDF(filename: string, rows: Record<string, unknown>[], title = 'Report') {
  if (!rows.length) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, 40, 52);
  const columns = Object.keys(rows[0]).map((k) => ({ header: k, dataKey: k }));
  autoTable(doc, {
    startY: 64,
    columns,
    body: rows as any,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  });
  doc.save(filename);
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
