package app

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGuestMeetingAdmissionState(t *testing.T) {
	tests := []struct {
		name, mode, creatorID, userID, want string
		authHeader                          bool
	}{
		{name: "creator is admitted in lobby", mode: "lobby", creatorID: "host-1", userID: "host-1", want: "admitted", authHeader: true},
		{name: "another signed-in user waits in lobby", mode: "lobby", creatorID: "host-1", userID: "member-2", want: "waiting", authHeader: true},
		{name: "invalid token waits in lobby", mode: "lobby", creatorID: "host-1", userID: "", want: "waiting", authHeader: true},
		{name: "anonymous user waits in lobby", mode: "lobby", creatorID: "host-1", userID: "", want: "waiting"},
		{name: "immediate mode admits anonymous user", mode: "immediate", creatorID: "host-1", userID: "", want: "admitted"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", nil)
			if tt.authHeader {
				r.Header.Set("Authorization", "Bearer test-token")
			}
			resolveUser := func(*http.Request) (userPublic, error) {
				if tt.userID == "" {
					return userPublic{}, errors.New("invalid or absent token")
				}
				return userPublic{ID: tt.userID}, nil
			}
			if got := guestMeetingRequestAdmissionState(r, tt.mode, tt.creatorID, resolveUser); got != tt.want {
				t.Fatalf("guestMeetingRequestAdmissionState(%q, %q, %q) = %q, want %q", tt.mode, tt.creatorID, tt.userID, got, tt.want)
			}
		})
	}
}

func TestGuestMeetingRequestAdmissionStateSkipsAuthenticationForAnonymousRequest(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	called := false
	state := guestMeetingRequestAdmissionState(r, "lobby", "host-1", func(*http.Request) (userPublic, error) {
		called = true
		return userPublic{ID: "host-1"}, nil
	})
	if called || state != "waiting" {
		t.Fatalf("anonymous request called resolver=%v and state=%q, want false and waiting", called, state)
	}
}

func TestGuestLiveKitIdentityIsStablePerMeetingAndGuestName(t *testing.T) {
	identity := guestLiveKitIdentity("meeting-a", " Ivan ")
	if identity != guestLiveKitIdentity("meeting-a", "ivan") {
		t.Fatal("expected case and whitespace variants of a guest name to share an identity")
	}
	if identity == guestLiveKitIdentity("meeting-a", "guest") {
		t.Fatal("different guest names must not share an identity")
	}
	if identity == guestLiveKitIdentity("meeting-b", "ivan") {
		t.Fatal("the same guest name in different meetings must not share an identity")
	}
}
