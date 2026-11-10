import { act, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAllSection } from './DeleteAllSection'
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

const workout = { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-01', type: 'Løping', varighet: 20 }
const otherKeys = { 'annen-app:x': '1', 'Treningsdagbok2:x': '2', 'treningsdagbok:v1:x': '3', '': '4' }

function snapshot() {
  return Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter: [workout] }))
  localStorage.setItem('Treningsdagbok:v2:x', 'fremtidig')
  for (const [key, value] of Object.entries(otherKeys)) localStorage.setItem(key, value)
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// Som App: listen tømmes i samme oppdatering som onDeleted.
function setup(initiallyEmpty = false) {
  const onDeleted = vi.fn()
  const onFailed = vi.fn()
  const user = userEvent.setup()
  let setEmpty: (empty: boolean) => void = () => undefined
  function Harness() {
    const [empty, setEmptyState] = useState(initiallyEmpty)
    setEmpty = setEmptyState
    return (
      <DeleteAllSection
        empty={empty}
        onDeleted={() => {
          onDeleted()
          setEmptyState(true)
        }}
        onFailed={onFailed}
      />
    )
  }
  render(<Harness />)
  return {
    user,
    onDeleted,
    onFailed,
    setEmpty: (empty: boolean) => {
      act(() => {
        setEmpty(empty)
      })
    },
  }
}

function dialog() {
  return screen.getByRole('dialog', { name: 'Slette alle data?' })
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Slett alle data' }))
  return dialog()
}

describe('DeleteAllSection', () => {
  it('har overskrift, forklaring og knapp', () => {
    setup()
    expect(screen.getByRole('heading', { level: 2, name: 'Slett alle data' })).toBeInTheDocument()
    expect(screen.getByText(/Fjern alle økter som er lagret i denne nettleseren/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slett alle data' })).toBeInTheDocument()
  })

  it('åpner en dialog med konsekvenstekst og råd om å eksportere først, med fokus på Avbryt', async () => {
    const { user, onDeleted } = setup()
    const opened = await openDialog(user)
    expect(opened).toHaveAccessibleDescription(/Dette kan ikke angres\./)
    expect(opened).toHaveAccessibleDescription(/Eksporter øktene først hvis du vil ta vare på dem\./)
    expect(opened).toHaveAccessibleDescription(/Filer du allerede har eksportert, slettes ikke\./)
    expect(opened).toHaveAccessibleDescription(/Lukk appen i andre faner først/)
    expect(within(opened).getByRole('button', { name: 'Avbryt' })).toHaveFocus()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('Avbryt endrer ingenting og gir fokus tilbake til knappen', async () => {
    const before = snapshot()
    const { user, onDeleted, onFailed } = setup()
    const opened = await openDialog(user)
    await user.click(within(opened).getByRole('button', { name: 'Avbryt' }))
    expect(opened).not.toHaveAttribute('open')
    expect(snapshot()).toEqual(before)
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Slett alle data' })).toHaveFocus()
  })

  it('Escape endrer ingenting og gir fokus tilbake til knappen', async () => {
    const before = snapshot()
    const { user, onDeleted } = setup()
    const opened = await openDialog(user)
    opened.dispatchEvent(new Event('cancel', { cancelable: true }))
    await vi.waitFor(() => {
      expect(opened).not.toHaveAttribute('open')
    })
    expect(snapshot()).toEqual(before)
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Slett alle data' })).toHaveFocus()
  })

  it('Bekreft fjerner alle nøkler med appens prefiks og ingen andre, og flytter fokus til en melding', async () => {
    const { user, onDeleted, onFailed } = setup()
    const opened = await openDialog(user)
    await user.click(within(opened).getByRole('button', { name: 'Slett alle data' }))

    expect(snapshot()).toEqual(otherKeys)
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
    expect(opened).not.toHaveAttribute('open')
    expect(screen.getByText('Alle data er slettet.')).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fjerner meldingen om vellykket sletting når listen får innhold, og viser den ikke igjen senere', async () => {
    const { user, setEmpty } = setup()
    await user.click(within(await openDialog(user)).getByRole('button', { name: 'Slett alle data' }))
    expect(screen.getByText('Alle data er slettet.')).toBeInTheDocument()
    setEmpty(false)
    expect(screen.queryByText('Alle data er slettet.')).not.toBeInTheDocument()
    setEmpty(true)
    expect(screen.queryByText('Alle data er slettet.')).not.toBeInTheDocument()
  })

  it('beholder feilvarselet selv om listen har innhold', async () => {
    const { user } = setup()
    const opened = await openDialog(user)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blokkert', 'SecurityError')
    })
    await user.click(within(opened).getByRole('button', { name: 'Slett alle data' }))
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it.each([
    ['ugyldig JSON', '{ikke json'],
    ['ukjent versjon', JSON.stringify({ versjon: 2, okter: [] })],
    ['blanding av gyldige og ugyldige økter', JSON.stringify({ versjon: 1, okter: [workout, 'tull', { id: 1 }] })],
  ])('sletter også %s', async (_, raw) => {
    localStorage.setItem(STORAGE_KEY, raw)
    const { user, onDeleted } = setup(true)
    await user.click(within(await openDialog(user)).getByRole('button', { name: 'Slett alle data' }))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('viser varsel og ingen suksessmelding når lagringen er utilgjengelig', async () => {
    const { user, onDeleted, onFailed } = setup(true)
    const opened = await openDialog(user)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blokkert', 'SecurityError')
    })
    await user.click(within(opened).getByRole('button', { name: 'Slett alle data' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nettleseren tillot ikke sletting nå. Last inn siden på nytt og prøv igjen.',
    )
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.queryByText('Alle data er slettet.')).not.toBeInTheDocument()
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('melder feil når slettingen stopper halvveis, uten å påstå at ingenting ble slettet', async () => {
    localStorage.clear()
    localStorage.setItem('Treningsdagbok:v1:a', '1')
    localStorage.setItem('Treningsdagbok:v1:b', '2')
    const { user, onDeleted, onFailed } = setup(true)
    const opened = await openDialog(user)
    const original = Storage.prototype.removeItem.bind(localStorage)
    let calls = 0
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      calls += 1
      if (calls === 2) throw new DOMException('Feil', 'UnknownError')
      original(key)
    })
    await user.click(within(opened).getByRole('button', { name: 'Slett alle data' }))

    expect(Object.keys(localStorage)).toHaveLength(1)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/ingenting|ikke slettet/)
    expect(screen.queryByText('Alle data er slettet.')).not.toBeInTheDocument()
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('kan prøves igjen etter feil, og en ny åpning fjerner det gamle varselet', async () => {
    const { user, onDeleted } = setup(true)
    const opened = await openDialog(user)
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blokkert', 'SecurityError')
    })
    await user.click(within(opened).getByRole('button', { name: 'Slett alle data' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    spy.mockRestore()
    await openDialog(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Slett alle data' }))
    expect(screen.getByText('Alle data er slettet.')).toHaveFocus()
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  describe('innrammet visning', () => {
    it('viser ikke knappen når appen vises i en annen side', () => {
      vi.spyOn(window, 'self', 'get').mockReturnValue({} as Window & typeof globalThis)
      setup()
      expect(screen.queryByRole('button', { name: 'Slett alle data' })).not.toBeInTheDocument()
      expect(
        screen.getByText('Sletting er bare tilgjengelig når appen åpnes direkte, ikke inne i en annen side.'),
      ).toBeInTheDocument()
    })

    it('viser ikke knappen når sjekken kaster (fail-closed)', () => {
      vi.spyOn(window, 'self', 'get').mockImplementation(() => {
        throw new DOMException('Blokkert', 'SecurityError')
      })
      setup()
      expect(screen.queryByRole('button', { name: 'Slett alle data' })).not.toBeInTheDocument()
      expect(screen.getByText(/Sletting er bare tilgjengelig når appen åpnes direkte/)).toBeInTheDocument()
    })

    it('viser knappen og ikke forklaringen når appen åpnes direkte', () => {
      setup()
      expect(screen.getByRole('button', { name: 'Slett alle data' })).toBeInTheDocument()
      expect(screen.queryByText(/Sletting er bare tilgjengelig/)).not.toBeInTheDocument()
    })
  })
})
