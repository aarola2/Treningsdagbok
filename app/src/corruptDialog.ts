// Tekst for dialogen som spør før ødelagte lagrede data fjernes, felles for registrering, redigering og sletting.
export type CorruptAction = 'add' | 'update' | 'delete'

const outcome: Record<CorruptAction, string> = {
  add: 'den nye økten lagres',
  update: 'endringen lagres',
  delete: 'økten slettes',
}

export function corruptDialogText(kept: number, action: CorruptAction) {
  // Bare registrering kan møte null gyldige økter: redigering og sletting gjelder en økt som vises.
  if (kept === 0) {
    return {
      title: 'De lagrede dataene kan ikke leses',
      confirmLabel: 'Fjern alle lagrede data og lagre',
      text: 'Ingen av de lagrede øktene kan leses. Hvis du fortsetter, fjernes alle lagrede data, og bare den nye økten lagres.',
    }
  }
  const keptText = kept === 1 ? '1 gyldig økt' : `${String(kept)} gyldige økter`
  return {
    title: 'Noen lagrede data er ødelagte',
    confirmLabel: action === 'delete' ? 'Fjern ødelagte data og slett' : 'Fjern ødelagte data og lagre',
    text: `Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. ${keptText} beholdes, og ${outcome[action]}.`,
  }
}
