import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportSection } from './ExportSection'

const workouts = [
  { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-04', type: 'Løping', varighet: 45 },
  { id: '00000000-0000-4000-8000-000000000002', dato: '2026-11-05', type: 'Yoga', varighet: 30 },
]

let blobs: Blob[] = []
let clicked: HTMLAnchorElement[] = []
const revoke = vi.fn()
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

function restore(name: 'createObjectURL' | 'revokeObjectURL', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(URL, name, descriptor)
  else Reflect.deleteProperty(URL, name)
}

beforeEach(() => {
  blobs = []
  clicked = []
  revoke.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 12))
  // jsdom mangler createObjectURL; ekte nedlasting testes i e2e.
  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return 'blob:test/1'
  }
  URL.revokeObjectURL = revoke
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  restore('createObjectURL', originalCreate)
  restore('revokeObjectURL', originalRevoke)
})

async function expectStatus(text: string) {
  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toBe(text)
  })
}

describe('ExportSection', () => {
  it('har overskrift, forklaring og knapp', () => {
    render(<ExportSection workouts={workouts} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Eksport' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eksporter økter' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('forteller at filen ikke er kryptert', () => {
    render(<ExportSection workouts={workouts} />)
    expect(screen.getByText(/Filen er ikke kryptert, så oppbevar den trygt\./)).toBeInTheDocument()
  })

  it('laster ned en JSON-fil med alle øktene og melder fra', async () => {
    const user = userEvent.setup()
    render(<ExportSection workouts={workouts} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))

    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.type).toBe('application/json')
    expect(JSON.parse(await (blobs[0] as Blob).text())).toMatchObject({ versjon: 1, okter: workouts })
    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.download).toBe('treningsdagbok-2026-11-05.json')
    expect(clicked[0]?.getAttribute('href')).toBe('blob:test/1')
    expect(clicked[0]?.isConnected).toBe(false)
    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith('blob:test/1')
    })
    await expectStatus('Eksporterte 2 økter til treningsdagbok-2026-11-05.json.')
  })

  it('bruker entall for én økt og tusenskille for mange', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportSection workouts={workouts.slice(0, 1)} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    await expectStatus('Eksporterte 1 økt til treningsdagbok-2026-11-05.json.')

    const many = Array.from({ length: 5000 }, (_, n) => ({ ...workouts[0], id: String(n) })) as typeof workouts
    rerender(<ExportSection workouts={many} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    await expectStatus('Eksporterte 5 000 økter til treningsdagbok-2026-11-05.json.')
  })

  it('tømmer meldingen før den settes på nytt ved gjentatt eksport, så den leses opp igjen', async () => {
    const user = userEvent.setup()
    render(<ExportSection workouts={workouts} />)
    const message = 'Eksporterte 2 økter til treningsdagbok-2026-11-05.json.'
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    await expectStatus(message)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    // Rett etter klikket er meldingen tom; den samme teksten kommer tilbake som en ny endring.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await expectStatus(message)
    expect(clicked).toHaveLength(2)
  })

  it('fjerner meldingen når listen endres', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportSection workouts={workouts} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    await expectStatus('Eksporterte 2 økter til treningsdagbok-2026-11-05.json.')
    rerender(<ExportSection workouts={[]} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByText('Det finnes ingen økter å eksportere ennå.')).toBeInTheDocument()
  })

  it('viser ikke en foreldet melding når listen endres før meldingen er satt', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 10, 5, 12))
    const { rerender } = render(<ExportSection workouts={workouts} />)
    const button = screen.getByRole('button', { name: 'Eksporter økter' })

    // Kontroll: uten listeendring kommer meldingen når timeren har gått.
    fireEvent.click(button)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Eksporterte 2 økter')

    fireEvent.click(button)
    rerender(<ExportSection workouts={workouts.slice(0, 1)} />)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('viser feilmelding når nedlastingen ikke kan startes', async () => {
    URL.createObjectURL = () => {
      throw new Error('blokkert')
    }
    const user = userEvent.setup()
    render(<ExportSection workouts={workouts} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    await expectStatus('Nedlastingen kunne ikke startes. Prøv igjen.')
    expect(clicked).toHaveLength(0)
  })

  it('uten økter vises ingen knapp, men en norsk melding', () => {
    render(<ExportSection workouts={[]} />)
    expect(screen.queryByRole('button', { name: 'Eksporter økter' })).not.toBeInTheDocument()
    expect(screen.getByText('Det finnes ingen økter å eksportere ennå.')).toBeInTheDocument()
  })
})
