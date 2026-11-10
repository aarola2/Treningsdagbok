import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { deleteAllData } from './workoutStorage'

// GitHub Pages kan ikke sette frame-ancestors, så sletting skjules når appen vises inne i en annen side
// (clickjacking). Kan ikke sjekken gjøres, regnes appen som innrammet.
function isFramed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

interface Notice {
  text: string
  error: boolean
  key: number
}

interface DeleteAllSectionProps {
  // Listen er tom. Settes av App i samme oppdatering som onDeleted.
  empty: boolean
  onDeleted: () => void
  onFailed: () => void
}

export function DeleteAllSection({ empty, onDeleted, onFailed }: DeleteAllSectionProps) {
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeKey = useRef(0)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Suksessmeldingen gjelder bare til listen får innhold igjen; den skal ikke dukke opp på nytt senere.
  if (notice && !notice.error && !empty) setNotice(null)

  // Fokus til meldingen, så den leses opp. Dialogens effekt (barnet) har allerede lukket dialogen.
  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  function confirm() {
    const result = deleteAllData()
    noticeKey.current += 1
    setConfirming(false)
    if (result.ok) {
      setNotice({ text: 'Alle data er slettet.', error: false, key: noticeKey.current })
      onDeleted()
    } else {
      // Noen nøkler kan være fjernet før feilen, så meldingen påstår ikke at ingenting ble slettet.
      setNotice({
        text: 'Nettleseren tillot ikke sletting nå. Last inn siden på nytt og prøv igjen.',
        error: true,
        key: noticeKey.current,
      })
      onFailed()
    }
  }

  return (
    <section>
      <h2>Slett alle data</h2>
      {isFramed() ? (
        <p>Sletting er bare tilgjengelig når appen åpnes direkte, ikke inne i en annen side.</p>
      ) : (
        <>
          <p>Fjern alle økter som er lagret i denne nettleseren, også data som ikke kan leses.</p>
          <button
            type="button"
            ref={buttonRef}
            onClick={() => {
              setNotice(null)
              setConfirming(true)
            }}
          >
            Slett alle data
          </button>
        </>
      )}
      {notice && (
        <p
          key={notice.key}
          ref={noticeRef}
          tabIndex={-1}
          role={notice.error ? 'alert' : undefined}
          className={notice.error ? 'form-error notice-after' : 'notice notice-after'}
        >
          {notice.text}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title="Slette alle data?"
        confirmLabel="Slett alle data"
        onConfirm={confirm}
        onCancel={() => {
          setConfirming(false)
          buttonRef.current?.focus()
        }}
      >
        Alle økter som er lagret i denne nettleseren, slettes. Dette kan ikke angres. Eksporter øktene først hvis du vil
        ta vare på dem. Filer du allerede har eksportert, slettes ikke. Lukk appen i andre faner først, ellers kan de
        lagre øktene på nytt.
      </ConfirmDialog>
    </section>
  )
}
