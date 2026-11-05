import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import type { Workout } from './workout'
import {
  MAX_RAW_LENGTH,
  MAX_WORKOUTS,
  STORAGE_KEY,
  addWorkout,
  deleteAllData,
  deleteWorkout,
  loadWorkouts,
  updateWorkout,
} from './workoutStorage'

const today = '2026-11-05'
const input = { dato: '2026-11-04', type: 'Løping', varighet: 45 }

function workout(n: number, overrides: Partial<Workout> = {}): Workout {
  const suffix = n.toString(16).padStart(12, '0')
  return { id: `00000000-0000-4000-8000-${suffix}`, dato: '2026-11-01', type: `Økt ${String(n)}`, varighet: 30, ...overrides }
}

function store(value: unknown) {
  localStorage.setItem(STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

function stored(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw)
}

const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const
let consoleSpies: MockInstance[] = []

beforeEach(() => {
  localStorage.clear()
  consoleSpies = consoleMethods.map((method) => vi.spyOn(console, method))
})

afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('loadWorkouts', () => {
  it('gir tom liste når ingenting er lagret', () => {
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [] })
  })

  it('leser gyldige økter', () => {
    store({ versjon: 1, okter: [workout(1), workout(2)] })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [workout(1), workout(2)] })
  })

  it.each([
    ['ødelagt JSON', '{'],
    ['null', 'null'],
    ['liste på rotnivå', '[]'],
    ['tall på rotnivå', '42'],
    ['versjon mangler', { okter: [] }],
    ['versjon som streng', { versjon: '1', okter: [] }],
    ['versjon 0', { versjon: 0, okter: [] }],
    ['versjon mellom 0 og 1', { versjon: 0.5, okter: [] }],
    ['negativ versjon', { versjon: -1, okter: [] }],
    ['okter mangler', { versjon: 1 }],
    ['okter er ikke liste', { versjon: 1, okter: {} }],
    ['for stor råstreng', 'x'.repeat(MAX_RAW_LENGTH + 1)],
  ])('gir corrupt uten økter ved %s', (_, value) => {
    store(value)
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [] })
  })

  it('gir corrupt ved ukjent rotnøkkel, men beholder gyldige økter', () => {
    store({ versjon: 1, okter: [workout(1)], ekstra: true })
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [workout(1)] })
  })

  it('gir corrupt ved __proto__-nøkkel på rotnivå', () => {
    store('{"__proto__":{"versjon":1},"okter":[]}')
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [] })
  })

  it('bruker ikke arvet versjon fra et forurenset Object.prototype', () => {
    Object.defineProperty(Object.prototype, 'versjon', { value: 1, configurable: true })
    try {
      store({ okter: [workout(1)] })
      expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [] })
    } finally {
      Reflect.deleteProperty(Object.prototype, 'versjon')
    }
  })

  it('gir corrupt uten å tolke gyldig JSON som er større enn grensen', () => {
    store(JSON.stringify({ versjon: 1, okter: [workout(1)] }) + ' '.repeat(MAX_RAW_LENGTH))
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [] })
  })

  it('filtrerer bort ugyldige økter og returnerer de gyldige med corrupt', () => {
    store({ versjon: 1, okter: [workout(1), { ...workout(2), notat: 'x' }, 'tull', workout(3, { varighet: 0 }), workout(4)] })
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [workout(1), workout(4)] })
  })

  it('beholder den første ved duplisert id', () => {
    store({ versjon: 1, okter: [workout(1), workout(1, { type: 'Kopi' })] })
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: [workout(1)] })
  })

  it('gir corrupt og bare de første 5 000 ved for mange lagrede økter', () => {
    const many = Array.from({ length: MAX_WORKOUTS + 1 }, (_, n) => workout(n))
    store({ versjon: 1, okter: many })
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: many.slice(0, MAX_WORKOUTS) })
  })

  it('beholder 5 000 gyldige selv om ugyldige og duplikater ligger først', () => {
    const valid = Array.from({ length: MAX_WORKOUTS }, (_, n) => workout(n))
    store({ versjon: 1, okter: ['tull', valid[0], ...valid] })
    expect(loadWorkouts()).toEqual({ status: 'corrupt', workouts: valid })
  })

  it.each([
    ['2', 2],
    ['2.5', 2.5],
    ['1e400 (uendelig)', '1e400'],
  ])('gir unsupported-version for nyere versjon %s', (_, versjon) => {
    store(`{"versjon":${String(versjon)},"okter":[],"nyttFelt":true}`)
    expect(loadWorkouts()).toEqual({ status: 'unsupported-version', workouts: [] })
  })

  it('gir unavailable når localStorage ikke kan nås', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Sperret', 'SecurityError')
    })
    expect(loadWorkouts()).toEqual({ status: 'unavailable', workouts: [] })
  })

  it('gir unavailable når lesing kaster', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Lesefeil')
    })
    expect(loadWorkouts()).toEqual({ status: 'unavailable', workouts: [] })
  })
})

describe('addWorkout', () => {
  it('lagrer en ny økt med skjemaversjon og unik id', () => {
    const result = addWorkout(input, { today })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.workouts).toHaveLength(1)
    expect(result.workouts[0]).toMatchObject(input)
    expect(result.workouts[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(stored()).toEqual({ versjon: 1, okter: result.workouts })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: result.workouts })
  })

  it('lagrer trimmet type', () => {
    const result = addWorkout({ ...input, type: '  Sykling ' }, { today })
    expect(result.ok && result.workouts[0]?.type).toBe('Sykling')
  })

  it('avviser ugyldig input med feltfeil og lagrer ingenting', () => {
    expect(addWorkout({ ...input, varighet: 1441 }, { today })).toEqual({
      ok: false,
      error: 'invalid',
      errors: { varighet: 'Oppgi varighet som et helt antall minutter fra 1 til 1440.' },
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('avviser dato frem i tid ved lagring', () => {
    expect(addWorkout({ ...input, dato: '2026-11-06' }, { today })).toMatchObject({ ok: false, error: 'invalid' })
  })

  it('bruker dagens lokale dato når today ikke er oppgitt', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 5, 12))
    try {
      expect(addWorkout({ ...input, dato: '2026-11-05' }).ok).toBe(true)
      expect(addWorkout({ ...input, dato: '2026-11-06' }).ok).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lagrer økt nr. 5 000 og avviser nr. 5 001', () => {
    store({ versjon: 1, okter: Array.from({ length: MAX_WORKOUTS - 1 }, (_, n) => workout(n)) })
    const result = addWorkout(input, { today })
    expect(result.ok && result.workouts).toHaveLength(MAX_WORKOUTS)
    const before = localStorage.getItem(STORAGE_KEY)
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'limit' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('får plass til 5 000 økter med maksimal feltlengde (verste tilfelle)', () => {
    const worst = Array.from({ length: MAX_WORKOUTS - 1 }, (_, n) => workout(n, { type: '🏃'.repeat(50), varighet: 1440 }))
    store({ versjon: 1, okter: worst })
    const result = addWorkout({ ...input, type: '🏃'.repeat(50), varighet: 1440 }, { today })
    expect(result.ok).toBe(true)
    const rawLength = localStorage.getItem(STORAGE_KEY)?.length ?? 0
    expect(rawLength).toBeLessThan(MAX_RAW_LENGTH)
    expect(rawLength).toBeGreaterThan(900_000)
    expect(loadWorkouts().status).toBe('ok')
  })

  it('gir nye, unike id-er også etter sletting', () => {
    const ids = new Set<string>()
    for (let n = 0; n < 20; n++) {
      const added = addWorkout(input, { today })
      if (!added.ok) throw new Error('forventet lagring')
      const last = added.workouts.at(-1)
      if (!last) throw new Error('forventet økt')
      expect(ids.has(last.id)).toBe(false)
      ids.add(last.id)
      if (n % 2 === 0) deleteWorkout(last.id)
    }
  })

  it('tar med endringer gjort i en annen fane mellom kall', () => {
    addWorkout(input, { today })
    const other = loadWorkouts()
    store({ versjon: 1, okter: [...other.workouts, workout(99)] })
    const result = addWorkout({ ...input, type: 'Svømming' }, { today })
    expect(result.ok && result.workouts.map((w) => w.type)).toEqual(['Løping', 'Økt 99', 'Svømming'])
  })

  it('gir quota ved QuotaExceededError og beholder lagrede data', () => {
    store({ versjon: 1, okter: [workout(1)] })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'quota' })
    setItem.mockRestore()
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [workout(1)] })
  })

  it('gir quota ved Firefox-varianten av kvotefeil', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'NS_ERROR_DOM_QUOTA_REACHED')
    })
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'quota' })
  })

  it('gir quota når den faktiske lagringskvoten er brukt opp av et annet prosjekt', () => {
    let key = 0
    for (let chunk = 1 << 22; chunk >= 1; chunk >>= 1) {
      try {
        for (;;) localStorage.setItem(`Annet:${String(key++)}`, 'x'.repeat(chunk))
      } catch {
        // Fyll med mindre biter til kvoten er nådd.
      }
    }
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'quota' })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('gir unavailable ved vanlig feil med kvotenavn (ikke DOMException)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' })
    })
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'unavailable' })
  })

  it('gir unavailable ved annen skrivefeil', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Skrivefeil')
    })
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'unavailable' })
  })

  it('gir unavailable når localStorage ikke kan nås', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Sperret', 'SecurityError')
    })
    expect(addWorkout(input, { today })).toEqual({ ok: false, error: 'unavailable' })
  })
})

describe('skrivesperre ved ødelagte data', () => {
  const corrupt = JSON.stringify({ versjon: 1, okter: [workout(1), { ...workout(2), notat: 'x' }] })

  it.each([
    ['legg til', () => addWorkout(input, { today })],
    ['oppdater', () => updateWorkout(workout(1).id, input, { today })],
    ['slett én', () => deleteWorkout(workout(1).id)],
  ])('%s nektes og rådata er uendret', (_, write) => {
    store(corrupt)
    expect(write()).toEqual({ ok: false, error: 'corrupt' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
  })

  it('lagrer gyldige økter pluss endringen når forkasting er bekreftet', () => {
    store(corrupt)
    const result = addWorkout(input, { today, discardInvalid: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.workouts).toHaveLength(2)
    expect(result.workouts[0]).toEqual(workout(1))
    expect(result.workouts[1]).toMatchObject(input)
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: result.workouts })
  })

  it('oppdatering med bekreftet forkasting lagrer gyldige økter med endringen', () => {
    store(corrupt)
    const expected = [{ ...workout(1), ...input, type: 'Yoga' }]
    expect(updateWorkout(workout(1).id, { ...input, type: 'Yoga' }, { today, discardInvalid: true })).toEqual({
      ok: true,
      workouts: expected,
    })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: expected })
  })

  it('sletting med bekreftet forkasting lagrer de gjenværende gyldige øktene', () => {
    store(JSON.stringify({ versjon: 1, okter: [workout(1), workout(3), 'tull'] }))
    expect(deleteWorkout(workout(1).id, { discardInvalid: true })).toEqual({ ok: true, workouts: [workout(3)] })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [workout(3)] })
  })

  it('forkasting med ødelagt JSON gir bare den nye økten', () => {
    store('{')
    const result = addWorkout(input, { today, discardInvalid: true })
    expect(result.ok && result.workouts).toHaveLength(1)
  })

  it.each([
    ['uten forkasting', {}],
    ['med forkasting', { discardInvalid: true }],
  ])('nyere versjon gir unsupported-version %s og rådata er uendret', (_, options) => {
    const newer = JSON.stringify({ versjon: 2, okter: [] })
    store(newer)
    expect(addWorkout(input, { today, ...options })).toEqual({ ok: false, error: 'unsupported-version' })
    expect(updateWorkout(workout(1).id, input, { today, ...options })).toEqual({ ok: false, error: 'unsupported-version' })
    expect(deleteWorkout(workout(1).id, options)).toEqual({ ok: false, error: 'unsupported-version' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(newer)
  })
})

describe('updateWorkout', () => {
  it('oppdaterer feltene og beholder id og rekkefølge', () => {
    store({ versjon: 1, okter: [workout(1), workout(2)] })
    const result = updateWorkout(workout(1).id, { dato: '2026-10-01', type: ' Yoga ', varighet: 60 }, { today })
    const expected = [{ ...workout(1), dato: '2026-10-01', type: 'Yoga', varighet: 60 }, workout(2)]
    expect(result).toEqual({ ok: true, workouts: expected })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: expected })
  })

  it('avviser ugyldig input og lagrer ingenting', () => {
    store({ versjon: 1, okter: [workout(1)] })
    expect(updateWorkout(workout(1).id, { ...input, type: '' }, { today })).toEqual({
      ok: false,
      error: 'invalid',
      errors: { type: 'Oppgi type trening.' },
    })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [workout(1)] })
  })

  it('gir not-found for ukjent id', () => {
    store({ versjon: 1, okter: [workout(1)] })
    expect(updateWorkout(workout(2).id, input, { today })).toEqual({ ok: false, error: 'not-found' })
  })
})

describe('deleteWorkout', () => {
  it('sletter bare den valgte økten', () => {
    store({ versjon: 1, okter: [workout(1), workout(2), workout(3)] })
    expect(deleteWorkout(workout(2).id)).toEqual({ ok: true, workouts: [workout(1), workout(3)] })
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [workout(1), workout(3)] })
  })

  it('gir not-found for ukjent id', () => {
    store({ versjon: 1, okter: [workout(1)] })
    expect(deleteWorkout(workout(2).id)).toEqual({ ok: false, error: 'not-found' })
  })

  it('kan slette den siste økten', () => {
    store({ versjon: 1, okter: [workout(1)] })
    expect(deleteWorkout(workout(1).id)).toEqual({ ok: true, workouts: [] })
    expect(stored()).toEqual({ versjon: 1, okter: [] })
  })
})

describe('deleteAllData', () => {
  it('fjerner alle appens nøkler, også andre versjoner, og beholder fremmede nøkler', () => {
    store({ versjon: 1, okter: [workout(1)] })
    localStorage.setItem('Treningsdagbok:v1:annet', 'x')
    localStorage.setItem('Treningsdagbok:v2:okter', 'y')
    localStorage.setItem('Annet:prosjekt', 'z')
    localStorage.setItem('Treningsdagbokfoo', 'w')
    expect(deleteAllData()).toEqual({ ok: true })
    expect(Object.keys(localStorage).sort()).toEqual(['Annet:prosjekt', 'Treningsdagbokfoo'])
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [] })
  })

  it('fjerner mange nøkler uten å hoppe over noen', () => {
    for (let n = 0; n < 10; n++) localStorage.setItem(`Treningsdagbok:v1:n${String(n)}`, 'x')
    expect(deleteAllData()).toEqual({ ok: true })
    expect(localStorage).toHaveLength(0)
  })

  it.each([
    ['ødelagte data', '{'],
    ['nyere versjon', JSON.stringify({ versjon: 2, okter: [] })],
  ])('virker ved %s', (_, value) => {
    store(value)
    expect(deleteAllData()).toEqual({ ok: true })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('gir unavailable når localStorage ikke kan nås', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Sperret', 'SecurityError')
    })
    expect(deleteAllData()).toEqual({ ok: false, error: 'unavailable' })
  })

  it('gir unavailable når sletting kaster', () => {
    store({ versjon: 1, okter: [] })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Slettefeil')
    })
    expect(deleteAllData()).toEqual({ ok: false, error: 'unavailable' })
  })
})
