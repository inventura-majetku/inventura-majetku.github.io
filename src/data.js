// Načtení exportu majetku (xlsx) a vytažení jen potřebných sloupců.
// Ostatní sloupce (ceny, dodavatelé, jména osob…) se záměrně ignorují.
import * as XLSX from 'xlsx';

// Porovnání názvů sloupců bez diakritiky a velikosti písmen.
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const COLUMNS = {
  inv: ['inventarni cislo'],
  name: ['nazev'],
  center: ['stredisko'],
  centerName: ['nazev strediska'],
};

/**
 * Přečte xlsx (ArrayBuffer) a vrátí seznam položek.
 * @returns {{ items: {inv:string,name:string,center:string,centerName:string}[], duplicates: string[] }}
 */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  // Řádek s hlavičkou hledáme v prvních 20 řádcích.
  const headerRow = rows.findIndex(
    (r, i) => i < 20 && r.some((c) => COLUMNS.inv.includes(norm(c)))
  );
  if (headerRow < 0) {
    throw new Error('V tabulce jsem nenašel sloupec „Inventární číslo“.');
  }

  const header = rows[headerRow].map(norm);
  const col = (key) => header.findIndex((c) => COLUMNS[key].includes(c));
  const iInv = col('inv');
  const iName = col('name');
  const iCenter = col('center');
  const iCenterName = col('centerName');
  const cell = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');

  const seen = new Set();
  const duplicates = [];
  const items = [];
  for (const r of rows.slice(headerRow + 1)) {
    const inv = cell(r, iInv);
    if (!inv) continue;
    if (seen.has(inv)) {
      duplicates.push(inv);
      continue;
    }
    seen.add(inv);
    items.push({
      inv,
      name: cell(r, iName),
      center: cell(r, iCenter),
      centerName: cell(r, iCenterName),
    });
  }

  items.sort((a, b) => a.inv.localeCompare(b.inv, 'cs', { numeric: true }));
  return { items, duplicates };
}

/** Seznam středisek v datech: [{ code, name, count }] */
export function listCenters(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.center || '';
    const c = map.get(key) || { code: key, name: it.centerName, count: 0 };
    c.count++;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'cs', { numeric: true }));
}
