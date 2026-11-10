import { useRef, useState } from 'react'
import { DeleteAllSection } from './DeleteAllSection'
import { ExportSection } from './ExportSection'
import { PrivacySection } from './PrivacySection'
import { WorkoutForm } from './WorkoutForm'
import { WorkoutList } from './WorkoutList'
import type { Announcement, FocusTarget } from './WorkoutList'
import type { Workout } from './workout'
import { loadWorkouts } from './workoutStorage'
import type { LoadResult } from './workoutStorage'

export function App() {
  // App eier listen; skjemaet og listen melder fra med den lagrede listen, så lagringen ikke leses på nytt.
  const [list, setList] = useState<LoadResult>(loadWorkouts)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const seq = useRef(0)

  function nextSeq() {
    seq.current += 1
    return seq.current
  }

  return (
    <main>
      <h1>Treningsdagbok</h1>
      <WorkoutForm
        editing={editing}
        onSaved={(workouts) => {
          setList({ status: 'ok', workouts })
          if (editing) {
            const saved = workouts.find((workout) => workout.id === editing.id)
            if (saved) setAnnouncement({ text: `«${saved.type}» er oppdatert.`, seq: nextSeq() })
            setEditing(null)
          }
        }}
        onCancelEdit={() => {
          if (editing) setFocusTarget({ id: editing.id, seq: nextSeq() })
          setEditing(null)
        }}
      />
      <WorkoutList
        list={list}
        focusTarget={focusTarget}
        announcement={announcement}
        // Ny kopi for hvert klikk: Rediger på samme økt fyller feltene på nytt og flytter fokus til Dato.
        onEdit={(workout) => {
          setEditing({ ...workout })
        }}
        onDeleted={(workouts, deletedId) => {
          setList({ status: 'ok', workouts })
          if (editing?.id === deletedId) setEditing(null)
        }}
      />
      <ExportSection workouts={list.workouts} />
      <DeleteAllSection
        empty={list.status === 'ok' && list.workouts.length === 0}
        onDeleted={() => {
          setList({ status: 'ok', workouts: [] })
          setEditing(null)
        }}
        // Slettingen kan ha stoppet halvveis; vis det som faktisk ligger igjen.
        onFailed={() => {
          setList(loadWorkouts())
        }}
      />
      <PrivacySection />
    </main>
  )
}
