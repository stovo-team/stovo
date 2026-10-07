package app

import (
	"net/http"
	"strings"
	"testing"
)

func TestChatDescriptionUpdatesAndPersists(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Description Test Workspace",
		"username":    "desc-owner",
		"password":    "secure-password",
		"displayName": "Description Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	createResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "Atlas Project",
		"memberIds": []string{},
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d, want %d", createResp.StatusCode, http.StatusCreated)
	}
	created := decodeJSON[chatPublic](t, createResp)
	if created.Description != nil {
		t.Fatalf("initial description = %v, want nil", created.Description)
	}

	// Set description
	updateResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, map[string]any{
		"description": "Atlas client rollout",
	})
	if updateResp.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d", updateResp.StatusCode, http.StatusOK)
	}
	updated := decodeJSON[chatPublic](t, updateResp)
	if updated.Description == nil || *updated.Description != "Atlas client rollout" {
		t.Fatalf("updated description = %v, want 'Atlas client rollout'", updated.Description)
	}

	// Verify GET persists description
	getResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, nil)
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("get status = %d, want %d", getResp.StatusCode, http.StatusOK)
	}
	fetched := decodeJSON[chatPublic](t, getResp)
	if fetched.Description == nil || *fetched.Description != "Atlas client rollout" {
		t.Fatalf("persisted description = %v, want 'Atlas client rollout'", fetched.Description)
	}

	// Clear description
	clearResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, map[string]any{
		"description": "",
	})
	if clearResp.StatusCode != http.StatusOK {
		t.Fatalf("clear status = %d, want %d", clearResp.StatusCode, http.StatusOK)
	}
	cleared := decodeJSON[chatPublic](t, clearResp)
	if cleared.Description != nil {
		t.Fatalf("cleared description = %v, want nil", cleared.Description)
	}
}

func TestChatNameAndDescriptionEnforceLengthLimits(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Length Limit Test Workspace",
		"username":    "length-owner",
		"password":    "secure-password",
		"displayName": "Length Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	createResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "A valid chat name",
		"memberIds": []string{},
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d, want %d", createResp.StatusCode, http.StatusCreated)
	}
	created := decodeJSON[chatPublic](t, createResp)

	tooLongName := strings.Repeat("n", 256)
	for _, path := range []string{"/api/chats/group", "/api/chats/" + created.ID} {
		method := http.MethodPost
		body := map[string]any{"title": tooLongName, "memberIds": []string{}}
		if path == "/api/chats/"+created.ID {
			method = http.MethodPatch
			body = map[string]any{"title": tooLongName}
		}
		resp := jsonRequest(t, client, method, serverURL.URL+path, owner.AccessToken, body)
		if resp.StatusCode != http.StatusUnprocessableEntity {
			t.Errorf("%s %s status = %d, want %d", method, path, resp.StatusCode, http.StatusUnprocessableEntity)
		}
	}

	tooLongDescription := strings.Repeat("d", 121)
	descriptionResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, map[string]any{
		"description": tooLongDescription,
	})
	if descriptionResp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("description update status = %d, want %d", descriptionResp.StatusCode, http.StatusUnprocessableEntity)
	}
}
