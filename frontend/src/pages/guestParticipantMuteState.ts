export function updateMutedParticipantIds(currentIds: string[], participantId: string, muted: boolean): string[] {
  if (muted) {
    return currentIds.includes(participantId) ? currentIds : [...currentIds, participantId];
  }
  return currentIds.filter((id) => id !== participantId);
}
