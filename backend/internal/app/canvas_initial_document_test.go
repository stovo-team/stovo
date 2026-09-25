package app

import (
	"encoding/base64"
	"net/http"
	"strings"
	"testing"
)

func TestDecodeCanvasUpdate(t *testing.T) {
	t.Run("rejects empty and malformed updates", func(t *testing.T) {
		for _, update := range []string{"", "not-base64"} {
			if _, err := decodeCanvasUpdate(update); err == nil {
				t.Fatalf("decodeCanvasUpdate(%q) error = nil, want invalid update", update)
			}
		}
	})

	t.Run("rejects updates over the limit", func(t *testing.T) {
		tooLarge := base64.StdEncoding.EncodeToString(make([]byte, maxCanvasUpdateBytes+1))
		if _, err := decodeCanvasUpdate(tooLarge); err == nil {
			t.Fatal("decodeCanvasUpdate(oversized) error = nil, want invalid update")
		}
		if _, err := decodeCanvasUpdate(strings.Repeat("\r\n", base64.StdEncoding.EncodedLen(maxCanvasUpdateBytes))); err == nil {
			t.Fatal("decodeCanvasUpdate(oversized input) error = nil, want invalid update")
		}
	})

	t.Run("accepts valid updates", func(t *testing.T) {
		want := []byte("valid update")
		got, err := decodeCanvasUpdate(base64.StdEncoding.EncodeToString(want))
		if err != nil {
			t.Fatalf("decodeCanvasUpdate() error = %v", err)
		}
		if string(got) != string(want) {
			t.Fatalf("decoded update = %q, want %q", got, want)
		}
	})
}

func TestCanvasCreateSeedsMarkdownBeforeReturning(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	owner := setupOwner(t, client, serverURL.URL, "canvas-owner", "Canvas Workspace")
	member := createInvitedUser(t, client, serverURL.URL, owner, "canvas-member")
	chatResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{"title": "Canvas chat", "memberIds": []string{member.User.ID}})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d, want %d", chatResp.StatusCode, http.StatusCreated)
	}
	chat := decodeJSON[chatPublic](t, chatResp)
	delayResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+chat.ID, owner.AccessToken, map[string]any{"messageDelaySeconds": 60})
	if delayResp.StatusCode != http.StatusOK {
		t.Fatalf("set message delay status = %d, want %d", delayResp.StatusCode, http.StatusOK)
	}
	priorMessageResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", member.AccessToken, map[string]any{"type": "text", "content": "Recent message"})
	if priorMessageResp.StatusCode != http.StatusCreated {
		t.Fatalf("create prior member message status = %d, want %d", priorMessageResp.StatusCode, http.StatusCreated)
	}
	spoofedCanvasResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/"+chat.ID+"/messages", member.AccessToken, map[string]any{"type": "canvas", "content": "canvas:fake\nFake Canvas"})
	if spoofedCanvasResp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("ordinary Canvas-typed message status = %d, want %d", spoofedCanvasResp.StatusCode, http.StatusTooManyRequests)
	}
	invalidResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/v1/plugins/canvas/canvases", member.AccessToken, map[string]any{
		"chatId": chat.ID, "title": "Invalid import", "initialUpdate": "not-base64",
	})
	if invalidResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid initial update status = %d, want %d", invalidResp.StatusCode, http.StatusBadRequest)
	}
	listResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/v1/plugins/canvas/canvases", member.AccessToken, nil)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("list canvases status = %d, want %d", listResp.StatusCode, http.StatusOK)
	}
	if canvases := decodeJSON[[]canvasPublic](t, listResp); len(canvases) != 0 {
		t.Fatalf("canvases after rejected import = %d, want none", len(canvases))
	}
	initialUpdate := base64.StdEncoding.EncodeToString([]byte("initial Yjs document update"))
	createResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/v1/plugins/canvas/canvases", member.AccessToken, map[string]any{
		"chatId": chat.ID, "title": "Imported Markdown", "initialUpdate": initialUpdate,
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create Canvas status = %d, want %d", createResp.StatusCode, http.StatusCreated)
	}
	created := decodeJSON[canvasPublic](t, createResp)
	documentResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/v1/plugins/canvas/canvases/"+created.ID+"/document", member.AccessToken, nil)
	if documentResp.StatusCode != http.StatusOK {
		t.Fatalf("get Canvas document status = %d, want %d", documentResp.StatusCode, http.StatusOK)
	}
	document := decodeJSON[struct {
		Updates []canvasUpdatePublic `json:"updates"`
	}](t, documentResp)
	if len(document.Updates) != 1 || document.Updates[0].Update != initialUpdate {
		t.Fatalf("Canvas updates = %#v, want the initial document update", document.Updates)
	}
}
