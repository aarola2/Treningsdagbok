import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkoutForm } from './WorkoutForm'
import * as workoutStorage from './workoutStorage'
import { MAX_WORKOUTS, STORAGE_KEY, loadWorkouts } from './workoutStorage'

// jsdom mangler showModal/close; ekte modal oppførsel testes i e2e.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 12))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

function setup() {
  const user = userEvent.setup()
  render(<WorkoutForm />)
  const fields = {
    dato: screen.getByLabelText('Dato'),
    type: screen.getByLabelText('Type'),
    varighet: screen.getByLabelText('Varighet (minutter)'),
  }
  async function fill(values: Partial<Record<keyof typeof fields, string>>) {
    for (const [name, value] of Object.entries(values) as [keyof typeof fields, string][]) {
      await user.clear(fields[name])
      if (value !== '') await user.type(fields[name], value)
    }
  }
  async function submit() {
    await user.click(screen.getByRole('button', { name: 'Lagre økt' }))
  }
  return { user, fields, fill, submit }
}

function storedId(n: number) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

describe('WorkoutForm', () => {
  it('har feltene med synlig ledetekst og dagens dato forhåndsutfylt', () => {
    const { fields } = setup()
    expect(screen.getByRole('form', { name: 'Registrer økt' })).toBeInTheDocument()
    expect(fields.dato).toHaveValue('2026-11-05')
    expect(fields.dato).toHaveAttribute('max', '2026-11-05')
    expect(fields.type).toHaveValue('')
    expect(fields.varighet).toHaveValue(null)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('lagrer en gyldig økt, viser statusmelding og tømmer type og varighet', async () => {
    const { fields, fill, submit } = setup()
    await fill({ dato: '2026-11-04', type: 'Løping', varighet: '45' })
    await submit()

    const { status, workouts } = loadWorkouts()
    expect(status).toBe('ok')
    expect(workouts).toEqual([{ id: expect.any(String) as string, dato: '2026-11-04', type: 'Løping', varighet: 45 }])
    expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
    expect(fields.type).toHaveValue('')
    expect(fields.varighet).toHaveValue(null)
    expect(fields.dato).toHaveValue('2026-11-04')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sender oppdatert liste til onSaved bare ved vellykket lagring', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<WorkoutForm onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: 'Lagre økt' }))
    expect(onSaved).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Type'), 'Løping')
    await user.type(screen.getByLabelText('Varighet (minutter)'), '45')
    await user.click(screen.getByRole('button', { name: 'Lagre økt' }))
    expect(onSaved).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledWith(loadWorkouts().workouts)
  })

  it('lagrer med Enter i et felt', async () => {
    const { user, fields, fill } = setup()
    await fill({ type: 'Sykling', varighet: '30' })
    await user.type(fields.varighet, '{Enter}')
    expect(loadWorkouts().workouts).toHaveLength(1)
  })

  it.each([
    ['1', 1],
    ['1440', 1440],
  ])('godtar varighet %s', async (varighet, expected) => {
    const { fill, submit } = setup()
    await fill({ type: 'Yoga', varighet })
    await submit()
    expect(loadWorkouts().workouts[0]?.varighet).toBe(expected)
  })

  it('godtar type på 50 tegn', async () => {
    const { fill, submit } = setup()
    await fill({ type: 'x'.repeat(50), varighet: '10' })
    await submit()
    expect(loadWorkouts().workouts).toHaveLength(1)
  })

  it('viser feil ved feltene, flytter fokus til første feil og lagrer ingenting', async () => {
    const { fields, submit } = setup()
    await submit()

    expect(fields.dato).not.toHaveAttribute('aria-invalid')
    expect(fields.type).toHaveAttribute('aria-invalid', 'true')
    expect(fields.type).toHaveAccessibleDescription('Oppgi type trening.')
    expect(fields.varighet).toHaveAttribute('aria-invalid', 'true')
    expect(fields.varighet).toHaveAccessibleDescription('Oppgi varighet som et helt antall minutter fra 1 til 1440.')
    expect(fields.type).toHaveFocus()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('flytter fokus til dato når den er første feil', async () => {
    const { fields, fill, submit } = setup()
    await fill({ dato: '2026-11-06', type: 'Løping', varighet: '45' })
    await submit()
    expect(fields.dato).toHaveAccessibleDescription('Datoen kan ikke være frem i tid.')
    expect(fields.dato).toHaveFocus()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it.each([
    ['0', 'Oppgi varighet som et helt antall minutter fra 1 til 1440.'],
    ['1441', 'Oppgi varighet som et helt antall minutter fra 1 til 1440.'],
    ['45.5', 'Oppgi varighet som et helt antall minutter fra 1 til 1440.'],
  ])('avviser varighet %s', async (varighet, message) => {
    const { fields, fill, submit } = setup()
    await fill({ type: 'Løping', varighet })
    await submit()
    expect(fields.varighet).toHaveAccessibleDescription(message)
    expect(fields.varighet).toHaveFocus()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('avviser type på 51 tegn', async () => {
    const { fields, fill, submit } = setup()
    await fill({ type: 'x'.repeat(51), varighet: '10' })
    await submit()
    expect(fields.type).toHaveAccessibleDescription('Typen kan ha maks 50 tegn.')
  })

  it('viser feltfeil fra lagringen hvis datoen skifter mellom validering og lagring', async () => {
    vi.spyOn(workoutStorage, 'addWorkout').mockReturnValue({
      ok: false,
      error: 'invalid',
      errors: { dato: 'Datoen kan ikke være frem i tid.' },
    })
    const { fields, fill, submit } = setup()
    await fill({ type: 'Løping', varighet: '45' })
    await submit()
    expect(fields.dato).toHaveAccessibleDescription('Datoen kan ikke være frem i tid.')
    expect(fields.dato).toHaveFocus()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('fjerner feilmeldingene etter en vellykket lagring', async () => {
    const { fields, fill, submit } = setup()
    await submit()
    await fill({ type: 'Løping', varighet: '45' })
    await submit()
    expect(fields.type).not.toHaveAttribute('aria-invalid')
    expect(fields.varighet).not.toHaveAttribute('aria-invalid')
    expect(fields.type).not.toHaveAccessibleDescription()
  })

  describe('lagringsfeil', () => {
    async function submitValid() {
      const { fields, fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      return fields
    }

    function expectInputKept(fields: Awaited<ReturnType<typeof submitValid>>) {
      expect(fields.type).toHaveValue('Løping')
      expect(fields.varighet).toHaveValue(45)
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    }

    it('viser melding og beholder input ved full lagring', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      const fields = await submitValid()
      expect(screen.getByRole('alert')).toHaveTextContent('Lagringsplassen i nettleseren er full. Økten ble ikke lagret.')
      expectInputKept(fields)
    })

    it('viser melding og beholder input når lagring er utilgjengelig', async () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('Sperret', 'SecurityError')
      })
      const fields = await submitValid()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Nettleseren tillater ikke lagring nå (for eksempel i privat modus). Økten ble ikke lagret.',
      )
      expectInputKept(fields)
    })

    it('viser melding og beholder input ved økt nr. 5 001', async () => {
      const okter = Array.from({ length: MAX_WORKOUTS }, (_, n) => ({
        id: storedId(n),
        dato: '2026-11-01',
        type: 'Økt',
        varighet: 30,
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter }))
      const fields = await submitValid()
      expect(screen.getByRole('alert')).toHaveTextContent('Du har nådd grensen på 5 000 økter. Økten ble ikke lagret.')
      expectInputKept(fields)
      expect(loadWorkouts().workouts).toHaveLength(MAX_WORKOUTS)
    })

    it('viser melding og beholder input når data er fra en nyere versjon', async () => {
      const newer = JSON.stringify({ versjon: 2, okter: [] })
      localStorage.setItem(STORAGE_KEY, newer)
      const fields = await submitValid()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Dataene er lagret av en nyere versjon av appen. Last inn siden på nytt. Økten ble ikke lagret.',
      )
      expectInputKept(fields)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(newer)
    })

    it('fjerner gamle feltfeil når lagringen feiler', async () => {
      const { fields, fill, submit } = setup()
      await submit()
      expect(fields.type).toHaveAttribute('aria-invalid', 'true')

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      await fill({ type: 'Yoga', varighet: '20' })
      await submit()
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(fields.type).not.toHaveAttribute('aria-invalid')
    })

    it('lager en ny meldingsnode når samme lagringsfeil gjentas, slik at den leses opp igjen', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      const first = screen.getByRole('alert')
      await submit()
      const second = screen.getByRole('alert')
      expect(second).toHaveTextContent(first.textContent)
      expect(second).not.toBe(first)
      expect(first).not.toBeInTheDocument()
    })

    it('statusmeldingen kommer ikke tilbake når neste lagring feiler', async () => {
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      await fill({ type: 'Yoga', varighet: '20' })
      await submit()
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('fjerner feilmeldingen når neste innsending har feil i feltene', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.getByRole('alert')).toBeInTheDocument()
      await fill({ type: '' })
      await submit()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('fjerner feilmeldingen etter en vellykket lagring', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      setItem.mockRestore()
      await submit()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
    })
  })

  describe('ødelagte lagrede data', () => {
    const valid = { id: storedId(1), dato: '2026-11-01', type: 'Gammel', varighet: 20 }
    const corrupt = JSON.stringify({ versjon: 1, okter: [valid, { ...valid, id: storedId(2), notat: 'x' }] })

    async function submitWithCorruptData() {
      localStorage.setItem(STORAGE_KEY, corrupt)
      const helpers = setup()
      await helpers.fill({ type: 'Løping', varighet: '45' })
      await helpers.submit()
      return helpers
    }

    it('åpner en dialog som forklarer at ødelagte data fjernes og hvor mange økter som beholdes', async () => {
      await submitWithCorruptData()
      const dialog = screen.getByRole('dialog', { name: 'Noen lagrede data er ødelagte' })
      expect(dialog).toHaveAccessibleDescription(
        'Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. 1 gyldig økt beholdes, og den nye økten lagres.',
      )
      expect(screen.getByRole('button', { name: 'Avbryt' })).toHaveFocus()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
    })

    it('oppgir antallet i flertall når flere gyldige økter beholdes', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ versjon: 1, okter: [valid, { ...valid, id: storedId(3) }, { ...valid, id: storedId(2), notat: 'x' }] }),
      )
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/2 gyldige økter beholdes/)
    })

    it('sier tydelig at alle data fjernes når ingen økter kan leses', async () => {
      localStorage.setItem(STORAGE_KEY, '{')
      const { user, fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      const dialog = screen.getByRole('dialog', { name: 'De lagrede dataene kan ikke leses' })
      expect(dialog).toHaveAccessibleDescription(
        'Ingen av de lagrede øktene kan leses. Hvis du fortsetter, fjernes alle lagrede data, og bare den nye økten lagres.',
      )
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{')
      await user.click(screen.getByRole('button', { name: 'Fjern alle lagrede data og lagre' }))
      expect(loadWorkouts().workouts.map((workout) => workout.type)).toEqual(['Løping'])
    })

    it('viser feltfeil uten dialog når input er ugyldig, og rådata er uendret', async () => {
      localStorage.setItem(STORAGE_KEY, corrupt)
      const { fields, submit } = setup()
      await submit()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(fields.type).toHaveAttribute('aria-invalid', 'true')
      expect(fields.type).toHaveFocus()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
    })

    it('fjerner gamle feltfeil og feilmeldinger når dialogen åpnes', async () => {
      localStorage.setItem(STORAGE_KEY, corrupt)
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      })
      const { fields, fill, submit } = setup()
      await submit()
      expect(fields.type).toHaveAttribute('aria-invalid', 'true')
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(fields.type).not.toHaveAttribute('aria-invalid')

      await userEvent.click(screen.getByRole('button', { name: 'Fjern ødelagte data og lagre' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Lagringsplassen i nettleseren er full.')
      setItem.mockRestore()
      await submit()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('Avbryt endrer ingenting og beholder input', async () => {
      const { user, fields } = await submitWithCorruptData()
      await user.click(screen.getByRole('button', { name: 'Avbryt' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
      expect(fields.type).toHaveValue('Løping')
      expect(fields.varighet).toHaveValue(45)
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('Escape endrer ingenting og beholder input', async () => {
      const { fields } = await submitWithCorruptData()
      fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
      expect(fields.type).toHaveValue('Løping')
    })

    it('Bekreft lagrer gyldige økter pluss den nye', async () => {
      const { user } = await submitWithCorruptData()
      await user.click(screen.getByRole('button', { name: 'Fjern ødelagte data og lagre' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const { status, workouts } = loadWorkouts()
      expect(status).toBe('ok')
      expect(workouts).toEqual([valid, { id: expect.any(String) as string, dato: '2026-11-05', type: 'Løping', varighet: 45 }])
      expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
    })

    it('en ny innsending rett etter bekreftelsen ignoreres uten feltfeil', async () => {
      const { user, fields, submit } = await submitWithCorruptData()
      await user.click(screen.getByRole('button', { name: 'Fjern ødelagte data og lagre' }))
      await submit()
      expect(loadWorkouts().workouts).toHaveLength(2)
      expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
      expect(fields.type).not.toHaveAttribute('aria-invalid')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('viser grensefeilen direkte uten dialog når 5 000 gyldige økter allerede er lagret', async () => {
      const okter = Array.from({ length: MAX_WORKOUTS }, (_, n) => ({ ...valid, id: storedId(n + 10) }))
      const atLimit = JSON.stringify({ versjon: 1, okter: [...okter, 'tull'] })
      localStorage.setItem(STORAGE_KEY, atLimit)
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Du har nådd grensen på 5 000 økter. Økten ble ikke lagret.')
      expect(localStorage.getItem(STORAGE_KEY)).toBe(atLimit)
    })

    it('åpner dialogen når 4 999 gyldige økter beholdes', async () => {
      const okter = Array.from({ length: MAX_WORKOUTS - 1 }, (_, n) => ({ ...valid, id: storedId(n + 10) }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [...okter, 'tull'] }))
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/4999 gyldige økter beholdes/)
    })
  })

  describe('gjentatte innsendinger', () => {
    it('dobbeltklikk lagrer én gang og beholder bekreftelsen uten feltfeil', async () => {
      const { user, fields, fill } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await user.dblClick(screen.getByRole('button', { name: 'Lagre økt' }))
      expect(loadWorkouts().workouts).toHaveLength(1)
      expect(screen.getByRole('status')).toHaveTextContent('«Løping» er lagret.')
      expect(fields.type).not.toHaveAttribute('aria-invalid')
    })

    it('statusmeldingen fjernes når et felt endres, og neste innsending behandles normalt', async () => {
      const { user, fields, fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      await user.type(fields.type, 'S')
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      await submit()
      expect(fields.varighet).toHaveAttribute('aria-invalid', 'true')
    })

    it('statusområdet tømmes mellom to lagringer av samme type, slik at den andre leses opp', async () => {
      const { fill, submit } = setup()
      await fill({ type: 'Løping', varighet: '45' })
      await submit()
      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('«Løping» er lagret.')
      await fill({ type: 'Løping', varighet: '30' })
      expect(status).toBeEmptyDOMElement()
      await submit()
      expect(status).toHaveTextContent('«Løping» er lagret.')
      expect(loadWorkouts().workouts).toHaveLength(2)
    })
  })

  it('feilmeldingen er koblet til feltet allerede når fokus flyttes dit', async () => {
    const { fields, submit } = setup()
    let describedAtFocus: string | null | undefined
    fields.type.addEventListener('focus', () => {
      const id = fields.type.getAttribute('aria-describedby')
      describedAtFocus = id === null ? null : document.getElementById(id)?.textContent
    })
    await submit()
    expect(describedAtFocus).toBe('Oppgi type trening.')
  })
})
