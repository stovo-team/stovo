package app

import "testing"

func TestHistoryCacheKeyScopesLatestPageToChatUserAndRevision(t *testing.T) {
	key := historyCacheKey("chat-1", "user-1", 7, 3)
	if key != "chat:history:v1:chat-1:7:user-1:3:latest-20" {
		t.Fatalf("unexpected cache key %q", key)
	}
}

func TestMessageHistoryPageExposesCursorOnlyWhenOlderMessagesRemain(t *testing.T) {
	page := newMessageHistoryPage([]messagePublic{{ID: "one"}, {ID: "two"}}, true)
	if page.NextBefore != "one" || !page.HasMore {
		t.Fatalf("unexpected page %#v", page)
	}

	lastPage := newMessageHistoryPage(nil, false)
	if lastPage.NextBefore != "" || lastPage.HasMore {
		t.Fatalf("unexpected final page %#v", lastPage)
	}
}
