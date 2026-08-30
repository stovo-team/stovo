package runtime

import "context"

// TranscriptionRecoveryStore is the process-lifecycle operation needed to
// release recording sessions left behind by a previous process.
type TranscriptionRecoveryStore interface {
	RecoverInterrupted(context.Context) (int, error)
}

// TranscriptionRecoveryLogger keeps operational reporting at the runtime edge.
type TranscriptionRecoveryLogger interface {
	Warnf(loggerName, format string, args ...any)
	Infof(loggerName, format string, args ...any)
}

// RecoverInterruptedTranscriptionSessions marks recordings that cannot survive
// a process restart as failed. It deliberately owns startup recovery only; the
// transcription feature continues to own the state transition itself.
func RecoverInterruptedTranscriptionSessions(ctx context.Context, store TranscriptionRecoveryStore, logger TranscriptionRecoveryLogger) {
	if store == nil {
		return
	}
	count, err := store.RecoverInterrupted(ctx)
	if err != nil {
		if logger != nil {
			logger.Warnf("transcription", "recover interrupted sessions failed error=%v", err)
		}
		return
	}
	if count > 0 && logger != nil {
		logger.Infof("transcription", "marked interrupted sessions as failed count=%d", count)
	}
}
