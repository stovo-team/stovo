package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

func TestIntelligenceSourcePostgresContract(t *testing.T) {
	server, _, _ := newTestServer(t)
	ctx := context.Background()
	const (
		familyID       = "source-family-test"
		principalID    = "source-principal-test"
		chatID         = "source-chat-test"
		installationID = "source-install-test"
		connectionID   = "source-connection-test"
		resourceID     = "source-message-test"
		tenantID       = "source-tenant-test"
		token          = "synthetic-source-credential"
	)
	credentialHash := sha256.Sum256([]byte(token))
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.families(id,name,created_at,updated_at) VALUES($1,'Synthetic source family','2026-10-06','2026-10-06')`, []any{familyID}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Synthetic principal','member','2026-10-06')`, []any{principalID, familyID}},
		{`INSERT INTO public.chats(id,family_id,type,title,media_visibility,created_at,updated_at) VALUES($1,$2,'group','Synthetic source chat','members','2026-10-06','2026-10-06')`, []any{chatID, familyID}},
		{`INSERT INTO public.chat_members(chat_id,user_id,created_at) VALUES($1,$2,'2026-10-06')`, []any{chatID, principalID}},
		{`INSERT INTO public.intelligence_installations(id,tenant_id,family_id,enabled) VALUES($1,$2,$3,true)`, []any{installationID, tenantID, familyID}},
		{`INSERT INTO public.intelligence_connections(id,installation_id,principal_user_id,credential_hash,enabled) VALUES($1,$2,$3,$4,true)`, []any{connectionID, installationID, principalID, credentialHash[:]}},
		{`INSERT INTO public.intelligence_connection_chats(connection_id,chat_id) VALUES($1,$2)`, []any{connectionID, chatID}},
	} {
		if _, err := server.sqlDB.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("insert synthetic source fixture: %v", err)
		}
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.messages(id,chat_id,sender_id,type,content,created_at,updated_at) VALUES($1,$2,$3,'text','hello 😀','2026-10-06','2026-10-06')`, resourceID, chatID, principalID); err != nil {
		t.Fatalf("insert source message: %v", err)
	}

	server.cfg.IntelligenceSourceEnabled = true
	handlerConfig := server.intelligenceSourceHandler()
	handler := httptransport.NewIntelligenceSourceHandler(handlerConfig)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}

	var firstPage httptransport.IntelligenceSourceEventPage
	if response := request(http.MethodGet, "/api/v1/intelligence/source/events?tenant_id=forged-tenant", ""); response.Code != http.StatusOK {
		t.Fatalf("event request status=%d body=%s", response.Code, response.Body.String())
	} else if err := json.Unmarshal(response.Body.Bytes(), &firstPage); err != nil {
		t.Fatalf("decode event response: %v", err)
	}
	if len(firstPage.Events) != 1 || firstPage.Events[0].Kind != "create" || firstPage.Events[0].TenantID != tenantID || firstPage.Events[0].ResourceID != resourceID {
		t.Fatalf("initial event page = %#v", firstPage)
	}
	revisionID := firstPage.Events[0].RevisionID

	snapshotPath := "/api/v1/intelligence/source/resources/" + resourceID + "/snapshot?revision_id=" + revisionID
	var snapshot httptransport.IntelligenceResourceSnapshot
	if response := request(http.MethodGet, snapshotPath, ""); response.Code != http.StatusOK {
		t.Fatalf("snapshot status=%d body=%s", response.Code, response.Body.String())
	} else if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if snapshot.Content != "hello 😀" || snapshot.RevisionID != revisionID || snapshot.ContentRevisionID != revisionID || snapshot.MetadataRevisionID != revisionID {
		t.Fatalf("snapshot does not match source revision: %#v", snapshot)
	}

	var citation httptransport.IntelligenceCitationResolution
	if response := request(http.MethodPost, "/api/v1/intelligence/source/citations:resolve", `{"resource_id":"`+resourceID+`","revision_id":"`+revisionID+`","locator":{"start":6,"end":7}}`); response.Code != http.StatusOK {
		t.Fatalf("citation status=%d body=%s", response.Code, response.Body.String())
	} else if err := json.Unmarshal(response.Body.Bytes(), &citation); err != nil {
		t.Fatalf("decode citation: %v", err)
	}
	if citation.RevisionID != revisionID || citation.Excerpt != "😀" {
		t.Fatalf("citation resolution = %#v", citation)
	}

	authorize := func() httptransport.IntelligenceAuthorizationDecision {
		t.Helper()
		response := request(http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["`+resourceID+`"],"operation":"read"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("authorization status=%d body=%s", response.Code, response.Body.String())
		}
		var body struct {
			Decisions []httptransport.IntelligenceAuthorizationDecision `json:"decisions"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || len(body.Decisions) != 1 {
			t.Fatalf("decode authorization decision: %v body=%s", err, response.Body.String())
		}
		return body.Decisions[0]
	}
	if decision := authorize(); !decision.Allowed {
		t.Fatalf("current member was denied read: %#v", decision)
	}

	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.message_user_deletions(message_id,user_id,deleted_at) VALUES($1,$2,'2026-10-06')`, resourceID, principalID); err != nil {
		t.Fatalf("hide message for principal: %v", err)
	}
	if decision := authorize(); decision.Allowed {
		t.Fatalf("read was allowed after per-user deletion: %#v", decision)
	}
	if response := request(http.MethodGet, "/api/v1/intelligence/source/events?cursor="+firstPage.NextCursor, ""); response.Code != http.StatusOK {
		t.Fatalf("ACL replay after per-user deletion status=%d body=%s", response.Code, response.Body.String())
	} else {
		var page httptransport.IntelligenceSourceEventPage
		if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil || len(page.Events) == 0 || page.Events[0].Kind != "acl_change" {
			t.Fatalf("per-user ACL invalidation missing: err=%v page=%#v", err, page)
		}
	}

	if _, err := server.sqlDB.ExecContext(ctx, `DELETE FROM public.message_user_deletions WHERE message_id=$1 AND user_id=$2`, resourceID, principalID); err != nil {
		t.Fatalf("restore per-user visibility: %v", err)
	}
	if _, err := server.sqlDB.ExecContext(ctx, `UPDATE public.messages SET encryption_protocol='end_to_end',content=NULL,ciphertext='synthetic-ciphertext',nonce='synthetic-nonce' WHERE id=$1`, resourceID); err != nil {
		t.Fatalf("transition message to E2E: %v", err)
	}
	if response := request(http.MethodGet, snapshotPath, ""); response.Code != http.StatusNotFound {
		t.Fatalf("historical snapshot survived E2E transition: status=%d body=%s", response.Code, response.Body.String())
	}
	if _, err := server.sqlDB.ExecContext(ctx, `DELETE FROM public.chat_members WHERE chat_id=$1 AND user_id=$2`, chatID, principalID); err != nil {
		t.Fatalf("remove current membership: %v", err)
	}
	if decision := authorize(); decision.Allowed {
		t.Fatalf("read was allowed after membership removal: %#v", decision)
	}

	var auditCount int
	if err := server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_source_audit WHERE connection_id=$1`, connectionID).Scan(&auditCount); err != nil {
		t.Fatalf("read audit records: %v", err)
	}
	if auditCount == 0 {
		t.Fatal("expected metadata-only service audit records")
	}
}
