package http

import "testing"

func TestSourceV2ConsentAcceptsIndependentCodexAndReplyGrants(t *testing.T) {
	for grant, enabled := range map[string]bool{"codex": true, "reply": false} {
		if !validSourceV2ConsentGrant(grant) {
			t.Fatalf("consent grant %q was rejected", grant)
		}
		if !validSourceV2ConsentGrants(map[string]bool{grant: enabled}) {
			t.Fatalf("independent consent grant %q=%v was rejected", grant, enabled)
		}
	}
}

func TestSourceV2ConsentRejectsUnknownGrant(t *testing.T) {
	if validSourceV2ConsentGrants(map[string]bool{"admin": true}) {
		t.Fatal("unknown consent grant was accepted")
	}
}
