package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

func TestIntelligenceSourceV2AuthorizationRouteHasVersionedNoStoreFailure(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	request, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", strings.NewReader(`{"schema_version":"v2","resource_ids":["synthetic-resource"],"operation":"read"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer unknown-source-token")
	response, err := fixture.httpClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		SchemaVersion string `json:"schema_version"`
		Error         struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode v2 source error envelope: %v; body=%s", err, body)
	}
	if response.StatusCode != http.StatusUnauthorized || envelope.SchemaVersion != "v2" || envelope.Error.Code != "invalid_credential" || response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("v2 authorization failure = status %d, schema %q, code %q, cache-control %q, body=%s; want 401/v2/invalid_credential/no-store", response.StatusCode, envelope.SchemaVersion, envelope.Error.Code, response.Header.Get("Cache-Control"), body)
	}
}

func TestIntelligenceSourceV2AuthorizationUsesCurrentScopedOperationGrants(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{})
	messageID := "source-v2-policy-message-" + uuid.NewString()
	otherMessageID := "source-v2-policy-out-of-chat-" + uuid.NewString()
	unknownProtocolID := "source-v2-policy-unknown-protocol-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','synthetic authorization content',$4,$4),($5,$6,$3,'text','synthetic other-chat content',$4,$4)`, messageID, fixture.chatID, fixture.userID, createdAt, otherMessageID, fixture.secondChatID); err != nil {
		t.Fatalf("insert synthetic policy messages: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `INSERT INTO public.messages(id,chat_id,sender_id,type,content,encryption_protocol,created_at,updated_at) VALUES($1,$2,$3,'text','synthetic unsupported protocol','future_cipher', $4,$4)`, unknownProtocolID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic unsupported-protocol message: %v", err)
	}
	operations := []string{"read", "process", "external_transfer", "export"}
	for _, operation := range operations {
		decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, operation)
		if decision.Allowed {
			t.Errorf("default-denied %s grant was allowed: %#v", operation, decision)
		}
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `
		UPDATE public.intelligence_source_v2_connection_grants SET granted=true,granted_at=now(),revoked_at=NULL,updated_at=now()
		WHERE connection_id=$1 AND grant_type IN ('read','process','export')`, connectionID); err != nil {
		t.Fatalf("grant synthetic operation permissions: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.families SET ai_notes_enabled=true WHERE id=$1`, fixture.familyID); err != nil {
		t.Fatalf("enable synthetic AI Notes policy: %v", err)
	}
	for operation, want := range map[string]bool{"read": true, "process": true, "external_transfer": false, "export": true} {
		decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, operation)
		if decision.Allowed != want || decision.ConnectionID != connectionID || decision.PrincipalID != fixture.userID || decision.Scope.Kind != "chat" || decision.Scope.ResourceID != fixture.chatID || decision.ValidUntil.Sub(decision.DecidedAt) > 30*time.Second {
			t.Errorf("%s decision = %#v, want allowed=%v and credential-mapped scope", operation, decision, want)
		}
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, otherMessageID, "read"); decision.Allowed {
		t.Errorf("message outside the consented chat was allowed: %#v", decision)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, unknownProtocolID, "read"); decision.Allowed {
		t.Errorf("message with unsupported encryption protocol was allowed: %#v", decision)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.families SET ai_notes_enabled=false WHERE id=$1`, fixture.familyID); err != nil {
		t.Fatalf("disable synthetic AI Notes policy: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "process"); decision.Allowed {
		t.Errorf("process was allowed while current AI Notes policy was disabled: %#v", decision)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()+interval '3 seconds' WHERE id=$1`, connectionID); err != nil {
		t.Fatalf("set synthetic near-expiry source credential: %v", err)
	}
	var credentialExpiresAt time.Time
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT credential_expires_at FROM public.intelligence_source_v2_connections WHERE id=$1`, connectionID).Scan(&credentialExpiresAt); err != nil {
		t.Fatalf("read synthetic source credential expiry: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "read"); !decision.Allowed || decision.ValidUntil.After(credentialExpiresAt) {
		t.Errorf("authorization decision outlives source credential: %#v credential_expires_at=%s", decision, credentialExpiresAt)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `INSERT INTO public.message_user_deletions(message_id,user_id,deleted_at) VALUES($1,$2,$3)`, messageID, fixture.userID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("hide synthetic message from current principal: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "read"); decision.Allowed {
		t.Errorf("read was allowed after current principal hid the message: %#v", decision)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `DELETE FROM public.message_user_deletions WHERE message_id=$1 AND user_id=$2`, messageID, fixture.userID); err != nil {
		t.Fatalf("restore synthetic message visibility: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `DELETE FROM public.chat_members WHERE chat_id=$1 AND user_id=$2`, fixture.chatID, fixture.userID); err != nil {
		t.Fatalf("remove synthetic current membership: %v", err)
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, messageID, "read"); decision.Allowed {
		t.Errorf("read was allowed after current chat membership was removed: %#v", decision)
	}
	legacy := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v1/intelligence/source/events", credential, nil)
	defer func() { _ = legacy.Body.Close() }()
	if legacy.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(legacy.Body)
		t.Fatalf("v2 credential was accepted by v1 source route: status=%d body=%s", legacy.StatusCode, body)
	}
}

func TestIntelligenceSourceV2BackfillAndFenceReplayPreserveExactSnapshots(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	plaintextID := "source-v2-sync-plaintext-" + uuid.NewString()
	serverEncryptedID := "source-v2-sync-server-encrypted-" + uuid.NewString()
	e2eID := "source-v2-sync-e2e-" + uuid.NewString()
	serverCiphertext, serverNonce, err := fixture.server.encryptServerAtRest(fixture.familyID, "Секрет 🌙")
	if err != nil {
		t.Fatalf("encrypt synthetic server-at-rest message: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','История 🌍',$4,$4)`, plaintextID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic plaintext history: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,ciphertext,nonce,key_version,encryption_protocol,created_at,updated_at)
		VALUES($1,$2,$3,'text',NULL,$4,$5,1,'server_at_rest',$6,$6)`, serverEncryptedID, fixture.chatID, fixture.userID, serverCiphertext, serverNonce, createdAt); err != nil {
		t.Fatalf("insert synthetic server-at-rest history: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,ciphertext,nonce,encryption_protocol,created_at,updated_at)
		VALUES($1,$2,$3,'text',NULL,'synthetic-e2e-ciphertext','synthetic-e2e-nonce','end_to_end',$4,$4)`, e2eID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic E2E history: %v", err)
	}
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})

	start := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/backfills", credential, map[string]any{})
	defer func() { _ = start.Body.Close() }()
	startBody, _ := io.ReadAll(start.Body)
	var started struct {
		SchemaVersion  string `json:"schema_version"`
		BackfillID     string `json:"backfill_id"`
		SnapshotCursor string `json:"snapshot_cursor"`
		ScopeReset     bool   `json:"scope_reset"`
	}
	if start.StatusCode != http.StatusOK || start.Header.Get("Cache-Control") != "no-store" || json.Unmarshal(startBody, &started) != nil || started.SchemaVersion != "v2" || started.BackfillID == "" || started.SnapshotCursor == "" || !started.ScopeReset {
		t.Fatalf("backfill start status=%d cache=%q body=%s", start.StatusCode, start.Header.Get("Cache-Control"), startBody)
	}

	snapshotURL := fixture.serverURL + "/api/v2/intelligence/source/backfills/" + url.PathEscape(started.BackfillID) + "/snapshots?cursor=" + url.QueryEscape(started.SnapshotCursor)
	snapshotResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, snapshotURL, credential, nil)
	snapshotBody, err := io.ReadAll(snapshotResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	_ = snapshotResponse.Body.Close()
	var snapshots struct {
		SchemaVersion string `json:"schema_version"`
		Snapshots     []struct {
			TenantID     string         `json:"tenant_id"`
			ConnectionID string         `json:"connection_id"`
			PrincipalID  string         `json:"principal_id"`
			ResourceID   string         `json:"resource_id"`
			RevisionID   string         `json:"revision_id"`
			Content      string         `json:"content"`
			Metadata     map[string]any `json:"metadata"`
		} `json:"snapshots"`
		NextSnapshotCursor string `json:"next_snapshot_cursor"`
		HasMore            bool   `json:"has_more"`
		FenceCursor        string `json:"fence_cursor"`
	}
	if snapshotResponse.StatusCode != http.StatusOK || snapshotResponse.Header.Get("Cache-Control") != "no-store" || json.Unmarshal(snapshotBody, &snapshots) != nil || snapshots.SchemaVersion != "v2" || len(snapshots.Snapshots) != 2 || snapshots.HasMore || snapshots.FenceCursor == "" {
		t.Fatalf("snapshot page status=%d cache=%q body=%s", snapshotResponse.StatusCode, snapshotResponse.Header.Get("Cache-Control"), snapshotBody)
	}
	var exactRevision string
	seenPlaintext, seenServerAtRest := false, false
	for _, snapshot := range snapshots.Snapshots {
		if snapshot.TenantID == "" || snapshot.ConnectionID != connectionID || snapshot.PrincipalID != fixture.userID || snapshot.RevisionID == "" {
			t.Errorf("snapshot lacks credential-bound identity/revision: %#v", snapshot)
		}
		switch snapshot.ResourceID {
		case plaintextID:
			seenPlaintext = snapshot.Content == "История 🌍"
			exactRevision = snapshot.RevisionID
		case serverEncryptedID:
			seenServerAtRest = snapshot.Content == "Секрет 🌙"
		}
		if strings.Contains(string(snapshotBody), serverCiphertext) || strings.Contains(string(snapshotBody), serverNonce) || strings.Contains(string(snapshotBody), "synthetic-e2e-ciphertext") {
			t.Fatal("ciphertext or nonce appeared in snapshot response")
		}
	}
	if !seenPlaintext || !seenServerAtRest || exactRevision == "" {
		t.Fatalf("backfill omitted supported history plaintext=%v server_at_rest=%v snapshots=%#v", seenPlaintext, seenServerAtRest, snapshots.Snapshots)
	}
	if strings.Contains(string(snapshotBody), e2eID) {
		t.Fatalf("E2E resource appeared in backfill snapshot: %s", snapshotBody)
	}

	exactURL := fixture.serverURL + "/api/v2/intelligence/source/resources/" + url.PathEscape(plaintextID) + "/snapshot?revision_id=" + url.QueryEscape(exactRevision)
	exactResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, exactURL, credential, nil)
	var exact struct {
		SchemaVersion string `json:"schema_version"`
		RevisionID    string `json:"revision_id"`
		Content       string `json:"content"`
	}
	if exactResponse.StatusCode != http.StatusOK || json.NewDecoder(exactResponse.Body).Decode(&exact) != nil || exact.SchemaVersion != "v2" || exact.RevisionID != exactRevision || exact.Content != "История 🌍" {
		body, _ := io.ReadAll(exactResponse.Body)
		_ = exactResponse.Body.Close()
		t.Fatalf("exact snapshot status=%d body=%s result=%#v", exactResponse.StatusCode, body, exact)
	}
	_ = exactResponse.Body.Close()

	citation := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/citations:resolve", credential, map[string]any{
		"schema_version": "v2", "resource_id": plaintextID, "revision_id": exactRevision,
		"locator": map[string]any{"kind": "text", "start": 8, "end": 9},
	})
	var citationResult struct {
		SchemaVersion string `json:"schema_version"`
		RevisionID    string `json:"revision_id"`
		Excerpt       string `json:"excerpt"`
	}
	if citation.StatusCode != http.StatusOK || json.NewDecoder(citation.Body).Decode(&citationResult) != nil || citationResult.SchemaVersion != "v2" || citationResult.RevisionID != exactRevision || citationResult.Excerpt != "🌍" {
		body, _ := io.ReadAll(citation.Body)
		_ = citation.Body.Close()
		t.Fatalf("Unicode citation status=%d body=%s result=%#v", citation.StatusCode, body, citationResult)
	}
	_ = citation.Body.Close()

	newMessageID := "source-v2-sync-created-after-fence-" + uuid.NewString()
	createdAfterFence := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET content='Изменено 🌍',updated_at=$2 WHERE id=$1`, plaintextID, createdAfterFence); err != nil {
		t.Fatalf("edit synthetic message after fence: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','Создано после fence',$4,$4)`, newMessageID, fixture.chatID, fixture.userID, createdAfterFence); err != nil {
		t.Fatalf("create synthetic message after fence: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=$2,updated_at=$2 WHERE id=$1`, serverEncryptedID, createdAfterFence); err != nil {
		t.Fatalf("delete synthetic message after fence: %v", err)
	}

	cursor := snapshots.FenceCursor
	var replayed []struct {
		SchemaVersion  string `json:"schema_version"`
		EventID        string `json:"event_id"`
		TenantID       string `json:"tenant_id"`
		ConnectionID   string `json:"connection_id"`
		PrincipalID    string `json:"principal_id"`
		ResourceID     string `json:"resource_id"`
		RevisionID     string `json:"revision_id"`
		OrderToken     string `json:"order_token"`
		SourceSequence int64  `json:"source_sequence"`
		Kind           string `json:"kind"`
		Tombstone      bool   `json:"tombstone"`
	}
	for page := 0; page < 5; page++ {
		eventURL := fixture.serverURL + "/api/v2/intelligence/source/events?cursor=" + url.QueryEscape(cursor) + "&limit=1"
		eventResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, eventURL, credential, nil)
		eventBody, err := io.ReadAll(eventResponse.Body)
		if err != nil {
			t.Fatal(err)
		}
		_ = eventResponse.Body.Close()
		var events struct {
			SchemaVersion string `json:"schema_version"`
			Events        []struct {
				SchemaVersion  string `json:"schema_version"`
				EventID        string `json:"event_id"`
				TenantID       string `json:"tenant_id"`
				ConnectionID   string `json:"connection_id"`
				PrincipalID    string `json:"principal_id"`
				ResourceID     string `json:"resource_id"`
				RevisionID     string `json:"revision_id"`
				OrderToken     string `json:"order_token"`
				SourceSequence int64  `json:"source_sequence"`
				Kind           string `json:"kind"`
				Tombstone      bool   `json:"tombstone"`
			} `json:"events"`
			NextCursor string `json:"next_cursor"`
			HasMore    bool   `json:"has_more"`
		}
		if eventResponse.StatusCode != http.StatusOK || eventResponse.Header.Get("Cache-Control") != "no-store" || json.Unmarshal(eventBody, &events) != nil || events.SchemaVersion != "v2" {
			t.Fatalf("event page status=%d cache=%q body=%s", eventResponse.StatusCode, eventResponse.Header.Get("Cache-Control"), eventBody)
		}
		if strings.Contains(string(eventBody), serverCiphertext) || strings.Contains(string(eventBody), serverNonce) || strings.Contains(string(eventBody), "synthetic-e2e-ciphertext") {
			t.Fatalf("event body contains ciphertext or nonce: %s", eventBody)
		}
		if page == 0 {
			duplicateResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, eventURL, credential, nil)
			duplicateBody, err := io.ReadAll(duplicateResponse.Body)
			_ = duplicateResponse.Body.Close()
			var duplicatePage struct {
				Events []struct {
					EventID string `json:"event_id"`
				} `json:"events"`
			}
			if err != nil || duplicateResponse.StatusCode != http.StatusOK || json.Unmarshal(duplicateBody, &duplicatePage) != nil || len(duplicatePage.Events) != len(events.Events) || len(events.Events) == 0 || duplicatePage.Events[0].EventID != events.Events[0].EventID {
				t.Fatalf("replaying the same event cursor was not at-least-once stable: status=%d first=%s retry=%s", duplicateResponse.StatusCode, eventBody, duplicateBody)
			}
		}
		for _, event := range events.Events {
			if event.SchemaVersion != "v2" || event.EventID == "" || event.TenantID == "" || event.ConnectionID != connectionID || event.PrincipalID != fixture.userID || event.ResourceID == "" || event.RevisionID == "" || event.OrderToken == "" || event.SourceSequence <= 0 {
				t.Errorf("event lacks stable identity/order fields: %#v", event)
			}
			replayed = append(replayed, event)
		}
		if !events.HasMore {
			break
		}
		if events.NextCursor == "" || len(events.Events) != 1 {
			t.Fatalf("event page omitted cursor/ordered item: %#v", events)
		}
		cursor = events.NextCursor
	}
	if len(replayed) != 3 {
		t.Fatalf("replay returned %d events, want create/edit/delete: %#v", len(replayed), replayed)
	}
	kindsByResource := map[string]string{}
	for _, event := range replayed {
		kindsByResource[event.ResourceID] = event.Kind
	}
	if kindsByResource[plaintextID] != "update" || kindsByResource[newMessageID] != "create" || kindsByResource[serverEncryptedID] != "delete" || !replayed[2].Tombstone {
		t.Fatalf("replayed lifecycle events = %#v", replayed)
	}
	for i := 1; i < len(replayed); i++ {
		if replayed[i].SourceSequence <= replayed[i-1].SourceSequence {
			t.Fatalf("event sequence not strictly increasing: %#v", replayed)
		}
	}
}

func TestIntelligenceSourceV2BackfillCursorBindingExpiryRetryAndReset(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	resourceIDs := []string{"source-v2-cursor-a-" + uuid.NewString(), "source-v2-cursor-b-" + uuid.NewString()}
	for index, resourceID := range resourceIDs {
		content := "cursor snapshot " + strconv.Itoa(index)
		if _, err := fixture.server.sqlDB.ExecContext(ctx, `
			INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
			VALUES($1,$2,$3,'text',$4,$5,$5)`, resourceID, fixture.chatID, fixture.userID, content, createdAt); err != nil {
			t.Fatalf("insert synthetic cursor snapshot %d: %v", index, err)
		}
	}
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	startBackfill := func(sourceCredential string) (string, string) {
		t.Helper()
		response := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/backfills", sourceCredential, map[string]any{})
		defer func() { _ = response.Body.Close() }()
		var result struct {
			SchemaVersion  string `json:"schema_version"`
			BackfillID     string `json:"backfill_id"`
			SnapshotCursor string `json:"snapshot_cursor"`
			ScopeReset     bool   `json:"scope_reset"`
		}
		if response.StatusCode != http.StatusOK || json.NewDecoder(response.Body).Decode(&result) != nil || result.SchemaVersion != "v2" || !result.ScopeReset || result.BackfillID == "" || result.SnapshotCursor == "" {
			t.Fatalf("start cursor-test backfill status=%d result=%#v", response.StatusCode, result)
		}
		return result.BackfillID, result.SnapshotCursor
	}
	type snapshotPage struct {
		SchemaVersion string `json:"schema_version"`
		Snapshots     []struct {
			ResourceID string `json:"resource_id"`
			RevisionID string `json:"revision_id"`
		} `json:"snapshots"`
		NextSnapshotCursor string `json:"next_snapshot_cursor"`
		HasMore            bool   `json:"has_more"`
	}
	readPage := func(sourceCredential, backfillID, cursor string) (int, string, snapshotPage) {
		t.Helper()
		pageURL := fixture.serverURL + "/api/v2/intelligence/source/backfills/" + url.PathEscape(backfillID) + "/snapshots?cursor=" + url.QueryEscape(cursor) + "&limit=1"
		response := sourceV2Request(t, fixture.httpClient, http.MethodGet, pageURL, sourceCredential, nil)
		defer func() { _ = response.Body.Close() }()
		body, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatalf("read cursor snapshot response: %v", err)
		}
		var page snapshotPage
		if response.StatusCode == http.StatusOK {
			if err := json.Unmarshal(body, &page); err != nil {
				t.Fatalf("decode cursor snapshot response %q: %v", body, err)
			}
		}
		return response.StatusCode, string(body), page
	}
	backfillID, cursor := startBackfill(credential)
	status, firstBody, firstPage := readPage(credential, backfillID, cursor)
	if status != http.StatusOK || firstPage.SchemaVersion != "v2" || !firstPage.HasMore || len(firstPage.Snapshots) != 1 || firstPage.NextSnapshotCursor == "" {
		t.Fatalf("first limited snapshot page status=%d page=%#v body=%s", status, firstPage, firstBody)
	}
	status, duplicateBody, duplicatePage := readPage(credential, backfillID, cursor)
	if status != http.StatusOK || len(duplicatePage.Snapshots) != 1 || duplicatePage.Snapshots[0].RevisionID != firstPage.Snapshots[0].RevisionID || duplicatePage.NextSnapshotCursor != firstPage.NextSnapshotCursor || duplicateBody != firstBody {
		t.Fatalf("retry did not return the same materialized page: status=%d first=%s retry=%s", status, firstBody, duplicateBody)
	}
	status, _, finalPage := readPage(credential, backfillID, firstPage.NextSnapshotCursor)
	if status != http.StatusOK || finalPage.HasMore || len(finalPage.Snapshots) != 1 {
		t.Fatalf("second limited snapshot page status=%d page=%#v", status, finalPage)
	}
	if finalPage.Snapshots[0].ResourceID == firstPage.Snapshots[0].ResourceID {
		t.Fatalf("snapshot keyset repeated resource across pages: %#v then %#v", firstPage, finalPage)
	}

	invalidCursorCode := func(sourceCredential, pathBackfillID, rawCursor string) string {
		t.Helper()
		pageURL := fixture.serverURL + "/api/v2/intelligence/source/backfills/" + url.PathEscape(pathBackfillID) + "/snapshots?cursor=" + url.QueryEscape(rawCursor)
		response := sourceV2Request(t, fixture.httpClient, http.MethodGet, pageURL, sourceCredential, nil)
		defer func() { _ = response.Body.Close() }()
		var envelope struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
			t.Fatalf("decode invalid cursor response status=%d: %v", response.StatusCode, err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid cursor status=%d code=%q, want 400", response.StatusCode, envelope.Error.Code)
		}
		return envelope.Error.Code
	}
	tampered := "A" + cursor[1:]
	if invalidCursorCode(credential, backfillID, tampered) != "invalid_cursor" {
		t.Fatal("tampered snapshot cursor did not return invalid_cursor")
	}
	otherBackfillID, _ := startBackfill(credential)
	if invalidCursorCode(credential, otherBackfillID, cursor) != "invalid_cursor" {
		t.Fatal("snapshot cursor from one backfill was accepted for another backfill")
	}
	secondConnectionID, secondCredential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	if secondConnectionID == connectionID || invalidCursorCode(secondCredential, backfillID, cursor) != "invalid_cursor" {
		t.Fatal("snapshot cursor was not bound to its source connection")
	}

	identity, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, credential)
	if err != nil {
		t.Fatalf("authenticate cursor fixture credential: %v", err)
	}
	expiredCursor := fixture.server.encodeIntelligenceSourceV2Cursor(intelligenceSourceV2Cursor{
		Kind: "snapshot", ConnectionID: identity.ConnectionID, ChatID: identity.ChatID,
		BackfillID: backfillID, Page: 0, IssuedAt: fixture.server.intelligenceOIDCNow().Add(-8 * 24 * time.Hour).Unix(),
	})
	expiredURL := fixture.serverURL + "/api/v2/intelligence/source/backfills/" + url.PathEscape(backfillID) + "/snapshots?cursor=" + url.QueryEscape(expiredCursor)
	expiredResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, expiredURL, credential, nil)
	defer func() { _ = expiredResponse.Body.Close() }()
	var expiredEnvelope struct {
		SchemaVersion string `json:"schema_version"`
		Error         struct {
			Code     string            `json:"code"`
			Recovery map[string]string `json:"recovery"`
		} `json:"error"`
	}
	if expiredResponse.StatusCode != http.StatusGone || json.NewDecoder(expiredResponse.Body).Decode(&expiredEnvelope) != nil || expiredEnvelope.SchemaVersion != "v2" || expiredEnvelope.Error.Code != "cursor_expired" || expiredEnvelope.Error.Recovery["action"] != "full_backfill_required" {
		t.Fatalf("expired cursor response status=%d envelope=%#v", expiredResponse.StatusCode, expiredEnvelope)
	}
	resetID, resetCursor := startBackfill(credential)
	if resetID == backfillID || resetCursor == cursor {
		t.Fatalf("full backfill did not create an independent reset: old=%s new=%s", backfillID, resetID)
	}
}

func TestIntelligenceSourceV2FenceSerializesConcurrentCreateEditAndDelete(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	editID := "source-v2-fence-edit-" + uuid.NewString()
	deleteID := "source-v2-fence-delete-" + uuid.NewString()
	createID := "source-v2-fence-create-" + uuid.NewString()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','before edit',$4,$4),($5,$2,$3,'text','before delete',$4,$4)`, editID, fixture.chatID, fixture.userID, createdAt, deleteID); err != nil {
		t.Fatalf("insert synthetic concurrent-fence history: %v", err)
	}
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	identity, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, credential)
	if err != nil {
		t.Fatalf("authenticate synthetic concurrent-fence connection: %v", err)
	}
	lockTx, err := fixture.server.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin synthetic source-sequence lock: %v", err)
	}
	defer func() { _ = lockTx.Rollback() }()
	var sequence int64
	if err := lockTx.QueryRowContext(ctx, `SELECT next_sequence FROM public.intelligence_source_v2_connections WHERE id=$1 FOR UPDATE`, connectionID).Scan(&sequence); err != nil {
		t.Fatalf("lock synthetic source sequence: %v", err)
	}
	_ = sequence

	operations := []struct {
		name  string
		query string
		args  []any
	}{
		{"edit", `UPDATE public.messages SET content='after edit 🌍',updated_at=$2 WHERE id=$1`, []any{editID, time.Now().UTC().Format(time.RFC3339Nano)}},
		{"delete", `UPDATE public.messages SET deleted_at=$2,updated_at=$2 WHERE id=$1`, []any{deleteID, time.Now().UTC().Format(time.RFC3339Nano)}},
		{"create", `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','created at fence',$4,$4)`, []any{createID, fixture.chatID, fixture.userID, time.Now().UTC().Format(time.RFC3339Nano)}},
	}
	operationResults := make(chan error, len(operations))
	for _, operation := range operations {
		operation := operation
		go func() {
			_, err := fixture.server.sqlDB.ExecContext(ctx, operation.query, operation.args...)
			if err != nil {
				err = errors.New(operation.name + ": " + err.Error())
			}
			operationResults <- err
		}()
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		var blocked int
		if err := fixture.server.sqlDB.QueryRowContext(ctx, `
			SELECT count(*) FROM pg_stat_activity
			WHERE datname=current_database() AND wait_event_type='Lock'
			  AND (lower(query) LIKE '%update public.messages set content%'
			       OR lower(query) LIKE '%update public.messages set deleted_at%'
			       OR lower(query) LIKE '%insert into public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)%')`).Scan(&blocked); err != nil {
			t.Fatalf("inspect synthetic message writes waiting on sequence fence: %v", err)
		}
		if blocked >= len(operations) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("only %d of %d concurrent message writes waited on the held sequence fence", blocked, len(operations))
		}
		time.Sleep(10 * time.Millisecond)
	}

	backfillResult := make(chan struct {
		start httptransport.IntelligenceSourceV2BackfillStart
		err   error
	}, 1)
	go func() {
		started, err := fixture.server.intelligenceSourceV2StartBackfill(ctx, identity)
		backfillResult <- struct {
			start httptransport.IntelligenceSourceV2BackfillStart
			err   error
		}{started, err}
	}()
	if err := lockTx.Commit(); err != nil {
		t.Fatalf("release synthetic source-sequence lock: %v", err)
	}
	for range operations {
		if err := <-operationResults; err != nil {
			t.Fatal(err)
		}
	}
	started := <-backfillResult
	if started.err != nil {
		t.Fatalf("start backfill across concurrent source writes: %v", started.err)
	}
	page, err := fixture.server.intelligenceSourceV2BackfillSnapshots(ctx, identity, started.start.BackfillID, started.start.SnapshotCursor, 100)
	if err != nil || page.HasMore || page.FenceCursor == "" {
		t.Fatalf("read snapshot across concurrent source writes page=%#v err=%v", page, err)
	}
	resourceContent := make(map[string]string, len(page.Snapshots))
	for _, snapshot := range page.Snapshots {
		resourceContent[snapshot.ResourceID] = snapshot.Content
	}
	if resourceContent[editID] != "after edit 🌍" || resourceContent[createID] != "created at fence" {
		t.Fatalf("snapshot lost a concurrent edit or create: %#v", resourceContent)
	}
	if _, exists := resourceContent[deleteID]; exists {
		t.Fatalf("snapshot retained the concurrently deleted resource: %#v", resourceContent)
	}
	var fenceSequence, editSequence, deleteSequence, createSequence int64
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT fence_sequence FROM public.intelligence_source_v2_backfills WHERE id=$1`, started.start.BackfillID).Scan(&fenceSequence); err != nil {
		t.Fatalf("read concurrent backfill fence: %v", err)
	}
	for resourceID, target := range map[string]*int64{editID: &editSequence, deleteID: &deleteSequence, createID: &createSequence} {
		if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT sequence FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND resource_id=$2`, connectionID, resourceID).Scan(target); err != nil {
			t.Fatalf("read concurrent source event for %s: %v", resourceID, err)
		}
	}
	replay, err := fixture.server.intelligenceSourceV2Events(ctx, identity, page.FenceCursor, 100)
	if err != nil {
		t.Fatalf("replay events after concurrent backfill fence: %v", err)
	}
	replayed := make(map[string]httptransport.IntelligenceSourceV2Event, len(replay.Events))
	for _, event := range replay.Events {
		replayed[event.ResourceID] = event
	}
	for resourceID, eventSequence := range map[string]int64{editID: editSequence, deleteID: deleteSequence, createID: createSequence} {
		if eventSequence > fenceSequence {
			if _, exists := replayed[resourceID]; !exists {
				t.Errorf("post-fence event for %s is missing from replay (event=%d fence=%d)", resourceID, eventSequence, fenceSequence)
			}
		} else if _, exists := replayed[resourceID]; exists {
			t.Errorf("pre-fence event for %s leaked into replay (event=%d fence=%d)", resourceID, eventSequence, fenceSequence)
		}
	}
}

func TestIntelligenceSourceV2ContentReadsSerializeWithReadRevocation(t *testing.T) {
	tests := []struct {
		name string
		read func(context.Context, intelligenceSourceV2ConsentFixture, httptransport.IntelligenceSourceIdentity, string, string, string, string) error
		want error
	}{
		{
			name: "backfill snapshot",
			read: func(ctx context.Context, fixture intelligenceSourceV2ConsentFixture, identity httptransport.IntelligenceSourceIdentity, backfillID, cursor, _, _ string) error {
				page, err := fixture.server.intelligenceSourceV2BackfillSnapshots(ctx, identity, backfillID, cursor, 100)
				if err == nil && len(page.Snapshots) > 0 {
					return errors.New("backfill returned content after read revocation")
				}
				return err
			},
			want: httptransport.ErrIntelligenceSourceForbidden,
		},
		{
			name: "exact snapshot",
			read: func(ctx context.Context, fixture intelligenceSourceV2ConsentFixture, identity httptransport.IntelligenceSourceIdentity, _, _, resourceID, revisionID string) error {
				_, err := fixture.server.intelligenceSourceV2Snapshot(ctx, identity, resourceID, revisionID)
				return err
			},
			want: httptransport.ErrIntelligenceSourceNotFound,
		},
		{
			name: "citation",
			read: func(ctx context.Context, fixture intelligenceSourceV2ConsentFixture, identity httptransport.IntelligenceSourceIdentity, _, _, resourceID, revisionID string) error {
				_, err := fixture.server.intelligenceSourceV2ResolveCitation(ctx, identity, resourceID, revisionID, httptransport.IntelligenceTextLocator{Kind: "text", Start: 0, End: 4})
				return err
			},
			want: httptransport.ErrIntelligenceSourceNotFound,
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			fixture := newIntelligenceSourceV2ConsentFixture(t)
			ctx := context.Background()
			connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
			resourceID := "source-v2-read-revoke-race-" + uuid.NewString()
			createdAt := time.Now().UTC().Format(time.RFC3339Nano)
			if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','race payload',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
				t.Fatalf("insert synthetic read-race message: %v", err)
			}
			identity, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, credential)
			if err != nil {
				t.Fatalf("authenticate synthetic read-race credential: %v", err)
			}
			started, err := fixture.server.intelligenceSourceV2StartBackfill(ctx, identity)
			if err != nil {
				t.Fatalf("start synthetic read-race backfill: %v", err)
			}
			page, err := fixture.server.intelligenceSourceV2BackfillSnapshots(ctx, identity, started.BackfillID, started.SnapshotCursor, 100)
			if err != nil || len(page.Snapshots) != 1 {
				t.Fatalf("materialize synthetic read-race payload page=%#v err=%v", page, err)
			}
			revisionID := page.Snapshots[0].RevisionID
			if test.name == "backfill snapshot" {
				started, err = fixture.server.intelligenceSourceV2StartBackfill(ctx, identity)
				if err != nil {
					t.Fatalf("start racing backfill: %v", err)
				}
			}

			lockTx, err := fixture.server.sqlDB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatalf("begin synthetic revocation serialization: %v", err)
			}
			var lockedConnectionID string
			if err := lockTx.QueryRowContext(ctx, `SELECT id FROM public.intelligence_source_v2_connections WHERE id=$1 FOR UPDATE`, connectionID).Scan(&lockedConnectionID); err != nil {
				_ = lockTx.Rollback()
				t.Fatalf("hold source connection while revocation starts: %v", err)
			}
			revokeResult := make(chan error, 1)
			readResult := make(chan error, 1)
			revokeStarted, readStarted := false, false
			defer func() {
				_ = lockTx.Rollback()
				if revokeStarted {
					<-revokeResult
				}
				if readStarted {
					<-readResult
				}
			}()

			go func() {
				revokeResult <- fixture.server.revokeIntelligenceSourceV2Connection(ctx, nil, httptransport.IntelligenceSourceV2ConsentPrincipal{UserID: fixture.userID, FamilyID: fixture.familyID}, connectionID, "read")
			}()
			revokeStarted = true
			waitForSourceV2LockWait(t, fixture, "intelligence_source_v2_connections")

			go func() {
				readResult <- test.read(ctx, fixture, identity, started.BackfillID, started.SnapshotCursor, resourceID, revisionID)
			}()
			readStarted = true
			waitForSourceV2LockWait(t, fixture, "intelligence_source_v2_read_connection_lock")

			if err := lockTx.Commit(); err != nil {
				t.Fatalf("release source connection after queuing read and revoke: %v", err)
			}
			if err := <-revokeResult; err != nil {
				t.Fatalf("complete concurrent read revocation: %v", err)
			}
			revokeStarted = false
			if err := <-readResult; !errors.Is(err, test.want) {
				t.Fatalf("content read after queued read revocation returned %v, want %v", err, test.want)
			}
			readStarted = false
			var payloadCount int
			if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1`, connectionID).Scan(&payloadCount); err != nil {
				t.Fatalf("count payloads after racing revoke and read: %v", err)
			}
			if payloadCount != 0 {
				t.Fatalf("read revoke retained %d source payload(s)", payloadCount)
			}
		})
	}
}

func TestIntelligenceSourceV2MessageWritesCannotRestorePayloadAfterConcurrentAccessLoss(t *testing.T) {
	tests := []struct {
		name       string
		invalidate func(context.Context, intelligenceSourceV2ConsentFixture, string) error
		waitQuery  string
		wantReason string
	}{
		{
			name: "read grant revocation",
			invalidate: func(ctx context.Context, fixture intelligenceSourceV2ConsentFixture, connectionID string) error {
				return fixture.server.revokeIntelligenceSourceV2Connection(ctx, nil, httptransport.IntelligenceSourceV2ConsentPrincipal{UserID: fixture.userID, FamilyID: fixture.familyID}, connectionID, "read")
			},
			waitQuery:  "intelligence_source_v2_connections",
			wantReason: "read_grant_revoked",
		},
		{
			name: "chat membership removal",
			invalidate: func(ctx context.Context, fixture intelligenceSourceV2ConsentFixture, _ string) error {
				_, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.chat_members WHERE chat_id=$1 AND user_id=$2`, fixture.chatID, fixture.userID)
				return err
			},
			waitQuery:  "delete from public.chat_members",
			wantReason: "membership_changed",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := newIntelligenceSourceV2ConsentFixture(t)
			ctx := context.Background()
			connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
			resourceID := "source-v2-access-race-" + uuid.NewString()
			createdAt := time.Now().UTC().Format(time.RFC3339Nano)
			if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','initial payload',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
				t.Fatalf("insert synthetic access-race message: %v", err)
			}

			lockTx, err := fixture.server.sqlDB.BeginTx(ctx, nil)
			if err != nil {
				t.Fatalf("begin source connection serialization lock: %v", err)
			}
			defer func() { _ = lockTx.Rollback() }()
			var lockedConnectionID string
			if err := lockTx.QueryRowContext(ctx, `SELECT id FROM public.intelligence_source_v2_connections WHERE id=$1 FOR UPDATE`, connectionID).Scan(&lockedConnectionID); err != nil {
				t.Fatalf("hold source connection serialization lock: %v", err)
			}
			if lockedConnectionID != connectionID {
				t.Fatalf("locked source connection %q, want %q", lockedConnectionID, connectionID)
			}

			invalidationResult := make(chan error, 1)
			go func() { invalidationResult <- test.invalidate(ctx, fixture, connectionID) }()
			waitForSourceV2LockWait(t, fixture, test.waitQuery)

			messageWriteResult := make(chan error, 1)
			go func() {
				_, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET content='raced after access loss',updated_at=$2 WHERE id=$1`, resourceID, time.Now().UTC().Format(time.RFC3339Nano))
				messageWriteResult <- err
			}()
			waitForSourceV2LockWait(t, fixture, "update public.messages set content='raced after access loss'")
			if err := lockTx.Commit(); err != nil {
				t.Fatalf("release source connection serialization lock: %v", err)
			}
			if err := <-invalidationResult; err != nil {
				t.Fatalf("complete concurrent access invalidation: %v", err)
			}
			if err := <-messageWriteResult; err != nil {
				t.Fatalf("complete concurrent message write: %v", err)
			}

			var payloadCount int
			if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads payload JOIN public.intelligence_source_v2_revisions revision USING(connection_id,revision_id) WHERE payload.connection_id=$1 AND revision.resource_id=$2`, connectionID, resourceID).Scan(&payloadCount); err != nil {
				t.Fatalf("count payloads after concurrent access loss: %v", err)
			}
			if payloadCount != 0 {
				t.Errorf("concurrent write restored %d source payload(s) after access loss", payloadCount)
			}
			var reason string
			if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT reason FROM public.intelligence_source_v2_tombstone_ledger WHERE connection_id=$1 AND resource_id IN ($2,'chat:'||$3) ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID, fixture.chatID).Scan(&reason); err != nil {
				t.Fatalf("read durable tombstone after concurrent access loss: %v", err)
			}
			if reason != test.wantReason {
				t.Errorf("latest invalidation reason=%q, want %q", reason, test.wantReason)
			}
		})
	}
}

func waitForSourceV2LockWait(t *testing.T, fixture intelligenceSourceV2ConsentFixture, queryPrefix string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int
		if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `
			SELECT count(*) FROM pg_stat_activity
			WHERE datname=current_database() AND wait_event_type='Lock' AND lower(query) LIKE '%'||$1||'%'`, strings.ToLower(queryPrefix)).Scan(&waiting); err != nil {
			t.Fatalf("inspect source-v2 access-race lock wait for %q: %v", queryPrefix, err)
		}
		if waiting > 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("query %q did not reach the expected lock wait", queryPrefix)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestIntelligenceSourceV2LifecycleChangesPurgePayloadsAndKeepTombstones(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	deleteID := "source-v2-lifecycle-delete-" + uuid.NewString()
	restoreID := "source-v2-lifecycle-restore-" + uuid.NewString()
	moveID := "source-v2-lifecycle-move-" + uuid.NewString()
	visibilityID := "source-v2-lifecycle-visibility-" + uuid.NewString()
	connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','delete me',$5,$5),($4,$2,$3,'text','restore me',$5,$5),($6,$2,$3,'text','move me',$5,$5),($7,$2,$3,'text','hide me',$5,$5)`,
		deleteID, fixture.chatID, fixture.userID, restoreID, createdAt, moveID, visibilityID); err != nil {
		t.Fatalf("insert synthetic lifecycle messages: %v", err)
	}
	latestEvent := func(resourceID string) (revisionID, kind string, tombstone bool, protocol string, deleted bool) {
		t.Helper()
		err := fixture.server.sqlDB.QueryRowContext(ctx, `
			SELECT e.revision_id,e.kind,e.tombstone,r.encryption_protocol,r.deleted
			FROM public.intelligence_source_v2_events e
			JOIN public.intelligence_source_v2_revisions r ON r.connection_id=e.connection_id AND r.revision_id=e.revision_id
			WHERE e.connection_id=$1 AND e.resource_id=$2 ORDER BY e.sequence DESC LIMIT 1`, connectionID, resourceID).
			Scan(&revisionID, &kind, &tombstone, &protocol, &deleted)
		if err != nil {
			t.Fatalf("read latest lifecycle event for %s: %v", resourceID, err)
		}
		return
	}
	payloadCount := func(resourceID string) int {
		t.Helper()
		var count int
		if err := fixture.server.sqlDB.QueryRowContext(ctx, `
			SELECT count(*) FROM public.intelligence_source_v2_revision_payloads p
			JOIN public.intelligence_source_v2_revisions r ON r.connection_id=p.connection_id AND r.revision_id=p.revision_id
			WHERE p.connection_id=$1 AND r.resource_id=$2`, connectionID, resourceID).Scan(&count); err != nil {
			t.Fatalf("count lifecycle payloads for %s: %v", resourceID, err)
		}
		return count
	}
	deletedRevision, deleteKind, deleteTombstone, _, _ := latestEvent(deleteID)
	if deleteKind != "create" || deleteTombstone || payloadCount(deleteID) != 1 {
		t.Fatalf("initial source revision = %s/%s/%v payloads=%d", deletedRevision, deleteKind, deleteTombstone, payloadCount(deleteID))
	}
	deletedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=$2,updated_at=$2 WHERE id=$1`, deleteID, deletedAt); err != nil {
		t.Fatalf("soft-delete synthetic source message: %v", err)
	}
	tombstoneRevision, deleteKind, deleteTombstone, deleteProtocol, deleteFlag := latestEvent(deleteID)
	if deleteKind != "delete" || !deleteTombstone || deleteProtocol != "metadata_only" || !deleteFlag {
		t.Fatalf("delete event was not a metadata tombstone: kind=%q tombstone=%v protocol=%q deleted=%v", deleteKind, deleteTombstone, deleteProtocol, deleteFlag)
	}
	if count := payloadCount(deleteID); count != 0 {
		t.Fatalf("message deletion retained %d source payload rows; deletion must purge content immediately while preserving revision %s", count, tombstoneRevision)
	}
	var ledgerPresent bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT to_regclass('public.intelligence_source_v2_tombstone_ledger') IS NOT NULL`).Scan(&ledgerPresent); err != nil || !ledgerPresent {
		t.Fatalf("metadata tombstone ledger is unavailable: present=%v err=%v", ledgerPresent, err)
	}
	var retainedTombstone int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_tombstone_ledger WHERE connection_id=$1 AND resource_id=$2 AND revision_id=$3`, connectionID, deleteID, tombstoneRevision).Scan(&retainedTombstone); err != nil || retainedTombstone != 1 {
		t.Fatalf("delete tombstone ledger rows=%d err=%v", retainedTombstone, err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=NULL,updated_at=$2 WHERE id=$1`, deleteID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("restore synthetic source message: %v", err)
	}
	restoredRevision, restoreKind, restoreTombstone, _, _ := latestEvent(deleteID)
	if restoreKind != "restore" || restoreTombstone || restoredRevision == tombstoneRevision || payloadCount(deleteID) != 1 {
		t.Fatalf("restored message revision=%s kind=%q tombstone=%v payloads=%d", restoredRevision, restoreKind, restoreTombstone, payloadCount(deleteID))
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET chat_id=$2,updated_at=$3 WHERE id=$1`, moveID, fixture.secondChatID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("move synthetic source message out of scoped chat: %v", err)
	}
	_, moveKind, moveTombstone, moveProtocol, moveDeleted := latestEvent(moveID)
	if moveKind != "move" || !moveTombstone || moveProtocol != "metadata_only" || !moveDeleted || payloadCount(moveID) != 0 {
		t.Fatalf("scope exit did not produce and enforce a metadata tombstone: kind=%q tombstone=%v protocol=%q deleted=%v payloads=%d", moveKind, moveTombstone, moveProtocol, moveDeleted, payloadCount(moveID))
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.message_user_deletions(message_id,user_id,deleted_at) VALUES($1,$2,$3)`, visibilityID, fixture.userID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("hide synthetic message for source principal: %v", err)
	}
	_, visibilityKind, visibilityTombstone, visibilityProtocol, visibilityDeleted := latestEvent(visibilityID)
	if visibilityKind != "acl_change" || !visibilityTombstone || visibilityProtocol != "metadata_only" || !visibilityDeleted || payloadCount(visibilityID) != 0 {
		t.Fatalf("per-user visibility change did not emit a content-free invalidation: kind=%q tombstone=%v protocol=%q deleted=%v payloads=%d", visibilityKind, visibilityTombstone, visibilityProtocol, visibilityDeleted, payloadCount(visibilityID))
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.chat_members WHERE chat_id=$1 AND user_id=$2`, fixture.chatID, fixture.userID); err != nil {
		t.Fatalf("remove source principal from scoped chat: %v", err)
	}
	_, membershipKind, membershipTombstone, membershipProtocol, membershipDeleted := latestEvent("chat:" + fixture.chatID)
	if membershipKind != "acl_change" || !membershipTombstone || membershipProtocol != "metadata_only" || !membershipDeleted {
		t.Fatalf("membership removal did not emit a chat-scope tombstone: kind=%q tombstone=%v protocol=%q deleted=%v", membershipKind, membershipTombstone, membershipProtocol, membershipDeleted)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, fixture.chatID, fixture.userID, time.Now().UTC()); err != nil {
		t.Fatalf("restore source principal membership: %v", err)
	}
	_, membershipKind, membershipTombstone, membershipProtocol, membershipDeleted = latestEvent("chat:" + fixture.chatID)
	if membershipKind != "acl_change" || !membershipTombstone || membershipProtocol != "metadata_only" || !membershipDeleted {
		t.Fatalf("membership restoration did not emit a chat-scope tombstone: kind=%q tombstone=%v protocol=%q deleted=%v", membershipKind, membershipTombstone, membershipProtocol, membershipDeleted)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.chats SET media_visibility='family',updated_at=$2 WHERE id=$1`, fixture.chatID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("change synthetic chat visibility: %v", err)
	}
	_, visibilityKind, visibilityTombstone, visibilityProtocol, visibilityDeleted = latestEvent("chat:" + fixture.chatID)
	if visibilityKind != "acl_change" || !visibilityTombstone || visibilityProtocol != "metadata_only" || !visibilityDeleted {
		t.Fatalf("chat visibility change did not emit a scope invalidation: kind=%q tombstone=%v protocol=%q deleted=%v", visibilityKind, visibilityTombstone, visibilityProtocol, visibilityDeleted)
	}
	_ = deleteProtocol
	_ = deleteFlag
}

func TestIntelligenceSourceV2GrantRevocationKeepsMetadataEventsAndPurgesReadPayloads(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true, "process": true})
	resourceID := "source-v2-revoke-resource-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','revoke me',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic revocation message: %v", err)
	}
	identity, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, credential)
	if err != nil {
		t.Fatalf("authenticate synthetic revocation credential: %v", err)
	}
	started, err := fixture.server.intelligenceSourceV2StartBackfill(ctx, identity)
	if err != nil {
		t.Fatalf("start revocation-test backfill: %v", err)
	}
	page, err := fixture.server.intelligenceSourceV2BackfillSnapshots(ctx, identity, started.BackfillID, started.SnapshotCursor, 100)
	if err != nil || page.HasMore || page.FenceCursor == "" || len(page.Snapshots) != 1 {
		t.Fatalf("read revocation-test snapshot page=%#v err=%v", page, err)
	}
	revisionID := page.Snapshots[0].RevisionID
	exactURL := fixture.serverURL + "/api/v2/intelligence/source/resources/" + url.PathEscape(resourceID) + "/snapshot?revision_id=" + url.QueryEscape(revisionID)
	exactBeforeRevoke := sourceV2Request(t, fixture.httpClient, http.MethodGet, exactURL, credential, nil)
	if exactBeforeRevoke.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(exactBeforeRevoke.Body)
		_ = exactBeforeRevoke.Body.Close()
		t.Fatalf("exact read before revocation status=%d body=%s", exactBeforeRevoke.StatusCode, body)
	}
	_ = exactBeforeRevoke.Body.Close()
	revokeGrant := func(grant string) {
		t.Helper()
		response := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": connectionID, "grant": grant})
		defer func() { _ = response.Body.Close() }()
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			t.Fatalf("revoke %s status=%d body=%s", grant, response.StatusCode, body)
		}
	}
	type sourceEventPage struct {
		Events []struct {
			ResourceID string `json:"resource_id"`
			Kind       string `json:"kind"`
			Tombstone  bool   `json:"tombstone"`
		} `json:"events"`
		NextCursor string `json:"next_cursor"`
	}
	readEvents := func(cursor string) sourceEventPage {
		t.Helper()
		requestURL := fixture.serverURL + "/api/v2/intelligence/source/events?cursor=" + url.QueryEscape(cursor)
		response := sourceV2Request(t, fixture.httpClient, http.MethodGet, requestURL, credential, nil)
		defer func() { _ = response.Body.Close() }()
		var result sourceEventPage
		if response.StatusCode != http.StatusOK || json.NewDecoder(response.Body).Decode(&result) != nil {
			t.Fatalf("metadata event access after revoke status=%d result=%#v", response.StatusCode, result)
		}
		return result
	}
	revokeGrant("process")
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, resourceID, "read"); !decision.Allowed {
		t.Fatal("revoking process unexpectedly removed the independent read grant")
	}
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, resourceID, "process"); decision.Allowed {
		t.Fatal("revoked process grant remained authorized")
	}
	processEvents := readEvents(page.FenceCursor)
	if len(processEvents.Events) == 0 || !processEvents.Events[0].Tombstone || processEvents.Events[0].Kind != "acl_change" {
		t.Fatalf("process revoke did not produce metadata invalidation: %#v", processEvents)
	}
	revokeGrant("read")
	if decision := sourceV2AuthorizationDecision(t, fixture, credential, resourceID, "read"); decision.Allowed {
		t.Fatal("read remained authorized after its grant was revoked")
	}
	afterReadRevoke := sourceV2Request(t, fixture.httpClient, http.MethodGet, exactURL, credential, nil)
	if afterReadRevoke.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(afterReadRevoke.Body)
		_ = afterReadRevoke.Body.Close()
		t.Fatalf("exact read after grant revocation status=%d body=%s, want indistinguishable not-found", afterReadRevoke.StatusCode, body)
	}
	_ = afterReadRevoke.Body.Close()
	var payloadCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1 AND revision_id=$2`, connectionID, revisionID).Scan(&payloadCount); err != nil {
		t.Fatalf("inspect purged exact revision payload: %v", err)
	}
	if payloadCount != 0 {
		t.Fatalf("read revoke retained %d content payloads for the source connection", payloadCount)
	}
	readRevokeEvents := readEvents(processEvents.NextCursor)
	if len(readRevokeEvents.Events) == 0 || !readRevokeEvents.Events[0].Tombstone || readRevokeEvents.Events[0].Kind != "acl_change" {
		t.Fatalf("read revoke removed metadata-only event access: %#v", readRevokeEvents)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `SELECT to_regclass('public.intelligence_source_v2_tombstone_ledger') IS NOT NULL`); err != nil {
		t.Fatalf("inspect source v2 tombstone ledger: %v", err)
	}
	revokeGrant("connection")
	afterConnectionRevoke := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/source/events?cursor="+url.QueryEscape(readRevokeEvents.NextCursor), credential, nil)
	defer func() { _ = afterConnectionRevoke.Body.Close() }()
	if afterConnectionRevoke.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(afterConnectionRevoke.Body)
		t.Fatalf("source credential after connection revoke status=%d body=%s", afterConnectionRevoke.StatusCode, body)
	}
}

func TestIntelligenceSourceV2RestoreGateBlocksRoutesAndMissingStateFailsClosed(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	var gateExists bool
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT to_regclass('public.intelligence_source_v2_restore_gate') IS NOT NULL`).Scan(&gateExists); err != nil || !gateExists {
		t.Fatalf("source v2 restore gate table is missing: exists=%v err=%v", gateExists, err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET blocked=true,active_restore_id='synthetic-restore' WHERE gate_id='global'`); err != nil {
		t.Fatalf("block synthetic source restore: %v", err)
	}
	request := map[string]any{"schema_version": "v2", "resource_ids": []string{"synthetic-restore-gate"}, "operation": "read"}
	blocked := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", credential, request)
	if blocked.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(blocked.Body)
		_ = blocked.Body.Close()
		t.Fatalf("source route while restore gate is blocked status=%d body=%s", blocked.StatusCode, body)
	}
	_ = blocked.Body.Close()
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET blocked=false,active_restore_id=NULL WHERE gate_id='global'`); err != nil {
		t.Fatalf("unblock synthetic source restore gate: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `DELETE FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global'`); err != nil {
		t.Fatalf("remove synthetic restore gate row: %v", err)
	}
	missing := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", credential, request)
	defer func() { _ = missing.Body.Close() }()
	if missing.StatusCode != http.StatusServiceUnavailable {
		body, _ := io.ReadAll(missing.Body)
		t.Fatalf("source route with missing restore state status=%d body=%s", missing.StatusCode, body)
	}
	_ = connectionID
}

func TestIntelligenceSourceV2StaleUnblockedSnapshotCannotOpenRoutes(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	_, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET blocked=false,restore_epoch='epoch-from-restored-snapshot' WHERE gate_id='global'`); err != nil {
		t.Fatalf("simulate restored unblocked snapshot with stale deployment epoch: %v", err)
	}
	request := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", credential, map[string]any{
		"schema_version": "v2", "resource_ids": []string{"synthetic-stale-restore"}, "operation": "read",
	})
	defer func() { _ = request.Body.Close() }()
	if request.StatusCode != http.StatusServiceUnavailable {
		body, _ := io.ReadAll(request.Body)
		t.Fatalf("route opened from stale unblocked restore snapshot: status=%d body=%s", request.StatusCode, body)
	}
}

func TestIntelligenceSourceV2FreshEmptyDatabaseBindsDeploymentRestoreEpoch(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET restore_epoch='uninitialized',blocked=false WHERE gate_id='global'`); err != nil {
		t.Fatalf("reset synthetic empty database restore epoch: %v", err)
	}
	if err := fixture.server.initializeIntelligenceSourceV2RestoreEpoch(context.Background()); err != nil {
		t.Fatalf("bind empty database to deployment restore epoch: %v", err)
	}
	if err := fixture.server.requireIntelligenceSourceV2RestoreReady(context.Background()); err != nil {
		t.Fatalf("fresh database restore gate stayed closed after initialization: %v", err)
	}
}

func TestIntelligenceSourceV2OperatorBootstrapBindsNeverRestoredDatabaseWithExistingConnection(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET restore_epoch='uninitialized',blocked=false,active_restore_id=NULL,backup_created_at=NULL WHERE gate_id='global'`); err != nil {
		t.Fatalf("prepare historical-but-never-restored database: %v", err)
	}
	operations := NewIntelligenceSourceV2Operations(adapterintelligencesourcev2.NewPostgresStore(fixture.server.sqlDB))
	if err := operations.BootstrapIntelligenceSourceV2RestoreEpoch(context.Background(), fixture.server.cfg.IntelligenceSourceV2RestoreEpoch); err != nil {
		t.Fatalf("operator-attested bootstrap failed: %v", err)
	}
	if err := fixture.server.requireIntelligenceSourceV2RestoreReady(context.Background()); err != nil {
		t.Fatalf("source gate remained closed after bootstrap: %v", err)
	}
	var auditCount int
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT count(*) FROM public.intelligence_source_v2_audit WHERE operation='restore_epoch_bootstrap' AND result='operator_attested_never_restored'`).Scan(&auditCount); err != nil {
		t.Fatalf("read bootstrap audit record: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("bootstrap audit rows=%d, want exactly one", auditCount)
	}
}

func TestIntelligenceSourceV2OperatorBootstrapRefusesBlockedGate(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET restore_epoch='uninitialized',blocked=true WHERE gate_id='global'`); err != nil {
		t.Fatalf("prepare blocked gate: %v", err)
	}
	operations := NewIntelligenceSourceV2Operations(adapterintelligencesourcev2.NewPostgresStore(fixture.server.sqlDB))
	if err := operations.BootstrapIntelligenceSourceV2RestoreEpoch(context.Background(), fixture.server.cfg.IntelligenceSourceV2RestoreEpoch); err == nil {
		t.Fatal("operator bootstrap opened a blocked restore gate")
	}
	var blocked bool
	var epoch string
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT blocked,restore_epoch FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global'`).Scan(&blocked, &epoch); err != nil {
		t.Fatalf("read blocked gate: %v", err)
	}
	if !blocked || epoch != "uninitialized" {
		t.Fatalf("blocked gate changed after rejected bootstrap: blocked=%v epoch=%q", blocked, epoch)
	}
}

func TestIntelligenceSourceV2PrincipalDeactivationRetiresConsent(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	resourceID := "source-v2-principal-deactivated-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','principal lifecycle secret',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic principal lifecycle message: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=0 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("deactivate synthetic source principal: %v", err)
	}
	var payloadCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads payload JOIN public.intelligence_source_v2_revisions revision USING(connection_id,revision_id) WHERE payload.connection_id=$1 AND revision.resource_id=$2`, connectionID, resourceID).Scan(&payloadCount); err != nil {
		t.Fatalf("count payloads after principal deactivation: %v", err)
	}
	if payloadCount != 0 {
		t.Errorf("principal deactivation retained %d readable source payload(s)", payloadCount)
	}
	var reason string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT reason FROM public.intelligence_source_v2_tombstone_ledger WHERE connection_id=$1 ORDER BY sequence DESC LIMIT 1`, connectionID).Scan(&reason); err != nil {
		t.Fatalf("read principal deactivation tombstone: %v", err)
	}
	if reason != "principal_inactive" {
		t.Errorf("principal deactivation tombstone reason=%q, want principal_inactive", reason)
	}
	var enabled, readGranted, revoked bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT connection.enabled,grant_row.granted,connection.revoked_at IS NOT NULL FROM public.intelligence_source_v2_connections connection JOIN public.intelligence_source_v2_connection_grants grant_row ON grant_row.connection_id=connection.id AND grant_row.grant_type='read' WHERE connection.id=$1`, connectionID).Scan(&enabled, &readGranted, &revoked); err != nil {
		t.Fatalf("read retired connection state: %v", err)
	}
	if enabled || readGranted || !revoked {
		t.Errorf("deactivation left consent resumable: enabled=%v read_granted=%v revoked=%v", enabled, readGranted, revoked)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=1 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("reactivate synthetic principal: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET content='after reactivation',updated_at=$2 WHERE id=$1`, resourceID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("edit synthetic message after reactivation: %v", err)
	}
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1`, connectionID).Scan(&payloadCount); err != nil {
		t.Fatalf("count payloads after reactivation: %v", err)
	}
	if payloadCount != 0 {
		t.Errorf("reactivation restored %d payload(s) without fresh consent", payloadCount)
	}
}

func TestIntelligenceSourceV2DeletingParentPreservesImmutableHistory(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	resourceID := "source-v2-parent-delete-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','parent delete payload',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic parent-deletion message: %v", err)
	}
	var eventID, revisionID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT event_id,revision_id FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).Scan(&eventID, &revisionID); err != nil {
		t.Fatalf("read immutable event identities before deleting principal: %v", err)
	}
	// The application already requires chat memberships to be removed before a
	// user row can be deleted. Keep this test focused on source-v2 child rows.
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.chat_members WHERE user_id=$1`, fixture.userID); err != nil {
		t.Fatalf("remove synthetic principal membership before deletion: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.messages WHERE id=$1`, resourceID); err != nil {
		t.Fatalf("remove synthetic sender message before deleting principal: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.users WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("delete source principal with immutable history: %v", err)
	}
	var principalID, installationID sql.NullString
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT principal_user_id,installation_id FROM public.intelligence_source_v2_connections WHERE id=$1`, connectionID).Scan(&principalID, &installationID); err != nil {
		t.Fatalf("read archived source connection after principal deletion: %v", err)
	}
	if principalID.Valid || !installationID.Valid {
		t.Fatalf("parent deletion did not detach only deleted principal: principal=%#v installation=%#v", principalID, installationID)
	}
	var retainedEvent, retainedRevision bool
	var payloadCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_events WHERE event_id=$1),EXISTS(SELECT 1 FROM public.intelligence_source_v2_revisions WHERE revision_id=$2), (SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$3)`, eventID, revisionID, connectionID).Scan(&retainedEvent, &retainedRevision, &payloadCount); err != nil {
		t.Fatalf("read retained source metadata after principal deletion: %v", err)
	}
	if !retainedEvent || !retainedRevision || payloadCount != 0 {
		t.Fatalf("source history after principal deletion event=%v revision=%v payloads=%d", retainedEvent, retainedRevision, payloadCount)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.intelligence_installations WHERE id=$1`, installationID.String); err != nil {
		t.Fatalf("delete installation with immutable source history: %v", err)
	}
	var detachedInstallation sql.NullString
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT installation_id FROM public.intelligence_source_v2_connections WHERE id=$1`, connectionID).Scan(&detachedInstallation); err != nil {
		t.Fatalf("read archived connection after installation deletion: %v", err)
	}
	if detachedInstallation.Valid {
		t.Fatalf("installation foreign key remained set after parent deletion: %#v", detachedInstallation)
	}
}

func TestIntelligenceSourceV2ActivePayloadSurvivesBackupRetentionSweep(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	resourceID := "source-v2-active-retention-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','source still exists',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic active retention message: %v", err)
	}
	var revisionID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT revision_id FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).Scan(&revisionID); err != nil {
		t.Fatalf("read active source revision: %v", err)
	}

	_, err := fixture.server.cleanupIntelligenceSourceV2Retention(ctx, time.Now().UTC().Add(31*24*time.Hour))
	if err != nil {
		t.Fatalf("run backup retention sweep: %v", err)
	}
	exactURL := fixture.serverURL + "/api/v2/intelligence/source/resources/" + url.PathEscape(resourceID) + "/snapshot?revision_id=" + url.QueryEscape(revisionID)
	response := sourceV2Request(t, fixture.httpClient, http.MethodGet, exactURL, credential, nil)
	defer func() { _ = response.Body.Close() }()
	var snapshot struct {
		Content string `json:"content"`
	}
	if response.StatusCode != http.StatusOK || json.NewDecoder(response.Body).Decode(&snapshot) != nil || snapshot.Content != "source still exists" {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("live source payload after backup retention sweep status=%d content=%q body=%s", response.StatusCode, snapshot.Content, body)
	}
}

func TestIntelligenceSourceV2RestoreCannotTrustTombstonesFromRestoredDatabase(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	resourceID := "source-v2-restore-rollback-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','pre-backup content',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic pre-backup message: %v", err)
	}
	backupCreatedAt := time.Now().UTC()
	if err := fixture.server.RegisterIntelligenceSourceV2BackupHorizon(ctx, "synthetic-restore-rollback", backupCreatedAt, backupCreatedAt.Add(30*24*time.Hour)); err != nil {
		t.Fatalf("register synthetic pre-revocation backup: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=$2,updated_at=$2 WHERE id=$1`, resourceID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("create post-backup deletion tombstone: %v", err)
	}
	var tombstoneEventID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT event_id FROM public.intelligence_source_v2_tombstone_ledger WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).Scan(&tombstoneEventID); err != nil {
		t.Fatalf("read post-backup deletion tombstone: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_tombstone_ledger WHERE event_id=$1`, tombstoneEventID); err != nil {
		t.Fatalf("simulate restoring a database snapshot without the newer tombstone: %v", err)
	}

	restoreID := "synthetic-stale-ledger-restore-" + uuid.NewString()
	_, beginErr := fixture.server.BeginIntelligenceSourceV2Restore(ctx, restoreID, backupCreatedAt)
	if !errors.Is(beginErr, httptransport.ErrIntelligenceSourceUnavailable) {
		t.Fatalf("restore without independent tombstone proof returned %v, want unavailable", beginErr)
	}
	if err := fixture.server.requireIntelligenceSourceV2RestoreReady(ctx); err == nil {
		t.Fatal("source routes opened after restoring without an independent tombstone proof")
	}
	if err := fixture.server.CompleteIntelligenceSourceV2Restore(ctx, restoreID, nil, time.Now().UTC()); !errors.Is(err, httptransport.ErrIntelligenceSourceUnavailable) {
		t.Fatalf("restore completion without independent tombstone proof returned %v, want unavailable", err)
	}
}

func TestIntelligenceSourceV2RetentionPreservesActivePayloadsAndTombstones(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	connectionID, _ := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true})
	resourceID := "source-v2-retention-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','retained briefly',$4,$4)`, resourceID, fixture.chatID, fixture.userID, createdAt); err != nil {
		t.Fatalf("insert synthetic retention message: %v", err)
	}
	var originalRevisionID, createEventID string
	var createSequence int64
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT revision_id,event_id,sequence FROM public.intelligence_source_v2_events
		WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).
		Scan(&originalRevisionID, &createEventID, &createSequence); err != nil {
		t.Fatalf("read synthetic create revision: %v", err)
	}
	var payloadCreatedAt time.Time
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT created_at FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1 AND revision_id=$2`, connectionID, originalRevisionID).Scan(&payloadCreatedAt); err != nil {
		t.Fatalf("read synthetic active payload: %v", err)
	}
	backupCreatedAt := time.Now().UTC()
	backupRestorableUntil := backupCreatedAt.Add(30 * 24 * time.Hour)
	operations := NewIntelligenceSourceV2Operations(adapterintelligencesourcev2.NewPostgresStore(fixture.server.sqlDB))
	if err := operations.MarkIntelligenceSourceV2BackupInventoryVerified(ctx, time.Now().UTC()); err != nil {
		t.Fatalf("mark initial synthetic backup inventory: %v", err)
	}
	var inventoryComplete bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT complete FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global'`).Scan(&inventoryComplete); err != nil || !inventoryComplete {
		t.Fatalf("initial backup inventory is not complete: complete=%v err=%v", inventoryComplete, err)
	}
	if err := operations.RegisterIntelligenceSourceV2BackupHorizon(ctx, "synthetic-backup-too-long", backupCreatedAt, backupCreatedAt.Add(31*24*time.Hour)); !errors.Is(err, httptransport.ErrIntelligenceSourceInvalidRequest) {
		t.Fatalf("backup horizon longer than 30 days returned %v, want invalid request", err)
	}
	if err := operations.RegisterIntelligenceSourceV2BackupHorizon(ctx, "synthetic-backup", backupCreatedAt, backupRestorableUntil); err != nil {
		t.Fatalf("register synthetic restorable backup horizon: %v", err)
	}
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT complete FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global'`).Scan(&inventoryComplete); err != nil || inventoryComplete {
		t.Fatalf("new backup registration left inventory complete: complete=%v err=%v", inventoryComplete, err)
	}
	_, err := fixture.server.cleanupIntelligenceSourceV2Retention(ctx, time.Now().UTC().Add(31*24*time.Hour))
	if err != nil {
		t.Fatalf("run backup retention sweep while source remains active: %v", err)
	}
	var activePayloadCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1 AND revision_id=$2`, connectionID, originalRevisionID).Scan(&activePayloadCount); err != nil || activePayloadCount != 1 {
		t.Fatalf("active source payload count after backup retention sweep=%d err=%v", activePayloadCount, err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=$2,updated_at=$2 WHERE id=$1`, resourceID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("delete synthetic retention message: %v", err)
	}
	var tombstoneEventID, tombstoneRevisionID string
	var tombstoneSequence int64
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT event_id,revision_id,sequence FROM public.intelligence_source_v2_events
		WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).
		Scan(&tombstoneEventID, &tombstoneRevisionID, &tombstoneSequence); err != nil {
		t.Fatalf("read synthetic deletion tombstone: %v", err)
	}
	var tombstoneCreatedAt, tombstoneRetainUntil time.Time
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT created_at,retain_until FROM public.intelligence_source_v2_tombstone_ledger WHERE event_id=$1`, tombstoneEventID).Scan(&tombstoneCreatedAt, &tombstoneRetainUntil); err != nil {
		t.Fatalf("read retained tombstone horizon: %v", err)
	}
	if tombstoneRetainUntil.Before(tombstoneCreatedAt.Add(37*24*time.Hour)) || tombstoneRetainUntil.Before(backupRestorableUntil.Add(7*24*time.Hour)) {
		t.Fatalf("tombstone horizon does not cover restorable backup plus margin: created=%s retain=%s backup_until=%s", tombstoneCreatedAt, tombstoneRetainUntil, backupRestorableUntil)
	}

	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET deleted_at=NULL,updated_at=$2 WHERE id=$1`, resourceID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("restore synthetic message through the normal Messenger lifecycle: %v", err)
	}
	var restoredRevisionID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT revision_id FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND resource_id=$2 ORDER BY sequence DESC LIMIT 1`, connectionID, resourceID).Scan(&restoredRevisionID); err != nil {
		t.Fatalf("read post-lifecycle-restore source revision: %v", err)
	}
	if restoredRevisionID == tombstoneRevisionID || restoredRevisionID == originalRevisionID {
		t.Fatalf("restore reused an immutable revision identity: initial=%s deleted=%s restored=%s", originalRevisionID, tombstoneRevisionID, restoredRevisionID)
	}
	canceledCtx, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := fixture.server.cleanupIntelligenceSourceV2Retention(canceledCtx, time.Now().UTC()); !errors.Is(err, httptransport.ErrIntelligenceSourceUnavailable) {
		t.Fatalf("retention storage failure returned %v, want fail-closed unavailable", err)
	}
	shortlyAfterHorizon := time.Now().UTC().Add(36 * 24 * time.Hour)
	cleanup, err := fixture.server.cleanupIntelligenceSourceV2Retention(ctx, shortlyAfterHorizon)
	if err != nil {
		t.Fatalf("run backup retention cleanup while source remains active: %#v err=%v", cleanup, err)
	}
	var tombstonesBeforeHorizon int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_tombstone_ledger WHERE event_id=$1`, tombstoneEventID).Scan(&tombstonesBeforeHorizon); err != nil || tombstonesBeforeHorizon != 1 {
		t.Fatalf("tombstone was pruned before backup horizon plus margin: count=%d err=%v", tombstonesBeforeHorizon, err)
	}
	cleanupAt := time.Now().UTC().Add(38 * 24 * time.Hour)
	cleanup, err = fixture.server.cleanupIntelligenceSourceV2Retention(ctx, cleanupAt)
	if err != nil || cleanup.TombstonesPruned != 0 {
		t.Fatalf("cleanup without a verified backup inventory pruned tombstones = %#v err=%v", cleanup, err)
	}
	var retainedWithoutInventory int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_tombstone_ledger WHERE event_id=$1`, tombstoneEventID).Scan(&retainedWithoutInventory); err != nil || retainedWithoutInventory != 1 {
		t.Fatalf("tombstone ledger did not fail closed without backup inventory: count=%d err=%v", retainedWithoutInventory, err)
	}
	if err := fixture.server.MarkIntelligenceSourceV2BackupInventoryVerified(ctx, time.Now().UTC()); err != nil {
		t.Fatalf("mark synthetic complete backup inventory: %v", err)
	}
	cleanup, err = fixture.server.cleanupIntelligenceSourceV2Retention(ctx, cleanupAt)
	if err != nil || cleanup.TombstonesPruned == 0 {
		t.Fatalf("verified tombstone cleanup = %#v err=%v", cleanup, err)
	}
	var restoredPayloadCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_revision_payloads WHERE connection_id=$1 AND revision_id=$2`, connectionID, restoredRevisionID).Scan(&restoredPayloadCount); err != nil || restoredPayloadCount != 1 {
		t.Fatalf("active source payload after backup retention cleanup count=%d err=%v", restoredPayloadCount, err)
	}
	var eventStillPresent bool
	var retainedRevisionProtocol string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_events WHERE event_id=$1),r.encryption_protocol
		FROM public.intelligence_source_v2_revisions r WHERE r.connection_id=$2 AND r.revision_id=$3`, tombstoneEventID, connectionID, tombstoneRevisionID).
		Scan(&eventStillPresent, &retainedRevisionProtocol); err != nil || !eventStillPresent || retainedRevisionProtocol != "metadata_only" {
		t.Fatalf("immutable tombstone identity did not survive ledger expiry: present=%v protocol=%q err=%v", eventStillPresent, retainedRevisionProtocol, err)
	}
	_ = createEventID
	_ = createSequence
}

func TestIntelligenceSourceV2ConsentExchangeRotationAndRevocation(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()

	flowQuery := url.Values{
		"client_id":             {fixture.clientID},
		"redirect_uri":          {fixture.redirectURI},
		"state":                 {"synthetic-state-value"},
		"code_challenge":        {fixture.challenge},
		"code_challenge_method": {"S256"},
	}
	unauthenticated := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), "", nil)
	if unauthenticated.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(unauthenticated.Body)
		_ = unauthenticated.Body.Close()
		t.Fatalf("unauthenticated consent status = %d, want 401; body=%s", unauthenticated.StatusCode, body)
	}
	_ = unauthenticated.Body.Close()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=0 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("deactivate synthetic Messenger principal: %v", err)
	}
	inactiveUser := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), fixture.userToken, nil)
	if inactiveUser.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(inactiveUser.Body)
		_ = inactiveUser.Body.Close()
		t.Fatalf("inactive Messenger principal status = %d, want 401; body=%s", inactiveUser.StatusCode, body)
	}
	_ = inactiveUser.Body.Close()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.users SET is_active=1 WHERE id=$1`, fixture.userID); err != nil {
		t.Fatalf("reactivate synthetic Messenger principal: %v", err)
	}

	offerResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+flowQuery.Encode(), fixture.userToken, nil)
	if offerResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(offerResponse.Body)
		_ = offerResponse.Body.Close()
		t.Fatalf("consent offer status = %d, want 200; body=%s", offerResponse.StatusCode, body)
	}
	var offer struct {
		ClientID    string `json:"client_id"`
		RedirectURI string `json:"redirect_uri"`
		Chats       []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
			Type  string `json:"type"`
		} `json:"chats"`
		Grants map[string]bool `json:"grants"`
	}
	if err := json.NewDecoder(offerResponse.Body).Decode(&offer); err != nil {
		_ = offerResponse.Body.Close()
		t.Fatalf("decode consent offer: %v", err)
	}
	_ = offerResponse.Body.Close()
	if offer.ClientID != fixture.clientID || offer.RedirectURI != fixture.redirectURI {
		t.Fatalf("consent offer client/callback = %q/%q", offer.ClientID, offer.RedirectURI)
	}
	if len(offer.Chats) != 2 {
		t.Fatalf("consent offer listed %d accessible chats, want exactly the two synthetic member chats", len(offer.Chats))
	}
	var directChat *struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	}
	for index := range offer.Chats {
		if offer.Chats[index].Type == "direct" {
			directChat = &offer.Chats[index]
		}
	}
	if directChat == nil || directChat.Title != "Synthetic direct-message contact" {
		t.Fatalf("direct-message consent choice = %#v, want the other member's display name", directChat)
	}
	for _, grant := range []string{"read", "process", "external_transfer", "export", "codex", "reply"} {
		if granted, ok := offer.Grants[grant]; !ok || granted {
			t.Fatalf("initial %s grant = %v (present=%v), want denied", grant, granted, ok)
		}
	}

	invalidConsent := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": "https://attacker.example/callback",
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": fixture.chatID, "grants": map[string]bool{"read": true},
	}
	invalidCallbackResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, invalidConsent)
	if invalidCallbackResponse.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(invalidCallbackResponse.Body)
		_ = invalidCallbackResponse.Body.Close()
		t.Fatalf("unregistered callback status = %d, want 400; body=%s", invalidCallbackResponse.StatusCode, body)
	}
	_ = invalidCallbackResponse.Body.Close()

	invalidChat := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": "not-a-current-member-chat", "grants": map[string]bool{"read": true},
	}
	invalidChatResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, invalidChat)
	if invalidChatResponse.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(invalidChatResponse.Body)
		_ = invalidChatResponse.Body.Close()
		t.Fatalf("inaccessible chat consent status = %d, want 403; body=%s", invalidChatResponse.StatusCode, body)
	}
	_ = invalidChatResponse.Body.Close()

	consent := map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": "synthetic-state-value", "code_challenge": fixture.challenge, "code_challenge_method": "S256",
		"chat_id": fixture.chatID,
		"grants":  map[string]bool{"read": true, "codex": true, "reply": false},
	}
	consentResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, consent)
	if consentResponse.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(consentResponse.Body)
		_ = consentResponse.Body.Close()
		t.Fatalf("valid consent status = %d, want 302; body=%s", consentResponse.StatusCode, body)
	}
	if body, _ := io.ReadAll(consentResponse.Body); len(body) != 0 {
		_ = consentResponse.Body.Close()
		t.Fatalf("authorization code appeared in redirect response body: %q", body)
	}
	_ = consentResponse.Body.Close()
	callback, err := url.Parse(consentResponse.Header.Get("Location"))
	if err != nil || callback.Scheme+"://"+callback.Host+callback.EscapedPath() != fixture.redirectURI[:strings.Index(fixture.redirectURI, "?")] {
		t.Fatalf("consent redirect = %q, want exact registered callback", consentResponse.Header.Get("Location"))
	}
	if callback.Query().Get("state") != "synthetic-state-value" || callback.Query().Get("code") == "" {
		t.Fatalf("consent callback omitted state or code: %q", callback.RawQuery)
	}
	code := callback.Query().Get("code")
	codeDigest := sha256.Sum256([]byte(code))
	var hashedCodeCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&hashedCodeCount); err != nil {
		t.Fatalf("inspect consent code hash: %v", err)
	}
	if hashedCodeCount != 1 {
		t.Fatalf("persisted matching consent-code hashes = %d, want 1", hashedCodeCount)
	}
	var persistedCodeHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT code_hash FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&persistedCodeHash); err != nil {
		t.Fatalf("read persisted consent-code verifier: %v", err)
	}
	if len(persistedCodeHash) != sha256.Size || string(persistedCodeHash) == code {
		t.Fatal("consent code was not stored only as its fixed-size hash")
	}

	wrongVerifier := sourceV2TokenRequest(t, fixture, "authorization_code", code, "wrong-verifier-that-is-long-enough-to-be-rejected-by-pkce-check", "")
	if wrongVerifier.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(wrongVerifier.Body)
		_ = wrongVerifier.Body.Close()
		t.Fatalf("wrong PKCE verifier status = %d, want 400; body=%s", wrongVerifier.StatusCode, body)
	}
	_ = wrongVerifier.Body.Close()

	wrongClient := sourceV2TokenRequestWithSecret(t, fixture, "authorization_code", code, fixture.verifier, "", "incorrect synthetic client secret")
	if wrongClient.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(wrongClient.Body)
		_ = wrongClient.Body.Close()
		t.Fatalf("wrong confidential client secret status = %d, want 401; body=%s", wrongClient.StatusCode, body)
	}
	_ = wrongClient.Body.Close()

	exchangeResponse := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if exchangeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(exchangeResponse.Body)
		_ = exchangeResponse.Body.Close()
		t.Fatalf("consent token exchange status = %d, want 200; body=%s", exchangeResponse.StatusCode, body)
	}
	exchangeBody, err := io.ReadAll(exchangeResponse.Body)
	if err != nil {
		_ = exchangeResponse.Body.Close()
		t.Fatalf("read issued credential response: %v", err)
	}
	var issued struct {
		ConnectionID     string          `json:"connection_id"`
		ChatID           string          `json:"chat_id"`
		SourceCredential string          `json:"source_credential"`
		TokenType        string          `json:"token_type"`
		ExpiresIn        int64           `json:"expires_in"`
		Grants           map[string]bool `json:"grants"`
	}
	if err := json.Unmarshal(exchangeBody, &issued); err != nil {
		t.Fatalf("decode issued source credential: %v", err)
	}
	_ = exchangeResponse.Body.Close()
	if strings.Contains(string(exchangeBody), code) {
		t.Fatal("consent code appeared in the source credential response")
	}
	if issued.ConnectionID == "" || issued.ChatID != fixture.chatID || issued.SourceCredential == "" || issued.TokenType != "Bearer" || issued.ExpiresIn != int64((30*24*time.Hour).Seconds()) {
		t.Fatalf("invalid source credential response: %+v", issued)
	}
	if strings.Count(issued.SourceCredential, ".") != 0 {
		t.Fatal("source credential must be opaque and distinct from an OIDC/JWT token")
	}
	if len(issued.Grants) != 6 || !issued.Grants["read"] || issued.Grants["process"] || issued.Grants["external_transfer"] || issued.Grants["export"] || !issued.Grants["codex"] || issued.Grants["reply"] {
		t.Fatalf("independent consent grants = %#v", issued.Grants)
	}
	credentialDigest := sha256.Sum256([]byte(issued.SourceCredential))
	var persistedHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT credential_hash FROM public.intelligence_source_v2_connections WHERE id=$1`, issued.ConnectionID).Scan(&persistedHash); err != nil {
		t.Fatalf("read source credential verifier: %v", err)
	}
	if string(persistedHash) != string(credentialDigest[:]) {
		t.Fatal("persisted source credential verifier is not SHA-256 of the one-time credential")
	}
	var scopedChatID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT chat_id FROM public.intelligence_source_v2_connection_chats WHERE connection_id=$1`, issued.ConnectionID).Scan(&scopedChatID); err != nil {
		t.Fatalf("read consent chat scope: %v", err)
	}
	if scopedChatID != fixture.chatID {
		t.Fatalf("connection chat scope = %q, want only the explicitly selected chat %q", scopedChatID, fixture.chatID)
	}
	var persistedGrantCount int
	var persistedRead, persistedProcess, persistedTransfer, persistedExport, persistedCodex, persistedReply bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT count(*),bool_or(grant_type='read' AND granted),bool_or(grant_type='process' AND granted),
		       bool_or(grant_type='external_transfer' AND granted),bool_or(grant_type='export' AND granted),
		       bool_or(grant_type='codex' AND granted),bool_or(grant_type='reply' AND granted)
		FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, issued.ConnectionID).Scan(
		&persistedGrantCount, &persistedRead, &persistedProcess, &persistedTransfer, &persistedExport, &persistedCodex, &persistedReply); err != nil {
		t.Fatalf("inspect persisted independent grants: %v", err)
	}
	if persistedGrantCount != 6 || !persistedRead || persistedProcess || persistedTransfer || persistedExport || !persistedCodex || persistedReply {
		t.Fatalf("persisted independent grants count/read/process/transfer/export/codex/reply = %d/%v/%v/%v/%v/%v/%v", persistedGrantCount, persistedRead, persistedProcess, persistedTransfer, persistedExport, persistedCodex, persistedReply)
	}
	var sourceCredentialGrantRows int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, []byte(issued.SourceCredential)).Scan(&sourceCredentialGrantRows); err != nil {
		t.Fatalf("check credential non-disclosure in consent records: %v", err)
	}
	if sourceCredentialGrantRows != 0 {
		t.Fatal("source credential was persisted as a consent code")
	}
	var consumedCodeCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]).Scan(&consumedCodeCount); err != nil {
		t.Fatalf("check one-use consent code removal: %v", err)
	}
	if consumedCodeCount != 0 {
		t.Fatal("exchanged consent code was not consumed")
	}
	var auditContainsSecret int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_audit WHERE operation LIKE '%'||$1||'%' OR result LIKE '%'||$1||'%' OR COALESCE(grant_type,'') LIKE '%'||$1||'%'`, issued.SourceCredential).Scan(&auditContainsSecret); err != nil {
		t.Fatalf("inspect source audit secrecy: %v", err)
	}
	if auditContainsSecret != 0 {
		t.Fatal("source credential appeared in an audit record")
	}
	var auditContainsCode int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_v2_audit WHERE operation LIKE '%'||$1||'%' OR result LIKE '%'||$1||'%' OR COALESCE(grant_type,'') LIKE '%'||$1||'%'`, code).Scan(&auditContainsCode); err != nil {
		t.Fatalf("inspect authorization code secrecy in audit: %v", err)
	}
	if auditContainsCode != 0 {
		t.Fatal("authorization code appeared in an audit record")
	}
	if _, err := parseAccessToken(fixture.server.cfg, issued.SourceCredential); err == nil {
		t.Fatal("source credential was accepted as a Messenger or OIDC signed access token")
	}
	if _, err := fixture.server.authenticateIntelligenceSource(ctx, issued.SourceCredential); err == nil {
		t.Fatal("v2 source credential was accepted by the legacy v1 source authenticator")
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, issued.SourceCredential); err != nil {
		t.Fatalf("v2 source credential was rejected by its v2 authenticator: %v", err)
	}
	messageID := "source-v2-message-" + uuid.NewString()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `
		INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at)
		VALUES($1,$2,$3,'text','synthetic source v2 content',$4,$4)`, messageID, fixture.chatID, fixture.userID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert synthetic post-consent message: %v", err)
	}
	var legacyCaptureCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM public.intelligence_source_revisions WHERE connection_id=$1)
		     + (SELECT count(*) FROM public.intelligence_source_events WHERE connection_id=$1)`, issued.ConnectionID).Scan(&legacyCaptureCount); err != nil {
		t.Fatalf("inspect legacy source capture isolation: %v", err)
	}
	if legacyCaptureCount != 0 {
		t.Fatalf("v2 consent created %d legacy v1 revision/event rows, want none", legacyCaptureCount)
	}
	replayedCode := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if replayedCode.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(replayedCode.Body)
		_ = replayedCode.Body.Close()
		t.Fatalf("replayed consent code status = %d, want 400; body=%s", replayedCode.StatusCode, body)
	}
	_ = replayedCode.Body.Close()

	rotations := make(chan *http.Response, 2)
	var rotationWait sync.WaitGroup
	for range 2 {
		rotationWait.Add(1)
		go func() {
			defer rotationWait.Done()
			rotations <- sourceV2RotationRequest(t, fixture, issued.ConnectionID, issued.SourceCredential)
		}()
	}
	rotationWait.Wait()
	close(rotations)
	var successfulRotations int
	var rotatedCredential string
	for response := range rotations {
		body, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			t.Fatalf("read rotation response: %v", readErr)
		}
		if response.StatusCode == http.StatusOK {
			successfulRotations++
			var rotated struct {
				SourceCredential string `json:"source_credential"`
				ChatID           string `json:"chat_id"`
			}
			if err := json.Unmarshal(body, &rotated); err != nil {
				t.Fatalf("decode rotated source credential: %v", err)
			}
			if rotated.ChatID != fixture.chatID {
				t.Fatalf("rotated credential chat scope = %q, want %q", rotated.ChatID, fixture.chatID)
			}
			rotatedCredential = rotated.SourceCredential
		} else if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("losing concurrent rotation status = %d, want 400; body=%s", response.StatusCode, body)
		}
	}
	if successfulRotations != 1 || rotatedCredential == "" {
		t.Fatalf("successful concurrent rotations = %d, want exactly one", successfulRotations)
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, issued.SourceCredential); err == nil {
		t.Fatal("rotated source credential remained valid")
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err != nil {
		t.Fatalf("newly rotated source credential is invalid: %v", err)
	}

	revokeGrantResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID, "grant": "process"})
	if revokeGrantResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(revokeGrantResponse.Body)
		_ = revokeGrantResponse.Body.Close()
		t.Fatalf("independent grant revoke status = %d, want 200; body=%s", revokeGrantResponse.StatusCode, body)
	}
	_ = revokeGrantResponse.Body.Close()
	var readGranted, processGranted bool
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT bool_or(grant_type='read' AND granted),bool_or(grant_type='process' AND granted) FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, issued.ConnectionID).Scan(&readGranted, &processGranted); err != nil {
		t.Fatalf("inspect independent grant revocation: %v", err)
	}
	if !readGranted || processGranted {
		t.Fatalf("revoking process changed independent read grant: read=%v process=%v", readGranted, processGranted)
	}
	var processRevokeAuditCount int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `
		SELECT count(*) FROM public.intelligence_source_v2_audit
		WHERE connection_id=$1 AND operation='grant_revoke' AND result='revoked' AND grant_type='process'`, issued.ConnectionID).Scan(&processRevokeAuditCount); err != nil {
		t.Fatalf("inspect grant revocation audit record: %v", err)
	}
	if processRevokeAuditCount != 1 {
		t.Fatalf("process grant revocation audit records = %d, want 1", processRevokeAuditCount)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()-interval '1 second' WHERE id=$1`, issued.ConnectionID); err != nil {
		t.Fatalf("expire synthetic source credential: %v", err)
	}
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err == nil {
		t.Fatal("expired source credential remained valid")
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET credential_expires_at=now()+interval '1 day' WHERE id=$1`, issued.ConnectionID); err != nil {
		t.Fatalf("restore synthetic source credential expiry for revoke case: %v", err)
	}

	revokeConnectionResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID})
	if revokeConnectionResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(revokeConnectionResponse.Body)
		_ = revokeConnectionResponse.Body.Close()
		t.Fatalf("connection revoke status = %d, want 200; body=%s", revokeConnectionResponse.StatusCode, body)
	}
	_ = revokeConnectionResponse.Body.Close()
	if _, err := fixture.server.authenticateIntelligenceSourceV2Credential(ctx, rotatedCredential); err == nil {
		t.Fatal("revoked source credential remained valid")
	}
}

func TestIntelligenceSourceV2ReplyStreamsOneServerStampedChatMessage(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	connectionID, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true, "process": true, "codex": true, "reply": true})
	target := fixture.serverURL + "/api/v2/intelligence/source/replies"
	send := func(revision int, text string, final bool) *http.Response {
		return sourceV2Request(t, fixture.httpClient, http.MethodPost, target, credential, map[string]any{
			"schema_version": "v2", "operation_id": "synthetic-codex-response", "revision": revision, "text": text, "final": final,
		})
	}
	decodeMessageID := func(response *http.Response) string {
		t.Helper()
		defer func() { _ = response.Body.Close() }()
		body, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatalf("read reply response: %v", err)
		}
		if response.StatusCode != http.StatusOK {
			t.Fatalf("reply status=%d body=%s", response.StatusCode, body)
		}
		var result struct {
			MessageID   string `json:"message_id"`
			OperationID string `json:"operation_id"`
			Origin      string `json:"origin"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			t.Fatalf("decode reply response: %v", err)
		}
		if result.MessageID == "" || result.OperationID != "synthetic-codex-response" || result.Origin != "local_codex_bridge" || strings.Contains(string(body), credential) {
			t.Fatalf("reply response = %#v body=%s", result, body)
		}
		return result.MessageID
	}
	messageID := decodeMessageID(send(1, "stream part one", false))
	if replayID := decodeMessageID(send(1, "stream part one", false)); replayID != messageID {
		t.Fatalf("replayed reply message ID=%q, want %q", replayID, messageID)
	}
	if finalID := decodeMessageID(send(2, "complete Codex answer", true)); finalID != messageID {
		t.Fatalf("stream update message ID=%q, want same message %q", finalID, messageID)
	}
	var senderID, chatID, content, origin, persistedOperation string
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT sender_id,chat_id,content FROM public.messages WHERE id=$1`, messageID).Scan(&senderID, &chatID, &content); err != nil {
		t.Fatalf("read synthetic reply message: %v", err)
	}
	if senderID != fixture.userID || chatID != fixture.chatID || content != "complete Codex answer" {
		t.Fatalf("stored reply sender/chat/content=%q/%q/%q", senderID, chatID, content)
	}
	if err := fixture.server.sqlDB.QueryRowContext(context.Background(), `SELECT origin,operation_id FROM public.intelligence_source_v2_reply_origins WHERE connection_id=$1 AND message_id=$2`, connectionID, messageID).Scan(&origin, &persistedOperation); err != nil {
		t.Fatalf("read server-stamped reply origin: %v", err)
	}
	if origin != "local_codex_bridge" || persistedOperation != "synthetic-codex-response" {
		t.Fatalf("stored origin/operation=%q/%q", origin, persistedOperation)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_connection_grants SET granted=false,revoked_at=now() WHERE connection_id=$1 AND grant_type='reply'`, connectionID); err != nil {
		t.Fatalf("revoke synthetic reply permission: %v", err)
	}
	revoked := send(3, "must not be delivered", true)
	if revoked.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(revoked.Body)
		_ = revoked.Body.Close()
		t.Fatalf("reply after grant revoke status=%d body=%s", revoked.StatusCode, body)
	}
	_ = revoked.Body.Close()
}

func TestIntelligenceSourceV2EventFenceSkipsMessagesThatPrecedePairing(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	_, credential := createIntelligenceSourceV2TestConnection(t, fixture, fixture.chatID, map[string]bool{"read": true, "process": true, "codex": true, "reply": true})
	beforeID, afterID := uuid.NewString(), uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','@Codex old message',$4,$4)`, beforeID, fixture.chatID, fixture.userID, now); err != nil {
		t.Fatalf("insert pre-pairing synthetic message: %v", err)
	}
	fenceResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/events/fence", credential, map[string]any{"schema_version": "v2"})
	defer func() { _ = fenceResponse.Body.Close() }()
	var fence httptransport.IntelligenceSourceV2EventFence
	if fenceResponse.StatusCode != http.StatusOK || json.NewDecoder(fenceResponse.Body).Decode(&fence) != nil || fence.EventCursor == "" || fence.FenceSequence < 1 {
		t.Fatalf("event fence status=%d response=%#v", fenceResponse.StatusCode, fence)
	}
	if _, err := fixture.server.sqlDB.ExecContext(context.Background(), `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','@Codex new message',$4,$4)`, afterID, fixture.chatID, fixture.userID, time.Now().UTC().Add(time.Second).Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert post-fence synthetic message: %v", err)
	}
	eventURL := fixture.serverURL + "/api/v2/intelligence/source/events?cursor=" + url.QueryEscape(fence.EventCursor) + "&limit=20"
	eventResponse := sourceV2Request(t, fixture.httpClient, http.MethodGet, eventURL, credential, nil)
	defer func() { _ = eventResponse.Body.Close() }()
	var page httptransport.IntelligenceSourceV2EventPage
	if eventResponse.StatusCode != http.StatusOK || json.NewDecoder(eventResponse.Body).Decode(&page) != nil || len(page.Events) != 1 || page.Events[0].ResourceID != afterID {
		t.Fatalf("events after pair fence status=%d events=%#v", eventResponse.StatusCode, page.Events)
	}
}

func TestIntelligenceSourceV2BrowserConsentTicketIsBoundOneUseAndConnectionsArePrivate(t *testing.T) {
	fixture := newIntelligenceSourceV2ConsentFixture(t)
	ctx := context.Background()
	const state = "synthetic-browser-state"
	requestBody := map[string]any{
		"flow": "source_v2", "response_type": "code", "client_id": fixture.clientID, "redirect_uri": fixture.redirectURI,
		"state": state, "code_challenge": fixture.challenge, "code_challenge_method": "S256", "chat_id": fixture.chatID,
		"grants": map[string]bool{"read": true, "process": false, "external_transfer": true, "export": false},
	}
	sessionResponse := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize-session", fixture.userToken, requestBody)
	if sessionResponse.StatusCode != http.StatusOK || sessionResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(sessionResponse.Body)
		_ = sessionResponse.Body.Close()
		t.Fatalf("create source v2 browser ticket status=%d body=%s", sessionResponse.StatusCode, body)
	}
	var sessionResponseBody map[string]any
	if err := json.NewDecoder(sessionResponse.Body).Decode(&sessionResponseBody); err != nil {
		_ = sessionResponse.Body.Close()
		t.Fatalf("decode source v2 browser ticket response: %v", err)
	}
	_ = sessionResponse.Body.Close()
	if len(sessionResponseBody) != 1 || sessionResponseBody["expires_in"] != float64(120) {
		t.Fatalf("browser session response returned unexpected fields: %#v", sessionResponseBody)
	}
	var browserTicket string
	for _, cookie := range sessionResponse.Cookies() {
		if cookie.Name == "messenger_source_v2_browser" {
			browserTicket = cookie.Value
			if cookie.Path != "/api/v2/intelligence/authorize" || !cookie.HttpOnly || cookie.MaxAge != 120 {
				t.Fatalf("source browser cookie is not path-scoped and short-lived: %#v", cookie)
			}
		}
	}
	if browserTicket == "" {
		t.Fatal("browser ticket was not returned in HttpOnly cookie")
	}
	ticketHash := sha256.Sum256([]byte(browserTicket))
	var storedHash []byte
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT ticket_hash FROM public.intelligence_browser_authorization_sessions WHERE flow='source_v2' AND user_id=$1`, fixture.userID).Scan(&storedHash); err != nil {
		t.Fatalf("read source browser ticket hash: %v", err)
	}
	if !bytes.Equal(storedHash, ticketHash[:]) || bytes.Contains(storedHash, []byte(browserTicket)) {
		t.Fatal("source browser ticket was not persisted as only its SHA-256 hash")
	}
	wrongFlowRequest := httptest.NewRequest(http.MethodGet, fixture.serverURL+"/oauth2/authorize", nil)
	_, wrongFlowErr := fixture.server.authorizeIntelligenceOIDCBrowserSession(ctx, wrongFlowRequest, browserTicket, httptransport.IntelligenceOIDCAuthorizationRequest{
		ResponseType: "code", ClientID: fixture.clientID, RedirectURI: fixture.redirectURI, State: state, Nonce: "synthetic-nonce",
		CodeChallenge: fixture.challenge, CodeChallengeMethod: "S256",
	})
	if wrongFlowErr == nil {
		t.Fatal("source consent ticket was accepted by the OIDC authorization flow")
	}
	var ticketRows int
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1 AND flow='source_v2'`, ticketHash[:]).Scan(&ticketRows); err != nil || ticketRows != 1 {
		t.Fatalf("cross-flow ticket attempt consumed source session rows=%d err=%v", ticketRows, err)
	}

	query := url.Values{
		"response_type": {"code"}, "client_id": {fixture.clientID}, "redirect_uri": {fixture.redirectURI},
		"state": {state}, "code_challenge": {fixture.challenge}, "code_challenge_method": {"S256"},
	}
	browserStart, err := http.NewRequest(http.MethodGet, fixture.serverURL+"/api/v2/intelligence/authorize?"+query.Encode(), nil)
	if err != nil {
		t.Fatalf("build browser consent start: %v", err)
	}
	browserStart.Header.Set("Accept", "text/html")
	browserStartResponse, err := fixture.httpClient.Do(browserStart)
	if err != nil {
		t.Fatalf("request browser consent start: %v", err)
	}
	if browserStartResponse.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(browserStartResponse.Body)
		_ = browserStartResponse.Body.Close()
		t.Fatalf("browser consent start status=%d body=%s", browserStartResponse.StatusCode, body)
	}
	consentPage, err := url.Parse(browserStartResponse.Header.Get("Location"))
	_ = browserStartResponse.Body.Close()
	if err != nil || consentPage.Path != "/intelligence/consent" || consentPage.Query().Get("flow") != "source_v2" || consentPage.Query().Get("state") != state {
		t.Fatalf("browser consent page = %q (err %v)", browserStartResponse.Header.Get("Location"), err)
	}

	form := url.Values{
		"response_type": {"code"}, "client_id": {fixture.clientID}, "redirect_uri": {fixture.redirectURI},
		"state": {state}, "code_challenge": {fixture.challenge}, "code_challenge_method": {"S256"}, "chat_id": {fixture.chatID},
		"read": {"true"}, "process": {"false"}, "external_transfer": {"true"}, "export": {"false"},
	}
	submitBrowserForm := func(values url.Values) *http.Response {
		t.Helper()
		formRequest, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", strings.NewReader(values.Encode()))
		if err != nil {
			t.Fatalf("build source browser form: %v", err)
		}
		formRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		formRequest.Header.Set("Origin", normalizeConfiguredOriginForTest(fixture.server.cfg.AppURL))
		formRequest.AddCookie(&http.Cookie{Name: "messenger_source_v2_browser", Value: browserTicket})
		response, err := fixture.httpClient.Do(formRequest)
		if err != nil {
			t.Fatalf("submit source browser consent: %v", err)
		}
		return response
	}
	tamperedForm := make(url.Values, len(form))
	for key, values := range form {
		tamperedForm[key] = append([]string(nil), values...)
	}
	tamperedForm.Set("export", "true")
	tamperedResponse := submitBrowserForm(tamperedForm)
	if tamperedResponse.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(tamperedResponse.Body)
		_ = tamperedResponse.Body.Close()
		t.Fatalf("changed browser grant set status=%d body=%s", tamperedResponse.StatusCode, body)
	}
	_ = tamperedResponse.Body.Close()
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, ticketHash[:]).Scan(&ticketRows); err != nil || ticketRows != 1 {
		t.Fatalf("tampered consent consumed the bound browser ticket rows=%d err=%v", ticketRows, err)
	}
	formResponse := submitBrowserForm(form)
	if formResponse.StatusCode != http.StatusFound || formResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(formResponse.Body)
		_ = formResponse.Body.Close()
		t.Fatalf("source browser consent status=%d body=%s", formResponse.StatusCode, body)
	}
	callback, err := url.Parse(formResponse.Header.Get("Location"))
	_ = formResponse.Body.Close()
	if err != nil || callback.Query().Get("state") != state || callback.Query().Get("code") == "" {
		t.Fatalf("source browser callback = %q (err %v)", callback, err)
	}
	code := callback.Query().Get("code")
	replay := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/authorize", fixture.userToken, map[string]any{
		"client_id": fixture.clientID, "redirect_uri": fixture.redirectURI, "state": state, "code_challenge": fixture.challenge,
		"code_challenge_method": "S256", "chat_id": fixture.chatID, "grants": requestBody["grants"],
	})
	if replay.StatusCode != http.StatusFound {
		body, _ := io.ReadAll(replay.Body)
		_ = replay.Body.Close()
		t.Fatalf("separate bearer path remains available after browser ticket use, status=%d body=%s", replay.StatusCode, body)
	}
	_ = replay.Body.Close()
	replayedBrowser := submitBrowserForm(form)
	if replayedBrowser.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(replayedBrowser.Body)
		_ = replayedBrowser.Body.Close()
		t.Fatalf("replayed source browser ticket status=%d body=%s", replayedBrowser.StatusCode, body)
	}
	_ = replayedBrowser.Body.Close()

	exchange := sourceV2TokenRequest(t, fixture, "authorization_code", code, fixture.verifier, "")
	if exchange.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(exchange.Body)
		_ = exchange.Body.Close()
		t.Fatalf("exchange browser-issued source code status=%d body=%s", exchange.StatusCode, body)
	}
	var issued struct {
		ConnectionID     string          `json:"connection_id"`
		SourceCredential string          `json:"source_credential"`
		Grants           map[string]bool `json:"grants"`
	}
	if err := json.NewDecoder(exchange.Body).Decode(&issued); err != nil {
		_ = exchange.Body.Close()
		t.Fatalf("decode browser-issued source credential: %v", err)
	}
	_ = exchange.Body.Close()
	if issued.SourceCredential == "" || !issued.Grants["read"] || issued.Grants["process"] || !issued.Grants["external_transfer"] || issued.Grants["export"] {
		t.Fatalf("browser grants changed during server exchange: %#v", issued)
	}
	list := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", fixture.userToken, nil)
	if list.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(list.Body)
		_ = list.Body.Close()
		t.Fatalf("list own source connections status=%d body=%s", list.StatusCode, body)
	}
	var ownerList struct {
		Connections []struct {
			ID        string          `json:"id"`
			ChatID    string          `json:"chat_id"`
			Grants    map[string]bool `json:"grants"`
			RevokedAt *time.Time      `json:"revoked_at"`
		} `json:"connections"`
	}
	listBody, _ := io.ReadAll(list.Body)
	_ = list.Body.Close()
	if err := json.Unmarshal(listBody, &ownerList); err != nil || len(ownerList.Connections) != 1 || strings.Contains(string(listBody), issued.SourceCredential) {
		t.Fatalf("owner connection list = %s err=%v", listBody, err)
	}
	var owned *struct {
		ID        string          `json:"id"`
		ChatID    string          `json:"chat_id"`
		Grants    map[string]bool `json:"grants"`
		RevokedAt *time.Time      `json:"revoked_at"`
	}
	for i := range ownerList.Connections {
		if ownerList.Connections[i].ID == issued.ConnectionID {
			owned = &ownerList.Connections[i]
		}
	}
	if owned == nil || owned.ChatID != fixture.chatID || !owned.Grants["read"] || owned.Grants["process"] || !owned.Grants["external_transfer"] {
		t.Fatalf("own connection list did not preserve the independent chat grants: %#v", owned)
	}
	secondUserID := "source-v2-other-user-" + uuid.NewString()
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Other synthetic principal','member',now())`, secondUserID, fixture.familyID); err != nil {
		t.Fatalf("create second same-family principal for ownership test: %v", err)
	}
	secondUserToken, _, err := createAccessToken(fixture.server.cfg, userPublic{ID: secondUserID, FamilyID: fixture.familyID, Role: "member", IsActive: true})
	if err != nil {
		t.Fatalf("mint second synthetic Messenger session: %v", err)
	}
	otherList := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", secondUserToken, nil)
	var otherConnections struct {
		Connections []json.RawMessage `json:"connections"`
	}
	if otherList.StatusCode != http.StatusOK || json.NewDecoder(otherList.Body).Decode(&otherConnections) != nil || len(otherConnections.Connections) != 0 {
		body, _ := io.ReadAll(otherList.Body)
		_ = otherList.Body.Close()
		t.Fatalf("same-family non-owner connection list status=%d entries=%d body=%s", otherList.StatusCode, len(otherConnections.Connections), body)
	}
	_ = otherList.Body.Close()
	wholeRevoke := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/revoke", fixture.userToken, map[string]string{"connection_id": issued.ConnectionID, "grant": "connection"})
	if wholeRevoke.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(wholeRevoke.Body)
		_ = wholeRevoke.Body.Close()
		t.Fatalf("connection UI revoke sentinel status=%d body=%s", wholeRevoke.StatusCode, body)
	}
	_ = wholeRevoke.Body.Close()
	ownerAfterRevoke := sourceV2Request(t, fixture.httpClient, http.MethodGet, fixture.serverURL+"/api/v2/intelligence/connections", fixture.userToken, nil)
	var revokedList struct {
		Connections []struct {
			ID        string          `json:"id"`
			Grants    map[string]bool `json:"grants"`
			RevokedAt *time.Time      `json:"revoked_at"`
		} `json:"connections"`
	}
	if ownerAfterRevoke.StatusCode != http.StatusOK || json.NewDecoder(ownerAfterRevoke.Body).Decode(&revokedList) != nil || len(revokedList.Connections) != 1 || revokedList.Connections[0].ID != issued.ConnectionID || revokedList.Connections[0].RevokedAt == nil || revokedList.Connections[0].Grants["read"] {
		body, _ := io.ReadAll(ownerAfterRevoke.Body)
		_ = ownerAfterRevoke.Body.Close()
		t.Fatalf("whole connection revoke did not update safe list status=%d body=%s", ownerAfterRevoke.StatusCode, body)
	}
	_ = ownerAfterRevoke.Body.Close()
}

func normalizeConfiguredOriginForTest(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

type intelligenceSourceV2ConsentFixture struct {
	server       *Server
	serverURL    string
	httpClient   *http.Client
	userToken    string
	userID       string
	familyID     string
	clientID     string
	clientSecret string
	redirectURI  string
	chatID       string
	secondChatID string
	challenge    string
	verifier     string
}

func newIntelligenceSourceV2ConsentFixture(t *testing.T) intelligenceSourceV2ConsentFixture {
	t.Helper()
	server, _, _ := newTestServer(t)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate synthetic consent signing key: %v", err)
	}
	privateKeyDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("encode synthetic consent signing key: %v", err)
	}
	const (
		issuer       = "https://messenger.example"
		clientID     = "synthetic-intelligence-client"
		clientSecret = "synthetic-confidential-client-secret"
		redirectURI  = "https://intelligence.example/oauth/callback?tenant=synthetic"
	)
	server.cfg.IntelligenceSourceEnabled = true
	server.cfg.IntelligenceOIDCEnabled = true
	server.cfg.IntelligenceOIDCIssuer = issuer
	server.cfg.IntelligenceOIDCClientID = clientID
	server.cfg.IntelligenceOIDCClientSecret = clientSecret
	server.cfg.IntelligenceOIDCRedirectURIs = []string{redirectURI}
	server.cfg.IntelligenceOIDCSigningKeyID = "synthetic-consent-key"
	server.cfg.IntelligenceOIDCSigningPrivateKeyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateKeyDER}))
	server.cfg.IntelligenceSourceV2RestoreEpoch = "synthetic-source-v2-restore-epoch-current"
	if _, err := server.sqlDB.ExecContext(context.Background(), `UPDATE public.intelligence_source_v2_restore_gate SET blocked=false,restore_epoch=$1 WHERE gate_id='global'`, server.cfg.IntelligenceSourceV2RestoreEpoch); err != nil {
		t.Fatalf("initialize synthetic deployment restore epoch: %v", err)
	}
	httpServer := httptest.NewServer(server.Routes())
	t.Cleanup(httpServer.Close)

	ctx := context.Background()
	familyID := "source-v2-family-" + uuid.NewString()
	userID := "source-v2-user-" + uuid.NewString()
	otherUserID := "source-v2-user-" + uuid.NewString()
	chatID := "source-v2-chat-" + uuid.NewString()
	secondChatID := "source-v2-chat-" + uuid.NewString()
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.families(id,name,created_at,updated_at) VALUES($1,'Synthetic source v2 family',$2,$2)`, []any{familyID, createdAt}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Synthetic source v2 principal','member',$3)`, []any{userID, familyID, createdAt}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Synthetic direct-message contact','member',$3)`, []any{otherUserID, familyID, createdAt}},
		{`INSERT INTO public.chats(id,family_id,type,title,media_visibility,created_at,updated_at) VALUES($1,$2,'group','Synthetic source v2 chat','members',$3,$3)`, []any{chatID, familyID, createdAt}},
		{`INSERT INTO public.chats(id,family_id,type,title,media_visibility,created_at,updated_at) VALUES($1,$2,'direct',NULL,'members',$3,$3)`, []any{secondChatID, familyID, createdAt}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, []any{chatID, userID, createdAt}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, []any{secondChatID, userID, createdAt}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,$3)`, []any{secondChatID, otherUserID, createdAt}},
		{`INSERT INTO public.intelligence_installations(id,tenant_id,family_id,enabled) VALUES($1,$2,$3,true)`, []any{"source-v2-install-" + uuid.NewString(), "synthetic-tenant-" + uuid.NewString(), familyID}},
	}
	for _, statement := range statements {
		if _, err := server.sqlDB.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("insert synthetic v2 consent fixture: %v", err)
		}
	}
	accessToken, _, err := createAccessToken(server.cfg, userPublic{ID: userID, FamilyID: familyID, Role: "member", IsActive: true})
	if err != nil {
		t.Fatalf("mint synthetic Messenger session: %v", err)
	}
	verifier := "synthetic-consent-pkce-verifier-with-at-least-forty-three-characters"
	challengeDigest := sha256.Sum256([]byte(verifier))
	return intelligenceSourceV2ConsentFixture{
		server: server, serverURL: httpServer.URL, httpClient: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		userToken: accessToken, userID: userID, familyID: familyID, clientID: clientID, clientSecret: clientSecret, redirectURI: redirectURI,
		chatID: chatID, verifier: verifier, challenge: base64.RawURLEncoding.EncodeToString(challengeDigest[:]),
		secondChatID: secondChatID,
	}
}

type sourceV2AuthorizationTestDecision struct {
	SchemaVersion string `json:"schema_version"`
	TenantID      string `json:"tenant_id"`
	ConnectionID  string `json:"connection_id"`
	PrincipalID   string `json:"principal_id"`
	ResourceID    string `json:"resource_id"`
	Operation     string `json:"operation"`
	Allowed       bool   `json:"allowed"`
	Scope         struct {
		Kind       string `json:"kind"`
		ResourceID string `json:"resource_id"`
	} `json:"scope"`
	PolicyRevision string    `json:"policy_revision"`
	DecidedAt      time.Time `json:"decided_at"`
	ValidUntil     time.Time `json:"valid_until"`
}

func createIntelligenceSourceV2TestConnection(t *testing.T, fixture intelligenceSourceV2ConsentFixture, chatID string, grants map[string]bool) (string, string) {
	t.Helper()
	ctx := context.Background()
	var installationID string
	if err := fixture.server.sqlDB.QueryRowContext(ctx, `SELECT id FROM public.intelligence_installations WHERE family_id=$1 AND enabled`, fixture.familyID).Scan(&installationID); err != nil {
		t.Fatalf("find synthetic Intelligence installation: %v", err)
	}
	connectionID := "source-v2-policy-connection-" + uuid.NewString()
	credential := "synthetic-source-v2-credential-" + uuid.NewString()
	digest := sha256.Sum256([]byte(credential))
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connections(id,installation_id,principal_user_id,credential_hash,enabled,credential_expires_at) VALUES($1,$2,$3,$4,true,now()+interval '30 days')`, connectionID, installationID, fixture.userID, digest[:]); err != nil {
		t.Fatalf("insert synthetic source v2 connection: %v", err)
	}
	if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_chats(connection_id,chat_id) VALUES($1,$2)`, connectionID, chatID); err != nil {
		t.Fatalf("insert synthetic source v2 chat scope: %v", err)
	}
	for _, grant := range []string{"read", "process", "external_transfer", "export", "codex", "reply"} {
		if _, err := fixture.server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_grants(connection_id,grant_type,granted,granted_at) VALUES($1,$2,$3,CASE WHEN $3 THEN now() ELSE NULL END)`, connectionID, grant, grants[grant]); err != nil {
			t.Fatalf("insert synthetic %s grant: %v", grant, err)
		}
	}
	return connectionID, credential
}

func sourceV2AuthorizationDecision(t *testing.T, fixture intelligenceSourceV2ConsentFixture, credential, resourceID, operation string) sourceV2AuthorizationTestDecision {
	t.Helper()
	response := sourceV2Request(t, fixture.httpClient, http.MethodPost, fixture.serverURL+"/api/v2/intelligence/source/authorization:check", credential, map[string]any{"schema_version": "v2", "resource_ids": []string{resourceID}, "operation": operation})
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read v2 authorization response: %v", err)
	}
	var envelope struct {
		SchemaVersion string                              `json:"schema_version"`
		Decisions     []sourceV2AuthorizationTestDecision `json:"decisions"`
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("Cache-Control") != "no-store" || json.Unmarshal(body, &envelope) != nil || envelope.SchemaVersion != "v2" || len(envelope.Decisions) != 1 {
		t.Fatalf("authorization %s/%s status=%d cache=%q body=%s", resourceID, operation, response.StatusCode, response.Header.Get("Cache-Control"), body)
	}
	if strings.Contains(string(body), credential) {
		t.Fatal("source credential was echoed in authorization response")
	}
	return envelope.Decisions[0]
}

func sourceV2Request(t *testing.T, client *http.Client, method, target, bearer string, body any) *http.Response {
	t.Helper()
	var encoded io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode source v2 request: %v", err)
		}
		encoded = strings.NewReader(string(data))
	}
	request, err := http.NewRequest(method, target, encoded)
	if err != nil {
		t.Fatalf("create source v2 request: %v", err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("send source v2 request: %v", err)
	}
	return response
}

func sourceV2TokenRequest(t *testing.T, fixture intelligenceSourceV2ConsentFixture, grantType, codeOrCredential, verifier, connectionID string) *http.Response {
	t.Helper()
	return sourceV2TokenRequestWithSecret(t, fixture, grantType, codeOrCredential, verifier, connectionID, fixture.clientSecret)
}

func sourceV2TokenRequestWithSecret(t *testing.T, fixture intelligenceSourceV2ConsentFixture, grantType, codeOrCredential, verifier, connectionID, clientSecret string) *http.Response {
	t.Helper()
	form := url.Values{"grant_type": {grantType}, "redirect_uri": {fixture.redirectURI}}
	if grantType == "authorization_code" {
		form.Set("code", codeOrCredential)
		form.Set("code_verifier", verifier)
	} else {
		form.Set("source_credential", codeOrCredential)
		form.Set("connection_id", connectionID)
	}
	request, err := http.NewRequest(http.MethodPost, fixture.serverURL+"/api/v2/intelligence/token", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("create source v2 token request: %v", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.SetBasicAuth(fixture.clientID, clientSecret)
	response, err := fixture.httpClient.Do(request)
	if err != nil {
		t.Fatalf("send source v2 token request: %v", err)
	}
	return response
}

func sourceV2RotationRequest(t *testing.T, fixture intelligenceSourceV2ConsentFixture, connectionID, oldCredential string) *http.Response {
	t.Helper()
	return sourceV2TokenRequest(t, fixture, "urn:stovo:intelligence:source-credential-rotation", oldCredential, "", connectionID)
}
