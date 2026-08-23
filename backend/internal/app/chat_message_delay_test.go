package app

import (
	"net/http"
	"testing"
)

func TestChatMessageDelayReturnsAndPersistsCommittedValue(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setupResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Message Delay Workspace",
		"username":    "delay-owner",
		"password":    "secure-password",
		"displayName": "Delay Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setupResp)

	createResp := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "Delayed chat",
		"memberIds": []string{},
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d, want %d", createResp.StatusCode, http.StatusCreated)
	}
	created := decodeJSON[chatPublic](t, createResp)

	updateResp := jsonRequest(t, client, http.MethodPatch, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, map[string]any{
		"messageDelaySeconds": 5,
	})
	if updateResp.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d", updateResp.StatusCode, http.StatusOK)
	}
	updated := decodeJSON[chatPublic](t, updateResp)
	if updated.MessageDelaySeconds != 5 {
		t.Fatalf("response delay = %d, want 5", updated.MessageDelaySeconds)
	}

	getResp := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/chats/"+created.ID, owner.AccessToken, nil)
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("get status = %d, want %d", getResp.StatusCode, http.StatusOK)
	}
	fetched := decodeJSON[chatPublic](t, getResp)
	if fetched.MessageDelaySeconds != 5 {
		t.Fatalf("persisted delay = %d, want 5", fetched.MessageDelaySeconds)
	}
}
