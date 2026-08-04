# Bax Music PDP FAQ Review

Een statische frontend voor het reviewen van PDP FAQ-output uit de Bax Music FAQ-flow.
De standaarddataset is gebaseerd op `Bax_Music_FAQ_Flow_2026-08-04_Final_PDP_FAQs_gecorrigeerd - Bax_Music_FAQ_Flow_2026-08-04_Final_PDP_FAQs_gecorrigeerd.csv.csv`.

## Inhoud

- 78 FAQ-records
- 26 producten
- Zoekfunctie over product, vraag, antwoord, broninput en research trail
- Productgerichte FAQ-weergave
- Filter op gebruikte inputbron zoals PAA, AIO, ChatGPT, Reddit, Reviews en Specs
- Segment- en prijsinformatie per product
- Kaartweergave met duidelijke broninput per vraag
- Research trail in aparte tabs per vraag en per bron
- Tabelweergave met vraag, antwoord en bronkolommen
- Backend-versiebeheer voor nieuwe sheetexports
- CSV-import voor bijgewerkte datasets met dezelfde kolommen, met statische fallback
- Copy-to-clipboard voor zichtbare FAQ's of het geselecteerde product
- CSV-export van de actieve selectie

## Data updaten

Start de backend en gebruik daarna in de interface de knop `Importeer CSV`. Iedere upload wordt als nieuwe serverversie opgeslagen in `backend-data/versions/`. Via `Sheet-versie` kun je eerdere uploads opnieuw activeren.

De CSV moet dezelfde kolommen bevatten als de oorspronkelijke export:

```text
PDP URL,Product,Segment,Prijs,Segment_Basis,Variant_Van,FAQ,Antwoord,PAA_Basis,AIO_Inzicht,ChatGPT_Frame,Reddit_Twijfel,Review_Gebruikt,Spec_Gebruikt,Competitive_Gaps,EEAT_notes,Trail_PAA,Trail_AIO,Trail_ChatGPT,Trail_Reddit,Trail_Reviews,Trail_Competitors,SERP_Features,Sources,Product_Feed_Data
```

Als je de app zonder backend opent, werkt import nog steeds als browser-lokale fallback via `localStorage`.

## Met backend draaien

Vereist Node.js.

```bash
npm start
```

Open daarna:

```text
http://127.0.0.1:8787/
```

Beschikbare API-routes:

```text
GET  /api/current
GET  /api/versions
POST /api/versions
POST /api/activate
```

Let op: deze backend heeft geen login/auth en is bedoeld voor lokaal of intern gebruik. Voeg authenticatie toe voordat je hem publiek openzet.

## Alleen statisch draaien

```bash
npm run static
```

## Vercel

Deze repository kan op Vercel als statische site vanaf de root worden gedeployed. Er is geen build-stap nodig, omdat `index.html`, `app.js`, `data.js`, `styles.css` en `assets/` direct in de root staan.

Controleer in Vercel bij het project:

1. `Root Directory` moet de map zijn waar `index.html`, `package.json` en `vercel.json` direct in staan.
2. `Framework Preset` mag op `Other` staan.
3. `Build Command` moet leeg zijn.
4. `Output Directory` moet leeg zijn.

Als je een Vercel `404: NOT_FOUND` ziet, staat meestal de `Root Directory` niet op deze map, of staat er nog een oude `Output Directory` zoals `dist` ingesteld.

Op Vercel draait deze versie als statische frontend. CSV-import werkt dan als browser-lokale update via `localStorage`. Voor server-side versiebeheer op Vercel is extra opslag nodig, zoals Vercel KV/Blob, Supabase of een database.

## GitHub Pages

De frontend blijft volledig statisch bruikbaar op GitHub Pages, maar backend-versiebeheer werkt daar niet. CSV-import valt dan terug op browser-lokale opslag.

Voor GitHub Pages:

1. Push deze map naar een GitHub repository.
2. Ga naar `Settings` -> `Pages`.
3. Kies `Deploy from a branch`.
4. Selecteer de `main` branch en `/root`.

## Bestanden

- `index.html` bevat de applicatiestructuur.
- `styles.css` bevat de responsive UI-styling.
- `app.js` bevat filters, productselectie, kopieeracties en CSV-export.
- `data.js` bevat de genormaliseerde sheet-output.
- `server.js` bevat de Node-backend voor sheetversies.
- `assets/` bevat de Follo Agency en Bax Music logo-assets.
- `backend-data/` wordt runtime aangemaakt en staat in `.gitignore`.
