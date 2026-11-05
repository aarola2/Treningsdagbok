import { useEffect, useId, useRef, useState } from 'react'
import type { InputHTMLAttributes, SubmitEvent } from 'react'
import { flushSync } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { corruptDialogText } from './corruptDialog'
import { todayLocal, validateWorkoutInput } from './workout'
import type { FieldErrors, Workout, WorkoutField } from './workout'
import { MAX_WORKOUTS, addWorkout, loadWorkouts, updateWorkout } from './workoutStorage'
import type { WriteResult } from './workoutStorage'

type StorageError = Exclude<Extract<WriteResult, { ok: false }>['error'], 'invalid' | 'corrupt'>

const storageErrorMessages: Record<StorageError, string> = {
  quota: 'Lagringsplassen i nettleseren er full.',
  unavailable: 'Nettleseren tillater ikke lagring nå (for eksempel i privat modus).',
  limit: 'Du har nådd grensen på 5 000 økter.',
  'unsupported-version': 'Dataene er lagret av en nyere versjon av appen. Last inn siden på nytt.',
  'not-found': 'Økten finnes ikke lenger (den kan være slettet i en annen fane).',
}

function storageErrorText(error: StorageError, editing: boolean): string {
  return `${storageErrorMessages[error]} ${editing ? 'Endringen' : 'Økten'} ble ikke lagret.`
}

function valuesFor(editing: Workout | null): Record<WorkoutField, string> {
  return editing
    ? { dato: editing.dato, type: editing.type, varighet: String(editing.varighet) }
    : { dato: todayLocal(), type: '', varighet: '' }
}

interface WorkoutFormProps {
  onSaved?: (workouts: Workout[]) => void
  // Økten som redigeres; null eller utelatt betyr registrering av ny økt.
  editing?: Workout | null
  onCancelEdit?: () => void
}

const fieldOrder: WorkoutField[] = ['dato', 'type', 'varighet']

// Ny nøkkel for hver feilmelding gir en ny DOM-node, slik at skjermlesere leser opp også en gjentatt, lik melding.
// Statusmeldingen trenger ikke nøkkel: den tømmes alltid (feltendring) før neste lagring.
interface Message {
  text: string
  key: number
}

export function WorkoutForm({ onSaved, editing = null, onCancelEdit }: WorkoutFormProps) {
  const today = todayLocal()
  const [values, setValues] = useState(() => valuesFor(editing))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState<Message | null>(null)
  // Bytte av økt (eller tilbake til registrering) fyller feltene på nytt. Statusmeldingen beholdes når
  // redigeringen avsluttes etter lagring, så bekreftelsen fortsatt leses opp.
  const [shownEditing, setShownEditing] = useState(editing)
  if (editing !== shownEditing) {
    setShownEditing(editing)
    setValues(valuesFor(editing))
    setErrors({})
    setStorageError(null)
    if (editing) setStatus('')
  }
  // Antall gyldige økter som beholdes hvis brukeren bekrefter; null når dialogen er lukket.
  const [keptCount, setKeptCount] = useState<number | null>(null)
  const messageKey = useRef(0)
  const headingId = useId()
  const idPrefix = useId()
  const datoRef = useRef<HTMLInputElement>(null)
  const inputRefs = {
    dato: datoRef,
    type: useRef<HTMLInputElement>(null),
    varighet: useRef<HTMLInputElement>(null),
  }

  // Rediger: fokus til første felt.
  useEffect(() => {
    if (editing) datoRef.current?.focus()
  }, [editing])

  function showFieldErrors(fieldErrors: FieldErrors) {
    // Feilene må være i DOM-en før fokus flyttes, slik at skjermlesere leser dem.
    flushSync(() => {
      setErrors(fieldErrors)
      setStorageError(null)
    })
    const first = fieldOrder.find((field) => fieldErrors[field])
    if (first) inputRefs[first].current?.focus()
  }

  function showStorageError(error: StorageError) {
    messageKey.current += 1
    setStorageError({ text: storageErrorText(error, editing !== null), key: messageKey.current })
  }

  // Kjøres bare når statusmeldingen er tom (se handleSubmit), så den trenger ikke tømmes ved feil.
  function save(discardInvalid: boolean) {
    // Tomt felt blir 0 og avvises av valideringen.
    const input = { ...values, varighet: Number(values.varighet) }
    // Valider før lagring, slik at feltfeil vises før brukeren blir spurt om ødelagte data.
    const validation = validateWorkoutInput(input, todayLocal())
    if (!validation.ok) {
      showFieldErrors(validation.errors)
      return
    }
    const result = editing
      ? updateWorkout(editing.id, input, { discardInvalid })
      : addWorkout(input, { discardInvalid })
    if (result.ok) {
      // Ved redigering fyller App skjemaet på nytt når redigeringen avsluttes.
      setValues((current) => ({ ...current, type: '', varighet: '' }))
      setErrors({})
      setStorageError(null)
      setStatus(`«${validation.value.type}» er ${editing ? 'oppdatert' : 'lagret'}.`)
      onSaved?.(result.workouts)
      return
    }
    if (result.error === 'invalid') {
      showFieldErrors(result.errors)
      return
    }
    setErrors({})
    if (result.error === 'corrupt') {
      const kept = loadWorkouts().workouts.length
      // Ved grensen kan den nye økten ikke lagres selv etter forkasting, så dialogen ville lovet for mye.
      if (!editing && kept >= MAX_WORKOUTS) {
        showStorageError('limit')
        return
      }
      setStorageError(null)
      setKeptCount(kept)
      return
    }
    showStorageError(result.error)
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    // Statusmeldingen står til et felt endres; en ny innsending før det (dobbeltklikk, Enter) er en gjentakelse.
    if (status) return
    save(false)
  }

  function field(name: WorkoutField, label: string, inputProps: InputHTMLAttributes<HTMLInputElement>) {
    const error = errors[name]
    const inputId = `${idPrefix}-${name}`
    const errorId = `${inputId}-feil`
    return (
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          ref={inputRefs[name]}
          value={values[name]}
          onChange={(event) => {
            const { value } = event.target
            setValues((current) => ({ ...current, [name]: value }))
            setStatus('')
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {error && (
          <p id={errorId} className="field-error">
            {error}
          </p>
        )}
      </div>
    )
  }

  const dialog = corruptDialogText(keptCount ?? 0, editing ? 'update' : 'add')

  return (
    <section>
      <h2 id={headingId}>{editing ? 'Rediger økt' : 'Registrer økt'}</h2>
      <form aria-labelledby={headingId} noValidate onSubmit={handleSubmit}>
        {field('dato', 'Dato', { type: 'date', max: today })}
        {field('type', 'Type', { type: 'text', autoComplete: 'off' })}
        {field('varighet', 'Varighet (minutter)', { type: 'number', inputMode: 'numeric', min: 1, max: 1440, step: 1 })}
        {storageError && (
          <p key={storageError.key} role="alert" className="form-error">
            {storageError.text}
          </p>
        )}
        <div className="form-actions">
          <button type="submit">{editing ? 'Lagre endringer' : 'Lagre økt'}</button>
          {editing && (
            <button type="button" className="secondary" onClick={onCancelEdit}>
              Avbryt redigering
            </button>
          )}
        </div>
        <p role="status" className="status">
          {status}
        </p>
      </form>
      <ConfirmDialog
        open={keptCount !== null}
        title={dialog.title}
        confirmLabel={dialog.confirmLabel}
        onConfirm={() => {
          setKeptCount(null)
          save(true)
        }}
        onCancel={() => {
          setKeptCount(null)
        }}
      >
        {dialog.text}
      </ConfirmDialog>
    </section>
  )
}
