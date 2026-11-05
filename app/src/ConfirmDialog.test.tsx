import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

// jsdom mangler showModal/close; ekte modal oppførsel testes i e2e.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

function renderDialog(open: boolean) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <ConfirmDialog open={open} title="Tittel" confirmLabel="Bekreft" onConfirm={onConfirm} onCancel={onCancel}>
      Forklaring
    </ConfirmDialog>,
  )
  return { onConfirm, onCancel, view }
}

describe('ConfirmDialog', () => {
  it('er lukket når open er false', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('åpnes med tittel og forklaring som tilgjengelig navn og beskrivelse, og fokuserer Avbryt', () => {
    renderDialog(true)
    const dialog = screen.getByRole('dialog', { name: 'Tittel' })
    expect(dialog).toHaveAccessibleDescription('Forklaring')
    expect(screen.getByRole('button', { name: 'Avbryt' })).toHaveFocus()
  })

  it('kaller onConfirm og onCancel fra knappene', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderDialog(true)
    await user.click(screen.getByRole('button', { name: 'Bekreft' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('behandler Escape (cancel-hendelsen) som Avbryt og lar React styre lukkingen', () => {
    const { onCancel } = renderDialog(true)
    const event = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), event)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lukkes når open blir false', () => {
    const { view, onConfirm, onCancel } = renderDialog(true)
    view.rerender(
      <ConfirmDialog open={false} title="Tittel" confirmLabel="Bekreft" onConfirm={onConfirm} onCancel={onCancel}>
        Forklaring
      </ConfirmDialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
