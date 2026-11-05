// Feltnavnene er norske fordi de er en del av det lagrede og eksporterte formatet.
export interface Workout {
  id: string
  dato: string
  type: string
  varighet: number
}

export type WorkoutInput = Omit<Workout, 'id'>
export type WorkoutField = keyof WorkoutInput
export type FieldErrors = Partial<Record<WorkoutField, string>>

export type InputValidation = { ok: true; value: WorkoutInput } | { ok: false; errors: FieldErrors }

export const MIN_DATE = '1900-01-01'
export const MAX_TYPE_LENGTH = 50
export const MAX_DURATION_MINUTES = 1440

const datePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const storedKeys = ['dato', 'id', 'type', 'varighet']

export function todayLocal(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// `today` er null ved lesing: lagrede økter forkastes ikke fordi klokke eller tidssone avviker.
function dateError(value: unknown, today: string | null): string | undefined {
  if (typeof value !== 'string' || !isCalendarDate(value)) return 'Oppgi en gyldig dato.'
  if (value < MIN_DATE) return 'Datoen kan ikke være før 1. januar 1900.'
  if (today !== null && value > today) return 'Datoen kan ikke være frem i tid.'
  return undefined
}

// C0/C1-kontrolltegn og bidi-overstyring/-isolering kan brukes til visuell forfalskning.
function isForbiddenCodePoint(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)
}

function typeError(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return 'Oppgi type trening.'
  // Lengden telles i kodepunkter, slik at en emoji teller som ett tegn.
  let length = 0
  let forbidden = false
  for (const char of value.trim()) {
    length++
    if (isForbiddenCodePoint(char.codePointAt(0) ?? 0)) forbidden = true
  }
  if (length > MAX_TYPE_LENGTH) return `Typen kan ha maks ${String(MAX_TYPE_LENGTH)} tegn.`
  if (forbidden) return 'Typen inneholder tegn som ikke er tillatt.'
  return undefined
}

function durationError(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_DURATION_MINUTES) {
    return `Oppgi varighet som et helt antall minutter fra 1 til ${String(MAX_DURATION_MINUTES)}.`
  }
  return undefined
}

export function validateWorkoutInput(
  input: { dato: unknown; type: unknown; varighet: unknown },
  today: string,
): InputValidation {
  const errors: FieldErrors = {}
  const dato = dateError(input.dato, today)
  const type = typeError(input.type)
  const varighet = durationError(input.varighet)
  if (dato) errors.dato = dato
  if (type) errors.type = type
  if (varighet) errors.varighet = varighet
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { dato: input.dato as string, type: (input.type as string).trim(), varighet: input.varighet as number },
  }
}

// Lagrede data er ubetrodde: bare egne felt med nøyaktig forventet nøkkelsett godtas.
export function validateStoredWorkout(value: unknown): Workout | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const keys = Object.keys(value).sort()
  if (keys.length !== storedKeys.length || keys.some((key, index) => key !== storedKeys[index])) return null
  const { id, dato, type, varighet } = value as Record<string, unknown>
  if (typeof id !== 'string' || !idPattern.test(id)) return null
  if (dateError(dato, null) || typeError(type) || durationError(varighet)) return null
  if (typeof type !== 'string' || type !== type.trim()) return null
  return { id, dato: dato as string, type, varighet: varighet as number }
}
