import { todayLocal } from './workout'
import type { Workout } from './workout'

// Eksportformatet er en kontrakt hvis import kommer senere: samme feltnavn og versjon som lagringen.
const EXPORT_VERSION = 1

export function buildExport(workouts: Workout[], now: Date): { filename: string; json: string } {
  return {
    filename: `treningsdagbok-${todayLocal(now)}.json`,
    json: JSON.stringify({ versjon: EXPORT_VERSION, eksportert: now.toISOString(), okter: workouts }, null, 2),
  }
}
