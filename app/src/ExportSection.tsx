import { useState } from 'react'
import { buildExport } from './exportWorkouts'
import type { Workout } from './workout'

const countFormat = new Intl.NumberFormat('nb-NO')
const STATUS_DELAY_MS = 100

// Filen lages i nettleseren og lastes ned fra en blob:-URL; ingen nettverkskall og ingen CSP-endring.
function download(filename: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Frigjøres etter at nedlastingen har startet; noen nettlesere avbryter den ved umiddelbar frigjøring.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export function ExportSection({ workouts }: { workouts: Workout[] }) {
  const [status, setStatus] = useState('')
  // En melding om forrige eksport er foreldet når listen endres (lagring, redigering, sletting).
  const [shownWorkouts, setShownWorkouts] = useState(workouts)
  if (workouts !== shownWorkouts) {
    setShownWorkouts(workouts)
    setStatus('')
  }

  function exportAll() {
    const { filename, json } = buildExport(workouts, new Date())
    let message: string
    try {
      download(filename, json)
      const count = workouts.length === 1 ? '1 økt' : `${countFormat.format(workouts.length)} økter`
      message = `Eksporterte ${count} til ${filename}.`
    } catch {
      message = 'Nedlastingen kunne ikke startes. Prøv igjen.'
    }
    // Tøm først og sett teksten litt senere: to separate endringer gjør at skjermlesere leser opp også en lik
    // melding ved gjentatt eksport (endringer i samme oppgave kan slås sammen i tilgjengelighetstreet).
    setStatus('')
    setTimeout(() => {
      setStatus(message)
    }, STATUS_DELAY_MS)
  }

  return (
    <section>
      <h2>Eksport</h2>
      {workouts.length > 0 ? (
        <>
          <p>
            Last ned alle øktene som en JSON-fil, for eksempel som sikkerhetskopi. Filen er ikke kryptert, så oppbevar den
            trygt.
          </p>
          <button type="button" onClick={exportAll}>
            Eksporter økter
          </button>
        </>
      ) : (
        <p>Det finnes ingen økter å eksportere ennå.</p>
      )}
      <p role="status" className="status">
        {status}
      </p>
    </section>
  )
}
