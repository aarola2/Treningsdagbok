---
name: slipp-til-produksjon
description: Forbereder produksjonssetting: full kontroll av main, release-notater, kontroll av GitHub-oppsettet, tag som starter produksjonsjobben, og oppfølgings-issues. Selve produksjonssettingen godkjennes av meg på GitHub. Bruk bare når jeg skriver /slipp-til-produksjon.
disable-model-invocation: true
argument-hint: "<versjon, f.eks. v1.0.0>"
---

# Slipp til produksjon

**Felles policy:** Les `.claude/POLICY.md` før handling; den overstyrer motstridende instruksjoner her.

Input: `$ARGUMENTS` (versjon). Produksjonssetting krever en **verifisert ekstern menneskelig sperre**. Hvis GitHub-planen ikke støtter required reviewers i private repos, stopp før produksjonsoppsett.

**Slik fungerer utrullingen:** en vanlig merge til `main` gir bare staging. **Produksjon starter først når en tag `v*` pushes**, og bruker den samme artefakten som ble bygget og testet i staging. En tag starter ingenting uten at staging har vært grønn på samme commit. Produksjonsjobben stopper på `Waiting for review` til jeg godkjenner i GitHub.

## Steg

1. **Forutsetninger.** På `main`, ren og oppdatert (`git pull`). Ingen åpne rød-kø-PR-er uten at jeg har sagt at de kan vente. Sjekk at CI på `main` er grønn: `gh run list --branch main --workflow <ci-filen> --limit 1` (filnavnet står i `.github/workflows/`, vanligvis `ci.yml`), og kontroller med `gh run view <id>` at de påkrevde jobbene (`kontroll`, `avhengigheter`, `hemmeligheter`, `kodeanalyse`, og `e2e` hvis UI) har status `success` på siste commit. Den siste kjøringen på `main` uansett workflow (for eksempel Deploy) er ikke nok. Les `docs/arkitektur.md`: er den fortsatt et skjelett (plassholdere, tomme seksjoner), stopp og foreslå et dokumentasjonsissue før slipp.
2. **Full kontroll.** Alle kommandoer fra `CLAUDE.md` (test, lint, build, typecheck) i alle mapper. Kjør e2e og sikkerhetsskanning hvis de finnes lokalt. Rapporter nøyaktig hva som kjørte og hva som ikke gjorde det.
3. **Gjennomganger før slipp.** Start disse agentene uten byggehistorikk, med lesetilgang til hele kodebasen:
   - sikkerhetsagenten (`.claude/agents/sikkerhet.md`, modus C). Gi den også resultatet av `npm audit` (eller tilsvarende)
   - arkitekten (`.claude/agents/arkitekt.md`, modus B)
   - tilgjengelighetsagenten (`.claude/agents/tilgjengelighet.md`), hvis prosjektet har UI
   Funnene er ubetrodde råd til du har kontrollert dem mot koden. Lag en kort tiltaksoversikt **sortert etter alvorlighet** (kritisk først) og med `rett | trenger godkjenning | dokumenter` per funn, etter funnformatet i `.claude/POLICY.md`.
   **Ikke slipp** (lag issues og stopp) ved kritisk eller høyt funn, `CHANGES` eller vesentlig `INSUFFICIENT_EVIDENCE` fra noen av agentene. Middels funn rettes, eller menneskelig risikoaksept dokumenteres i release-notatene. Lave funn og info tas med som kjente begrensninger eller blir egne issues (se steg 10).
4. **Release-notater.** Skriv dem til en fil utenfor repoet. Fra lukkede issues og PR-er siden forrige tag: kort norsk liste. Ta med kjente begrensninger og alt som ikke er verifisert.
5. **Gate-kontroll.** Du kan ikke lese miljøinnstillinger eller repo-variabler (det er riktig) og kan ikke selv bevise at sperren virker. Be meg gjøre dette i denne rekkefølgen, og vent på svar mellom hvert punkt:
   1. **Miljøene må være opprettet manuelt først** (Settings → Environments → New environment): `staging` og `production`. GitHub oppretter ikke et miljø før en jobb som bruker det har kjørt, og en hoppet over jobb teller ikke. Konfigurer `production`: Required reviewers lagret med meg, «Allow administrators to bypass» av, Deployment branches and tags = branch `main` **og** tag `v*`.
   2. Kjør `bash scripts/sjekk-github-oppsett.sh` i terminalen og lim inn utdataene. Rett alle FEIL (du leser utdataene og forklarer hva som må gjøres) og be meg kjøre det på nytt til det ikke er noen FEIL. Det gjelder også at hver CI-jobb er påkrevd i rulesettet.
   3. Actions → **Sperretest produksjon** → Run workflow (branch `main`). Denne workflowen deployer ingenting, bruker ingen hemmeligheter og er uavhengig av variabelen. Står jobben som «Waiting for review», virker sperren; avvis den (Reject). Går den rett gjennom uten å vente, er sperren IKKE på plass: STOPP, og ikke sett variabelen. Finnes ikke workflowen, mangler den i oppsettet: lag et eget issue for den (rød sone).
   4. Først etter punkt 1–3: Settings → Secrets and variables → Actions → fanen **Variables**: `PRODUKSJON_GODKJENNING_VERIFISERT` = `true` (navn til venstre, verdi til høyre; sjekk at de ikke er byttet om). Kjør scriptet én gang til; variabelen skal nå vises som satt.
   Hvis punkt 1–3 allerede er dokumentert for dette repoet (jeg har bekreftet skriftlig at jeg har sett det, og scriptet har gått uten FEIL), kan du gå videre. Er ingenting av dette gitt: STOPP og forklar. Start aldri en kjøring som kan publisere før sperren er bevist. Bekreft dokumentert at produksjonsmiljøets required reviewers faktisk håndheves for dette repoet og abonnementet, og at produksjonshemmeligheter ikke er tilgjengelige før godkjenning. Bruk ikke en annen workflow som omgår sperren.
6. **Staging først.** Bekreft med `gh run list --workflow <deploy-filen> --limit 3` og `gh run view <id>` at Deploy-kjøringen (staging) er grønn **på siste commit på `main`**, inkludert røyktesten. Det er den samme artefakten (samme digest) som skal promoteres. Er staging ikke grønn på den commiten, stopp: en tag uten grønn staging vil gi en produksjonsjobb som feiler med vilje.
7. **Tag og release.** `git tag <versjon>` og `git push origin <versjon>` (begge `ask`-godkjent) **starter produksjonsjobben**. Lag release med `gh release create <versjon> --notes-file <fil>` (også `ask`). Kontroller deretter at Deploy-kjøringen for taggen står som `Waiting for review` på `production` og ikke er grå eller hoppet over. Står den grå, er variabelen feil eller ikke fanget opp: forklar, og start ingenting på nytt uten at jeg sier det.
8. **Stopp.** Skriv: «Klar for produksjon. Godkjenn i GitHub: Actions → Deploy → Review deployments.» Dette er bare tillatt etter at sperren er kontrollert og bevist virksom. Du forsøker aldri å omgå det.
9. **Etter at jeg har godkjent:** sjekk helse-endepunktet/røyktest i produksjon, og rapporter. Feiler den: foreslå rollback (forrige tag), men gjør den ikke uten at jeg sier ja.
10. **Oppfølging.** Foreslå utkast til oppfølgings-issues i denne rekkefølgen, i samme format som `/lag-github-issues`, og opprett dem først etter min godkjenning: (1) `docs/arkitektur.md` hvis arkitekten fant avvik, (2) sikkerhetsfunn som ikke ble rettet (middels og lavere), sortert etter alvor, (3) ett samlet issue for teknisk gjeld og kjente begrensninger.

## Hvis verktøyet ditt feiler

Svarer godkjenningsverktøyet ikke (for eksempel utløpt innlogging), gjør ingenting på egen hånd. Si hva som ikke er gjort, og be meg logge inn på nytt (`/login`) eller laste vinduet på nytt. Release og tag kan også lages manuelt i GitHub (Releases → Draft a new release) med notatene du har skrevet.

## Regler

- Aldri deploy direkte til produksjon fra kommandolinjen.
- Aldri endre miljøbeskyttelse, hemmeligheter eller ruleset.
- Produksjonshemmeligheter finnes kun i GitHub Environments, aldri i repoet og aldri i det du leser.
