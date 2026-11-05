import { useRef, useState } from 'react'
import { WorkoutForm } from './WorkoutForm'
import { WorkoutList } from './WorkoutList'
import type { FocusTarget } from './WorkoutList'
import type { Workout } from './workout'
import { loadWorkouts } from './workoutStorage'
import type { LoadResult } from './workoutStorage'

export function App() {
  // App eier listen; skjemaet og listen melder fra med den lagrede listen, så lagringen ikke leses på nytt.
  const [list, setList] = useState<LoadResult>(loadWorkouts)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const focusSeq = useRef(0)

  function focusInList(id: string, on: FocusTarget['on']) {
    focusSeq.current += 1
    setFocusTarget({ id, on, seq: focusSeq.current })
  }

  return (
    <main>
      <h1>Treningsdagbok</h1>
      <WorkoutForm
        editing={editing}
        onSaved={(workouts) => {
          setList({ status: 'ok', workouts })
          if (editing) {
            focusInList(editing.id, 'row')
            setEditing(null)
          }
        }}
        onCancelEdit={() => {
          if (editing) focusInList(editing.id, 'edit')
          setEditing(null)
        }}
      />
      <WorkoutList
        list={list}
        focusTarget={focusTarget}
        onEdit={setEditing}
        onDeleted={(workouts, deletedId) => {
          setList({ status: 'ok', workouts })
          if (editing?.id === deletedId) setEditing(null)
        }}
      />
    </main>
  )
}
