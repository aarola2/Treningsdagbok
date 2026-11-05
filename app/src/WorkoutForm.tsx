import { useId, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { flushSync } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { todayLocal, validateWorkoutInput } from './workout'
import type { FieldErrors, WorkoutField } from './workout'
import { addWorkout } from './workoutStorage'
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

export function WorkoutForm() {
  const today = todayLocal()
  const [values, setValues] = useState<Record<WorkoutField, string>>({ dato: today, type: '', varighet: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const headingId = useId()
  const errorIdPrefix = useId()
  const inputRefs = {
    dato: useRef<HTMLInputElement>(null),
    type: useRef<HTMLInputElement>(null),
    varighet: useRef<HTMLInputElement>(null),
  }

  function showFieldErrors(fieldErrors: FieldErrors) {
    // Feilene må være i DOM-en før fokus flyttes, slik at skjermlesere leser dem.
    flushSync(() => {
      setStatus('')
      setErrors(fieldErrors)
      setStorageError('')
    })
    const first = fieldOrder.find((field) => fieldErrors[field])
    if (first) inputRefs[first].current?.focus()
  }

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
      setStorageError('')
      setStatus(`«${validation.value.type}» er lagret.`)
      return
    }
    if (result.error === 'invalid') {
      showFieldErrors(result.errors)
      return
    }
    setStatus('')
    setErrors({})
    if (result.error === 'corrupt') {
      setStorageError('')
      setConfirmOpen(true)
      return
    }
    setStorageError(storageErrorMessages[result.error])
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    save(false)
  }

  function field(name: WorkoutField, label: string, inputProps: Record<string, string | number>) {
    const error = errors[name]
    const errorId = `${errorIdPrefix}-${name}`
    return (
      <div className="field">
        <label htmlFor={`${errorIdPrefix}-${name}-input`}>{label}</label>
        <input
          id={`${errorIdPrefix}-${name}-input`}
          ref={inputRefs[name]}
          value={values[name]}
          onChange={(event) => {
            const { value } = event.target
            setValues((current) => ({ ...current, [name]: value }))
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

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Registrer økt</h2>
      <form aria-labelledby={headingId} noValidate onSubmit={handleSubmit}>
        {field('dato', 'Dato', { type: 'date', max: today })}
        {field('type', 'Type', { type: 'text', autoComplete: 'off' })}
        {field('varighet', 'Varighet (minutter)', { type: 'number', inputMode: 'numeric', min: 1, max: 1440, step: 1 })}
        {storageError && (
          <p role="alert" className="form-error">
            {storageError}
          </p>
        )}
        <button type="submit">Lagre økt</button>
        <p role="status" className="status">
          {status}
        </p>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Noen lagrede data er ødelagte"
        confirmLabel="Fjern ødelagte data og lagre"
        onConfirm={() => {
          setConfirmOpen(false)
          save(true)
        }}
        onCancel={() => {
          setConfirmOpen(false)
        }}
      >
        Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. Gyldige økter
        beholdes, og den nye økten lagres.
      </ConfirmDialog>
    </section>
  )
}
