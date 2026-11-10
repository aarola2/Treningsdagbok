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

  describe('slett alle data', () => {
    async function deleteAll(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Slett alle data' }))
      const dialog = screen.getByRole('dialog', { name: 'Slette alle data?' })
      await user.click(within(dialog).getByRole('button', { name: 'Slett alle data' }))
    }

    it('tømmer listen, viser tomtilstand og flytter fokus til meldingen', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
      const user = userEvent.setup()
      render(<App />)
      await deleteAll(user)

      expect(screen.queryByRole('table', { name: 'Mine økter' })).not.toBeInTheDocument()
      expect(screen.getByText(/Du har ingen lagrede økter ennå/)).toBeInTheDocument()
      expect(screen.getByText('Det finnes ingen økter å eksportere ennå.')).toBeInTheDocument()
      expect(screen.getByText('Alle data er slettet.')).toHaveFocus()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('avslutter en pågående redigering og tømmer skjemaet', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Rediger «Lagret» 1. nov. 2026' }))
      expect(screen.getByRole('heading', { level: 2, name: 'Rediger økt' })).toBeInTheDocument()
      await deleteAll(user)

      expect(screen.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeInTheDocument()
      expect(screen.getByLabelText('Type')).toHaveValue('')
    })

    it.each([
      ['ødelagte data', '{ikke json', 'De lagrede dataene kan ikke leses, så ingen økter kan vises.'],
      [
        'ukjent versjon',
        JSON.stringify({ versjon: 99, okter: [] }),
        'Dataene er lagret av en nyere versjon av appen og kan ikke vises. Last inn siden på nytt.',
      ],
    ])('tilbyr sletting og fjerner %s', async (_, raw, message) => {
      localStorage.setItem(STORAGE_KEY, raw)
      const user = userEvent.setup()
      render(<App />)
      expect(screen.getByText(message)).toBeInTheDocument()
      await deleteAll(user)

      expect(screen.queryByText(message)).not.toBeInTheDocument()
      expect(screen.getByText(/Du har ingen lagrede økter ennå/)).toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('viser det som faktisk ligger igjen når slettingen feiler', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
      const user = userEvent.setup()
      render(<App />)
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('Feil', 'UnknownError')
      })
      await deleteAll(user)

      expect(screen.getByRole('alert')).toHaveTextContent('Nettleseren tillot ikke sletting nå.')
      expect(typesInList()).toEqual(['Lagret'])
      expect(screen.queryByText('Alle data er slettet.')).not.toBeInTheDocument()
    })

    it('leser listen på nytt etter feil, så økter slettet før feilen forsvinner fra listen', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [stored] }))
      const user = userEvent.setup()
      render(<App />)
      // Første nøkkel fjernes, så kaster nettleseren på neste.
      localStorage.setItem('Treningsdagbok:v1:zz', 'x')
      const original = Storage.prototype.removeItem.bind(localStorage)
      let calls = 0
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
        calls += 1
        if (calls === 2) throw new DOMException('Feil', 'UnknownError')
        original(key)
      })
      await deleteAll(user)

      // jsdom gir nøklene i innsettingsrekkefølge: øktene ble fjernet, den andre nøkkelen står igjen.
      expect(Object.keys(localStorage)).toEqual(['Treningsdagbok:v1:zz'])
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByRole('table', { name: 'Mine økter' })).not.toBeInTheDocument()
      expect(screen.getByText(/Du har ingen lagrede økter ennå/)).toBeInTheDocument()
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
