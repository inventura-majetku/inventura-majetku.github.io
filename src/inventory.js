// Logika inventury: stav (co je nalezeno, co chybí), uložení rozpracované
// inventury v telefonu a export výsledku do Excelu.
import * as XLSX from 'xlsx';

const STORAGE_KEY = 'majetek.inventura.v1';
const key = (code) => String(code ?? '').trim().toUpperCase();

/**
 * Založí novou inventuru pro jedno pracoviště.
 * @param {object[]} allItems všechny položky ze souboru
 * @param {string} center kód pracoviště ('*' = všechna)
 */
export function createSession(allItems, center, fileName) {
  const mine = allItems.filter((it) => center === '*' || it.center === center);
  const others = {};
  for (const it of allItems) {
    if (center !== '*' && it.center !== center) {
      others[key(it.inv)] = `${it.center} ${it.centerName}`.trim();
    }
  }
  const first = mine[0] || {};
  return {
    version: 1,
    fileName,
    center,
    centerLabel: center === '*' ? 'Všechna pracoviště' : `${first.center ?? ''} ${first.centerName ?? ''}`.trim(),
    startedAt: new Date().toISOString(),
    items: mine.map(({ inv, name }) => ({ inv, name })),
    found: {}, // inv -> { at, manual }
    extras: [], // { code, at, note }
    others,
  };
}

/**
 * Zpracuje naskenovaný (nebo ručně zadaný) kód.
 * @returns {{ type: 'found'|'again'|'extra'|'extra-again', item?, code, note? }}
 */
export function registerCode(session, rawCode, manual = false) {
  const code = String(rawCode ?? '').trim();
  const k = key(code);
  const item = session.items.find((it) => key(it.inv) === k);
  if (item) {
    if (session.found[item.inv]) return { type: 'again', item, code };
    session.found[item.inv] = { at: new Date().toISOString(), manual };
    return { type: 'found', item, code };
  }
  if (session.extras.some((e) => key(e.code) === k)) return { type: 'extra-again', code };
  const other = session.others[k];
  const note = other ? `Patří na pracoviště ${other}` : 'Není v nahraném seznamu';
  session.extras.push({ code, at: new Date().toISOString(), note });
  return { type: 'extra', code, note };
}

export function unmark(session, inv) {
  delete session.found[inv];
}

export function removeExtra(session, code) {
  session.extras = session.extras.filter((e) => e.code !== code);
}

// ---------- Poznámky k položkám ----------
export const NOTE_PRESETS = {
  missing: ['Na opravě', 'Zapůjčeno', 'Přesunuto na jiné pracoviště', 'Vyřazeno / zlikvidováno', 'Nelze dohledat'],
  found: ['Poškozený štítek – vyměnit', 'Poškozeno', 'Nepoužívá se', 'Jiné umístění'],
};

export function getNote(session, inv) {
  return session.notes?.[inv] || '';
}

export function setNote(session, inv, text) {
  session.notes ??= {};
  const t = String(text ?? '').trim();
  if (t) session.notes[inv] = t;
  else delete session.notes[inv];
}

export function stats(session) {
  const total = session.items.length;
  const found = session.items.filter((it) => session.found[it.inv]).length;
  return { total, found, missing: total - found, extras: session.extras.length };
}

// ---------- Uložení v telefonu ----------
export function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return s && s.version === 1 && Array.isArray(s.items) ? s : null;
  } catch {
    return null;
  }
}

// ---------- Export do Excelu ----------
export function fmtDateTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function sheet(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

/** Vytvoří xlsx s výsledkem inventury. Vrací { blob, fileName }. */
export function exportResult(session) {
  const s = stats(session);
  const now = new Date();
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['Výsledek inventury majetku'],
        [],
        ['Pracoviště', session.centerLabel],
        ['Zdrojový soubor', session.fileName],
        ['Inventura zahájena', fmtDateTime(session.startedAt)],
        ['Výsledek uložen', fmtDateTime(now.toISOString())],
        [],
        ['Položek v seznamu', s.total],
        ['Nalezeno', s.found],
        ['Chybí', s.missing],
        ['Naskenováno mimo seznam', s.extras],
      ],
      [26, 50]
    ),
    'Souhrn'
  );

  const missing = session.items.filter((it) => !session.found[it.inv]);
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [['Inventární číslo', 'Název', 'Poznámka'], ...missing.map((it) => [it.inv, it.name, getNote(session, it.inv)])],
      [18, 60, 40]
    ),
    'Chybí'
  );

  const found = session.items
    .filter((it) => session.found[it.inv])
    .sort((a, b) => session.found[a.inv].at.localeCompare(session.found[b.inv].at));
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['Inventární číslo', 'Název', 'Čas', 'Způsob', 'Poznámka'],
        ...found.map((it) => [
          it.inv,
          it.name,
          fmtDateTime(session.found[it.inv].at),
          session.found[it.inv].manual ? 'ručně' : 'sken',
          getNote(session, it.inv),
        ]),
      ],
      [18, 60, 18, 10, 40]
    ),
    'Nalezeno'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [['Inventární číslo', 'Čas', 'Poznámka'], ...session.extras.map((e) => [e.code, fmtDateTime(e.at), e.note])],
      [18, 18, 50]
    ),
    'Mimo seznam'
  );

  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const p = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const place = session.center === '*' ? 'vse' : session.center;
  return { blob, fileName: `inventura_${place}_${date}.xlsx` };
}
