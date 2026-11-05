import { useState } from 'react'
import { buildExport } from './exportWorkouts'
import type { Workout } from './workout'

const countFormat = new Intl.NumberFormat('nb-NO')

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

  function exportAll() {
    const { filename, json } = buildExport(workouts, new Date())
    download(filename, json)
    const count = workouts.length === 1 ? '1 økt' : `${countFormat.format(workouts.length)} økter`
    setStatus(`Eksporterte ${count} til ${filename}.`)
  }

  return (
    <section>
      <h2>Eksport</h2>
      {workouts.length > 0 ? (
        <>
          <p>Last ned alle øktene som en JSON-fil, for eksempel som sikkerhetskopi.</p>
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
