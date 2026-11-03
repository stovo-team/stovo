package orchestrator

// A mutable tag can point to a different image without changing its name.
func backendImageRequiresRecreation(runningReference, desiredReference, runningID, desiredID string) bool {
	return (runningReference != desiredReference && runningID != desiredReference) || runningID != desiredID
}
