import { useId } from 'react'

// Statisk tekst om hvor data lagres og hvilken risiko det har. Ingen juridisk vurdering (utenfor scope i #11).
export function PrivacySection() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Lagring og personvern</h2>
      <p>Øktene du registrerer, lagres bare i denne nettleseren på denne enheten. Appen sender dem ikke noe sted.</p>
      <p>
        Dataene kan gå tapt, for eksempel i privat modus, hvis du tømmer nettleserdata, eller hvis nettleseren rydder
        bort data etter en periode uten bruk. Bruk eksport jevnlig som sikkerhetskopi.
      </p>
      <p>
        Appen ligger på GitHub Pages. Som vert behandler GitHub IP-adressen din og logger forespørsler når du åpner
        siden.
      </p>
    </section>
  )
}
