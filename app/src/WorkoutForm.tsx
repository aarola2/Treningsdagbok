import { useId, useRef, useState } from 'react'
import type { InputHTMLAttributes, SubmitEvent } from 'react'
import { flushSync } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { todayLocal, validateWorkoutInput } from './workout'
import type { FieldErrors, Workout, WorkoutField } from './workout'
import { MAX_WORKOUTS, addWorkout, loadWorkouts } from './workoutStorage'
import type { WriteResult } from './workoutStorage'

type StorageError = Exclude<Extract<WriteResult, { ok: false }>['error'], 'invalid' | 'corrupt'>

const storageErrorMessages: Record<StorageError, string> = {
  quota: 'Lagringsplassen i nettleseren er full. Økten ble ikke lagret.',
  unavailable: 'Nettleseren tillater ikke lagring nå (for eksempel i privat modus). Økten ble ikke lagret.',
  limit: 'Du har nådd grensen på 5 000 økter. Økten ble ikke lagret.',
  'unsupported-version': 'Dataene er lagret av en nyere versjon av appen. Last inn siden på nytt. Økten ble ikke lagret.',
  'not-found': 'Økten ble ikke funnet. Økten ble ikke lagret.',
}

const fieldOrder: WorkoutField[] = ['dato', 'type', 'varighet']

// Ny nøkkel for hver feilmelding gir en ny DOM-node, slik at skjermlesere leser opp også en gjentatt, lik melding.
// Statusmeldingen trenger ikke nøkkel: den tømmes alltid (feltendring) før neste lagring.
interface Message {
  text: string
  key: number
}

function corruptDialogText(kept: number) {
  if (kept === 0) {
    return {
      title: 'De lagrede dataene kan ikke leses',
      confirmLabel: 'Fjern alle lagrede data og lagre',
      text: 'Ingen av de lagrede øktene kan leses. Hvis du fortsetter, fjernes alle lagrede data, og bare den nye økten lagres.',
    }
  }
  const keptText = kept === 1 ? '1 gyldig økt' : `${String(kept)} gyldige økter`
  return {
    title: 'Noen lagrede data er ødelagte',
    confirmLabel: 'Fjern ødelagte data og lagre',
    text: `Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. ${keptText} beholdes, og den nye økten lagres.`,
  }
}

export function WorkoutForm({ onSaved }: { onSaved?: (workouts: Workout[]) => void }) {
  const today = todayLocal()
  const [values, setValues] = useState<Record<WorkoutField, string>>({ dato: today, type: '', varighet: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState<Message | null>(null)
  // Antall gyldige økter som beholdes hvis brukeren bekrefter; null når dialogen er lukket.
  const [keptCount, setKeptCount] = useState<number | null>(null)
  const messageKey = useRef(0)
  const headingId = useId()
  const idPrefix = useId()
  const inputRefs = {
    dato: useRef<HTMLInputElement>(null),
    type: useRef<HTMLInputElement>(null),
    varighet: useRef<HTMLInputElement>(null),
  }

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
    setStorageError({ text: storageErrorMessages[error], key: messageKey.current })
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
    const result = addWorkout(input, { discardInvalid })
    if (result.ok) {
      setValues((current) => ({ ...current, type: '', varighet: '' }))
      setErrors({})
      setStorageError(null)
      setStatus(`«${validation.value.type}» er lagret.`)
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
      if (kept >= MAX_WORKOUTS) {
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

  const dialog = corruptDialogText(keptCount ?? 0)

  return (
    <section>
      <h2 id={headingId}>Registrer økt</h2>
      <form aria-labelledby={headingId} noValidate onSubmit={handleSubmit}>
        {field('dato', 'Dato', { type: 'date', max: today })}
        {field('type', 'Type', { type: 'text', autoComplete: 'off' })}
        {field('varighet', 'Varighet (minutter)', { type: 'number', inputMode: 'numeric', min: 1, max: 1440, step: 1 })}
        {storageError && (
          <p key={storageError.key} role="alert" className="form-error">
            {storageError.text}
          </p>
        )}
        <button type="submit">Lagre økt</button>
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
