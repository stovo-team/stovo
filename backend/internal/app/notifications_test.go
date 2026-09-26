package app

import (
	"testing"
	"time"

	"stovo-messenger/backend/internal/ports"

	"github.com/doquangtan/socketio/v4"
)

func TestUserViewingChatInForeground(t *testing.T) {
	server := &Server{sessions: NewSessionRegistry()}
	user := userPublic{ID: "user-1"}
	foregroundSocket := &socketio.Socket{Id: "foreground-chat-a"}
	backgroundSocket := &socketio.Socket{Id: "background-chat-b"}
	server.sessions.Register(user, foregroundSocket)
	server.sessions.Register(user, backgroundSocket)
	server.sessions.SetAppState(foregroundSocket.Id, true, "chat-a")
	server.sessions.SetAppState(backgroundSocket.Id, false, "chat-b")

	if !server.sessions.IsViewingChatInForeground("user-1", "chat-a") {
		t.Fatal("expected notifications for the active foreground chat to be suppressed")
	}
	if server.sessions.IsViewingChatInForeground("user-1", "chat-b") {
		t.Fatal("expected notifications for another chat to be delivered")
	}
}

func TestFormatMessageNotificationDirect(t *testing.T) {
	title, message, tags := formatMessageNotification("direct", nil, "Alice", "hello")
	if title != "Alice" {
		t.Fatalf("expected title Alice, got %q", title)
	}
	if message != "hello" {
		t.Fatalf("expected message hello, got %q", message)
	}
	if !containsTag(tags, "direct") || !containsTag(tags, "speech_balloon") {
		t.Fatalf("expected direct + speech_balloon tags, got %v", tags)
	}
}

func TestFormatMessageNotificationGroup(t *testing.T) {
	chatTitle := "Family Chat"
	title, message, tags := formatMessageNotification("group", &chatTitle, "Alice", "hello")
	if title != "Family Chat" {
		t.Fatalf("expected chat title, got %q", title)
	}
	if message != "Alice: hello" {
		t.Fatalf("expected sender-prefixed body, got %q", message)
	}
	if containsTag(tags, "direct") {
		t.Fatalf("did not expect direct tag, got %v", tags)
	}
}

func TestFormatMessageNotificationMissingTitle(t *testing.T) {
	title, _, _ := formatMessageNotification("channel", nil, "Bob", "hi")
	if title != "Chat" {
		t.Fatalf("expected fallback Chat title, got %q", title)
	}
}

func TestCallCompletionNotificationIsDeliveredWhileChatIsForeground(t *testing.T) {
	now := time.Date(2026, time.September, 26, 12, 0, 0, 0, time.UTC)
	pref := ports.ChatNotificationPreference{NotificationMode: "all"}
	decision := ShouldNotifyRecipientWithForegroundOverride(pref, "system", false, true, now, true)
	if !decision.ShouldNotify {
		t.Fatalf("expected call completion notification while the chat is foreground, got %q", decision.Reason)
	}
}

func TestCallCompletionForegroundNotificationStillHonorsChatPreferences(t *testing.T) {
	now := time.Date(2026, time.September, 26, 12, 0, 0, 0, time.UTC)
	pref := ports.ChatNotificationPreference{NotificationMode: "mentions_only"}
	decision := ShouldNotifyRecipientWithForegroundOverride(pref, "system", false, true, now, true)
	if decision.ShouldNotify {
		t.Fatal("expected mentions-only preference to suppress an unmentioned call completion notification")
	}
}

func TestExtractMentionedUserIDsFromContent(t *testing.T) {
	members := []chatMemberPublic{
		{ID: "user-1", Username: "alice", DisplayName: "Alice Smith"},
		{ID: "user-2", Username: "bobjones", DisplayName: "Bob Jones"},
		{ID: "user-3", Username: "charlie", DisplayName: "Charlie Brown"},
	}

	// Mention by username
	m1 := extractMentionedUserIDsFromContent(members, "user-1", "Hey @bobjones check this out")
	if len(m1) != 1 || m1[0] != "user-2" {
		t.Fatalf("expected user-2 for username mention, got %v", m1)
	}

	// Mention by display name
	m2 := extractMentionedUserIDsFromContent(members, "user-1", "Hello @Charlie Brown please look")
	if len(m2) != 1 || m2[0] != "user-3" {
		t.Fatalf("expected user-3 for display name mention, got %v", m2)
	}

	// Sender self-mention ignored
	m3 := extractMentionedUserIDsFromContent(members, "user-1", "I am @alice")
	if len(m3) != 0 {
		t.Fatalf("expected empty for self-mention, got %v", m3)
	}
}

func containsTag(tags []string, want string) bool {
	for _, tag := range tags {
		if tag == want {
			return true
		}
	}
	return false
}

func TestIsWithinQuietHours(t *testing.T) {
	// 22:00 to 07:00 (spans midnight)
	t1 := time.Date(2026, 9, 15, 23, 30, 0, 0, time.UTC)
	if !isWithinQuietHours("22:00", "07:00", t1) {
		t.Errorf("expected 23:30 to be within quiet hours 22:00-07:00")
	}

	t2 := time.Date(2026, 9, 15, 6, 59, 0, 0, time.UTC)
	if !isWithinQuietHours("22:00", "07:00", t2) {
		t.Errorf("expected 06:59 to be within quiet hours 22:00-07:00")
	}

	t3 := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	if isWithinQuietHours("22:00", "07:00", t3) {
		t.Errorf("expected 12:00 NOT to be within quiet hours 22:00-07:00")
	}

	// 09:00 to 17:00 (same day)
	t4 := time.Date(2026, 9, 15, 14, 0, 0, 0, time.UTC)
	if !isWithinQuietHours("09:00", "17:00", t4) {
		t.Errorf("expected 14:00 to be within 09:00-17:00")
	}

	t5 := time.Date(2026, 9, 15, 8, 59, 0, 0, time.UTC)
	if isWithinQuietHours("09:00", "17:00", t5) {
		t.Errorf("expected 08:59 NOT to be within 09:00-17:00")
	}
}

func TestShouldNotifyRecipientMute(t *testing.T) {
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)

	// Permanently muted
	p1 := ports.ChatNotificationPreference{
		IsMuted:              true,
		AlwaysNotifyMentions: false,
	}
	d1 := ShouldNotifyRecipient(p1, "sender-1", false, false, now)
	if d1.ShouldNotify {
		t.Errorf("expected muted chat to suppress notification")
	}

	// Muted but mentioned with AlwaysNotifyMentions=true
	p2 := ports.ChatNotificationPreference{
		IsMuted:              true,
		AlwaysNotifyMentions: true,
	}
	d2 := ShouldNotifyRecipient(p2, "sender-1", true, false, now)
	if !d2.ShouldNotify || d2.Priority != 5 {
		t.Errorf("expected mention to break through mute with priority 5, got %+v", d2)
	}

	// Muted until future time
	future := now.Add(2 * time.Hour)
	p3 := ports.ChatNotificationPreference{
		IsMuted:    true,
		MutedUntil: &future,
	}
	d3 := ShouldNotifyRecipient(p3, "sender-1", false, false, now)
	if d3.ShouldNotify {
		t.Errorf("expected future muted_until to suppress notification")
	}

	// Muted until past time (expired)
	past := now.Add(-10 * time.Minute)
	p4 := ports.ChatNotificationPreference{
		IsMuted:    true,
		MutedUntil: &past,
	}
	d4 := ShouldNotifyRecipient(p4, "sender-1", false, false, now)
	if !d4.ShouldNotify {
		t.Errorf("expected expired muted_until to allow notification")
	}
}

func TestShouldNotifyRecipientQuietHours(t *testing.T) {
	nightTime := time.Date(2026, 9, 15, 23, 0, 0, 0, time.UTC)
	dayTime := time.Date(2026, 9, 15, 14, 0, 0, 0, time.UTC)

	p := ports.ChatNotificationPreference{
		QuietHoursEnabled:    true,
		QuietHoursStart:      "22:00",
		QuietHoursEnd:        "07:00",
		AlwaysNotifyMentions: true,
	}

	// Night time: suppressed
	d1 := ShouldNotifyRecipient(p, "sender-1", false, false, nightTime)
	if d1.ShouldNotify {
		t.Errorf("expected quiet hours to suppress notification")
	}

	// Night time with mention: delivered
	d2 := ShouldNotifyRecipient(p, "sender-1", true, false, nightTime)
	if !d2.ShouldNotify || d2.Priority != 5 {
		t.Errorf("expected mention during quiet hours to be delivered, got %+v", d2)
	}

	// Day time: delivered
	d3 := ShouldNotifyRecipient(p, "sender-1", false, false, dayTime)
	if !d3.ShouldNotify {
		t.Errorf("expected day time to be delivered outside quiet hours")
	}
}

func TestShouldNotifyRecipientModes(t *testing.T) {
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)

	// Mentions only mode
	pMentions := ports.ChatNotificationPreference{
		NotificationMode: "mentions_only",
	}
	if ShouldNotifyRecipient(pMentions, "sender-1", false, false, now).ShouldNotify {
		t.Errorf("expected unmentioned message in mentions_only mode to be suppressed")
	}
	if !ShouldNotifyRecipient(pMentions, "sender-1", true, false, now).ShouldNotify {
		t.Errorf("expected mentioned message in mentions_only mode to be delivered")
	}

	// Specific senders mode
	pSenders := ports.ChatNotificationPreference{
		NotificationMode:     "specific_senders",
		NotifySenderIDs:      []string{"boss-user", "mom-user"},
		AlwaysNotifyMentions: true,
	}
	// From allowed sender
	if !ShouldNotifyRecipient(pSenders, "boss-user", false, false, now).ShouldNotify {
		t.Errorf("expected message from boss-user to be delivered in specific_senders mode")
	}
	// From non-allowed sender
	if ShouldNotifyRecipient(pSenders, "random-user", false, false, now).ShouldNotify {
		t.Errorf("expected message from random-user to be suppressed in specific_senders mode")
	}
	// From non-allowed sender with mention
	dMention := ShouldNotifyRecipient(pSenders, "random-user", true, false, now)
	if !dMention.ShouldNotify || dMention.Priority != 5 {
		t.Errorf("expected mention from random-user to break through in specific_senders mode, got %+v", dMention)
	}
}

func TestShouldNotifyRecipientForeground(t *testing.T) {
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	p := ports.ChatNotificationPreference{
		NotificationMode: "all",
	}
	d := ShouldNotifyRecipient(p, "sender-1", true, true, now)
	if d.ShouldNotify {
		t.Errorf("expected foreground viewing to always suppress notification")
	}
}
