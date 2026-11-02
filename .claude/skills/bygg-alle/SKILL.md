---
name: bygg-alle
description: "Bygger flere uavhengige issues til åpne PR-er uten å vente ved lav risiko. Samme sikkerhets- og kvalitetsport som /bygg-issue-nr; merge bare i særskilt nivå 4 med eksplisitt «merge»."
disable-model-invocation: true
argument-hint: "[issue-numre, tomt = alle åpne brukstilfelle] [merge]"
---

# Bygg alle

Les `.claude/POLICY.md`, `CLAUDE.md` og **hele** `.claude/skills/bygg-issue-nr/SKILL.md` før handling. **Felles implementeringsflyt, testing, subagent-review og merge-vilkår i `bygg-issue-nr` gjelder uendret per issue.** Denne skillen endrer bare plan-godkjenning for lav risiko, sekvensering og rapportering.

Input `$ARGUMENTS`: issue-numre eller alle åpne med etikett `brukstilfelle`; valgfritt `merge` gjelder kun issues som **allerede er autorisert til nivå 4**. Uten `merge`: **aldri merge**. Det er normalt at brukeren ikke er til stede under kjøringen.

## 1. Finn issues og lag rekkefølge

1. Hent issues via `gh issue list --label brukstilfelle --state open` og les **hele** teksten i valgte issues. Sjekk `Risiko`, `Autonominivå`, `UI`, `Design`, `Forutsetninger`, `Akseptkriterier` og `Utenfor scope`.
2. Sorter etter dokumenterte avhengigheter (topologisk rekkefølge); identifiser sannsynlig felles filberøring, og planlegg trygg PR-/merge-rekkefølge. Ved tvetydig rekkefølge eller sirkulær avhengighet: rapporter og hopp over berørte issues, ikke gjett.
3. Arbeid **ett issue om gangen**, alltid på egen feature-branch fra oppdatert `main`. Ikke stable umergede branches eller start nytt issue på en branch som avhenger av umerget kode.

## 2. Beslutning før bygging – eneste tilsiktede autonomiforskjell

- **Nivå 3 eller 4, grønn sone, komplett issue:** dokumenter plan (også i PR) og bygg **uten** interaktiv plangodkjenning. Ikke hev nivået, legg til scope eller pakkedependenser.
- **Nivå 1:** kun analyser, ikke implementer.
- **Nivå 2, rød/ukjent risiko, manglende nivå eller uklarheter:** lag konkret plan, kjør sikkerhetsagent modus A ved rød sone, legg planen som issue-kommentar og sett status `Venter på plangodkjenning`. **Ikke bygg uten uttrykkelig godkjenning av denne planen**. En tidligere godkjent plan kan brukes bare hvis identisk issue, scope og versjon er kontrollerbart dokumentert.
- Ved uavhengige issues skal du fortsette med de som kan bygges forsvarlig når ett stopper. Ved potensielt felles kode/risiko skal du ikke gå videre dersom dette gjør resultatet utrygt.

## 3. Full kvalitetsport for hvert bygget issue

Følg **alle** steg 0–9 i `bygg-issue-nr`, inkludert:

- Test først, lokale test/lint/typecheck/build og e2e ved UI.
- Grønn CI på siste commit, SAST, avhengighets-/hemmelighetsskanning.
- Fersk uavhengig kodegjennomgang, sikkerhetsagent **alltid**, tilgjengelighetsagent **ved UI**, arkitekt ved større plan.
- PR-kommentarer, tiltaksoversikt, utbedring og ny verifisering på endret commit.
- Identiske regler for kritiske/høye funn, manglende evidens, tre feilrettingsforsøk og to review-runder.

**Ingen forkortet review eller redusert testing fordi dette er batch.** Ved feil: kommenter issue/PR med strukturert status, behold PR/branch ved behov og gå bare videre til andre **uavhengige** issues.

## 4. Flere åpne PR-er og merge

- Selv når flere PR-er er åpne, forutsetter hver PR sin egen testede commit og oppdatert `main` ved merge. Tidligere grønn CI gjelder ikke etter integrasjonsendring.
- Uten `merge`: la alle PR-er stå åpne for menneskelig gjennomgang/merge. Beskriv anbefalt rekkefølge og sannsynlige konflikter.
- Med `merge`: bruk **nøyaktig** merge-porten fra `bygg-issue-nr` for **hver** PR. Ingen nivå 1–3 eller rød sone kan autonomt merges. Verifiser eksterne gates og menneskelige reviews der påkrevd. Etter merge: oppdater `main`, revurder avhengigheter og test neste issue.
- Når `main` endres etter at en PR ble åpnet (typisk etter at brukeren har merget og kjører `/bygg-alle` på nytt), bygges issuet ikke om; PR-en oppdateres: flett `origin/main` inn i feature-branchen (ikke rebase/force push); løs konflikter uten å miste funksjonalitet; kjør **hele kvalitetsporten på nytt** og kommenter ny gjennomgang i PR.
- `docs/arkitektur.md` kan bare oppdateres innenfor godkjent plan eller i eget dokumentasjonsissue/PR, aldri ved en skjult ekstraendring.

## 5. Sluttrapport

Tabell med issue, risiko/nivå, status (`PR åpen | Venter på plangodkjenning | Venter på #N | Feilet | Merget`), PR-lenke og blokkerende årsak. Angi også rekkefølge for review/merge, felles filberøring, kontrollresultater, sikkerhet/a11y-funn, alt ikke verifisert og hva brukeren konkret må gjøre videre. Aldri hev at en PR er ferdig før den faktisk er merget. Ingen produksjonsdeploy.
