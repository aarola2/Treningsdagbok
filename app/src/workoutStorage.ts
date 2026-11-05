import { todayLocal, validateStoredWorkout, validateWorkoutInput } from './workout'
import type { FieldErrors, Workout, WorkoutInput } from './workout'

export const STORAGE_KEY = 'Treningsdagbok:v1:okter'
const APP_KEY_PREFIX = 'Treningsdagbok:'
const SCHEMA_VERSION = 1
export const MAX_WORKOUTS = 5000
// Omtrent dobbelt så mye som 5 000 økter med maksimal feltlengde.
export const MAX_RAW_LENGTH = 2_000_000

export type LoadResult =
  | { status: 'ok' | 'corrupt'; workouts: Workout[] }
  | { status: 'unsupported-version' | 'unavailable'; workouts: [] }

export type WriteResult =
  | { ok: true; workouts: Workout[] }
  | { ok: false; error: 'invalid'; errors: FieldErrors }
  | { ok: false; error: 'corrupt' | 'unsupported-version' | 'limit' | 'not-found' | 'quota' | 'unavailable' }

export interface WriteOptions {
  // Brukeren har bekreftet at ugyldige lagrede data kan fjernes.
  discardInvalid?: boolean
  today?: string
}

type Change = { ok: true; workouts: Workout[] } | Exclude<WriteResult, { ok: true }>

function getStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parse(raw: string | null): LoadResult {
  if (raw === null) return { status: 'ok', workouts: [] }
  if (raw.length > MAX_RAW_LENGTH) return { status: 'corrupt', workouts: [] }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'corrupt', workouts: [] }
  }
  if (!isRecord(data) || !Object.hasOwn(data, 'versjon')) return { status: 'corrupt', workouts: [] }
  const { versjon, okter } = data
  if (typeof versjon === 'number' && versjon > SCHEMA_VERSION) {
    return { status: 'unsupported-version', workouts: [] }
  }
  if (versjon !== SCHEMA_VERSION || !Object.hasOwn(data, 'okter') || !Array.isArray(okter)) {
    return { status: 'corrupt', workouts: [] }
  }

  const workouts: Workout[] = []
  const ids = new Set<string>()
  let corrupt = Object.keys(data).length !== 2
  // Beholder de første 5 000 gyldige; resten regnes som ødelagt.
  for (const item of okter) {
    const workout = validateStoredWorkout(item)
    if (workout && !ids.has(workout.id) && workouts.length < MAX_WORKOUTS) {
      ids.add(workout.id)
      workouts.push(workout)
    } else {
      corrupt = true
    }
  }
  return { status: corrupt ? 'corrupt' : 'ok', workouts }
}

export function loadWorkouts(): LoadResult {
  const storage = getStorage()
  if (!storage) return { status: 'unavailable', workouts: [] }
  try {
    return parse(storage.getItem(STORAGE_KEY))
  } catch {
    return { status: 'unavailable', workouts: [] }
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

// Leser gjeldende lagring rett før endringen, slik at endringer fra andre faner blir med.
function write(change: (workouts: Workout[]) => Change, options: WriteOptions): WriteResult {
  const storage = getStorage()
  if (!storage) return { ok: false, error: 'unavailable' }
  const loaded = loadWorkouts()
  if (loaded.status === 'unavailable' || loaded.status === 'unsupported-version') {
    return { ok: false, error: loaded.status }
  }
  if (loaded.status === 'corrupt' && options.discardInvalid !== true) return { ok: false, error: 'corrupt' }

  const result = change(loaded.workouts)
  if (!result.ok) return result
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ versjon: SCHEMA_VERSION, okter: result.workouts }))
  } catch (error) {
    return { ok: false, error: isQuotaError(error) ? 'quota' : 'unavailable' }
  }
  return result
}

export function addWorkout(input: WorkoutInput, options: WriteOptions = {}): WriteResult {
  return write((workouts) => {
    const validation = validateWorkoutInput(input, options.today ?? todayLocal())
    if (!validation.ok) return { ok: false, error: 'invalid', errors: validation.errors }
    if (workouts.length >= MAX_WORKOUTS) return { ok: false, error: 'limit' }
    return { ok: true, workouts: [...workouts, { id: crypto.randomUUID(), ...validation.value }] }
  }, options)
}

export function updateWorkout(id: string, input: WorkoutInput, options: WriteOptions = {}): WriteResult {
  return write((workouts) => {
    const validation = validateWorkoutInput(input, options.today ?? todayLocal())
    if (!validation.ok) return { ok: false, error: 'invalid', errors: validation.errors }
    if (!workouts.some((workout) => workout.id === id)) return { ok: false, error: 'not-found' }
    return {
      ok: true,
      workouts: workouts.map((workout) => (workout.id === id ? { id, ...validation.value } : workout)),
    }
  }, options)
}

export function deleteWorkout(id: string, options: Pick<WriteOptions, 'discardInvalid'> = {}): WriteResult {
  return write((workouts) => {
    if (!workouts.some((workout) => workout.id === id)) return { ok: false, error: 'not-found' }
    return { ok: true, workouts: workouts.filter((workout) => workout.id !== id) }
  }, options)
}

// Virker også når lagrede data er ødelagte eller har ukjent versjon.
export function deleteAllData(): { ok: true } | { ok: false; error: 'unavailable' } {
  const storage = getStorage()
  if (!storage) return { ok: false, error: 'unavailable' }
  try {
    // Samle nøklene først: indeksene forskyves når nøkler fjernes.
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(APP_KEY_PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    return { ok: false, error: 'unavailable' }
  }
  return { ok: true }
}
