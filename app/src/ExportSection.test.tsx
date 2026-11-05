import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportSection } from './ExportSection'

const workouts = [
  { id: '00000000-0000-4000-8000-000000000001', dato: '2026-11-04', type: 'Løping', varighet: 45 },
  { id: '00000000-0000-4000-8000-000000000002', dato: '2026-11-05', type: 'Yoga', varighet: 30 },
]

let blobs: Blob[] = []
let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  blobs = []
  clicked = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 12))
  // jsdom mangler createObjectURL; ekte nedlasting testes i e2e.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:test/1'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ExportSection', () => {
  it('har overskrift, forklaring og knapp', () => {
    render(<ExportSection workouts={workouts} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Eksport' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eksporter økter' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
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
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Eksporterte 2 økter til treningsdagbok-2026-11-05.json.')
  })

  it('bruker entall for én økt og tusenskille for mange', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportSection workouts={workouts.slice(0, 1)} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    expect(screen.getByRole('status')).toHaveTextContent('Eksporterte 1 økt til')

    const many = Array.from({ length: 5000 }, (_, n) => ({ ...workouts[0], id: String(n) })) as typeof workouts
    rerender(<ExportSection workouts={many} />)
    await user.click(screen.getByRole('button', { name: 'Eksporter økter' }))
    expect(screen.getByRole('status').textContent).toBe('Eksporterte 5 000 økter til treningsdagbok-2026-11-05.json.')
  })

  it('uten økter vises ingen knapp, men en norsk melding', () => {
    render(<ExportSection workouts={[]} />)
    expect(screen.queryByRole('button', { name: 'Eksporter økter' })).not.toBeInTheDocument()
    expect(screen.getByText('Det finnes ingen økter å eksportere ennå.')).toBeInTheDocument()
  })
})
