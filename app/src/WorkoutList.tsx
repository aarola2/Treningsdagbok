import { useId, useMemo } from 'react'
import type { Workout } from './workout'
import type { LoadResult } from './workoutStorage'

const statusMessages: Record<Exclude<LoadResult['status'], 'ok'>, string> = {
  corrupt: 'Noen lagrede data kan ikke leses. Bare gyldige økter vises.',
  'unsupported-version': 'Dataene er lagret av en nyere versjon av appen og kan ikke vises. Last inn siden på nytt.',
  unavailable: 'Nettleseren tillater ikke lagring nå (for eksempel i privat modus), så lagrede økter kan ikke vises.',
}

// Opprettes én gang; Intl-formatering er dyrt å lage per rad når det er 5 000 rader.
const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function formatDate(dato: string): string {
  return dateFormat.format(new Date(`${dato}T00:00:00Z`))
}

// Nyeste dato først; ved lik dato kommer den som er lagret sist (sist registrert) først.
function sortNewestFirst(workouts: Workout[]): Workout[] {
  return workouts
    .map((workout, index) => ({ workout, index }))
    .sort((a, b) => b.workout.dato.localeCompare(a.workout.dato) || b.index - a.index)
    .map(({ workout }) => workout)
}

export function WorkoutList({ list }: { list: LoadResult }) {
  const headingId = useId()
  const sorted = useMemo(() => sortNewestFirst(list.workouts), [list.workouts])

  return (
    <section>
      <h2 id={headingId}>Mine økter</h2>
      {list.status !== 'ok' && <p className="form-error">{statusMessages[list.status]}</p>}
      {list.status === 'ok' && sorted.length === 0 && (
        <p>Du har ingen lagrede økter ennå. Registrer den første økten i skjemaet over.</p>
      )}
      {sorted.length > 0 && (
        <table aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Type</th>
              <th scope="col">Varighet</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((workout) => (
              <tr key={workout.id}>
                <td>
                  <time dateTime={workout.dato}>{formatDate(workout.dato)}</time>
                </td>
                <td>{workout.type}</td>
                <td>{workout.varighet} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
