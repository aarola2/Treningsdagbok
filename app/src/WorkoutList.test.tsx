import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Workout } from './workout'
import { PAGE_SIZE, WorkoutList } from './WorkoutList'
import type { LoadResult } from './workoutStorage'

function workout(n: number, dato: string, type = `Økt ${String(n)}`, varighet = 30): Workout {
  return { id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`, dato, type, varighet }
}

function renderList(list: LoadResult) {
  return render(<WorkoutList list={list} />)
}

function dataRows() {
  return screen.getAllByRole('row').slice(1)
}

const emptyText = 'Du har ingen lagrede økter ennå. Registrer den første økten i skjemaet «Registrer økt».'

describe('WorkoutList', () => {
  it('viser øktene i en tabell med navn og kolonneoverskrifter', () => {
    renderList({ status: 'ok', workouts: [workout(1, '2026-11-05', 'Løping', 45)] })
    const table = screen.getByRole('table', { name: 'Mine økter' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Dato',
      'Type',
      'Varighet',
    ])
    const cells = within(dataRows()[0] as HTMLElement).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual(['5. nov. 2026', 'Løping', '45\u00A0min'])
    expect(within(cells[0] as HTMLElement).getByText('5. nov. 2026').closest('time')).toHaveAttribute(
      'datetime',
      '2026-11-05',
    )
  })

  it('sorterer nyeste dato først, og ved lik dato sist registrert først', () => {
    const workouts = [
      workout(1, '2026-11-01', 'A'),
      workout(2, '2026-11-03', 'B'),
      workout(3, '2026-11-01', 'C'),
      workout(4, '2026-11-03', 'D'),
      workout(5, '2025-12-31', 'E'),
    ]
    renderList({ status: 'ok', workouts })
    expect(dataRows().map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual(['D', 'B', 'C', 'A', 'E'])
  })

  it.each([
    ['stigende', ['2026-01-01', '2026-06-01', '2026-12-01']],
    ['synkende', ['2026-12-01', '2026-06-01', '2026-01-01']],
    ['blandet', ['2026-06-01', '2026-12-01', '2026-01-01']],
    ['blandet omvendt', ['2026-12-01', '2026-01-01', '2026-06-01']],
  ])('sorterer riktig uansett lagringsrekkefølge (%s)', (_, datoer) => {
    renderList({ status: 'ok', workouts: datoer.map((dato, n) => workout(n, dato, dato)) })
    expect(dataRows().map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      '2026-12-01',
      '2026-06-01',
      '2026-01-01',
    ])
  })

  it('sorterer en stor liste i tilfeldig rekkefølge riktig (også når sorteringen fletter delsekvenser)', async () => {
    // Deterministisk «tilfeldig» rekkefølge av 300 datoer med mange like datoer.
    const workouts = Array.from({ length: 300 }, (_, n) =>
      workout(n, `2026-${String(((n * 7) % 12) + 1).padStart(2, '0')}-${String(((n * 13) % 28) + 1).padStart(2, '0')}`),
    )
    renderList({ status: 'ok', workouts })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Vis flere økter' }))
    await user.click(screen.getByRole('button', { name: 'Vis flere økter' }))
    const shown = dataRows().map((row) => {
      const [dato, type] = within(row)
        .getAllByRole('cell')
        .map((cell) => cell.querySelector('time')?.getAttribute('datetime') ?? cell.textContent)
      return { dato, n: Number(type?.replace('Økt ', '')) }
    })
    const expected = workouts
      .map((w, n) => ({ dato: w.dato, n }))
      .sort((a, b) => (a.dato === b.dato ? b.n - a.n : a.dato < b.dato ? 1 : -1))
    expect(shown).toEqual(expected)
  })

  describe('paginering', () => {
    const many = (count: number) => Array.from({ length: count }, (_, n) => workout(n, '2026-01-01'))

    it('viser alle uten knapp eller teller når det er høyst én side', () => {
      renderList({ status: 'ok', workouts: many(PAGE_SIZE) })
      expect(dataRows()).toHaveLength(PAGE_SIZE)
      expect(screen.queryByRole('button', { name: 'Vis flere økter' })).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('viser første side, en teller og flere sider ved klikk til alle vises', async () => {
      renderList({ status: 'ok', workouts: many(2 * PAGE_SIZE + 50) })
      const user = userEvent.setup()
      expect(dataRows()).toHaveLength(PAGE_SIZE)
      expect(screen.getByRole('status')).toHaveTextContent('Viser 100 av 250 økter.')

      await user.click(screen.getByRole('button', { name: 'Vis flere økter' }))
      expect(dataRows()).toHaveLength(2 * PAGE_SIZE)
      expect(screen.getByRole('status')).toHaveTextContent('Viser 200 av 250 økter.')

      await user.click(screen.getByRole('button', { name: 'Vis flere økter' }))
      expect(dataRows()).toHaveLength(250)
      expect(screen.getByRole('status')).toHaveTextContent('Viser 250 av 250 økter.')
      expect(screen.queryByRole('button', { name: 'Vis flere økter' })).not.toBeInTheDocument()
    })

    it('viser de nyeste øktene på første side', () => {
      const workouts = [...many(PAGE_SIZE), workout(999, '2026-12-24', 'Nyest')]
      renderList({ status: 'ok', workouts })
      expect(within(dataRows()[0] as HTMLElement).getAllByRole('cell')[1]).toHaveTextContent('Nyest')
    })

    it('formaterer store antall med mellomrom', () => {
      renderList({ status: 'ok', workouts: many(5000) })
      // Hardt mellomrom som tusenskille (toHaveTextContent normaliserer mellomrom, så sjekk teksten direkte).
      expect(screen.getByRole('status').textContent).toBe('Viser 100 av 5\u00A0000 økter.')
    })
  })

  it('endrer ikke rekkefølgen i listen den får', () => {
    const workouts = [workout(1, '2026-11-01'), workout(2, '2026-11-03')]
    renderList({ status: 'ok', workouts })
    expect(workouts.map((w) => w.dato)).toEqual(['2026-11-01', '2026-11-03'])
  })

  it('viser tomtilstand uten tabell når det ikke finnes økter', () => {
    renderList({ status: 'ok', workouts: [] })
    expect(screen.getByText(emptyText)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Mine økter' })).toBeInTheDocument()
  })

  it('viser feilmelding og fortsatt de gyldige øktene ved ødelagte data', () => {
    renderList({ status: 'corrupt', workouts: [workout(1, '2026-11-05', 'Gyldig')] })
    expect(screen.getByText('Noen lagrede data kan ikke leses. Bare gyldige økter vises.')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Gyldig' })).toBeInTheDocument()
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument()
  })

  it('sier at ingen økter kan vises når ingen av de ødelagte dataene kan leses', () => {
    renderList({ status: 'corrupt', workouts: [] })
    expect(screen.getByText('De lagrede dataene kan ikke leses, så ingen økter kan vises.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument()
  })

  it.each([
    [
      'unsupported-version' as const,
      'Dataene er lagret av en nyere versjon av appen og kan ikke vises. Last inn siden på nytt.',
    ],
    [
      'unavailable' as const,
      'Nettleseren tillater ikke lagring nå (for eksempel i privat modus), så lagrede økter kan ikke vises.',
    ],
  ])('viser egen melding uten tomtilstand ved %s', (status, message) => {
    renderList({ status, workouts: [] })
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('viser HTML og skript i type som ren tekst', () => {
    const { container } = renderList({
      status: 'ok',
      workouts: [workout(1, '2026-11-05', '<img src=x onerror=alert(1)>')],
    })
    expect(screen.getByRole('cell', { name: '<img src=x onerror=alert(1)>' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
