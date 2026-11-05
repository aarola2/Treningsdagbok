import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}

// Native modal <dialog>: fanger fokus, gjør resten av siden inert og gir fokus tilbake ved lukking.
export function ConfirmDialog({ open, title, confirmLabel, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Den trygge handlingen får fokus først.
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape: la React-tilstanden styre lukkingen.
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{children}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" ref={cancelRef} className="secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </dialog>
  )
}
