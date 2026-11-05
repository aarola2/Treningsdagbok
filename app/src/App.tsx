import { useState } from 'react'
import { WorkoutForm } from './WorkoutForm'
import { WorkoutList } from './WorkoutList'
import { loadWorkouts } from './workoutStorage'
import type { LoadResult } from './workoutStorage'

export function App() {
  // App eier listen; skjemaet melder fra med den lagrede listen, så lagringen ikke leses på nytt.
  const [list, setList] = useState<LoadResult>(loadWorkouts)

  return (
    <main>
      <h1>Treningsdagbok</h1>
      <WorkoutForm
        onSaved={(workouts) => {
          setList({ status: 'ok', workouts })
        }}
      />
      <WorkoutList list={list} />
    </main>
  )
}
