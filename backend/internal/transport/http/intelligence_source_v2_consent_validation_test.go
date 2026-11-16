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

func TestSourceV2ConsentScopeRequiresExplicitConfirmationForAllChats(t *testing.T) {
	tests := []struct {
		name, kind, chatID string
		confirmed          bool
		want               bool
	}{
		{name: "existing single chat", kind: "chat", chatID: "chat-a", want: true},
		{name: "confirmed Space scope", kind: "space", confirmed: true, want: true},
		{name: "unconfirmed Space scope", kind: "space", want: false},
		{name: "chat scope without chat", kind: "chat", want: false},
		{name: "Space scope cannot smuggle a chat ID", kind: "space", chatID: "chat-a", confirmed: true, want: false},
		{name: "unknown scope", kind: "tenant", confirmed: true, want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validSourceV2ConsentScope(test.kind, test.chatID, test.confirmed); got != test.want {
				t.Fatalf("validSourceV2ConsentScope(%q, %q, %v) = %v, want %v", test.kind, test.chatID, test.confirmed, got, test.want)
			}
		})
	}
}
