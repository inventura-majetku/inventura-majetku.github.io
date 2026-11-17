// Generování PDF se štítky: QR kód + inventární číslo.
// Vše se kreslí vektorově, takže tisk je ostrý v jakékoliv velikosti.
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Předvolby archů A4. Rozměry v mm. Vždy ověřte zkušebním tiskem na obyčejný papír.
export const PRESETS = {
  avery3657: {
    label: '48,5 × 25,4 mm – 40 ks na A4 (4 × 10), např. Avery Zweckform 3657',
    cols: 4, rows: 10, labelW: 48.5, labelH: 25.4, marginTop: 21.5, marginLeft: 8, gapX: 0, gapY: 0,
  },
  avery3651: {
    label: '52,5 × 29,7 mm – 40 ks na A4 (4 × 10, bez okrajů), např. Avery Zweckform 3651',
    cols: 4, rows: 10, labelW: 52.5, labelH: 29.7, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0,
  },
  avery3474: {
    label: '70 × 37 mm – 24 ks na A4 (3 × 8), např. Avery Zweckform 3474',
    cols: 3, rows: 8, labelW: 70, labelH: 37, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0,
  },
};

export const DEFAULT_LAYOUT = {
  preset: 'avery3657',
  ...PRESETS.avery3657,
  offsetX: 0, // posun celého tisku kvůli nepřesnosti tiskárny (mm)
  offsetY: 0,
  padding: 2.5, // bílý okraj uvnitř štítku (mm)
  startPos: 1, // od kolikáté etikety na prvním archu začít (pro načaté archy)
  border: false, // tenký rámeček kolem štítku – pro zkušební tisk
};

const PAGE_W = 210;
const PAGE_H = 297;
const MAX_FONT_PT = 16;
const MIN_FONT_PT = 5;

/** Kolik etiket je na jednom archu. */
export const perSheet = (L) => L.cols * L.rows;

/**
 * Vytvoří PDF a vrátí ho jako Blob.
 * @param {{inv:string}[]} items
 */
export function buildLabelsPdf(items, layout) {
  const L = { ...DEFAULT_LAYOUT, ...layout };
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: 'Štítky majetku', creator: 'Majetek evidence' });
  doc.setFont('helvetica', 'bold');

  const qrSize = Math.min(L.labelH, L.labelW) - 2 * L.padding;
  const textGap = 2;
  const textX0 = L.padding + qrSize + textGap;
  const textW = L.labelW - textX0 - L.padding;

  // Jedna velikost písma pro všechny štítky, aby vypadaly stejně.
  const fontPt = commonFontSize(doc, items, textW, L.labelH - 2 * L.padding);

  const per = perSheet(L);
  L.startPos = ((Math.max(1, Math.round(L.startPos)) - 1) % per) + 1;
  let page = 0;
  items.forEach((item, k) => {
    const slot = L.startPos - 1 + k;
    const p = Math.floor(slot / per);
    while (page < p) {
      doc.addPage();
      page++;
    }
    const cell = slot % per;
    const col = cell % L.cols;
    const row = Math.floor(cell / L.cols);
    const x = L.marginLeft + L.offsetX + col * (L.labelW + L.gapX);
    const y = L.marginTop + L.offsetY + row * (L.labelH + L.gapY);

    if (L.border) {
      doc.setDrawColor(170);
      doc.setLineWidth(0.1);
      doc.rect(x, y, L.labelW, L.labelH, 'S');
    }

    drawQr(doc, item.inv, x + L.padding, y + (L.labelH - qrSize) / 2, qrSize);

    doc.setFontSize(fontPt);
    doc.setTextColor(0);
    doc.text(item.inv, x + textX0 + textW / 2, y + L.labelH / 2, {
      align: 'center',
      baseline: 'middle',
    });
  });

  return doc.output('blob');
}

/** Největší velikost písma (pt), při které se vejdou všechna čísla. */
function commonFontSize(doc, items, maxW, maxH) {
  const ptToMm = 25.4 / 72;
  let size = Math.min(MAX_FONT_PT, maxH / ptToMm);
  for (const it of items) {
    doc.setFontSize(size);
    const w = doc.getTextWidth(it.inv);
    if (w > maxW) size = Math.max(MIN_FONT_PT, size * (maxW / w));
  }
  return Math.floor(size * 2) / 2;
}

/** Nakreslí QR kód jako vektorové obdélníky (souvislé úseky v řádku se slučují). */
function drawQr(doc, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const m = size / n;
  const overlap = m * 0.03; // proti tenkým bílým čárám mezi řádky v prohlížečích PDF
  doc.setFillColor(0);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!data[r * n + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && data[r * n + c]) c++;
      doc.rect(x + start * m, y + r * m, (c - start) * m, m + overlap, 'F');
    }
  }
}
