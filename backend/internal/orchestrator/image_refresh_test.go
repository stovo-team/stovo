package orchestrator

import "testing"

func TestBackendImageRequiresRecreation(t *testing.T) {
	tests := []struct {
		name, runningReference, desiredReference, runningID, desiredID string
		want                                                           bool
	}{
		{"same tag points to newer image", "app:latest", "app:latest", "sha256:old", "sha256:new", true},
		{"same tag and image", "app:latest", "app:latest", "sha256:same", "sha256:same", false},
		{"changed pinned reference", "app:old", "app:new", "sha256:old", "sha256:new", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := backendImageRequiresRecreation(tt.runningReference, tt.desiredReference, tt.runningID, tt.desiredID); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
