import { describe, expect, it } from 'vitest'
import { todayLocal, validateStoredWorkout, validateWorkoutInput } from './workout'

const today = '2026-11-05'
const valid = { dato: '2026-11-05', type: 'Løping', varighet: 45 }
const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

function errorsFor(input: Record<string, unknown>) {
  const result = validateWorkoutInput({ ...valid, ...input }, today)
  return result.ok ? {} : result.errors
}

describe('validateWorkoutInput', () => {
  it('godtar en gyldig økt og trimmer typen', () => {
    expect(validateWorkoutInput({ ...valid, type: '  Styrke  ' }, today)).toEqual({
      ok: true,
      value: { dato: '2026-11-05', type: 'Styrke', varighet: 45 },
    })
  })

  it.each([
    ['i dag', '2026-11-05'],
    ['tidligste dato', '1900-01-01'],
    ['skuddårsdag', '2024-02-29'],
  ])('godtar dato %s', (_, dato) => {
    expect(errorsFor({ dato })).toEqual({})
  })

  it.each([
    ['i morgen', '2026-11-06', 'Datoen kan ikke være frem i tid.'],
    ['før 1900', '1899-12-31', 'Datoen kan ikke være før 1. januar 1900.'],
    ['30. februar', '2026-02-30', 'Oppgi en gyldig dato.'],
    ['29. februar i vanlig år', '2025-02-29', 'Oppgi en gyldig dato.'],
    ['måned 13', '2026-13-01', 'Oppgi en gyldig dato.'],
    ['dag 0', '2026-11-00', 'Oppgi en gyldig dato.'],
    ['uten nuller', '2026-1-5', 'Oppgi en gyldig dato.'],
    ['med klokkeslett', '2026-11-05T10:00', 'Oppgi en gyldig dato.'],
    ['ikke-ASCII-sifre', '２０２６-11-05', 'Oppgi en gyldig dato.'],
    ['tekst', 'abc', 'Oppgi en gyldig dato.'],
    ['tom', '', 'Oppgi en gyldig dato.'],
    ['tall', 20261105, 'Oppgi en gyldig dato.'],
    ['null', null, 'Oppgi en gyldig dato.'],
  ])('avviser dato %s', (_, dato, message) => {
    expect(errorsFor({ dato })).toEqual({ dato: message })
  })

  it.each([
    ['1 tegn', 'A'],
    ['50 tegn', 'x'.repeat(50)],
    ['50 tegn etter trimming', ` ${'x'.repeat(50)} `],
    ['50 emoji (kodepunkter)', '🏃'.repeat(50)],
    ['norske bokstaver', 'Æøå-trening'],
    ['tegn rett utenfor de forbudte områdene', 'a~b c d e⁥f⁪g퟿hi\u{10000}'],
  ])('godtar type med %s', (_, type) => {
    expect(errorsFor({ type })).toEqual({})
  })

  it.each([
    ['tom', '', 'Oppgi type trening.'],
    ['bare mellomrom', '   ', 'Oppgi type trening.'],
    ['51 tegn', 'x'.repeat(51), 'Typen kan ha maks 50 tegn.'],
    ['51 emoji', '🏃'.repeat(51), 'Typen kan ha maks 50 tegn.'],
    ['linjeskift', 'Løp\ning', 'Typen inneholder tegn som ikke er tillatt.'],
    ['nulltegn', 'Løp\u0000', 'Typen inneholder tegn som ikke er tillatt.'],
    ['siste C0-kontrolltegn', 'Løp\u001Fing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['DEL', 'Løp\u007Fing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['C1-kontrolltegn', 'Løp\u0085', 'Typen inneholder tegn som ikke er tillatt.'],
    ['siste C1-kontrolltegn', 'Løp\u009Fing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['første bidi-overstyring', 'Løp‪ing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['siste bidi-overstyring', 'Løp‮ing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['første bidi-isolering', 'Løp⁦ing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['siste bidi-isolering', 'Løp⁩ing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['ensomt høyt surrogat', 'Løp\uD800ing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['ensomt lavt surrogat', 'Løp\uDFFFing', 'Typen inneholder tegn som ikke er tillatt.'],
    ['tall', 42, 'Oppgi type trening.'],
    ['null', null, 'Oppgi type trening.'],
  ])('avviser type %s', (_, type, message) => {
    expect(errorsFor({ type })).toEqual({ type: message })
  })

  it.each([1, 45, 1440])('godtar varighet %s', (varighet) => {
    expect(errorsFor({ varighet })).toEqual({})
  })

  it.each([0, -1, 1441, 45.5, Number.NaN, Number.POSITIVE_INFINITY, '45', null])(
    'avviser varighet %s',
    (varighet) => {
      expect(errorsFor({ varighet })).toEqual({
        varighet: 'Oppgi varighet som et helt antall minutter fra 1 til 1440.',
      })
    },
  )

  it('rapporterer feil for alle felt samtidig', () => {
    expect(validateWorkoutInput({ dato: '', type: '', varighet: 0 }, today)).toEqual({
      ok: false,
      errors: {
        dato: 'Oppgi en gyldig dato.',
        type: 'Oppgi type trening.',
        varighet: 'Oppgi varighet som et helt antall minutter fra 1 til 1440.',
      },
    })
  })
})

describe('validateStoredWorkout', () => {
  const stored = { id, ...valid }

  it('godtar en gyldig lagret økt og lager et nytt objekt', () => {
    const result = validateStoredWorkout(stored)
    expect(result).toEqual(stored)
    expect(result).not.toBe(stored)
  })

  it('godtar dato frem i tid ved lesing (tidssone eller klokke kan avvike)', () => {
    expect(validateStoredWorkout({ ...stored, dato: '2999-01-01' })).toEqual({ ...stored, dato: '2999-01-01' })
  })

  it.each([
    ['ukjent felt', { ...stored, notat: 'x' }],
    ['manglende felt', { id, dato: valid.dato, type: valid.type }],
    ['__proto__-felt', JSON.parse(`{"id":"${id}","dato":"2026-11-05","type":"Løping","varighet":45,"__proto__":{"x":1}}`) as unknown],
    ['ugyldig id', { ...stored, id: 'ikke-en-uuid' }],
    ['tegn foran id', { ...stored, id: `x${id}` }],
    ['tegn bak id', { ...stored, id: `${id}x` }],
    ['store bokstaver i id', { ...stored, id: id.toUpperCase() }],
    ['store bokstaver i siste del av id', { ...stored, id: id.slice(0, 24) + id.slice(24).toUpperCase() }],
    ['type med ensomt surrogat', { ...stored, type: '\uD800' }],
    ['id som tall', { ...stored, id: 1 }],
    ['utrimmet type', { ...stored, type: ' Løping' }],
    ['type med kontrolltegn', { ...stored, type: 'a\u0007' }],
    ['dato før 1900', { ...stored, dato: '1899-12-31' }],
    ['ugyldig dato', { ...stored, dato: '2026-02-30' }],
    ['varighet 0', { ...stored, varighet: 0 }],
    ['liste', [stored]],
    ['null', null],
    ['streng', 'økt'],
  ])('avviser %s', (_, value) => {
    expect(validateStoredWorkout(value)).toBeNull()
  })

  it('ignorerer arvede egenskaper', () => {
    const inherited = Object.create({ varighet: 45 }) as Record<string, unknown>
    Object.assign(inherited, { id, dato: valid.dato, type: valid.type })
    expect(validateStoredWorkout(inherited)).toBeNull()
  })
})

describe('todayLocal', () => {
  it('formaterer lokal dato som ÅÅÅÅ-MM-DD', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayLocal(new Date(2026, 10, 15, 0, 0))).toBe('2026-11-15')
  })
})
