# Evidence majetku

Webová aplikace pro inventuru majetku:

- **Štítky** – z exportu majetku (.xlsx) vytvoří PDF se štítky (QR kód + inventární číslo) pro tisk na A4 archy samolepicích etiket.
- **Inventura** – v telefonu nahrajete export pracoviště, kamerou skenujete štítky a nalezené položky se odškrtávají. Výsledek (nalezeno / chybí / mimo seznam) se uloží jako Excel. Rozpracovaná inventura se průběžně ukládá v telefonu.

Výsledek inventury jde uložit jako Excel nebo PDF protokol; PDF jde na Androidu sdílet (WhatsApp, e-mail…).
Po prvním otevření se aplikace uloží do zařízení a funguje i **bez internetu**. Když vyjde nová verze, aplikace nabídne tlačítko „Aktualizovat“.

Data z tabulky se zpracují jen v prohlížeči a nikam se neodesílají. Tabulky s majetkem (`*.xlsx`) ani PDF se do repozitáře neukládají (viz `.gitignore`).

## Spuštění pro vývoj

Potřeba je jen [Node.js](https://nodejs.org).

```bash
npm install
npm run dev
```

Pak otevřete http://localhost:5173.

## Struktura

| Soubor | Co dělá |
|---|---|
| `index.html` | vzhled stránky |
| `src/main.js` | ovládání stránky (nahrání souboru, výběr, tlačítka) |
| `src/data.js` | čtení xlsx – bere jen sloupce Inventární číslo, Název, Středisko, Název střediska |
| `src/labels.js` | tvorba PDF, předvolby archů etiket |
| `src/inventory.js` | logika inventury, uložení stavu, export do Excelu |
| `src/inventoryUI.js` | obrazovka Inventura (kamera, seznamy, tlačítka) |
| `src/report.js` | PDF protokol o inventuře |
| `src/pwa.js` | režim bez internetu, nabídka nové verze |
| `src/fonts/` | písmo Noto Sans (licence OFL) pro českou diakritiku v PDF |
| `src/style.css` | styly |

## Tisk štítků

1. Nový typ archu nejdřív vytiskněte na obyčejný papír se zapnutými rámečky a přiložte proti světlu k archu etiket.
2. V dialogu tisku vždy nastavte **Skutečná velikost / 100 %**.
3. Pokud je tisk posunutý, upravte „Doladění tiskárny“.
