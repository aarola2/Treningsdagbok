<!--
Mal for brukerhistorie. Kopieres til docs/krav/_mal-brukerhistorie.md av /nytt-prosjekt.
Kopier den til docs/krav/<navn>.md og fyll ut. Teknologivalg hører ikke hjemme her (de står i CLAUDE.md).
/lag-github-issues stopper hvis «Definisjon av ferdig» eller «Ikke-funksjonelle krav» mangler eller er tomme.
-->



# <Treningsdagbok>

## Mål

Lage en treningsdagbok


## Aktører

Vanlige mennesker
## Hovedflyt

1) Brukeren skal kunne lagre en treningsøkt med feltene dato (påkrevd), type (påkrevd, fritekst, maks 50 tegn) og varighet i minutter (påkrevd, heltall 1–1440). Ingen fritekst om helse/skader (dataminimering). *(Avklart av eier 2026-11-05.)*
2) Brukeren skal kunne se en liste over lagrede økter.
3) Brukeren skal kunne redigere og slette én økt.
4) Brukeren skal kunne eksportere alle økter som en nedlastbar JSON-fil med skjemaversjon. *(Avklart av eier 2026-11-05.)*
5) Brukeren skal kunne slette alle data, med bekreftelse.
6) Appen viser en kort tekst om at data bare lagres i denne nettleseren, at de kan gå tapt, og at GitHub Pages behandler IP-adresser.
7) Data lagres lokalt.


## Feil- og tomtilstander

Man får beskjed på norsk, blant annet ved ugyldig input, tom liste, ødelagte lagrede data, full lagring og utilgjengelig lagring.

- Maks 5 000 økter (hard grense); økt nr. 5 001 avvises med norsk melding. *(Avklart av eier 2026-11-05.)*
- Er lagrede data delvis ødelagte eller har ukjent versjon, vises de gyldige øktene. Før noe nytt lagres, forklarer en dialog at de ødelagte dataene fjernes; bare ved bekreftelse lagres de gyldige øktene pluss endringen. *(Avklart av eier 2026-11-05.)*

## Utenfor scope

- Database
- Flere brukere, innlogging og synkronisering *(avklart av eier 2026-11-05)*
- Import av data *(avklart av eier 2026-11-05)*

## Definisjon av ferdig
- [ ] Alle MVP-issues er merget
- [ ] Brukeren kan registrere, redigere, slette og eksportere en økt uten veiledning
- [ ] Alle ikke-funksjonelle krav under er verifisert med test eller dokumentert manuell kontroll
- [ ] Ingen åpne kritiske eller høye sikkerhetsfunn
- [ ] docs/arkitektur.md er utfylt

## Ikke-funksjonelle krav
- **Robusthet:** Ødelagte eller ukjente lagrede data krasjer ikke appen. Brukeren får en norsk feilmelding, og gyldige økter vises fortsatt.
- **Sikkerhet og personvern:** Data forlater aldri enheten. Ingen innlogging, analyse eller tredjepartsressurser. Brukeren kan slette alle data.
- **Tilgjengelighet:** WCAG 2.2 AA. Alt kan brukes med tastatur, og alle skjemafelt har ledetekst.
- **Ytelse:** Med 5 000 lagrede økter vises listen på under 1 sekund, og eksporten er ferdig på under 2 sekunder.
- **Responsivt:** Kan brukes uten horisontal scrolling fra 320 px bredde.
- **Drift:** Røyktest i CI etter deploy. Tilbakerulling skjer ved å tagge forrige versjon på nytt.


## Design

<!-- Referanser til docs/design/ (wireframe, skjermbilder), eller «Ingen» / «Må avklares». -->
1) Det bør være moderne design.
2) Ingen referanse i `docs/design/`. Enkel, ren layout etter tilgjengelighetskravene; eier godkjenner skjermbilder i hver UI-PR, og UI-issues merges ikke autonomt. *(Avklart av eier 2026-11-05.)*

## Antakelser og åpne avklaringer

<!-- Ingen, eller en konkret liste med eier og konsekvens. -->
- Automatisert axe-sjekk (`@axe-core/playwright`) får eget issue før første skjema; pakken godkjennes i planen. *(Avklart av eier 2026-11-05.)*
- Øvrige antakelser står i utkastene fra `/lag-github-issues` (2026-11-05) og bekreftes når eier godkjenner utkastene.
