package app

import (
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func TestCanvasCreateRetryReusesOriginalDocumentAndCard(t *testing.T) {
	server, serverURL, client := newTestServer(t)
	owner := setupOwner(t, client, serverURL.URL, "canvas-retry-owner", "Canvas Retry")
	member := createInvitedUser(t, client, serverURL.URL, owner, "canvas-retry-member")
	chatResponse := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{"title": "Canvas retry chat", "memberIds": []string{member.User.ID}})
	chat := decodeJSON[chatPublic](t, chatResponse)
	id := uuid.NewString()
	initial := base64.StdEncoding.EncodeToString([]byte("original document"))
	payload := map[string]any{"canvasId": id, "chatId": chat.ID, "title": "Original Canvas", "initialUpdate": initial}
	endpoint := serverURL.URL + "/api/v1/plugins/canvas/canvases"
	// The first response can be lost after the server has committed. Retrying
	// must recover that document rather than create a second one.
	firstResponse := jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, payload)
	if firstResponse.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d", firstResponse.StatusCode)
	}
	first := decodeJSON[canvasPublic](t, firstResponse)
	retryResponse := jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, payload)
	if retryResponse.StatusCode != http.StatusCreated {
		t.Fatalf("retry create status = %d", retryResponse.StatusCode)
	}
	retry := decodeJSON[canvasPublic](t, retryResponse)
	if first.ID != id || retry.ID != id {
		t.Fatalf("create/retry IDs = %q / %q, want stable client ID %q", first.ID, retry.ID, id)
	}
	t.Run("rejects another owner", func(t *testing.T) {
		response := jsonRequest(t, client, http.MethodPost, endpoint, member.AccessToken, payload)
		defer func() { _ = response.Body.Close() }()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("another owner retry = %d, want 403", response.StatusCode)
		}
	})
	t.Run("rejects another origin chat", func(t *testing.T) {
		response := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{"title": "Other chat", "memberIds": []string{member.User.ID}})
		other := decodeJSON[chatPublic](t, response)
		response = jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, map[string]any{"canvasId": id, "chatId": other.ID})
		defer func() { _ = response.Body.Close() }()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("another chat retry = %d, want 403", response.StatusCode)
		}
	})
	t.Run("rejects another family", func(t *testing.T) {
		if _, err := server.canvasDB.Exec(`INSERT INTO families(id,name,created_at,updated_at) VALUES ('canvas-other-family','Other',$1,$1)`, nowString()); err != nil {
			t.Fatal(err)
		}
		if _, err := server.canvasDB.Exec(`UPDATE canvases SET family_id='canvas-other-family' WHERE id=$1`, id); err != nil {
			t.Fatal(err)
		}
		response := jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, payload)
		_ = response.Body.Close()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("another family retry = %d, want 403", response.StatusCode)
		}
		if _, err := server.canvasDB.Exec(`UPDATE canvases SET family_id=$2 WHERE id=$1`, id, owner.User.FamilyID); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("rejects invalid IDs", func(t *testing.T) {
		for _, invalid := range []string{"bad-id", uuid.Nil.String()} {
			response := jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, map[string]any{"canvasId": invalid, "chatId": chat.ID})
			_ = response.Body.Close()
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("invalid ID %q status = %d", invalid, response.StatusCode)
			}
		}
	})

	listResponse := jsonRequest(t, client, http.MethodGet, endpoint, owner.AccessToken, nil)
	if canvases := decodeJSON[[]canvasPublic](t, listResponse); len(canvases) != 1 {
		t.Fatalf("canvases = %d, want 1", len(canvases))
	}
	documentResponse := jsonRequest(t, client, http.MethodGet, endpoint+"/"+id+"/document", owner.AccessToken, nil)
	document := decodeJSON[struct {
		Updates []canvasUpdatePublic `json:"updates"`
	}](t, documentResponse)
	if len(document.Updates) != 1 || document.Updates[0].Update != initial {
		t.Fatalf("updates = %#v, want one original update", document.Updates)
	}
	messagesResponse := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, nil)
	messages := decodeJSON[messageHistoryPage](t, messagesResponse)
	cards := 0
	for _, message := range messages.Messages {
		if message.Type == "canvas" {
			cards++
		}
	}
	if cards != 1 {
		t.Fatalf("canvas cards = %d, want 1", cards)
	}
}

func TestCanvasCreateRetryRepairsInterruptedCardMapping(t *testing.T) {
	server, host, client := newTestServer(t)
	owner := setupOwner(t, client, host.URL, "canvas-interrupted-owner", "Interrupted Canvas")
	member := createInvitedUser(t, client, host.URL, owner, "canvas-interrupted-member")
	response := jsonRequest(t, client, http.MethodPost, host.URL+"/api/chats/group", owner.AccessToken, map[string]any{"title": "Interrupted creation", "memberIds": []string{member.User.ID}})
	chat := decodeJSON[chatPublic](t, response)
	// The message transaction can commit before the Canvas-card mapping write
	// fails. A sequence survives rollback, making this a one-shot failure.
	_, err := server.canvasDB.Exec(`CREATE SEQUENCE canvas_card_failure;
 CREATE FUNCTION fail_first_canvas_card() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF nextval('canvas_card_failure')=1 THEN RAISE EXCEPTION 'simulated mapping interruption'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER canvas_card_failure BEFORE INSERT ON canvas_cards FOR EACH ROW EXECUTE FUNCTION fail_first_canvas_card()`)
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()
	payload := map[string]any{"canvasId": id, "chatId": chat.ID, "title": "Retry card", "initialUpdate": base64.StdEncoding.EncodeToString([]byte("seed"))}
	endpoint := host.URL + "/api/v1/plugins/canvas/canvases"
	response = jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, payload)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusInternalServerError {
		t.Fatalf("interrupted create status = %d, want 500", response.StatusCode)
	}
	response = jsonRequest(t, client, http.MethodPost, endpoint, owner.AccessToken, payload)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("repair retry status = %d, want 201", response.StatusCode)
	}
	if canvas := decodeJSON[canvasPublic](t, response); canvas.ID != id {
		t.Fatalf("repair ID = %q", canvas.ID)
	}
	response = jsonRequest(t, client, http.MethodGet, host.URL+"/api/chats/"+chat.ID+"/messages", owner.AccessToken, nil)
	page := decodeJSON[messageHistoryPage](t, response)
	if len(page.Messages) != 1 || page.Messages[0].Type != "canvas" {
		t.Fatalf("messages after retry = %#v, want one Canvas card", page.Messages)
	}
	response = jsonRequest(t, client, http.MethodGet, endpoint+"/"+id+"/document", owner.AccessToken, nil)
	document := decodeJSON[struct {
		Updates []canvasUpdatePublic `json:"updates"`
	}](t, response)
	if len(document.Updates) != 1 {
		t.Fatalf("initial update count = %d, want 1", len(document.Updates))
	}
}
