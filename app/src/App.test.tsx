import { render, screen, within } from '@testing-library/react'
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
  localStorage.clear()
})

const stored = { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-01', type: 'Lagret', varighet: 20 }

function typesInList() {
  return within(screen.getByRole('table', { name: 'Mine økter' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent)
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
    vi.restoreAllMocks()
  })
})
