package app

import "testing"

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
