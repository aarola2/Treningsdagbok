import { useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Workout } from './workout'
import type { LoadResult } from './workoutStorage'

const statusMessages: Record<Exclude<LoadResult['status'], 'ok' | 'corrupt'>, string> = {
  'unsupported-version': 'Dataene er lagret av en nyere versjon av appen og kan ikke vises. Last inn siden på nytt.',
  unavailable: 'Nettleseren tillater ikke lagring nå (for eksempel i privat modus), så lagrede økter kan ikke vises.',
}

function statusMessage(list: LoadResult): string | null {
  if (list.status === 'ok') return null
  if (list.status === 'corrupt') {
    return list.workouts.length > 0
      ? 'Noen lagrede data kan ikke leses. Bare gyldige økter vises.'
      : 'De lagrede dataene kan ikke leses, så ingen økter kan vises.'
  }
  return statusMessages[list.status]
}

// Én side holder visningen rask også med 5 000 økter (og på trege maskiner), og gir skjermlesere en håndterlig tabell.
export const PAGE_SIZE = 100

const countFormat = new Intl.NumberFormat('nb-NO')

// Opprettes én gang; Intl-formatering er dyrt å lage per rad.
const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function formatDate(dato: string): string {
  return dateFormat.format(new Date(`${dato}T00:00:00Z`))
}

// Nyeste dato først; ved lik dato kommer den som er lagret sist (sist registrert) først.
function sortNewestFirst(workouts: Workout[]): Workout[] {
  return workouts
    .map((workout, index) => ({ workout, index }))
    // ÅÅÅÅ-MM-DD sorteres riktig som tekst.
    .sort((a, b) => (a.workout.dato < b.workout.dato ? 1 : a.workout.dato > b.workout.dato ? -1 : b.index - a.index))
    .map(({ workout }) => workout)
}

export function WorkoutList({ list }: { list: LoadResult }) {
  const headingId = useId()
  const sorted = useMemo(() => sortNewestFirst(list.workouts), [list.workouts])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const shown = sorted.slice(0, visibleCount)
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  // Fokus til første nye rad: brukeren havner ved det nye innholdet, og fokus går ikke tapt når knappen
  // forsvinner etter siste side.
  function showMore() {
    const firstNew = shown.length
    flushSync(() => {
      setVisibleCount((count) => count + PAGE_SIZE)
    })
    bodyRef.current?.rows[firstNew]?.focus()
  }
  const message = statusMessage(list)

  return (
    <section>
      <h2 id={headingId}>Mine økter</h2>
      {message && <p className="form-error">{message}</p>}
      {list.status === 'ok' && sorted.length === 0 && (
        <p>Du har ingen lagrede økter ennå. Registrer den første økten i skjemaet «Registrer økt».</p>
      )}
      {sorted.length > 0 && (
        <table className="workout-table" aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Type</th>
              <th scope="col">Varighet</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {shown.map((workout) => (
              <tr key={workout.id} tabIndex={-1}>
                <td>
                  <time dateTime={workout.dato}>{formatDate(workout.dato)}</time>
                </td>
                <td>{workout.type}</td>
                {/* Hardt mellomrom holder tall og enhet sammen uten å hindre bryting ellers. */}
                <td>{workout.varighet}&nbsp;min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sorted.length > PAGE_SIZE && (
        <div className="list-more">
          <p role="status">
            Viser {countFormat.format(shown.length)} av {countFormat.format(sorted.length)} økter.
          </p>
          {shown.length < sorted.length && (
            <button
              type="button"
              className="secondary"
              onClick={showMore}
            >
              Vis flere økter
            </button>
          )}
        </div>
      )}
    </section>
  )
}
