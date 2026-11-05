// Tekst for dialogen som spør før ødelagte lagrede data fjernes, felles for registrering, redigering og sletting.
export type CorruptAction = 'add' | 'update' | 'delete'

const outcome: Record<CorruptAction, string> = {
  add: 'den nye økten lagres',
  update: 'endringen lagres',
  delete: 'økten slettes',
}

// `kept` er antall gyldige økter som blir igjen i tillegg til endringen (ved sletting: uten økten som slettes).
export function corruptDialogText(kept: number, action: CorruptAction) {
  const confirmLabel = action === 'delete' ? 'Fjern ødelagte data og slett' : 'Fjern ødelagte data og lagre'
  if (kept === 0 && action !== 'add') {
    return {
      title: 'Noen lagrede data er ødelagte',
      confirmLabel,
      text: `Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene, og ${outcome[action]}. Ingen andre gyldige økter er lagret.`,
    }
  }
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
    confirmLabel,
    text: `Noen av de lagrede dataene kan ikke leses. Hvis du fortsetter, fjernes de ødelagte dataene. ${keptText} beholdes, og ${outcome[action]}.`,
  }
}
