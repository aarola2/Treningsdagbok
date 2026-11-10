# Arkitektur – Treningsdagbok

> Status: MVP-funksjonene i brukerhistorien er bygget og merget (#4–#11): registrere, liste, redigere, slette én økt, eksportere, slette alle data og tekst om lagring og personvern. Dokumentet beskriver løsningen slik den er på `main`. Det oppdateres når koden endres; et utdatert dokument blokkerer slipp.

## Oversikt

Treningsdagbok er en statisk nettapp (Vite + React + TypeScript) uten backend. Den publiseres på GitHub Pages under `https://aarola2.github.io/Treningsdagbok/`. Alle data lagres i `localStorage` i brukerens nettleser.

```
Nettleser (bruker)
 └─ statiske filer fra GitHub Pages (HTML, JS, CSS)
     └─ React-app ──les/skriv──> localStorage (samme enhet, samme origin)
                  └─ eksport ──> JSON-fil via blob:-URL (lastes ned lokalt)
```

Ingen nettverkskall etter at sidene er lastet. Ingen analyse, telemetri, CDN eller tredjepartsfonter.

## Deler

| Del | Sted | Ansvar |
|---|---|---|
| App | `app/src/` | React-komponenter; `main.tsx` monterer `App` i `StrictMode` |
| Enhetstester | `app/src/**/*.test.ts(x)` | Vitest + Testing Library i jsdom, ved siden av koden |
| E2E | `app/e2e/` | Playwright (Chromium) mot produksjonsbygget, med axe |
| Bygg/CSP | `app/vite.config.ts` | Base-sti `/Treningsdagbok/`, CSP-meta i produksjonsbygget, Vitest-oppsett og dekningsgrense |
| CI | `.github/workflows/ci.yml` | `kontroll`, `avhengigheter`, `hemmeligheter`, `kodeanalyse`, `e2e` |
| Utrulling | `.github/workflows/deploy.yml` | Én artefakt → staging-røyktest → produksjon kun på tag `v*` |
| Sperretest | `.github/workflows/sperretest.yml` | Beviser at `production` krever godkjenning; deployer ingenting |

### Komponenter i appen

Hele appen er én side. `App` eier listen over økter og sender den nedover; komponentene melder tilbake med den nye, lagrede listen, så lagringen ikke leses på nytt unødvendig.

| Fil | Ansvar |
|---|---|
| `App.tsx` | Leser lagringen ved oppstart (`loadWorkouts`). Holder listen, økten som redigeres, fokusmål og meldinger. Rekkefølge på siden: skjema, liste, eksport, slett alle, personverntekst |
| `WorkoutForm.tsx` | Registrerer ny økt eller redigerer valgt økt. Feltfeil ved feltene, fokus til første feil, statusmelding, dialog før ødelagte data forkastes |
| `WorkoutList.tsx` | Tabell sortert med nyeste dato først (ved lik dato: sist registrert først), 100 rader per side («Vis flere økter»). Knappene Rediger og Slett per rad, sletting med bekreftelse. Tomtilstand og feilmeldinger for ødelagte data, ukjent versjon og utilgjengelig lagring |
| `ExportSection.tsx` | Laster ned alle gyldige økter som JSON. Melding om antall og filnavn |
| `DeleteAllSection.tsx` | «Slett alle data» med bekreftelse. Skjules når appen er rammet inn (se S4) |
| `PrivacySection.tsx` | Statisk tekst om lagring og personvern |
| `ConfirmDialog.tsx` | Felles modal `<dialog>` (`showModal`), fokus starter på «Avbryt», Escape avbryter |
| `corruptDialog.ts` | Tekst for dialogen om ødelagte data (registrering, redigering, sletting) |
| `workout.ts` | Datamodell og validering av input og lagrede økter |
| `workoutStorage.ts` | All lesing og skriving av `localStorage` |
| `exportWorkouts.ts` | Bygger eksportfilen (navn og JSON) |

## Data og lagring

### Datamodell

En økt har feltene `id`, `dato`, `type` og `varighet`. Feltnavnene er norske fordi de er del av det lagrede og eksporterte formatet. Ingen fritekst om helse eller skader (dataminimering).

| Felt | Regel ved registrering og redigering |
|---|---|
| `id` | UUID fra `crypto.randomUUID()`; endres ikke ved redigering |
| `dato` | `ÅÅÅÅ-MM-DD`, en gyldig kalenderdato fra 1900-01-01 til og med dagens lokale dato |
| `type` | Fritekst, trimmes, 1–50 tegn (telt i kodepunkter, så en emoji er ett tegn). Kontrolltegn, bidi-overstyring og ensomme surrogater avvises |
| `varighet` | Helt antall minutter, 1–1440 |

### Lagringsnøkkel og skjemaversjon

- Nøkkel: `Treningsdagbok:v1:okter`.
- Verdi: JSON `{ "versjon": 1, "okter": [ … ] }`, med nøyaktig disse to rotnøklene.

### Lesing (`loadWorkouts`)

Lagrede data er ubetrodde. Resultatet har en status som UI-et viser på norsk:

| Status | Når | Hva brukeren ser |
|---|---|---|
| `ok` | Ingen data, eller gyldige data | Listen, eller tomtilstand |
| `corrupt` | Ugyldig JSON, verdi over 2 000 000 tegn (tolkes ikke), feil rotstruktur eller ukjente rotnøkler, `versjon` som ikke er et tall større enn 1, ugyldige eller dupliserte økter, eller flere enn 5 000 gyldige økter | De gyldige øktene og en melding om at noen data ikke kan leses |
| `unsupported-version` | `versjon` er et tall større enn 1 (lagret av en nyere app) | Melding om nyere versjon; ingen økter vises, og skriving sperres |
| `unavailable` | `localStorage` kan ikke nås eller lesing kaster (for eksempel privat modus) | Melding om at lagring ikke er tillatt nå |

Hver økt valideres med `validateStoredWorkout`: nøyaktig de fire feltene, `id` som UUID og samme feltregler som over. Datoen sjekkes ikke mot dagens dato ved lesing, så klokke eller tidssone ikke kan forkaste lagrede økter. Ved duplisert `id` beholdes den første. De første 5 000 gyldige øktene beholdes.

### Skriving (`addWorkout`, `updateWorkout`, `deleteWorkout`)

- Lagringen leses rett før hver endring, slik at endringer fra andre faner blir med.
- Hard grense på **5 000 økter**: økt nr. 5 001 avvises med en norsk melding.
- Er dataene `corrupt`, skrives ingenting før brukeren har bekreftet i en dialog at de ødelagte dataene fjernes. Da lagres de gyldige øktene pluss endringen.
- Ved `unsupported-version` eller `unavailable` skrives ingenting.
- `QuotaExceededError` (også Firefox-varianten) gir en egen melding om full lagring; andre skrivefeil gir «utilgjengelig». Lagrede data og brukerens input beholdes.

### Slett alle data (`deleteAllData`)

- Fjerner **alle** nøkler som begynner med `Treningsdagbok:`, også fremtidige versjoner (`v2:` og så videre), slik at ødelagte data og ukjent versjon også kan slettes. Andre nøkler på samme origin røres ikke. Prefikset er godkjent av eier (#10).
- Nøklene samles før de fjernes, fordi indeksene forskyves underveis.
- Stopper slettingen halvveis (unntak), vises et varsel som ikke påstår at ingenting ble slettet, og listen leses på nytt slik at den viser det som faktisk ligger igjen. Slettingen kan trygt prøves igjen.

### Eksportformat

- Filnavn: `treningsdagbok-ÅÅÅÅ-MM-DD.json`, med lokal dato.
- Innhold: `{ "versjon": 1, "eksportert": "<ISO 8601-tidspunkt>", "okter": [ … ] }`, formatert med innrykk. Øktene har samme felt og samme rekkefølge som i lagringen. Bare gyldige økter eksporteres.
- Filen lages i nettleseren og lastes ned fra en `blob:`-URL. Det skjer ingen nettverkskall og ingen CSP-endring. Filen er ikke kryptert, og appen sier det.
- Formatet er en kontrakt hvis import kommer senere. Import er utenfor scope i dag.

### Ytelse (verste tilfelle)

| Krav | Verste tilfelle i test | Test |
|---|---|---|
| Listen vises på under 1 s med 5 000 økter | 5 000 økter med maksimal feltlengde, målt etter omlasting | `e2e/liste.spec.ts` («viser første side av 5 000 økter … innen 1 sekund») |
| Eksport ferdig på under 2 s | 5 000 økter, 50 tegn emoji eller devanagari, varighet 1440 | `e2e/eksport.spec.ts` («5 000 økter … er ferdig nedlastet innen 2 sekunder») |
| Slett alle (samme mål som eksport) | 5 000 økter med maksimal datamengde; målt til 39 ms lokalt | `e2e/slett-alle.spec.ts` («5 000 økter er slettet og listen tom innen 2 sekunder») |
| Plass til grensen | 5 000 økter med maksimal feltlengde får plass i `localStorage` | `src/workoutStorage.test.ts` («får plass til 5 000 økter med maksimal feltlengde») |

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

Testdata er syntetiske. Repoet er offentlig, og rapportene er CI-artefakter, så ekte treningsdata skal aldri brukes i tester, skjermbilder eller issues.

## Feilsøking

- **`engine-strict`/Node-feil ved `npm ci`:** Node må være ≥ 24.15.0 (jsdom krever det).
- **E2E: «port 4173 er i bruk»:** stopp andre `vite preview`-prosesser; Playwright gjenbruker bevisst ikke en eksisterende server.
- **E2E: nettleser mangler:** kjør `npm run e2e:install`.
- **E2E i iframe feiler med `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`:** en rammeside som Playwright ruter (uten ekte server), trenger `context.grantPermissions(['local-network-access'])`; se `e2e/slett-alle.spec.ts`.
- **Blank side på Pages / 404 på JS:** sjekk at `base` i `vite.config.ts` matcher reponavnet.
- **CSP-feil i konsollen:** ny kode bruker inline-skript, `eval` eller ekstern ressurs. Fjern det i stedet for å svekke CSP.
- **Brukeren ser «data kan ikke leses»:** dataene under `Treningsdagbok:v1:okter` er ødelagte eller manipulert. Neste lagring tilbyr å fjerne de ødelagte dataene, eller brukeren kan bruke «Slett alle data».
- **Brukeren ser «nyere versjon»:** dataene har `versjon` > 1. Appen skriver ikke over dem. Last inn siden på nytt (ny versjon på Pages), eller slett alle data.

## Drift

### Utrulling

1. Merge til `main` → CI kjører. Når CI er grønn, bygger `deploy.yml` **én** artefakt (`artefakt-<commit>`, `.tgz` med SHA-256), som beholdes i 90 dager.
2. **Staging** er en røyktest i runneren, fordi Pages bare har ett nettsted per repo: artefakten pakkes ut og serveres lokalt, og testen krever at `index.html` svarer, har `<title>Treningsdagbok</title>` og har CSP-meta. Grønn staging lagrer et bevis (`staging-ok-<commit>`) med samme digest.
3. **Produksjon** starter bare når en tag `v*` pushes (via `/slipp-til-produksjon`), taggen ligger på `main`, eier har satt `PRODUKSJON_GODKJENNING_VERIFISERT=true`, og en reviewer godkjenner miljøet `production`. Jobben henter artefakten og staging-beviset fra **samme** kjøring for den commiten, krever at digestene stemmer, og publiserer den uendrede artefakten til Pages. Ingenting bygges på nytt.

Eier kontrollerer GitHub-innstillingene med `bash scripts/sjekk-github-oppsett.sh`.

### Slik ser du at appen virker

- **Før slipp:** CI og `Deploy` er grønne på commiten som skal slippes (Actions-fanen), inkludert staging-røyktesten.
- **Etter slipp (manuell kontroll):** åpne `https://aarola2.github.io/Treningsdagbok/` i et privat vindu. Sjekk at:
  - siden laster med overskriften «Treningsdagbok» og seksjonene for registrering, liste, eksport, slett alle og personvern;
  - utviklerverktøyenes konsoll ikke viser CSP- eller JavaScript-feil;
  - du kan registrere en økt med oppdiktede data, se den i listen og slette den igjen.
- Det finnes ingen automatisk røyktest mot Pages-URL-en etter produksjonsdeploy. Eier har godkjent dette (#12, K9/A7); en automatisk røyktest blir eventuelt et eget issue i rød sone.

### Tilbakerulling

- **Innen 90 dager** (mens artefakten for forrige slippede commit finnes): lag en **ny** tag `v*` på den forrige slippede commiten, for eksempel `v1.0.2` på samme commit som `v1.0.0`. Produksjonsjobben finner artefakten og staging-beviset for den commiten og publiserer dem på nytt etter godkjenning. Taggen må ligge på `main`, noe en tidligere slippet commit gjør.
- **Etter 90 dager** (artefakten er slettet): lag en revert-commit til `main` via PR. Det gir ny CI, ny artefakt og ny staging, og deretter en ny tag `v*` på den commiten.
- Brukerdata påvirkes ikke av tilbakerulling, fordi de ligger i nettleseren. En eldre app som møter data med høyere `versjon`, viser «nyere versjon» og skriver ikke over dem.

## Tilgjengelighet

Mål: WCAG 2.2 AA. Ingen samsvarserklæring er gitt.

Bygget og testet:

- `lang="nb"`, viewport uten zoomsperre, `<title>`, `<main>` og én `<h1>`. Hver del er en `<section>` med `<h2>`; personvernteksten er en navngitt region.
- Skjemaet har `<label>` på alle felt, feilmeldinger knyttet til feltet (`aria-describedby`) og fokus til første feil. Lagrings- og feilstatus vises med `role="status"`/`role="alert"`.
- Dialoger er native modal `<dialog>`: resten av siden er inert, fokus starter på den trygge handlingen («Avbryt»), Escape avbryter, og fokus går tilbake til knappen som åpnet dialogen.
- Etter sletting eller redigering flyttes fokus til en melding (`tabIndex=-1`), slik at den leses opp og fokus ikke forsvinner med en slettet rad.
- Synlig fokus (3 px, kontrast ≥ 3:1). Små knapper i listen er minst 24 × 24 px.
- E2E: axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) i alle hovedflyter og med åpne dialoger; tastaturflyt for registrering, redigering, sletting, eksport og slett alle; 320 px uten horisontal rulling, også med WCAG 1.4.12-tekstavstand.

Gjenstår før slipp (manuelt, #13): skjermleser (VoiceOver og NVDA), zoom 200 % og 400 %, kontrast i ekte nettleser, og andre nettlesere enn Chromium. Spesielt: meldinger som leses opp fordi de får fokus, har ingen rolle. Tilgjengelighetsgjennomgangen av #10 vurderte dette som middels og «mulig» (WCAG 4.1.3). Testes med skjermleser; må det rettes, gjelder det både `WorkoutList` og `DeleteAllSection`.

Når navigasjon kommer: `<header>`/`<nav>`, hopp-lenke og `document.title` per visning.

## Sikkerhet og personvern

### Dataflyt og dataklasser

- Treningsdata kan være helseopplysninger (GDPR art. 9). Data forlater aldri enheten: ingen backend, ingen telemetri, ingen tredjepartsressurser. Dette håndheves av CSP (`default-src 'self'`, `connect-src 'self'`, `frame-src 'none'` m.m.).
- GitHub (Pages) behandler besøkendes IP-adresse og forespørselslogger som vert. Det står i appens personverntekst.

### Lagring og livssyklus

- `localStorage` er **ukryptert**, per origin, og lesbar for nettleserutvidelser og andre med tilgang til enheten. Personvernteksten sier at dataene ikke er kryptert.
- Opprettelse, endring og sletting skjer i appen, eller ved at brukeren tømmer nettleserdata.
- Data kan gå tapt: nettleseren kan kaste ut data (for eksempel Safari etter 7 dager uten bruk), og privat modus kan mangle lagring eller kaste `QuotaExceededError`. Personvernteksten anbefaler eksport som sikkerhetskopi. `navigator.storage.persist()` er vurdert og utsatt av eier (#11).
- Ingen ekte data i repo, tester, issues, skjermbilder eller Playwright-spor (repoet er offentlig).

### S5-krav og hvordan de er oppfylt

| S5-krav | Slik er det løst | Tester |
|---|---|---|
| Dataminimering | Bare `dato`, `type` (maks 50 tegn) og `varighet`; ingen fritekst om helse | `src/workout.test.ts` (validering av felt og lengder), `src/workoutStorage.test.ts` («lagrer en ny økt med skjemaversjon og unik id») |
| «Slett alle data» med bekreftelse, lagringen tom etterpå | `DeleteAllSection` + `deleteAllData`, dialog med fokus på «Avbryt» | `src/DeleteAllSection.test.tsx`, `src/workoutStorage.test.ts` («deleteAllData»), `e2e/slett-alle.spec.ts` (lagringen tom før og etter omlasting, Avbryt og Escape endrer ingenting) |
| Eksport av egne data | `ExportSection` + `buildExport`, JSON med skjemaversjon | `src/exportWorkouts.test.ts`, `src/ExportSection.test.tsx`, `e2e/eksport.spec.ts` (innholdet i nedlastet fil, ingen nettverkskall). Import er utenfor scope |
| Data fra `localStorage` er ubetrodde: skjemaversjon og validering; ødelagt JSON krasjer ikke og gir ikke XSS | Statusene i «Lesing», `validateStoredWorkout`, React-tekst (ingen `dangerouslySetInnerHTML`), streng CSP | `src/workoutStorage.test.ts` («loadWorkouts»: ukjent rotnøkkel, `__proto__`, forurenset `Object.prototype`, for stor verdi, duplikater, over 5 000), `src/workout.test.ts` («validateStoredWorkout»), `src/WorkoutList.test.tsx` og `e2e/liste.spec.ts` («viser HTML og skript i type som ren tekst»), `e2e/smoke.spec.ts` («CSP blokkerer inline-skript») |
| `QuotaExceededError` og utilgjengelig lagring | Egne feilkoder og norske meldinger; input og data beholdes | `src/workoutStorage.test.ts` («gir quota …», «gir unavailable …»), `src/WorkoutForm.test.tsx` («lagringsfeil»), `src/WorkoutList.test.tsx` («viser feilmelding ved full lagring»), `src/DeleteAllSection.test.tsx` (utilgjengelig og delvis sletting) |
| Ingen logging av treningsdata til konsollen | Ingen `console`-kall i appkoden | `src/workoutStorage.test.ts` (spioner på `console.log/info/warn/error/debug` i alle tester), e2e uten konsollfeil (`smoke`, `registrering`, `liste`, `eksport`, `slett-alle`) |
| Tekst om hvor data lagres og risikoen for tap | `PrivacySection` | `src/PrivacySection.test.tsx`, `e2e/personvern.spec.ts` |
| Ingen forespørsler utenfor egen origin | CSP og ingen eksterne ressurser | `e2e/eksport.spec.ts` og `e2e/slett-alle.spec.ts` (overvåker alle forespørsler); full kontroll i alle flyter gjøres i #13 |

### Kjente begrensninger

- **Andre åpne faner** har øktene i minnet. Etter «Slett alle data» eller endringer i én fane kan en annen fane skrive data tilbake ved neste lagring. Skrivingen leser lagringen rett før endringen, men det finnes ingen varsling mellom faner. Dialogen for «Slett alle data» ber brukeren lukke andre faner. Et varsel med `storage`-hendelsen er et utsatt forslag.
- **Nettleserens egne kopier:** nettleseren kan beholde slettede data på disk en stund før den rydder. Appen kan ikke styre det.
- **Angre** finnes ikke for sletting (utenfor scope).

### Akseptert rest-risiko (eier, 2026-10-30, oppdatert 2026-11-10)

- **Delt origin (S1):** alle GitHub Pages-prosjekter på kontoen deler origin `https://aarola2.github.io`. Andre prosjekter der kan lese og endre denne appens `localStorage`, og `script-src 'self'` tillater skript fra dem. Eier har akseptert risikoen med denne regelen: **ingen andre Pages-prosjekter på kontoen skal lagre personopplysninger eller laste tredjepartsskript, og det skal ikke finnes et brukernettsted (`aarola2.github.io`-repo) med service worker.** Nøkkelprefiks i `localStorage` er ingen beskyttelse; det gjelder også prefikset som «Slett alle data» bruker. Personverntekstens løfte om at data bare ligger i denne nettleseren, hviler på denne regelen. Vurderes på nytt før første produksjonsslipp (eget domene gir egen origin).
- **CSP via meta og innramming (S4):** GitHub Pages kan ikke sette HTTP-headere. `frame-ancestors`, `report-uri`/`report-to` og `sandbox` virker ikke i meta, og `X-Frame-Options` kan ikke settes, så appen kan rammes inn (clickjacking). CSP-meta står først i `<head>` (verifisert i e2e). Utviklingsserveren kjører uten CSP.
  - Tiltak (#10, eiers beslutning A): «Slett alle data» skjules når `window.self !== window.top`. Kaster sjekken, skjules knappen også (fail-closed). Testet med komponenttester og med ekte iframe fra en annen origin i e2e.
  - Restrisiko akseptert av eier 2026-11-10: sjekken er klientside og ikke et fullverdig forsvar. Det som holder risikoen lav: nettlesere partisjonerer lagring i tredjeparts-iframes (forutsatt, ikke testet), en `sandbox`-iframe uten skript eller samme origin kan ikke kjøre appen, og sletting krever to klikk i en modal dialog med fokus på «Avbryt».
- **gitleaks-binær (S3):** gitleaks-action laster ned binæren (festet til 8.30.1) fra GitHub Releases uten sjekksumkontroll.
