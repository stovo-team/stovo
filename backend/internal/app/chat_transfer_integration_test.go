package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestChatImportCreatesSeparatePrivateChatAndRetryIsIdempotent(t *testing.T) {
	appServer, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-owner", "Transfer Family")
	systemArchive, err := appServer.ensureMessageArchive(owner.User)
	if err != nil {
		t.Fatalf("load system archive before import: %v", err)
	}
	before := listTransferChats(t, client, server.URL, owner.AccessToken)

	archive := validChatTransferEnvelope()
	sourceMessage := archive["messages"].([]map[string]any)[0]
	sourceMessage["kind"] = "service"
	sourceMessage["deletedAt"] = "2026-10-10T08:30:00Z"
	sourceMessage["attachmentIds"] = []string{"external-file"}
	sourceMessage["reactions"] = []map[string]any{{"emoji": "👍", "participantIds": []string{"source-user-1"}}}
	archive["attachments"] = []map[string]any{{"id": "external-file", "path": "attachments/photo.jpg", "filename": "photo.jpg", "mimeType": "image/jpeg", "size": 123, "externalUrl": "https://example.test/photo.jpg"}}
	requestBody := map[string]any{"archive": archive, "targetChatId": "existing-chat-must-not-be-used"}
	firstResponse := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "import-operation-1", requestBody)
	if firstResponse.StatusCode != http.StatusCreated {
		t.Fatalf("first import status = %d body=%s", firstResponse.StatusCode, readBody(t, firstResponse))
	}
	first := decodeJSON[chatPublic](t, firstResponse)
	if first.Type != "archive" {
		t.Fatalf("imported chat type = %q, want archive", first.Type)
	}
	if first.Title == nil || *first.Title != "Imported: Planning" {
		t.Fatalf("imported chat title = %v, want Imported: Planning", first.Title)
	}
	if len(first.Members) != 1 || first.Members[0].ID != owner.User.ID {
		t.Fatalf("imported archive members = %#v, want only importing member %q", first.Members, owner.User.ID)
	}
	if first.UnreadCount != 0 {
		t.Fatalf("imported archive unread count = %d, want 0 for historical messages", first.UnreadCount)
	}

	messagesResponse := jsonRequest(t, client, http.MethodGet, server.URL+"/api/chats/"+first.ID+"/messages", owner.AccessToken, nil)
	if messagesResponse.StatusCode != http.StatusOK {
		t.Fatalf("imported messages status = %d body=%s", messagesResponse.StatusCode, readBody(t, messagesResponse))
	}
	page := decodeJSON[messageHistoryPage](t, messagesResponse)
	if len(page.Messages) != 1 {
		t.Fatalf("imported message count = %d, want 1", len(page.Messages))
	}
	if page.Messages[0].SenderID != owner.User.ID || page.Messages[0].Content == nil || *page.Messages[0].Content != "Hello" {
		t.Fatalf("imported message = %#v, want importer as sender and original text", page.Messages[0])
	}
	if !page.Messages[0].CreatedAt.Equal(mustParseTransferTime(t, "2026-10-10T08:00:00Z")) {
		t.Fatalf("imported message timestamp = %s, want source timestamp", page.Messages[0].CreatedAt)
	}
	if page.Messages[0].ImportAttribution == nil || page.Messages[0].ImportAttribution.SourceProvider != "telegram" || page.Messages[0].ImportAttribution.SourceAuthorID != "source-user-1" || page.Messages[0].ImportAttribution.SourceAuthorName != "Mira" {
		t.Fatalf("imported source author attribution = %#v", page.Messages[0].ImportAttribution)
	}
	var sourceReactions []map[string]any
	if err := json.Unmarshal(page.Messages[0].ImportAttribution.Reactions, &sourceReactions); err != nil || len(sourceReactions) != 1 || sourceReactions[0]["emoji"] != "👍" {
		t.Fatalf("imported source reactions = %s err=%v", page.Messages[0].ImportAttribution.Reactions, err)
	}
	var sourceAttachments []map[string]any
	if err := json.Unmarshal(page.Messages[0].ImportAttribution.SourceAttachments, &sourceAttachments); err != nil || len(sourceAttachments) != 1 || sourceAttachments[0]["externalUrl"] != "https://example.test/photo.jpg" {
		t.Fatalf("imported source attachment references = %s err=%v", page.Messages[0].ImportAttribution.SourceAttachments, err)
	}
	if page.Messages[0].ImportAttribution.SourceDeletedAt == nil || *page.Messages[0].ImportAttribution.SourceDeletedAt != "2026-10-10T08:30:00Z" {
		t.Fatalf("imported source deletion time = %v", page.Messages[0].ImportAttribution.SourceDeletedAt)
	}
	var sourceMetadata map[string]any
	if err := json.Unmarshal(page.Messages[0].ImportAttribution.Metadata, &sourceMetadata); err != nil || sourceMetadata["sourceKind"] != "service" {
		t.Fatalf("imported source kind metadata = %s err=%v", page.Messages[0].ImportAttribution.Metadata, err)
	}
	var statusCount, eventCount int
	if err := appServer.sqlDB.QueryRow(`SELECT COUNT(*) FROM message_statuses WHERE message_id=$1`, page.Messages[0].ID).Scan(&statusCount); err != nil {
		t.Fatalf("count imported message statuses: %v", err)
	}
	if err := appServer.sqlDB.QueryRow(`SELECT (SELECT COUNT(*) FROM sync_events WHERE aggregate_id=$1) + (SELECT COUNT(*) FROM outbox_events WHERE partition_key=$1)`, first.ID).Scan(&eventCount); err != nil {
		t.Fatalf("count import events: %v", err)
	}
	if statusCount != 0 || eventCount != 0 {
		t.Fatalf("import side effects statuses=%d events=%d, want none", statusCount, eventCount)
	}

	retryResponse := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "import-operation-1", requestBody)
	if retryResponse.StatusCode != http.StatusOK && retryResponse.StatusCode != http.StatusCreated {
		t.Fatalf("idempotent retry status = %d body=%s", retryResponse.StatusCode, readBody(t, retryResponse))
	}
	retry := decodeJSON[chatPublic](t, retryResponse)
	if retry.ID != first.ID {
		t.Fatalf("retry chat ID = %q, first chat ID = %q", retry.ID, first.ID)
	}
	changedEnvelope := validChatTransferEnvelope()
	changedEnvelope["messages"].([]map[string]any)[0]["text"] = "Changed body"
	conflictResponse := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "import-operation-1", map[string]any{"archive": changedEnvelope})
	if conflictResponse.StatusCode != http.StatusConflict {
		t.Fatalf("same idempotency key with changed archive status = %d, want %d", conflictResponse.StatusCode, http.StatusConflict)
	}
	_ = conflictResponse.Body.Close()
	afterImportSystemArchive, err := appServer.ensureMessageArchive(owner.User)
	if err != nil || afterImportSystemArchive.ID != systemArchive.ID {
		t.Fatalf("import affected system archive: before=%q after=%#v err=%v", systemArchive.ID, afterImportSystemArchive, err)
	}

	after := listTransferChats(t, client, server.URL, owner.AccessToken)
	if len(after) != len(before)+1 {
		t.Fatalf("chat count after import/retry = %d, before = %d; want exactly one new chat", len(after), len(before))
	}
	importedCount := 0
	for _, chat := range after {
		if chat.ID == first.ID {
			importedCount++
		}
	}
	if importedCount != 1 {
		t.Fatalf("imported chat appears %d times in chat list, want once", importedCount)
	}
}

func TestChatImportRejectsMissingIdempotencyKeyWithoutCreatingChat(t *testing.T) {
	_, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-no-key", "Transfer Family")
	before := listTransferChats(t, client, server.URL, owner.AccessToken)

	response := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "", map[string]any{
		"archive": validChatTransferEnvelope(),
	})
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing idempotency key status = %d body=%s, want %d", response.StatusCode, readBody(t, response), http.StatusBadRequest)
	}
	_ = response.Body.Close()

	after := listTransferChats(t, client, server.URL, owner.AccessToken)
	if len(after) != len(before) {
		t.Fatalf("chat count after rejected import = %d, before = %d", len(after), len(before))
	}
}

func TestChatImportRejectsUnsupportedProfileWithoutCreatingChat(t *testing.T) {
	_, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-unsupported", "Transfer Family")
	before := listTransferChats(t, client, server.URL, owner.AccessToken)
	envelope := validChatTransferEnvelope()
	envelope["source"].(map[string]any)["profileId"] = "slack-workspace-export"
	response := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "unsupported-profile", map[string]any{"archive": envelope})
	if response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("unsupported profile status=%d body=%s", response.StatusCode, readBody(t, response))
	}
	after := listTransferChats(t, client, server.URL, owner.AccessToken)
	if len(after) != len(before) {
		t.Fatalf("unsupported profile created a chat: before=%d after=%d", len(before), len(after))
	}
}

func TestChatImportEndToEndRequiresClientCiphertextWithoutPlaintext(t *testing.T) {
	appServer, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-e2e-owner", "Transfer E2E Family")
	if _, err := appServer.sqlDB.ExecContext(t.Context(), `UPDATE families SET default_message_encryption_protocol='end_to_end' WHERE id=$1`, owner.User.FamilyID); err != nil {
		t.Fatalf("set family encryption protocol: %v", err)
	}
	before := len(listTransferChats(t, client, server.URL, owner.AccessToken))

	archiveWithoutText := validChatTransferEnvelope()
	delete(archiveWithoutText["messages"].([]map[string]any)[0], "text")
	archiveWithPlaintext := validChatTransferEnvelope()
	archiveWithoutMetadata := validChatTransferEnvelope()
	delete(archiveWithoutMetadata["messages"].([]map[string]any)[0], "text")
	keys := []string{"missing-encryption", "valid-encryption", "plaintext-content", "missing-metadata"}
	wantStatuses := []int{http.StatusUnprocessableEntity, http.StatusCreated, http.StatusUnprocessableEntity, http.StatusUnprocessableEntity}
	bodies := []map[string]any{
		{"archive": validChatTransferEnvelope()},
		{"archive": archiveWithoutText, "preparedContent": map[string]any{"source-message-1": map[string]any{"ciphertext": "ciphertext", "nonce": "nonce", "encryptionMetadata": "wrapped-key"}}},
		{"archive": archiveWithPlaintext, "preparedContent": map[string]any{"source-message-1": map[string]any{"content": "plaintext must not be persisted", "ciphertext": "ciphertext", "nonce": "nonce", "encryptionMetadata": "wrapped-key"}}},
		{"archive": archiveWithoutMetadata, "preparedContent": map[string]any{"source-message-1": map[string]any{"ciphertext": "ciphertext", "nonce": "nonce"}}},
	}
	createdChatID := ""
	for index, body := range bodies {
		response := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, keys[index], body)
		if response.StatusCode != wantStatuses[index] {
			t.Fatalf("end-to-end import case %q status = %d body=%s, want %d", keys[index], response.StatusCode, readBody(t, response), wantStatuses[index])
		}
		if index == 1 {
			imported := decodeJSON[chatPublic](t, response)
			createdChatID = imported.ID
			messagesResponse := jsonRequest(t, client, http.MethodGet, server.URL+"/api/chats/"+createdChatID+"/messages", owner.AccessToken, nil)
			if messagesResponse.StatusCode != http.StatusOK {
				t.Fatalf("load end-to-end imported message status = %d body=%s", messagesResponse.StatusCode, readBody(t, messagesResponse))
			}
			page := decodeJSON[messageHistoryPage](t, messagesResponse)
			if len(page.Messages) != 1 || page.Messages[0].Content != nil || page.Messages[0].Ciphertext == nil || page.Messages[0].EncryptionMetadata == nil {
				t.Fatalf("persisted end-to-end message = %#v, want ciphertext only", page.Messages)
			}
		} else {
			_ = response.Body.Close()
		}
	}
	if after := len(listTransferChats(t, client, server.URL, owner.AccessToken)); after != before+1 {
		t.Fatalf("end-to-end imports created unexpected chat count: before=%d after=%d", before, after)
	}
}

func TestChatImportServerEncryptedDestinationRequiresClientPlaintext(t *testing.T) {
	_, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-server-encrypted-owner", "Transfer Server Encryption Family")
	before := len(listTransferChats(t, client, server.URL, owner.AccessToken))
	archiveWithoutText := validChatTransferEnvelope()
	delete(archiveWithoutText["messages"].([]map[string]any)[0], "text")
	response := chatTransferJSONRequest(t, client, http.MethodPost, server.URL+"/api/chat-imports", owner.AccessToken, "server-encrypted-missing-text", map[string]any{
		"archive":         archiveWithoutText,
		"preparedContent": map[string]any{"source-message-1": map[string]any{"ciphertext": "ciphertext", "nonce": "nonce", "encryptionMetadata": "wrapped-key"}},
	})
	if response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("server-encrypted import status = %d body=%s, want %d", response.StatusCode, readBody(t, response), http.StatusUnprocessableEntity)
	}
	_ = response.Body.Close()
	if after := len(listTransferChats(t, client, server.URL, owner.AccessToken)); after != before {
		t.Fatalf("rejected server-encrypted import created chats: before=%d after=%d", before, after)
	}
}

func TestChatExportSourceRequiresMembershipAndIsScopedToOneChat(t *testing.T) {
	_, server, client := newTestServer(t)
	owner := setupOwner(t, client, server.URL, "transfer-export-owner", "Transfer Family")
	member := createInvitedUser(t, client, server.URL, owner, "transfer-export-member")
	outsider := createInvitedUser(t, client, server.URL, owner, "transfer-export-outsider")

	createResponse := jsonRequest(t, client, http.MethodPost, server.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "Selected chat",
		"memberIds": []string{member.User.ID},
	})
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d body=%s", createResponse.StatusCode, readBody(t, createResponse))
	}
	selected := decodeJSON[chatPublic](t, createResponse)

	memberResponse := jsonRequest(t, client, http.MethodGet, server.URL+"/api/chats/"+selected.ID+"/transfer-source", member.AccessToken, nil)
	if memberResponse.StatusCode != http.StatusOK {
		t.Fatalf("member export-source status = %d body=%s", memberResponse.StatusCode, readBody(t, memberResponse))
	}
	var source map[string]any
	if err := json.NewDecoder(memberResponse.Body).Decode(&source); err != nil {
		t.Fatalf("decode export source: %v", err)
	}
	_ = memberResponse.Body.Close()
	if source["chatId"] != selected.ID {
		t.Fatalf("export-source chat ID = %v, want selected chat %q", source["chatId"], selected.ID)
	}

	outsiderResponse := jsonRequest(t, client, http.MethodGet, server.URL+"/api/chats/"+selected.ID+"/transfer-source", outsider.AccessToken, nil)
	if outsiderResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("non-member export-source status = %d, want %d", outsiderResponse.StatusCode, http.StatusNotFound)
	}
	_ = outsiderResponse.Body.Close()

	missingResponse := jsonRequest(t, client, http.MethodGet, server.URL+"/api/chats/missing-chat/transfer-source", owner.AccessToken, nil)
	if missingResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("missing-chat export-source status = %d, want %d", missingResponse.StatusCode, http.StatusNotFound)
	}
	_ = missingResponse.Body.Close()
}

func listTransferChats(t *testing.T, client *http.Client, baseURL, token string) []chatPublic {
	t.Helper()
	response := jsonRequest(t, client, http.MethodGet, baseURL+"/api/chats", token, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("list chats status = %d body=%s", response.StatusCode, readBody(t, response))
	}
	return decodeJSON[[]chatPublic](t, response)
}

func chatTransferJSONRequest(t *testing.T, client *http.Client, method, target, token, idempotencyKey string, body any) *http.Response {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal chat transfer request: %v", err)
	}
	request, err := http.NewRequest(method, target, bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("new chat transfer request: %v", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://localhost:5173")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("do chat transfer request: %v", err)
	}
	return response
}

func validChatTransferEnvelope() map[string]any {
	return map[string]any{
		"schemaVersion": 1,
		"source":        map[string]any{"providerId": "telegram", "profileId": "telegram-desktop-json"},
		"conversation":  map[string]any{"sourceId": "source-chat-1", "title": "Planning"},
		"participants":  []map[string]any{{"sourceId": "source-user-1", "displayName": "Mira"}},
		"messages": []map[string]any{{
			"sourceId": "source-message-1", "authorId": "source-user-1", "timestamp": "2026-10-10T08:00:00Z", "kind": "text", "text": "Hello",
		}},
		"attachments": []any{},
		"warnings":    []any{},
	}
}

func mustParseTransferTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse fixture timestamp: %v", err)
	}
	return parsed
}
