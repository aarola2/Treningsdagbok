# Arkitektur – Treningsdagbok

> Status: oppsett. Ingen produktfunksjoner er bygget ennå. Dokumentet oppdateres av dokumentasjonsissuet før første slipp; et skjelett eller utdatert dokument blokkerer slipp.

## Oversikt

Treningsdagbok er en statisk nettapp (Vite + React + TypeScript) uten backend. Den publiseres på GitHub Pages under `https://aarola2.github.io/Treningsdagbok/`. Data skal lagres i `localStorage` i brukerens nettleser.

```
Nettleser (bruker)
 └─ statiske filer fra GitHub Pages (HTML, JS, CSS)
     └─ React-app ──les/skriv──> localStorage (samme enhet, samme origin)
```

Ingen nettverkskall etter at sidene er lastet. Ingen analyse, telemetri, CDN eller tredjepartsfonter.

## Deler

| Del | Sted | Ansvar |
|---|---|---|
| App | `app/src/` | React-komponenter; `main.tsx` monterer `App` |
| Enhetstester | `app/src/**/*.test.tsx` | Vitest + Testing Library i jsdom |
| E2E | `app/e2e/` | Playwright mot produksjonsbygget |
| Bygg/CSP | `app/vite.config.ts` | Base-sti `/Treningsdagbok/`, CSP-meta i produksjonsbygget, Vitest-oppsett |
| CI | `.github/workflows/ci.yml` | `kontroll`, `avhengigheter`, `hemmeligheter`, `kodeanalyse`, `e2e` |
| Utrulling | `.github/workflows/deploy.yml` | Én artefakt → staging-røyktest → produksjon kun på tag `v*` |
| Sperretest | `.github/workflows/sperretest.yml` | Beviser at `production` krever godkjenning; deployer ingenting |

## Kjøring

Fra `app/`:

```
npm ci                 # installer låste avhengigheter (installasjonsskript blokkert av .npmrc)
npm run dev            # utviklingsserver (uten CSP)
npm run build          # typecheck + produksjonsbygg til dist/
npm run preview        # server dist/ på http://127.0.0.1:4173/Treningsdagbok/
```

## Testing

Fra `app/`:

```
npm test               # Vitest; i CI: npm test -- --coverage (grense 80 % i vite.config.ts)
npm run lint           # ESLint
npm run typecheck      # tsc -b
npm run e2e:install    # første gang: installer Chromium
npm run e2e            # Playwright bygger og starter produksjonsbygget selv
```

Rapport: `app/playwright-report/` (åpne `index.html`), skjermbilder og spor i `app/test-results/`. I CI lastes disse opp som artefakten `playwright-rapport` (14 dager). CI feiler på hoppede/isolerte tester (`.skip`, `.only`, `.fixme`, `.todo`, `skipIf`, `runIf`).

## Feilsøking

- **`engine-strict`/Node-feil ved `npm ci`:** Node må være ≥ 24.15.0 (jsdom krever det).
- **E2E: «port 4173 er i bruk»:** stopp andre `vite preview`-prosesser; Playwright gjenbruker bevisst ikke en eksisterende server.
- **E2E: nettleser mangler:** kjør `npm run e2e:install`.
- **Blank side på Pages / 404 på JS:** sjekk at `base` i `vite.config.ts` matcher reponavnet.
- **CSP-feil i konsollen:** ny kode bruker inline-skript, `eval` eller ekstern ressurs. Fjern det i stedet for å svekke CSP.

## Tilgjengelighet

Mål: WCAG 2.2 AA. Oppsettet har `lang="nb"`, viewport uten zoomsperre, `<title>`, `<main>` og én `<h1>`. Ingen samsvarserklæring er gitt.

Krav til senere UI-issues (tilgjengelighetsvurdering T1–T3):

- E2E for smal visning (320 CSS-px, ingen horisontal rulling) senest i første issue med layout.
- Automatisert axe-sjekk (`@axe-core/playwright`, versjonslåst, eget godkjent plan) før eller sammen med første issue med skjema eller interaksjon. axe erstatter ikke manuell test.
- `<header>`/`<nav>` og hopp-lenke når navigasjon kommer; `document.title` per visning ved ruting.
- Synlig fokus (ikke fjern `outline`; egen fokusstil ≥ 3:1), pekermål ≥ 24×24 px, respekter `prefers-reduced-motion`.
- Skjemaer med `<label>` og feilmeldinger knyttet til feltet; lagrings- og feilstatus via `role="status"`/`aria-live`.
- Tastaturflyt testes i e2e (`keyboard.press('Tab')`, `toBeFocused()`). Manuelt før slipp: skjermleser (VoiceOver/NVDA), zoom 200 %, kontrast.

## Sikkerhet og personvern

### Dataflyt og dataklasser

- Treningsdata kan være helseopplysninger (GDPR art. 9). Data forlater aldri enheten: ingen backend, ingen telemetri, ingen tredjepartsressurser. Dette håndheves av CSP (`connect-src 'self'` m.m.).
- GitHub (Pages) behandler besøkendes IP-adresse og forespørselslogger som vert. Det skal nevnes i appens personverntekst.

### Lagring og livssyklus

- `localStorage` er **ukryptert**, per origin, og lesbar for nettleserutvidelser og andre med tilgang til enheten.
- Opprettelse og endring skjer i appen. Sletting skjer i appen (krav, se under) eller ved at brukeren tømmer nettleserdata.
- Data kan gå tapt: nettleseren kan kaste ut data (for eksempel Safari etter 7 dager uten bruk), og privat modus kan mangle lagring eller kaste `QuotaExceededError`.
- Ingen ekte data i repo, tester, issues, skjermbilder eller Playwright-spor (repoet er offentlig).

### Krav til første brukerhistorie som lagrer data

Disse kravene må med i brukerhistorien (sikkerhetsvurdering S5) og ha negative tester:

- Dataminimering: bare nødvendige felt; begrunn eventuell fritekst om helse/skader.
- «Slett alle data» med bekreftelse; e2e verifiserer at lagringen er tom etterpå.
- Eksport av egne data; eventuell import valideres strengt (skjema, størrelsesgrense, ukjente felt avvises).
- Data fra `localStorage` er ubetrodd: skjemaversjon og validering; ødelagt eller manipulert JSON skal ikke krasje appen eller gi XSS.
- Håndter `QuotaExceededError` og utilgjengelig lagring.
- Ingen logging av treningsdata til konsollen.
- Kort tekst i appen om hvor data lagres og risikoen for tap. Vurder `navigator.storage.persist()`.

### Akseptert rest-risiko (eier, 2026-10-30)

- **Delt origin (S1):** alle GitHub Pages-prosjekter på kontoen deler origin `https://aarola2.github.io`. Andre prosjekter der kan lese og endre denne appens `localStorage`, og `script-src 'self'` tillater skript fra dem. Eier har akseptert risikoen med denne regelen: **ingen andre Pages-prosjekter på kontoen skal lagre personopplysninger eller laste tredjepartsskript, og det skal ikke finnes et brukernettsted (`aarola2.github.io`-repo) med service worker.** Nøkkelprefiks i `localStorage` er ingen beskyttelse. Vurderes på nytt før første produksjonsslipp (eget domene gir egen origin).
- **CSP via meta (S4):** GitHub Pages kan ikke sette HTTP-headere. `frame-ancestors`, `report-uri`/`report-to` og `sandbox` virker ikke i meta, og `X-Frame-Options` kan ikke settes, så appen kan rammes inn (clickjacking). Risikoen er lav uten innlogging, og moderne nettlesere partisjonerer lagring i tredjeparts-iframes. Den øker hvis destruktive handlinger (import, «slett alt») legges til; vurder da å skjule dem når appen er innrammet. CSP-meta står først i `<head>` (verifisert i e2e). Utviklingsserveren kjører uten CSP.
- **gitleaks-binær (S3):** gitleaks-action laster ned binæren (festet til 8.30.1) fra GitHub Releases uten sjekksumkontroll.
