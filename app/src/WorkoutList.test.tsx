import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workout } from './workout'
import { PAGE_SIZE, WorkoutList } from './WorkoutList'
import { STORAGE_KEY, loadWorkouts } from './workoutStorage'
import type { LoadResult } from './workoutStorage'

function workout(n: number, dato: string, type = `Økt ${String(n)}`, varighet = 30): Workout {
  return { id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`, dato, type, varighet }
}

function renderList(list: LoadResult) {
  return render(<WorkoutList list={list} />)
}

// Type-cellen inneholder også knappene Rediger/Slett; selve typen står i .workout-type.
function typeText(row: HTMLElement) {
  return within(row).getAllByRole('cell')[1]?.querySelector('.workout-type')?.textContent
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
    expect([cells[0]?.textContent, typeText(dataRows()[0] as HTMLElement), cells[2]?.textContent]).toEqual([
      '5. nov. 2026',
      'Løping',
      '45\u00A0min',
    ])
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
    expect(dataRows().map(typeText)).toEqual(['D', 'B', 'C', 'A', 'E'])
  })

  it.each([
    ['stigende', ['2026-01-01', '2026-06-01', '2026-12-01']],
    ['synkende', ['2026-12-01', '2026-06-01', '2026-01-01']],
    ['blandet', ['2026-06-01', '2026-12-01', '2026-01-01']],
    ['blandet omvendt', ['2026-12-01', '2026-01-01', '2026-06-01']],
  ])('sorterer riktig uansett lagringsrekkefølge (%s)', (_, datoer) => {
    renderList({ status: 'ok', workouts: datoer.map((dato, n) => workout(n, dato, dato)) })
    expect(dataRows().map(typeText)).toEqual([
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
      const dato = row.querySelector('time')?.getAttribute('datetime')
      return { dato, n: Number(typeText(row)?.replace('Økt ', '')) }
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
      expect(dataRows()[PAGE_SIZE]).toHaveFocus()

      await user.click(screen.getByRole('button', { name: 'Vis flere økter' }))
      expect(dataRows()).toHaveLength(250)
      expect(screen.getByRole('status')).toHaveTextContent('Viser 250 av 250 økter.')
      expect(screen.queryByRole('button', { name: 'Vis flere økter' })).not.toBeInTheDocument()
      // Knappen er borte, men fokus står på første nye rad i stedet for å falle til body.
      expect(dataRows()[2 * PAGE_SIZE]).toHaveFocus()
    })

    it('viser de nyeste øktene på første side', () => {
      const workouts = [...many(PAGE_SIZE), workout(999, '2026-12-24', 'Nyest')]
      renderList({ status: 'ok', workouts })
      expect(typeText(dataRows()[0] as HTMLElement)).toBe('Nyest')
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
    expect(screen.getByText('Gyldig')).toBeInTheDocument()
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
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('WorkoutList – rediger og slett', () => {
  const target = workout(1, '2026-11-05', 'Løping', 45)
  const other = workout(2, '2026-11-04', 'Yoga', 30)

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
  })

  function storeWorkouts(okter: unknown[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 1, okter }))
  }

  function renderActions(workouts = [target, other]) {
    storeWorkouts(workouts)
    const onEdit = vi.fn()
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<WorkoutList list={{ status: 'ok', workouts }} onEdit={onEdit} onDeleted={onDeleted} />)
    return { onEdit, onDeleted, user }
  }

  it('har knapper med navn som sier hvilken økt de gjelder', () => {
    renderActions()
    expect(screen.getByRole('button', { name: 'Rediger «Løping» 5. nov. 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rediger «Yoga» 4. nov. 2026' })).toBeInTheDocument()
  })

  it('Rediger sender økten til onEdit', async () => {
    const { onEdit, user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Rediger «Yoga» 4. nov. 2026' }))
    expect(onEdit).toHaveBeenCalledWith(other)
  })

  it('Slett krever bekreftelse; Avbryt endrer ingenting', async () => {
    const { onDeleted, user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    const dialog = screen.getByRole('dialog', { name: 'Slette økten?' })
    expect(dialog).toHaveAccessibleDescription('«Løping» 5. nov. 2026, 45 min, slettes. Dette kan ikke angres.')
    expect(screen.getByRole('button', { name: 'Avbryt' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(loadWorkouts().workouts).toEqual([target, other])
  })

  it('Escape i slettedialogen endrer ingenting', async () => {
    const { onDeleted, user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(loadWorkouts().workouts).toHaveLength(2)
  })

  it('Bekreft sletter økten, melder listen og flytter fokus til en melding', async () => {
    const { onDeleted, user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(loadWorkouts().workouts).toEqual([other])
    expect(onDeleted).toHaveBeenCalledWith([other], target.id)
    expect(screen.getByText('«Løping» 5. nov. 2026 er slettet.')).toHaveFocus()
  })

  it('spør om forkasting av ødelagte data før sletting, og sletter etter bekreftelse', async () => {
    const { onDeleted, user } = renderActions()
    storeWorkouts([target, other, 'tull'])
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(screen.getByRole('dialog', { name: 'Noen lagrede data er ødelagte' })).toHaveAccessibleDescription(
      'Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. 1 gyldig økt beholdes, og økten slettes.',
    )
    expect(onDeleted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Fjern ødelagte data og slett' }))
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [other] })
    expect(onDeleted).toHaveBeenCalledWith([other], target.id)
  })

  it('sier at ingen andre økter er lagret når bare økten som slettes er gyldig', async () => {
    const { user } = renderActions([target])
    storeWorkouts([target, 'tull'])
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(screen.getByRole('dialog', { name: 'Noen lagrede data er ødelagte' })).toHaveAccessibleDescription(
      'Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene, og økten slettes. Ingen andre gyldige økter er lagret.',
    )
    await user.click(screen.getByRole('button', { name: 'Fjern ødelagte data og slett' }))
    expect(loadWorkouts()).toEqual({ status: 'ok', workouts: [] })
  })

  it('avbrutt forkasting endrer ingenting', async () => {
    const { onDeleted, user } = renderActions()
    const corrupt = JSON.stringify({ versjon: 1, okter: [target, other, 'tull'] })
    localStorage.setItem(STORAGE_KEY, corrupt)
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it.each([
    [
      'not-found',
      () => {
        storeWorkouts([other])
      },
      'Økten finnes ikke lenger, så den ble ikke slettet. Last inn siden på nytt.',
    ],
    [
      'unsupported-version',
      () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ versjon: 2, okter: [] }))
      },
      'Dataene er lagret av en nyere versjon av appen. Last inn siden på nytt. Økten ble ikke slettet.',
    ],
  ])('viser feilmelding med fokus ved %s', async (_, arrange, message) => {
    const { onDeleted, user } = renderActions()
    arrange()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('viser feilmelding ved full lagring', async () => {
    const { user } = renderActions()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Lagringsplassen i nettleseren er full. Økten ble ikke slettet.')
    vi.restoreAllMocks()
  })

  it('flytter fokus til Rediger-knappen for økten i focusTarget', () => {
    const workouts = [target, other]
    const { rerender } = render(<WorkoutList list={{ status: 'ok', workouts }} />)
    rerender(<WorkoutList list={{ status: 'ok', workouts }} focusTarget={{ id: other.id, seq: 1 }} />)
    expect(screen.getByRole('button', { name: 'Rediger «Yoga» 4. nov. 2026' })).toHaveFocus()
  })

  it('flytter fokus til overskriften når økten ikke vises på siden', () => {
    const workouts = [target]
    const { rerender } = render(<WorkoutList list={{ status: 'ok', workouts }} />)
    rerender(<WorkoutList list={{ status: 'ok', workouts }} focusTarget={{ id: other.id, seq: 1 }} />)
    expect(screen.getByRole('heading', { name: 'Mine økter' })).toHaveFocus()
  })

  it('viser en melding fra skjemaet og flytter fokus til den, også når samme tekst kommer igjen', () => {
    const workouts = [target]
    const { rerender } = render(<WorkoutList list={{ status: 'ok', workouts }} />)
    rerender(<WorkoutList list={{ status: 'ok', workouts }} announcement={{ text: '«Løping» er oppdatert.', seq: 1 }} />)
    const first = screen.getByText('«Løping» er oppdatert.')
    expect(first).toHaveFocus()
    rerender(<WorkoutList list={{ status: 'ok', workouts }} announcement={{ text: '«Løping» er oppdatert.', seq: 2 }} />)
    const second = screen.getByText('«Løping» er oppdatert.')
    expect(second).toHaveFocus()
    expect(second).not.toBe(first)
  })

  it('fjerner forrige melding når en ny Rediger eller Slett starter', async () => {
    const { user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    expect(screen.getByText('«Løping» 5. nov. 2026 er slettet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rediger «Yoga» 4. nov. 2026' }))
    expect(screen.queryByText('«Løping» 5. nov. 2026 er slettet.')).not.toBeInTheDocument()
  })

  it('fjerner forrige melding når en ny sletting starter', async () => {
    const { user } = renderActions()
    await user.click(screen.getByRole('button', { name: 'Slett «Løping» 5. nov. 2026' }))
    await user.click(screen.getByRole('button', { name: 'Slett økten' }))
    await user.click(screen.getByRole('button', { name: 'Slett «Yoga» 4. nov. 2026' }))
    expect(screen.queryByText('«Løping» 5. nov. 2026 er slettet.')).not.toBeInTheDocument()
  })
})
