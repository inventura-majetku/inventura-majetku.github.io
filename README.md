# Evidence majetku

Webová aplikace pro inventuru majetku:

- **Štítky** – z exportu majetku (.xlsx) vytvoří PDF se štítky (QR kód + inventární číslo) pro tisk na A4 archy samolepicích etiket.
- **Inventura** – skenování štítků telefonem *(připravujeme)*.

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
| `src/style.css` | styly |

## Tisk štítků

1. Nový typ archu nejdřív vytiskněte na obyčejný papír se zapnutými rámečky a přiložte proti světlu k archu etiket.
2. V dialogu tisku vždy nastavte **Skutečná velikost / 100 %**.
3. Pokud je tisk posunutý, upravte „Doladění tiskárny“.
