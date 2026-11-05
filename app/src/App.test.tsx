import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { STORAGE_KEY } from './workoutStorage'

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

const stored = { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-01', type: 'Lagret', varighet: 20 }

function typesInList() {
  return within(screen.getByRole('table', { name: 'Mine økter' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.querySelector('.workout-type')?.textContent)
}

async function register(type: string, varighet: string) {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Type'))
  await user.type(screen.getByLabelText('Type'), type)
  await user.clear(screen.getByLabelText('Varighet (minutter)'))
  await user.type(screen.getByLabelText('Varighet (minutter)'), varighet)
  await user.click(screen.getByRole('button', { name: 'Lagre økt' }))
  return user
}

describe('App', () => {
  it('viser overskriften', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Treningsdagbok' })).toBeInTheDocument()
  })

  it('viser lagrede økter ved oppstart', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
    render(<App />)
    expect(typesInList()).toEqual(['Lagret'])
  })

  it('viser en ny økt i listen uten omlasting', async () => {
    render(<App />)
    expect(screen.getByText(/Du har ingen lagrede økter ennå/)).toBeInTheDocument()
    await register('Løping', '45')
    expect(typesInList()).toEqual(['Løping'])
    expect(screen.queryByText(/Du har ingen lagrede økter ennå/)).not.toBeInTheDocument()
  })

  it('fjerner meldingen om ødelagte data når forkasting er bekreftet', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored, 'tull'] }))
    render(<App />)
    expect(screen.getByText('Noen lagrede data kan ikke leses. Bare gyldige økter vises.')).toBeInTheDocument()
    const user = await register('Løping', '45')
    await user.click(screen.getByRole('button', { name: 'Fjern ødelagte data og lagre' }))
    expect(screen.queryByText('Noen lagrede data kan ikke leses. Bare gyldige økter vises.')).not.toBeInTheDocument()
    expect(typesInList()).toEqual(['Løping', 'Lagret'])
  })

  it('beholder listen uendret når lagringen feiler', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
    render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    await register('Løping', '45')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(typesInList()).toEqual(['Lagret'])
  })

  describe('redigering', () => {
    const other = { id: '00000000-0000-4000-8000-000000000002', dato: '2026-10-01', type: 'Annen', varighet: 30 }

    beforeEach(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored, other] }))
    })

    it('Rediger fyller skjemaet med økten og flytter fokus til Dato', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      expect(screen.getByRole('heading', { level: 2, name: 'Rediger økt' })).toBeInTheDocument()
      expect(screen.getByLabelText('Dato')).toHaveValue('2026-11-01')
      expect(screen.getByLabelText('Type')).toHaveValue('Lagret')
      expect(screen.getByLabelText('Varighet (minutter)')).toHaveValue(20)
      expect(screen.getByLabelText('Dato')).toHaveFocus()
    })

    it('Lagre endringer oppdaterer listen uten omlasting og flytter fokus til en melding', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      await user.clear(screen.getByLabelText('Type'))
      await user.type(screen.getByLabelText('Type'), 'Endret')
      await user.click(screen.getByRole('button', { name: 'Lagre endringer' }))

      expect(typesInList()).toEqual(['Endret', 'Annen'])
      expect(screen.getByText('«Endret» er oppdatert.')).toHaveFocus()
      expect(screen.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeInTheDocument()
      expect(screen.getByLabelText('Type')).toHaveValue('')
    })

    it('Rediger på samme økt igjen fyller feltene på nytt og flytter fokus til Dato', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      await user.clear(screen.getByLabelText('Type'))
      await user.type(screen.getByLabelText('Type'), 'Halvferdig')
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      expect(screen.getByLabelText('Type')).toHaveValue('Lagret')
      expect(screen.getByLabelText('Dato')).toHaveFocus()
    })

    it('Avbryt redigering endrer ingenting og gir fokus tilbake til Rediger-knappen', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Annen» 1. okt. 2026' }))
      await user.clear(screen.getByLabelText('Type'))
      await user.type(screen.getByLabelText('Type'), 'Ikke lagret')
      await user.click(screen.getByRole('button', { name: 'Avbryt redigering' }))

      expect(typesInList()).toEqual(['Lagret', 'Annen'])
      expect(screen.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Rediger «Annen» 1. okt. 2026' })).toHaveFocus()
    })

    it('sletting oppdaterer listen og avslutter redigering av samme økt', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      await user.click(screen.getByRole('button', { name: 'Slett «Lagret» 1. nov. 2026' }))
      await user.click(screen.getByRole('button', { name: 'Slett økten' }))
      expect(typesInList()).toEqual(['Annen'])
      expect(screen.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeInTheDocument()
    })
  })

  it('eksporterer øktene som vises, også en nylig lagret økt', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    URL.createObjectURL = () => 'blob:test/1'
    URL.revokeObjectURL = () => undefined
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    try {
      render(<App />)
      const user = await register('Løping', '45')
      await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
      const exportSection = screen.getByRole('heading', { level: 2, name: 'Eksport' }).closest('section') as HTMLElement
      await waitFor(() => {
        expect(within(exportSection).getByRole('status')).toHaveTextContent(
          'Eksporterte 2 økter til treningsdagbok-2026-11-05.json.',
        )
      })
    } finally {
      for (const [name, descriptor] of [
        ['createObjectURL', originalCreate],
        ['revokeObjectURL', originalRevoke],
      ] as const) {
        if (descriptor) Object.defineProperty(URL, name, descriptor)
        else Reflect.deleteProperty(URL, name)
      }
    }
  })
})
