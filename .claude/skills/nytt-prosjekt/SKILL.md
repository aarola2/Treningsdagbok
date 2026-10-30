---
name: nytt-prosjekt
description: "Oppretter et KI-assistert prosjekt med CLAUDE.md fra felles mal, rettigheter, CI/deploy, GitHub-issue-mal og nødvendig testoppsett. Bygger ingen produktfunksjoner."
disable-model-invocation: true
argument-hint: "<prosjektnavn> <én setning om hva det er>"
---

# Nytt prosjekt

**Les først:** `.claude/POLICY.md`. Den overstyrer motstridende instruksjoner. Input er `$ARGUMENTS` (navn og beskrivelse). Malene ligger i `.claude/skills/nytt-prosjekt/maler/`. Skillen lager **bare prosjektoppsett**; ingen funksjoner. Oppsettet er rød sone: **vis plan og vent på eksplisitt godkjenning**. Bruk én branch `feature/oppsett` og én PR for oppsettet; mennesket merger.

## Steg 1 – forutsetninger og teknologivalg

1. Sjekk `git --version`, `gh auth status` og `git remote -v`, samt at repo er riktig GitHub-repo. **Sammenlign navnet i `git remote -v` med prosjektnavnet i `$ARGUMENTS` tegn for tegn (stavemåte og store/små bokstaver).** Avviker de: stopp og vis avviket før noe lages; brukeren avgjør hvilket som skal rettes. Mangler repo: foreslå `gh repo create <navn> --private --clone` og **vent på ja**. Mangler verktøy: rapporter hva brukeren må installere og stopp.
2. Avklar stack med maks fire konsise spørsmål: frontend, backend/ingen, testverktøy, lint. Gi anbefaling med kort begrunnelse; klargjør i tillegg om UI er **web, native eller ingen**, og hvilken hosting/deploy som er aktuell.
3. Sjekk aktuelle runtimes og pakkehåndterer. Ikke anta JavaScript/Playwright for native apper. Nye pakker/verktøy skal eksplisitt godkjennes, versjonslåses og få lockfil der relevant.
4. Verifiser at **alle brukte maler faktisk finnes**: `CLAUDE.md.mal`, `brukstilfelle.md`, `brukerhistorie.md`, `ci.yml.mal`, `deploy.yml.mal`, `sperretest.yml.mal`, `dependabot.yml.mal` og `sjekk-github-oppsett.sh.mal`. Mangler en: stopp og be om fil/avklart alternativ, ikke finn på at prosjektet er klart.

## Steg 2 – plan før filer endres

Vis konkret filliste, foreslått stack, kjøre-/testkommandoer per mappe, CI-jobber, e2e/native UI-tester, pakker og versjoner, deploymiljø og hvilke eksterne GitHub-beskyttelser brukeren må konfigurere. Marker risiko, hemmeligheter og alt som ikke kan verifiseres. **Vent på godkjenning.**

## Steg 3 – opprett etter godkjenning

På `feature/oppsett`:

1. Opprett `CLAUDE.md` fra **`maler/CLAUDE.md.mal`**. Erstatt alle `{{...}}` med reelle opplysninger; skriv **faktiske** `dev`, `test`, `lint`, `build`, `typecheck` og e2e-kommandoer for hver eksisterende mappe. Fjern seksjon for manglende mappe/UI; ikke etterlat plassholdere. Verifiser at hovedagentens orkestrering er med, og at ingen tekst motsier policy.
2. Kopier `.github/ISSUE_TEMPLATE/brukstilfelle.md` fra mal, og kontroller at malen har: Formål, Akseptkriterier, Utenfor scope, Forutsetninger, Verifisering, Type, Risiko, Autonominivå, UI, Design, Antakelser og åpne avklaringer – **samme feltnavn** som `/lag-github-issues`. Hvis malen ikke har dette: foreslå konkret malendring i plan før opprettelse, ikke lag inkompatible issues.
3. Opprett `docs/krav/`, `docs/design/` og `docs/arkitektur.md` (oversikt, deler, kjøring, testing, feilsøking). Kopier `maler/brukerhistorie.md` til `docs/krav/_mal-brukerhistorie.md`. Legg til nødvendige `.gitkeep` og kort `.gitignore` for stacken.
4. Generer `.github/workflows/ci.yml` fra `ci.yml.mal` med **faktiske og kjørbare** jobber for test, lint, typecheck, build, dekning, dependency-/secret-skanning, SAST og e2e for web-UI; tilsvarende plattformrelevante tester for native. Ikke påstå at ukonfigurerte jobber er grønne. Ikke bruk `--if-present` eller annet som lar manglende kontroller gi grønt resultat (malen feiler også på hoppede eller isolerte tester); scriptene i `CLAUDE.md` skal finnes. Fest hver tredjeparts-action til **sin egen** gjennomgåtte commit-SHA (med utgivelsen som kommentar); `actions/checkout` bruker `persist-credentials: false`. `settings.json` sperrer `gh api`, så be brukeren oppgi eller bekrefte SHA-ene (for eksempel fra utgivelsessiden på GitHub eller med `git ls-remote`), eller foreslå en godkjent kommando i planen. Gjett aldri en SHA.
5. Generer `.github/dependabot.yml` fra mal. Nye dependencies må følge policy og låst versjon; ingen uautorisert «latest»-nedlasting.
6. **Web-UI:** konfigurer prosjektgodkjent Playwright-versjon (installer som eksplisitt planlagt devDependency og oppdater lockfil) – ingen uplanlagt `npm init playwright@latest`. `playwright.config.ts` bruker `webServer` for frontend og ev. backend og starter **produksjonsbygget** (`npm run build`, deretter `npm run preview` eller tilsvarende), ikke utviklingsserveren, slik at sikkerhetsheadere og CSP testes som i produksjon; `forbidOnly: !!process.env.CI`; `screenshot: 'on'`, `trace: 'retain-on-failure'`, Chromium og rapport. Sett scriptene `"e2e": "playwright test"` og `"e2e:install": "playwright install chromium"` i `package.json` (agenten bruker aldri `npx`); legg til enkel røyk-e2e, og ignorer `playwright-report/`, `test-results/`. Fyll `{{E2E_MAPPE}}` i CI-mal. **Uten web-UI:** fjern Playwright-jobben, og bruk native testsystem hvis relevant.
7. Lag `.github/workflows/deploy.yml` fra **`maler/deploy.yml.mal`**, tilpasset **avklart hosting** (malen er GitHub Pages; fyll alle `{{...}}`, også `{{SHA_...}}` per action, `{{APP_MAPPE}}`, `{{BYGG_MAPPE}}` og `{{RØYKTEST_TEKST}}`). Flyten er: merge til `main` gir bare staging (automatisk etter grønn CI); **produksjon starter bare ved push av en tag `v*`** og bruker **samme artefakt** som ble testet i staging, uten ny bygging. Produksjonsjobben er **fail-closed** med `if: ... vars.PRODUKSJON_GODKJENNING_VERIFISERT == 'true'` og `environment: production`; variabelen skal **ikke opprettes**. Kan ikke miljø eller godkjenningsgate håndheves, behold produksjonsjobben deaktivert eller bruk dokumentert manuell ekstern release. For GitHub Pages: noter at Pages Source må settes til GitHub Actions. Lag også `.github/workflows/sperretest.yml` fra **`maler/sperretest.yml.mal`** (manuell, deployer aldri, brukes til å bevise sperren før variabelen settes). Både deploy og sperretest er rød sone: vis dem i planen.
8. Tilpass `.claude/settings.json` for stackens kommandoer uten å svekke `ask`/`deny`. Bekreft at `.claude/POLICY.md` og **alle fire** skrivebeskyttede `.claude/agents/` er på plass. Sørg for at skillene `lag-github-issues`, `bygg-issue-nr`, `bygg-en-og-en` og `bygg-alle` er tilgjengelige; de skal **ikke** kopiere sjekklister til `CLAUDE.md`.
9. Kopier `maler/sjekk-github-oppsett.sh.mal` til `scripts/sjekk-github-oppsett.sh` (uendret, bortsett fra eventuelle andre filnavn i miljøvariablene øverst). Scriptet leser GitHub-innstillinger som du ikke kan lese, og **kjøres av eieren i terminalen**, ikke av deg.
10. Kontroller at ingen hemmeligheter, uventede filer eller utilstrekkelig dokumenterte gates er inkludert. Vis differanse og status før commit.

## Steg 4 – GitHub og manuelle beskyttelser

1. `gh label create brukstilfelle --color 0E8A16 --description "Brukstilfelle / user story"` hvis etiketten mangler.
2. `git add -- <konkrete filer>`; commit/push **bare** `feature/oppsett`; `gh pr create`. **Ikke merge selv**. Oppgi PR-lenke, hva som ble testet og hva som ikke ble verifisert.
3. **Opprett miljøene manuelt først** (Settings → Environments → New environment): `staging` og `production`. GitHub oppretter et miljø først når en jobb som bruker det faktisk har kjørt, og en hoppet over jobb teller ikke. Uten manuell opprettelse finnes ikke `production` å konfigurere eller teste.
4. Gi brukeren en **kort, eksplisitt sjekkliste** for GitHub (du kan ikke lese eller endre disse innstillingene):
   - Branch ruleset på `main`, **Enforcement = Active**: PR-krav, ingen force push, ingen sletting, Require status checks og Require code scanning results.
   - **Etter første CI-kjøring:** gjør hver jobb i `ci.yml` påkrevd (`kontroll`, `avhengigheter`, `hemmeligheter`, `kodeanalyse` og `e2e` hvis relevant; verifiser faktiske navn). En jobb som ikke er påkrevd, beskytter ingenting.
   - Secret scanning, push protection og Dependabot alerts.
   - `production`: Required reviewers lagret, «Allow administrators to bypass» av, Deployment branches and tags = branch `main` **og** tag `v*` (produksjon starter på tag). For privat repo: verifiser planstøtte; mangler den, ingen automatisk produksjonsjobb eller produksjonshemmeligheter. Eneste utvikler må vurdere «Prevent self-review».
   Be deretter brukeren kjøre `bash scripts/sjekk-github-oppsett.sh` og lime inn utdataene. Tolk dem og rapporter hver FEIL med hva som må gjøres. Gjenta etter hver endring av CI-jobber.
5. **Test produksjonssperren i praksis** før produksjonsvariabelen settes: etter merge av oppsetts-PR-en kjører brukeren «Sperretest produksjon» (Actions → Run workflow, branch `main`). Jobben skal stå som `Waiting for review`; brukeren avviser den (Reject). Ikke aksepter antakelse eller agentens eget utsagn som bevis. Variabelen settes først etterpå, og `/slipp-til-produksjon` styrer rekkefølgen.
6. Bekreft at ruleset/required checks er håndhevet før nivå 4 overhodet kan brukes. Ingen bevis = ingen autonom merge.

## Steg 5 – neste arbeid

Etter **menneskelig merge** av oppsetts-PR: `git checkout main`, `git pull --ff-only origin main`. Be om brukerhistorie ut fra `docs/krav/_mal-brukerhistorie.md` (mål, aktører, hovedflyt, utenfor scope, **definisjon av ferdig** og **ikke-funksjonelle krav**), lagre den i `docs/krav/<navn>.md` ved godkjent endring, og foreslå `/lag-github-issues docs/krav/<navn>.md` (som starter kravanalytikeren).

## Regler

- Ikke bygg produktfunksjoner som del av oppsettet.
- Ikke hev at skannere, GitHub-regler eller deploy-gates er konfigurert før de er observert og verifisert.
- Stack beskrives i generert `CLAUDE.md`, ikke kopieres inn i andre skills.
- Alle endringer i `.claude/`, `.github/` eller sikkerhetsoppsett er rød sone og krever godkjent plan og menneskelig PR-review/merge.
