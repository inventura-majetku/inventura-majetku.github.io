import { parseWorkbook, listCenters } from './data.js';
import { buildLabelsPdf, DEFAULT_LAYOUT, PRESETS, perSheet } from './labels.js';
import { initInventory, hasSession } from './inventoryUI.js';
import { initPwa } from './pwa.js';

initPwa();

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'majetek.layout.v1';

// ---------- Záložky ----------
const TAB_KEY = 'majetek.tab';
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.hidden = p.id !== `tab-${name}`;
  });
  document.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
  try {
    localStorage.setItem(TAB_KEY, name);
  } catch {
    /* nevadí */
  }
}
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => {
    showTab(btn.dataset.goto);
    window.scrollTo(0, 0);
  });
});
document.getElementById('help-print').addEventListener('click', () => window.print());

initInventory();
{
  let saved = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch {
    /* nevadí */
  }
  // Rozpracovaná inventura nebo telefon → rovnou Inventura.
  const isPhone = window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches;
  showTab(hasSession() ? 'inventory' : saved || (isPhone ? 'inventory' : 'labels'));
}

// ---------- Stav ----------
let allItems = [];
let fileBaseName = 'stitky';
const selected = new Set();
let layout = loadLayout();
let pdfUrl = null;

// ---------- 1. Načtení souboru ----------
$('file').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
});

const drop = $('drop');
['dragenter', 'dragover'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  })
);
['dragleave', 'drop'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.remove('over');
  })
);
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

async function loadFile(file) {
  const msg = $('load-msg');
  msg.className = '';
  msg.textContent = 'Načítám…';
  try {
    const { items, duplicates } = parseWorkbook(await file.arrayBuffer());
    if (!items.length) throw new Error('Tabulka neobsahuje žádné položky s inventárním číslem.');
    allItems = items;
    fileBaseName = file.name.replace(/\.[^.]+$/, '').trim().replace(/\s+/g, '_') || 'stitky';
    $('file-label').textContent = file.name;

    const centers = listCenters(items);
    msg.className = 'ok';
    msg.textContent =
      `Načteno ${items.length} položek` +
      (centers.length === 1
        ? ` – pracoviště ${centers[0].code} ${centers[0].name}.`
        : ` z ${centers.length} pracovišť.`);
    if (duplicates.length) {
      msg.className = 'warn';
      msg.textContent += ` Pozor: duplicitní inventární čísla byla přeskočena: ${[...new Set(duplicates)].join(', ')}.`;
    }

    const sel = $('center');
    sel.innerHTML = '';
    if (centers.length > 1) sel.add(new Option(`Všechna (${items.length})`, '*'));
    for (const c of centers) {
      sel.add(new Option(`${c.code} ${c.name} (${c.count})`.trim(), c.code));
    }
    sel.disabled = centers.length === 1;

    selected.clear();
    items.forEach((it) => selected.add(it.inv));
    $('search').value = '';
    $('select-card').hidden = false;
    $('layout-card').hidden = false;
    renderItems();
  } catch (err) {
    console.error(err);
    msg.className = 'err';
    msg.textContent = 'Soubor se nepodařilo načíst: ' + err.message;
  }
}

// ---------- 2. Výběr položek ----------
function visibleItems() {
  const center = $('center').value;
  const q = $('search').value.trim().toLowerCase();
  return allItems.filter(
    (it) =>
      (center === '*' || !center || it.center === center) &&
      (!q || it.inv.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
  );
}

// Položky, které půjdou do PDF: vybrané a patřící do zvoleného pracoviště.
function itemsToPrint() {
  const center = $('center').value;
  return allItems.filter(
    (it) => selected.has(it.inv) && (center === '*' || !center || it.center === center)
  );
}

function renderItems() {
  const tbody = $('items');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const it of visibleItems()) {
    const tr = document.createElement('tr');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(it.inv);
    cb.addEventListener('change', () => {
      cb.checked ? selected.add(it.inv) : selected.delete(it.inv);
      updateCount();
    });
    const td0 = document.createElement('td');
    td0.appendChild(cb);
    tr.appendChild(td0);
    for (const text of [it.inv, it.name, `${it.center} ${it.centerName}`.trim()]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tr.addEventListener('click', (e) => {
      if (e.target !== cb) cb.click();
    });
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  updateCount();
}

function updateCount() {
  const n = itemsToPrint().length;
  const sheets = Math.ceil((n + layout.startPos - 1) / perSheet(layout));
  $('sel-count').textContent = n
    ? `Vybráno ${n} štítků (${sheets} ${plural(sheets, 'arch', 'archy', 'archů')})`
    : 'Nic není vybráno';
}

$('center').addEventListener('change', renderItems);
$('search').addEventListener('input', renderItems);
$('sel-all').addEventListener('click', () => {
  visibleItems().forEach((it) => selected.add(it.inv));
  renderItems();
});
$('sel-none').addEventListener('click', () => {
  visibleItems().forEach((it) => selected.delete(it.inv));
  renderItems();
});

// ---------- 3. Rozložení archu ----------
const presetSel = $('preset');
for (const [key, p] of Object.entries(PRESETS)) presetSel.add(new Option(p.label, key));
presetSel.add(new Option('Vlastní rozměry', 'custom'));

function fillLayoutForm() {
  presetSel.value = layout.preset in PRESETS ? layout.preset : 'custom';
  document.querySelectorAll('[data-key]').forEach((el) => {
    const v = layout[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
}

presetSel.addEventListener('change', () => {
  const p = PRESETS[presetSel.value];
  layout = { ...layout, preset: presetSel.value, ...(p || {}) };
  delete layout.label;
  saveLayout();
  fillLayoutForm();
  updateCount();
});

const GEOMETRY_KEYS = ['cols', 'rows', 'labelW', 'labelH', 'marginTop', 'marginLeft', 'gapX', 'gapY'];
document.querySelectorAll('[data-key]').forEach((el) => {
  el.addEventListener('change', () => {
    const key = el.dataset.key;
    if (el.type === 'checkbox') {
      layout[key] = el.checked;
    } else {
      const v = parseFloat(String(el.value).replace(',', '.'));
      if (!Number.isFinite(v)) {
        el.value = layout[key];
        return;
      }
      layout[key] = ['cols', 'rows', 'startPos'].includes(key) ? Math.max(1, Math.round(v)) : v;
      el.value = layout[key];
      if (GEOMETRY_KEYS.includes(key)) {
        layout.preset = 'custom';
        presetSel.value = 'custom';
      }
    }
    if (layout.startPos > perSheet(layout)) {
      layout.startPos = 1;
      fillLayoutForm();
    }
    saveLayout();
    updateCount();
  });
});

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_LAYOUT, ...saved, startPos: 1, border: false };
  } catch {
    /* úložiště nemusí být dostupné */
  }
  return { ...DEFAULT_LAYOUT };
}

function saveLayout() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* nevadí */
  }
}

// ---------- Generování PDF ----------
$('generate').addEventListener('click', () => {
  const items = itemsToPrint();
  const msg = $('gen-msg');
  if (!items.length) {
    msg.className = 'err';
    msg.textContent = 'Nejsou vybrané žádné položky.';
    return;
  }
  const L = layout;
  if (L.marginLeft + L.cols * L.labelW + (L.cols - 1) * L.gapX > 210.01 ||
      L.marginTop + L.rows * L.labelH + (L.rows - 1) * L.gapY > 297.01) {
    msg.className = 'err';
    msg.textContent = 'Etikety se s těmito rozměry nevejdou na A4. Zkontrolujte rozměry archu.';
    return;
  }
  try {
    const blob = buildLabelsPdf(items, layout);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);

    const center = $('center').value;
    const name = `stitky_${center && center !== '*' ? center : fileBaseName}_${today()}.pdf`;

    msg.className = 'ok';
    msg.innerHTML = '';
    msg.append(`Hotovo: ${items.length} štítků. `);
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = name;
    a.className = 'button';
    a.textContent = `Stáhnout ${name}`;
    msg.appendChild(a);
    a.click();

    $('preview').src = pdfUrl;
    $('preview-card').hidden = false;
  } catch (err) {
    console.error(err);
    msg.className = 'err';
    msg.textContent = 'PDF se nepodařilo vytvořit: ' + err.message;
  }
});

// ---------- Pomocné ----------
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

fillLayoutForm();
