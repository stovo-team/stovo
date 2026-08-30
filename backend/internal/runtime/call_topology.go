package runtime

// ShouldPromoteCallToSFU captures the process-local topology threshold. It is
// independent of any particular SFU provider; outer adapters decide whether
// one is configured and how an unavailable-provider error is presented.
func ShouldPromoteCallToSFU(connectedOrConnecting, meshLimit int, alreadySFU bool) bool {
	return !alreadySFU && connectedOrConnecting > meshLimit
}
