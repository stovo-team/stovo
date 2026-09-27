export type CameraTrackParticipant<TTrack, TOptions> = {
  unpublishTrack: (track: TTrack, stopOnUnpublish?: boolean) => Promise<unknown>;
  publishTrack: (track: TTrack, options: TOptions) => Promise<unknown>;
};

export class CameraTrackReplacementFailedError extends Error {
  constructor(public readonly replacementError: unknown) {
    super("The replacement camera could not be published; the previous camera remains available.");
    this.name = "CameraTrackReplacementFailedError";
  }
}

export class CameraTrackReplacementRollbackError extends Error {
  constructor(
    public readonly replacementError: unknown,
    public readonly restorationError: unknown,
  ) {
    super("The replacement camera could not be published and the previous camera could not be restored.");
    this.name = "CameraTrackReplacementRollbackError";
  }
}

/** Replaces a published camera track without stopping the old track before rollback is possible. */
export async function replacePublishedCameraTrackSafely<TTrack extends { stop: () => void }, TOptions>(
  participant: CameraTrackParticipant<TTrack, TOptions>,
  oldTrack: TTrack,
  replacementTrack: TTrack,
  publishOptions: TOptions,
): Promise<void> {
  try {
    await participant.unpublishTrack(oldTrack, false);
  } catch (error) {
    try { replacementTrack.stop(); } catch { /* Preserve the original unpublish error. */ }
    throw new CameraTrackReplacementFailedError(error);
  }
  try {
    await participant.publishTrack(replacementTrack, publishOptions);
  } catch (error) {
    await participant.unpublishTrack(replacementTrack, false).catch(() => undefined);
    try { replacementTrack.stop(); } catch { /* Continue with restoring the old track. */ }
    try {
      await participant.publishTrack(oldTrack, publishOptions);
    } catch (restorationError) {
      throw new CameraTrackReplacementRollbackError(error, restorationError);
    }
    throw new CameraTrackReplacementFailedError(error);
  }
}
