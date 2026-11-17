// Obrazovka Inventura: kamera, seznam položek, ruční zadání, export.
import { parseWorkbook, listCenters } from './data.js';
import {
  createSession,
  registerCode,
  unmark,
  removeExtra,
  stats,
  saveSession,
  loadSession,
  exportResult,
  fmtDateTime,
} from './inventory.js';

const $ = (id) => document.getElementById(id);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let session = loadSession();
let pendingFile = null; // { items, fileName } před výběrem pracoviště
let view = 'missing';
let scanner = null;
let cameraOn = false;
let wakeLock = null;
let audioCtx = null;
let lastScan = { code: '', time: 0 };

export function hasSession() {
  return !!session;
}

export function initInventory() {
  // ---------- Začátek ----------
  $('inv-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const msg = $('inv-load-msg');
    msg.className = '';
    msg.textContent = 'Načítám…';
    try {
      const { items } = parseWorkbook(await file.arrayBuffer());
      if (!items.length) throw new Error('Tabulka neobsahuje žádné položky s inventárním číslem.');
      $('inv-file-label').textContent = file.name;
      const centers = listCenters(items);
      if (centers.length === 1) {
        startSession(createSession(items, centers[0].code, file.name));
        msg.textContent = '';
        return;
      }
      pendingFile = { items, fileName: file.name };
      const sel = $('inv-center');
      sel.innerHTML = '';
      for (const c of centers) sel.add(new Option(`${c.code} ${c.name} (${c.count})`.trim(), c.code));
      sel.add(new Option(`Všechna pracoviště (${items.length})`, '*'));
      msg.className = 'ok';
      msg.textContent = `Soubor obsahuje ${centers.length} pracovišť. Vyberte, které budete kontrolovat.`;
      $('inv-center-box').hidden = false;
    } catch (err) {
      console.error(err);
      msg.className = 'err';
      msg.textContent = 'Soubor se nepodařilo načíst: ' + err.message;
    } finally {
      e.target.value = '';
    }
  });

  $('inv-begin').addEventListener('click', () => {
    if (!pendingFile) return;
    startSession(createSession(pendingFile.items, $('inv-center').value, pendingFile.fileName));
    pendingFile = null;
  });

  // ---------- Kamera ----------
  $('cam-toggle').addEventListener('click', () => (cameraOn ? stopCamera() : startCamera()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });
  document.addEventListener('tabchange', (e) => {
    if (e.detail !== 'inventory') stopCamera();
  });

  // ---------- Ruční zadání ----------
  $('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('manual-code');
    const code = input.value.trim();
    if (!code) return;
    handleCode(code, true);
    input.value = '';
  });

  // ---------- Seznam ----------
  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      view = chip.dataset.view;
      document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderList();
    })
  );

  // ---------- Export ----------
  const canShareFiles = (() => {
    try {
      // Zkouška se skutečným typem souboru: Chrome na Androidu sdílení Excelu nepovoluje.
      return !!navigator.canShare?.({ files: [new File(['x'], 'test.xlsx', { type: XLSX_MIME })] });
    } catch {
      return false;
    }
  })();
  $('inv-share').hidden = !canShareFiles;
  $('inv-export').addEventListener('click', () => doExport(false));
  $('inv-share').addEventListener('click', () => doExport(true));

  $('inv-end').addEventListener('click', () => {
    const notSaved = !session.exportedAt || session.exportedAt < session.changedAt;
    const q = notSaved
      ? 'Výsledek inventury ještě nebyl uložen po poslední změně. Opravdu ukončit? Stav inventury se smaže.'
      : 'Ukončit inventuru a začít novou? Stav inventury se v tomto zařízení smaže.';
    if (!confirm(q)) return;
    stopCamera();
    session = null;
    saveSession(null);
    $('inv-file-label').textContent = 'Vybrat soubor';
    $('inv-load-msg').textContent = '';
    $('inv-load-msg').className = '';
    $('inv-center-box').hidden = true;
    render();
  });

  render();
}

function startSession(s) {
  session = s;
  session.changedAt = session.startedAt;
  persist();
  view = 'missing';
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.view === view));
  $('inv-center-box').hidden = true;
  setScanMsg('Spusťte kameru a namiřte ji na QR kód štítku.', '');
  render();
}

function persist() {
  if (!saveSession(session)) {
    setScanMsg('Upozornění: prohlížeč nedovolí ukládat průběh. Nezavírejte stránku před uložením výsledku.', 'warn');
  }
}

// ---------- Zpracování kódu ----------
function handleCode(code, manual) {
  if (!session) return;
  const now = Date.now();
  // Stejný kód před kamerou se čte mnohokrát za sekundu – započítáme ho jednou.
  if (!manual && code === lastScan.code && now - lastScan.time < 3000) return;
  lastScan = { code, time: now };

  const r = registerCode(session, code, manual);
  if (r.type === 'found' || r.type === 'extra') {
    session.changedAt = new Date().toISOString();
    persist();
  }

  switch (r.type) {
    case 'found':
      setScanMsg(`✓ ${r.item.inv} – ${r.item.name}`, 'ok');
      feedback('ok');
      break;
    case 'again':
      setScanMsg(`Už naskenováno: ${r.item.inv} – ${r.item.name}`, 'info');
      feedback('again');
      break;
    case 'extra':
      setScanMsg(`⚠ ${r.code}: ${r.note}`, 'warn');
      feedback('warn');
      break;
    case 'extra-again':
      setScanMsg(`Už zapsáno mimo seznam: ${r.code}`, 'info');
      feedback('again');
      break;
  }
  render();
}

function setScanMsg(text, kind) {
  const el = $('scan-msg');
  el.textContent = text;
  el.className = 'scan-msg ' + (kind || 'muted');
}

function feedback(kind) {
  const wrap = $('video-wrap');
  wrap.classList.remove('flash-ok', 'flash-warn');
  void wrap.offsetWidth; // restart animace
  if (kind === 'ok') wrap.classList.add('flash-ok');
  if (kind === 'warn') wrap.classList.add('flash-warn');

  try {
    navigator.vibrate?.(kind === 'ok' ? 80 : kind === 'warn' ? [80, 60, 80] : 30);
  } catch {
    /* nepodporováno */
  }
  beep(kind);
}

function beep(kind) {
  if (!audioCtx) return;
  try {
    const tones = kind === 'ok' ? [1200] : kind === 'warn' ? [500, 400] : [800];
    let t = audioCtx.currentTime;
    for (const f of tones) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.13);
      t += 0.15;
    }
  } catch {
    /* zvuk není podstatný */
  }
}

// ---------- Kamera ----------
async function startCamera() {
  if (!window.isSecureContext) {
    setScanMsg('Kamera funguje jen přes zabezpečenou adresu (https).', 'err');
    return;
  }
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
  } catch {
    audioCtx = null;
  }
  $('cam-toggle').disabled = true;
  setScanMsg('Spouštím kameru…', 'muted');
  try {
    const { default: QrScanner } = await import('qr-scanner');
    if (!scanner) {
      scanner = new QrScanner($('video'), (res) => handleCode(res.data, false), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
      });
    }
    $('video-wrap').hidden = false;
    await scanner.start();
    cameraOn = true;
    $('cam-toggle').textContent = 'Zastavit kameru';
    setScanMsg('Namiřte kameru na QR kód štítku.', 'muted');
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* obrazovka může zhasnout – nevadí */
    }
  } catch (err) {
    console.error(err);
    $('video-wrap').hidden = true;
    const name = err?.name || String(err);
    setScanMsg(
      /NotAllowed|Permission/i.test(name)
        ? 'Přístup ke kameře byl zamítnut. Povolte kameru pro tuto stránku v nastavení prohlížeče a zkuste to znovu.'
        : /NotFound|not found|no camera/i.test(`${name} ${err?.message || ''}`)
          ? 'V zařízení nebyla nalezena kamera. Použijte ruční zadání.'
          : 'Kameru se nepodařilo spustit: ' + (err?.message || name),
      'err'
    );
  } finally {
    $('cam-toggle').disabled = false;
  }
}

function stopCamera() {
  if (!cameraOn) return;
  scanner?.stop();
  cameraOn = false;
  $('video-wrap').hidden = true;
  $('cam-toggle').textContent = 'Spustit kameru';
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

// ---------- Vykreslení ----------
function render() {
  $('inv-start').hidden = !!session;
  $('inv-run').hidden = !session;
  if (!session) return;

  const s = stats(session);
  $('inv-title').textContent = session.centerLabel;
  $('inv-sub').textContent = `Zahájeno ${fmtDateTime(session.startedAt)} · ${session.fileName}`;
  $('inv-found').textContent = s.found;
  $('inv-total').textContent = s.total;
  $('inv-bar').style.width = s.total ? `${(100 * s.found) / s.total}%` : '0';
  $('inv-bar').classList.toggle('done', s.total > 0 && s.missing === 0);
  $('cnt-missing').textContent = s.missing;
  $('cnt-found').textContent = s.found;
  $('cnt-extras').textContent = s.extras;
  renderList();
}

function renderList() {
  const ul = $('inv-list');
  ul.innerHTML = '';
  const frag = document.createDocumentFragment();

  const row = (cls, code, text, sub, btnLabel, onClick) => {
    const li = document.createElement('li');
    li.className = cls;
    const main = document.createElement('div');
    main.className = 'li-main';
    const c = document.createElement('span');
    c.className = 'code';
    c.textContent = code;
    const t = document.createElement('span');
    t.className = 'name';
    t.textContent = text;
    main.append(c, t);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'sub muted small';
      s.textContent = sub;
      main.appendChild(s);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary small-btn';
    b.textContent = btnLabel;
    b.addEventListener('click', onClick);
    li.append(main, b);
    frag.appendChild(li);
  };

  if (view === 'missing') {
    for (const it of session.items.filter((i) => !session.found[i.inv])) {
      row('missing', it.inv, it.name, '', 'Nalezeno ručně', () => handleCode(it.inv, true));
    }
  } else if (view === 'found') {
    const list = session.items
      .filter((i) => session.found[i.inv])
      .sort((a, b) => session.found[b.inv].at.localeCompare(session.found[a.inv].at));
    for (const it of list) {
      const f = session.found[it.inv];
      row('found', it.inv, it.name, `${fmtDateTime(f.at)} · ${f.manual ? 'ručně' : 'sken'}`, 'Vrátit', () => {
        unmark(session, it.inv);
        touch();
      });
    }
  } else {
    for (const e of [...session.extras].reverse()) {
      row('extra', e.code, e.note, fmtDateTime(e.at), 'Odebrat', () => {
        removeExtra(session, e.code);
        touch();
      });
    }
  }

  if (!frag.childNodes.length) {
    const li = document.createElement('li');
    li.className = 'empty muted';
    li.textContent =
      view === 'missing'
        ? 'Nic nechybí – všechny položky jsou nalezené. 🎉'
        : view === 'found'
          ? 'Zatím nic nenaskenováno.'
          : 'Žádné kódy mimo seznam.';
    frag.appendChild(li);
  }
  ul.appendChild(frag);
}

function touch() {
  session.changedAt = new Date().toISOString();
  lastScan = { code: '', time: 0 };
  persist();
  render();
}

// ---------- Export ----------
async function doExport(share) {
  const msg = $('inv-export-msg');
  try {
    const { blob, fileName } = exportResult(session);
    session.exportedAt = new Date().toISOString();
    persist();

    if (share) {
      const file = new File([blob], fileName, { type: blob.type });
      try {
        await navigator.share({ files: [file], title: fileName });
        msg.className = 'ok';
        msg.textContent = `Odesláno: ${fileName}`;
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // uživatel sdílení zavřel
        // Sdílení nepovoleno → soubor aspoň uložíme.
        $('inv-share').hidden = true;
        download(blob, fileName);
        msg.className = 'warn';
        msg.textContent = `Tento telefon nedovolí sdílet Excel přímo. Soubor ${fileName} je uložený ve Stažených souborech – přiložte ho do e-mailu jako přílohu.`;
        return;
      }
    }

    download(blob, fileName);
    msg.className = 'ok';
    msg.textContent = `Uloženo do Stažených souborů: ${fileName}. Sekretářce ho pošlete jako přílohu e-mailu.`;
  } catch (err) {
    console.error(err);
    msg.className = 'err';
    msg.textContent = 'Výsledek se nepodařilo uložit: ' + (err?.message || err);
  }
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
