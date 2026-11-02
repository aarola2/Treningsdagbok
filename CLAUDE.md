# Treningsdagbok

Testprosjekt treningsdagbok: en personlig treningsdagbok som nettapp, der data lagres lokalt i brukerens nettleser.

## Stack

- Frontend: Vite 8 + React 19 + TypeScript 6 (web-UI), publisert som statisk nettsted på GitHub Pages
- Backend: ingen. Data lagres i `localStorage` på brukerens enhet
- Test: Vitest 5 + Testing Library + jsdom (enhet/komponent, dekningsgrense 80 %), Playwright 1.64 med Chromium (e2e)
- Lint: ESLint 10 + typescript-eslint (`strictTypeChecked`), react-hooks, react-refresh; typecheck med `tsc -b`

Node ≥ 24.15.0 og npm. Versjoner er låst eksakt (`app/.npmrc`: `save-exact`, `ignore-scripts`) med `app/package-lock.json`.

## Kommandoer

Kjør fra mappen oppgitt i seksjonsoverskriften. Alle kommandoene under finnes som scripts i `app/package.json` og er kjørt grønt under oppsettet.

### app/
- Start: `npm run dev` (utviklingsserver, uten CSP)
- Test: `npm test` (med dekning: `npm test -- --coverage`)
- Lint: `npm run lint`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- E2E (bare for UI): `npm run e2e` (nettleser installeres med `npm run e2e:install`). Playwright starter selv produksjonsbygget (`npm run build && npm run preview` på `http://127.0.0.1:4173/Treningsdagbok/`).

## Mappestruktur

```
app/                kode og tester (src/ enhetstester ved siden av koden, e2e/ Playwright)
docs/krav/          brukerhistorier
docs/design/        wireframe / prototyper / referanser
docs/arkitektur.md  oversikt, kjøring, testing, feilsøking (skal være utfylt før slipp)
scripts/            sjekk-github-oppsett.sh (kjøres av eier, ikke av Claude)
.github/            issue-mal, CI og deploy-oppsett
.claude/            policy, rettigheter, skills og subagenter
```

## Kodestandard

- Bruk strengeste praktiske typekontroll i valgt stack. Kodenavn på engelsk, brukerrettede meldinger på norsk med mindre produktkrav sier annet.
- Ingen uplanlagte pakker eller ad hoc nedlasting/kjøring av verktøy. Bruk godkjente, låste avhengigheter. Bruk scripts i `package.json`; `npx` er sperret. Pakkegrenser står i `.claude/POLICY.md`.
- Nettleserlagring bruker unik nøkkel med prosjektnavn og versjon (for eksempel `Treningsdagbok:v1:<navn>`); valider alt som leses derfra.
- Hver ny funksjon skal ha relevante tester, inkludert negative scenarier og grensetilfeller. Testfiler ligger nær koden der stacken egner seg for det.
- Foretrekk små enheter og enkel arkitektur, ingen død kode eller abstraksjoner uten behov.
- Ved web-UI: Playwright e2e med semantiske selektorer (`getByRole`, `getByLabel`, `getByText`), ingen vilkårlige faste ventetider, og sporbar dekning av akseptkriterier. Ta vare på rapport/skjermbilder. For native UI: bruk plattformrelevante tester.
- CSP leveres som meta-tag fra `app/vite.config.ts` (bare i produksjonsbygget). Ingen inline-skript, `eval`, `dangerouslySetInnerHTML` eller tredjepartsressurser (CDN, fonter, analyse).
- Repoet er offentlig, og Playwright-rapporter lastes opp som CI-artefakter: bruk aldri ekte treningsdata i tester, skjermbilder eller issues.

## Hovedagentens arbeidsflyt

Hovedagenten **eier fremdrift, delegering og håndtering av funn**. Den skal:

1. Lese `.claude/POLICY.md`, dette dokumentet og den aktuelle skillen før arbeid.
2. Kontrollere issueformat, risiko og autonominivå. Bruk `/lag-github-issues` for kravoppdeling; `bygg-issue-nr` er felles implementeringsprosess for alle bygg-skillene.
3. Kalle rådgivende subagenter på tidspunktene i policy/skills. Agentenes detaljerte faglige sjekklister ligger **kun** i `.claude/agents/`.
4. Samle funn i en kort tiltaksoversikt (`rett innenfor scope | trenger godkjenning | dokumenter`), rette tillatte funn, gjenta relevante tester/CI og innhente ny kontroll på endret commit.
5. Stoppe ved manglende beslutninger, rød sone uten godkjent plan, utilstrekkelig evidens, blokkerende sikkerhets-/kvalitetsfunn eller manglende teknisk håndhevede gates. Ikke forveksle agentens `APPROVE` med GitHub-review.

Ingen separat orkestreringsagent kreves. Ikke dupliser kontrollistene i dette dokumentet.

## Arbeidsmåte og autonomi

- Ett issue = én branch (`feature/<nr>-<navn>`) = én PR med `Closes #<nr>`. Ikke push til `main`, force-push, rebase eller `git add .`.
- `/bygg-issue-nr` og `/bygg-en-og-en` viser **alltid** planen og venter på godkjenning før endring. `/bygg-alle` kan bygge nivå 3–4 autonomt **kun uten rød sone**. Alle tre har **identisk** obligatorisk kvalitetsport; merge krever nivå 4, eksplisitt `merge` og eksternt håndhevede gates.
- Endre aldri scope uten spesifikk godkjenning. Et issue er ikke ferdig før PR er **faktisk merget**.
- Test, lint, typecheck, build og e2e der relevant skal kjøres etter prosjektets kommandoer. Oppgi hva som ikke kunne verifiseres.
- Grønn sone omfatter små, avklarte funksjoner, tester, dokumentasjon og UI-tilpasninger innenfor godkjent design. Rød sone og nivågrenser defineres **kun** i policy.

## Felles styring og subagenter

Les `.claude/POLICY.md` først. Rollene er `kravanalytiker`, `arkitekt`, `sikkerhet` og `tilgjengelighet` i `.claude/agents/`. De er skrivebeskyttede rådgivere; CI, sikkerhetsskanning, GitHub-ruleset og menneskelig review/merge gjelder separat. Følg policyens felles funnformat og kvalitetsport, ikke egne forenklede regler her.

## Utrulling

Merge til `main` gir bare staging. Produksjon starter bare ved push av en tag `v*` (via `/slipp-til-produksjon`), med samme artefakt som ble testet i staging, og er stengt inntil menneskelig, teknisk håndhevet godkjenning er dokumentert og eier har satt `PRODUKSJON_GODKJENNING_VERIFISERT` til `true`. Eier kjører `bash scripts/sjekk-github-oppsett.sh` for å kontrollere GitHub-innstillingene; du kan ikke lese dem. Ingen bygg-skill deployer til produksjon. Ikke endre deploy-workflow, miljøer eller variabler uten særskilt rød-sone-godkjenning. Se `.claude/POLICY.md`.

Hosting er GitHub Pages (`https://aarola2.github.io/Treningsdagbok/`). Staging er en røyktest av artefakten i runneren, fordi Pages bare har ett nettsted per repo.

## Ikke rør

- `.env`, tokens, nøkler, passord og annet hemmelig materiale.
- `.claude/settings.json`, `.github/workflows/`, branch protection eller andre sikkerhetsmekanismer uten særskilt godkjent rød-sone-issue.
- `app/.npmrc`, `app/package.json`-avhengigheter og test-/lint-/CSP-konfigurasjon (`vite.config.ts`, `playwright.config.ts`, `eslint.config.js`) må ikke svekkes; endringer krever godkjent plan.
- Alt under `Utenfor scope` i aktuelt issue.

## Forklaringer

Når du innfører noe prosjektets eier ikke lett kan forklare videre, legg ved en kort norsk forklaring i plan eller PR.
