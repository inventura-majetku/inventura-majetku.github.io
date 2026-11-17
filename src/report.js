// PDF protokol o inventuře (dá se sdílet i na Androidu, např. přes WhatsApp).
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import regularUrl from './fonts/NotoSans-Regular.ttf?url';
import boldUrl from './fonts/NotoSans-Bold.ttf?url';
import { stats, fmtDateTime } from './inventory.js';

let fontCache = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const toBase64 = async (url) => {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const [regular, bold] = await Promise.all([toBase64(regularUrl), toBase64(boldUrl)]);
  fontCache = { regular, bold };
  return fontCache;
}

/** Načte písmo předem (volá se při zahájení inventury). */
export async function preloadReport() {
  await loadFonts();
}

const ORANGE = [180, 86, 27];
const DARK = [43, 39, 33];

/** Vytvoří PDF protokol. Vrací { blob, fileName }. */
export async function buildReportPdf(session) {
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  doc.setFont('Noto', 'normal');
  doc.setProperties({ title: `Inventura – ${session.centerLabel}`, creator: 'Evidence majetku' });

  const s = stats(session);
  const now = new Date();
  const M = 15; // okraj

  // Hlavička
  doc.setFont('Noto', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text('Protokol o inventuře majetku', M, 22);
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.8);
  doc.line(M, 26, 210 - M, 26);

  autoTable(doc, {
    startY: 31,
    theme: 'plain',
    styles: { font: 'Noto', fontSize: 10, cellPadding: 1.2, textColor: DARK },
    columnStyles: { 0: { cellWidth: 48, textColor: [110, 102, 91] }, 1: { fontStyle: 'bold' } },
    body: [
      ['Pracoviště', session.centerLabel],
      ['Zdrojový soubor', session.fileName],
      ['Inventura zahájena', fmtDateTime(session.startedAt)],
      ['Protokol vytvořen', fmtDateTime(now.toISOString())],
    ],
    margin: { left: M, right: M },
  });

  // Souhrnná čísla
  let y = doc.lastAutoTable.finalY + 6;
  const boxes = [
    ['V seznamu', s.total, DARK],
    ['Nalezeno', s.found, [21, 122, 60]],
    ['Chybí', s.missing, [180, 35, 24]],
    ['Mimo seznam', s.extras, [138, 90, 0]],
  ];
  const bw = (210 - 2 * M - 3 * 4) / 4;
  boxes.forEach(([label, val, color], i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(228, 221, 209);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, bw, 18, 2, 2, 'S');
    doc.setFont('Noto', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...color);
    doc.text(String(val), x + bw / 2, y + 9, { align: 'center' });
    doc.setFont('Noto', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 102, 91);
    doc.text(label, x + bw / 2, y + 14.5, { align: 'center' });
  });
  y += 26;

  const section = (title, count, head, body, color) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('Noto', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...color);
    doc.text(`${title} (${count})`, M, y);
    autoTable(doc, {
      startY: y + 2,
      head: [head],
      body: body.length ? body : [[{ content: '— žádné položky —', colSpan: head.length, styles: { halign: 'center', textColor: [110, 102, 91] } }]],
      theme: 'striped',
      styles: { font: 'Noto', fontSize: 9, cellPadding: 1.6, textColor: DARK, overflow: 'linebreak' },
      headStyles: { font: 'Noto', fontStyle: 'bold', fillColor: color, textColor: 255 },
      alternateRowStyles: { fillColor: [246, 242, 234] },
      columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 10;
  };

  const missing = session.items.filter((it) => !session.found[it.inv]);
  section('Chybí', missing.length, ['Inventární číslo', 'Název'], missing.map((it) => [it.inv, it.name]), [180, 35, 24]);

  section(
    'Mimo seznam',
    session.extras.length,
    ['Inventární číslo', 'Čas', 'Poznámka'],
    session.extras.map((e) => [e.code, fmtDateTime(e.at), e.note]),
    [138, 90, 0]
  );

  const found = session.items
    .filter((it) => session.found[it.inv])
    .sort((a, b) => session.found[a.inv].at.localeCompare(session.found[b.inv].at));
  section(
    'Nalezeno',
    found.length,
    ['Inventární číslo', 'Název', 'Čas', 'Způsob'],
    found.map((it) => [it.inv, it.name, fmtDateTime(session.found[it.inv].at), session.found[it.inv].manual ? 'ručně' : 'sken']),
    [21, 122, 60]
  );

  // Podpisy a číslování stran
  if (y > 255) {
    doc.addPage();
    y = 25;
  }
  doc.setFont('Noto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 102, 91);
  doc.setDrawColor(180, 170, 155);
  doc.setLineWidth(0.3);
  y += 12;
  doc.line(M, y, M + 70, y);
  doc.line(210 - M - 70, y, 210 - M, y);
  doc.text('Inventuru provedl (jméno, podpis)', M, y + 4.5);
  doc.text('Převzal(a) (jméno, podpis)', 210 - M - 70, y + 4.5);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 140, 125);
    doc.text(`${session.centerLabel} · ${fmtDateTime(now.toISOString())}`, M, 290);
    doc.text(`Strana ${i} / ${pages}`, 210 - M, 290, { align: 'right' });
  }

  const p = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const place = session.center === '*' ? 'vse' : session.center;
  return { blob: doc.output('blob'), fileName: `inventura_${place}_${date}.pdf` };
}
