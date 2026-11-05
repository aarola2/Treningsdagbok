import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { corruptDialogText } from './corruptDialog'
import type { Workout } from './workout'
import { deleteWorkout, loadWorkouts } from './workoutStorage'
import type { LoadResult, WriteResult } from './workoutStorage'

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

type DeleteError = Exclude<Extract<WriteResult, { ok: false }>['error'], 'corrupt'>

const deleteErrorMessages: Record<DeleteError, string> = {
  'not-found': 'Økten finnes ikke lenger, så den ble ikke slettet. Last inn siden på nytt.',
  quota: 'Lagringsplassen i nettleseren er full. Økten ble ikke slettet.',
  unavailable: 'Nettleseren tillater ikke lagring nå (for eksempel i privat modus). Økten ble ikke slettet.',
  'unsupported-version': 'Dataene er lagret av en nyere versjon av appen. Last inn siden på nytt. Økten ble ikke slettet.',
  invalid: 'Økten ble ikke slettet.',
  limit: 'Økten ble ikke slettet.',
}

// Hvor fokus skal etter en handling i skjemaet; seq gjør at samme mål kan bes om flere ganger.
export interface FocusTarget {
  id: string
  on: 'row' | 'edit'
  seq: number
}

interface Notice {
  text: string
  error: boolean
  key: number
}

interface WorkoutListProps {
  list: LoadResult
  onEdit?: (workout: Workout) => void
  onDeleted?: (workouts: Workout[], deletedId: string) => void
  focusTarget?: FocusTarget | null
}

// Én side holder visningen rask også med 5 000 økter (og på trege maskiner), og gir skjermlesere en håndterlig tabell.
export const PAGE_SIZE = 100

const countFormat = new Intl.NumberFormat('nb-NO')

// Opprettes én gang; Intl-formatering er dyrt å lage per rad.
const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function formatDate(dato: string): string {
  return dateFormat.format(new Date(`${dato}T00:00:00Z`))
}

function describe(workout: Workout): string {
  return `«${workout.type}» ${formatDate(workout.dato)}`
}

// Nyeste dato først; ved lik dato kommer den som er lagret sist (sist registrert) først.
function sortNewestFirst(workouts: Workout[]): Workout[] {
  return workouts
    .map((workout, index) => ({ workout, index }))
    // ÅÅÅÅ-MM-DD sorteres riktig som tekst.
    .sort((a, b) => (a.workout.dato < b.workout.dato ? 1 : a.workout.dato > b.workout.dato ? -1 : b.index - a.index))
    .map(({ workout }) => workout)
}

export function WorkoutList({ list, onEdit, onDeleted, focusTarget }: WorkoutListProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const [deleting, setDeleting] = useState<Workout | null>(null)
  // Antall gyldige økter som beholdes hvis brukeren bekrefter forkasting før sletting; null når lukket.
  const [corruptKept, setCorruptKept] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeKey = useRef(0)
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

  // Etter lagring eller avbrutt redigering: fokus til raden eller dens Rediger-knapp, eller overskriften hvis
  // økten ikke vises på denne siden.
  useEffect(() => {
    if (!focusTarget) return
    const row = bodyRef.current?.querySelector<HTMLElement>(`tr[data-workout-id="${CSS.escape(focusTarget.id)}"]`)
    const target = focusTarget.on === 'edit' ? row?.querySelector<HTMLElement>('[data-action="edit"]') : row
    ;(target ?? headingRef.current)?.focus()
  }, [focusTarget])

  function showNotice(text: string, error: boolean) {
    noticeKey.current += 1
    // Lukker også dialogene i samme oppdatering, før fokus flyttes.
    flushSync(() => {
      setDeleting(null)
      setCorruptKept(null)
      setNotice({ text, error, key: noticeKey.current })
    })
    // Fokus til meldingen: den leses opp, og fokus forsvinner ikke med den slettede raden.
    noticeRef.current?.focus()
  }

  function confirmDelete(workout: Workout, discardInvalid: boolean) {
    const result = deleteWorkout(workout.id, { discardInvalid })
    if (result.ok) {
      onDeleted?.(result.workouts, workout.id)
      showNotice(`${describe(workout)} er slettet.`, false)
      return
    }
    if (result.error === 'corrupt') {
      setCorruptKept(loadWorkouts().workouts.length)
      return
    }
    showNotice(deleteErrorMessages[result.error], true)
  }
  const message = statusMessage(list)
  const corruptText = corruptDialogText(corruptKept ?? 1, 'delete')

  return (
    <section>
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>
        Mine økter
      </h2>
      {notice && (
        <p
          key={notice.key}
          ref={noticeRef}
          tabIndex={-1}
          role={notice.error ? 'alert' : undefined}
          className={notice.error ? 'form-error' : 'notice'}
        >
          {notice.text}
        </p>
      )}
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
              <tr key={workout.id} tabIndex={-1} data-workout-id={workout.id}>
                <td>
                  <time dateTime={workout.dato}>{formatDate(workout.dato)}</time>
                </td>
                <td>
                  <span className="workout-type">{workout.type}</span>
                  {/* Handlingene ligger i type-cellen: en egen kolonne ville klemt typen ved 320 px. */}
                  <span className="row-actions">
                    <button
                      type="button"
                      className="secondary small"
                      data-action="edit"
                      aria-label={`Rediger ${describe(workout)}`}
                      onClick={() => onEdit?.(workout)}
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      aria-label={`Slett ${describe(workout)}`}
                      onClick={() => {
                        setDeleting(workout)
                      }}
                    >
                      Slett
                    </button>
                  </span>
                </td>
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
      <ConfirmDialog
        open={deleting !== null && corruptKept === null}
        title="Slette økten?"
        confirmLabel="Slett økten"
        onConfirm={() => {
          if (deleting) confirmDelete(deleting, false)
        }}
        onCancel={() => {
          setDeleting(null)
        }}
      >
        {deleting && `${describe(deleting)}, ${String(deleting.varighet)} min, slettes. Dette kan ikke angres.`}
      </ConfirmDialog>
      <ConfirmDialog
        open={corruptKept !== null}
        title={corruptText.title}
        confirmLabel={corruptText.confirmLabel}
        onConfirm={() => {
          if (deleting) confirmDelete(deleting, true)
        }}
        onCancel={() => {
          setCorruptKept(null)
          setDeleting(null)
        }}
      >
        {corruptText.text}
      </ConfirmDialog>
    </section>
  )
}
