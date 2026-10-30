---
name: bygg-en-og-en
description: "Kjører flere GitHub-issues sekvensielt via /bygg-issue-nr med plangodkjenning per issue og menneskelig oppfølging mellom PR-er. Samme obligatoriske kvalitetsport som /bygg-alle."
disable-model-invocation: true
argument-hint: "[issue-numre eller tomt = alle åpne brukstilfelle] [merge]"
---

# Bygg en og en

Les `.claude/POLICY.md`, `CLAUDE.md` og **hele** `.claude/skills/bygg-issue-nr/SKILL.md`. Denne skillen orkestrerer flere issues; **ingen sikkerhets-, test-, review- eller merge-regler kan forenkles**. `$ARGUMENTS`: nummererte issues i oppgitt rekkefølge, ellers alle åpne `brukstilfelle` i avhengighetsrekkefølge. Valgfritt `merge` gir **ikke** automatisk økt autonominivå.

## Steg

1. **Oversikt:** `gh issue list --label brukstilfelle --state open`; les valgte issues, kontroller fullstendig issueformat, og sorter slik at alle dokumenterte `Forutsetninger` er oppfylt. Vis kort liste med nummer, risiko, nivå, UI, avhengigheter og forventede stoppunkter.
2. **Ett issue:** Følg `bygg-issue-nr` **i sin helhet** (inkludert sikkerhetsagent for alle PR-er, tilgjengelighetsagent ved UI, uavhengig review, tester, CI og tiltaksloop). **Vis alltid implementeringsplan og vent på eksplisitt ja før kodeendring**, også for nivå 3/4. Rød sone og nivå 2 krever særskilt plangodkjenning og menneskelig PR-review/merge.
3. **Etter PR:** Uten `merge`: stopp, la brukeren gjennomgå og merge PR, og fortsett først etter at merge er verifisert. Med `merge`: bruk **alle** felles merge-vilkår i `bygg-issue-nr`; ved blokkert merge stopp og rapporter, uten å gå videre.
4. **Etter faktisk merge:** `git checkout main`, `git pull --ff-only origin main`; bekreft at issuet er Closed. Start **ikke** neste issue før bekreftelsen, heller ikke om PR-en ser grønn ut. Vis så en kort pause-oppsummering (hva ble bygget, hva er neste issue, og hva brukeren bør se på eller lære av) og vent på at brukeren skriver «fortsett».
5. **Stopp ved første sperre:** ikke-godkjent plan, rød sone uten godkjenning, manglende akseptkriterier/design/evidens, avvist tillatelse, brutt forutsetning, tre mislykkede feilrettinger, blokkerende review eller ufullstendig CI. Rapporter presis årsak og neste handling.

**UI er ikke i seg selv et stoppunkt.** UI-issues behandles med samme obligatoriske e2e- og tilgjengelighetskontroller som ved `/bygg-alle` og `/bygg-issue-nr`.

## Sluttrapport

Oppgi per issue status, PR-lenke, CI/teststatus, reviewfunn, uverifiserte punkter og hva som nå krever menneskelig handling. Kjør aldri issues parallelt, hopp aldri over blokkerte issues for å komme videre, og deploy aldri til produksjon.
