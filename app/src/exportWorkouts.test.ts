import { describe, expect, it, vi } from 'vitest'
import { buildExport } from './exportWorkouts'

const workouts = [
  { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-04', type: '<img src=x onerror=alert(1)>', varighet: 45 },
  { id: '00000000-0000-4000-8000-000000000002', dato: '2026-11-05', type: 'Løping 🏃', varighet: 1440 },
]

describe('buildExport', () => {
  it('lager filnavn med lokal dato og JSON med versjon, eksporttidspunkt og alle økter', () => {
    const now = new Date(2026, 10, 5, 23, 30)
    const { filename, json } = buildExport(workouts, now)
    expect(filename).toBe('treningsdagbok-2026-11-05.json')
    expect(JSON.parse(json)).toEqual({ versjon: 1, eksportert: now.toISOString(), okter: workouts })
  })

  it('bruker lokal dato i filnavnet også når den er en annen enn UTC-datoen', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    try {
      const now = new Date(Date.UTC(2026, 10, 5, 12))
      const { filename, json } = buildExport(workouts, now)
      expect(filename).toBe('treningsdagbok-2026-11-06.json')
      expect((JSON.parse(json) as { eksportert: string }).eksportert).toBe('2026-11-05T12:00:00.000Z')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('bevarer feltene nøyaktig, også HTML-innhold og Unicode som tekst', () => {
    const parsed = JSON.parse(buildExport(workouts, new Date(2026, 0, 2)).json) as { okter: unknown[] }
    expect(parsed.okter).toEqual(workouts)
    expect(Object.keys(parsed.okter[0] as object)).toEqual(['id', 'dato', 'type', 'varighet'])
  })

  it('beholder lagret rekkefølge', () => {
    const parsed = JSON.parse(buildExport([...workouts].reverse(), new Date()).json) as { okter: { id: string }[] }
    expect(parsed.okter.map((w) => w.id)).toEqual([workouts[1]?.id, workouts[0]?.id])
  })

  it('formaterer JSON lesbart med innrykk', () => {
    expect(buildExport(workouts, new Date()).json).toContain('\n  "versjon": 1,\n')
  })

  it('gir gyldig JSON med tom liste', () => {
    expect(JSON.parse(buildExport([], new Date(2026, 0, 1)).json)).toMatchObject({ versjon: 1, okter: [] })
  })
})
