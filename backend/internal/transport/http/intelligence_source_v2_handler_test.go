package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func v2TestIdentity() IntelligenceSourceIdentity {
	return IntelligenceSourceIdentity{InstallationID: "install-v2", TenantID: "tenant-v2", ConnectionID: "connection-v2", FamilyID: "family-v2", PrincipalUserID: "principal-v2", ChatID: "chat-v2", InstallationEnabled: true, ConnectionEnabled: true}
}

func v2TestDecision(identity IntelligenceSourceIdentity, resourceID, operation string, now time.Time) IntelligenceSourceV2AuthorizationDecision {
	return IntelligenceSourceV2AuthorizationDecision{SchemaVersion: "v2", TenantID: identity.TenantID, ConnectionID: identity.ConnectionID, PrincipalID: identity.PrincipalUserID, ResourceID: resourceID, Operation: operation, Allowed: true, Scope: IntelligenceSourceV2DecisionScope{Kind: "chat", ResourceID: identity.ChatID}, PolicyRevision: "synthetic-policy-revision", DecidedAt: now, ValidUntil: now.Add(5 * time.Minute)}
}

func v2TestHandler(operations IntelligenceSourceV2Operations, configure func(*IntelligenceSourceV2HandlerConfig)) http.Handler {
	cfg := IntelligenceSourceV2HandlerConfig{Enabled: true, Authenticate: func(_ context.Context, token string) (IntelligenceSourceIdentity, error) {
		if token != "synthetic-v2-source-credential" {
			return IntelligenceSourceIdentity{}, ErrIntelligenceSourceUnauthorized
		}
		return v2TestIdentity(), nil
	}, Operations: operations, Now: func() time.Time { return time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC) }}
	if configure != nil {
		configure(&cfg)
	}
	return NewIntelligenceSourceV2Handler(cfg)
}

func v2Request(handler http.Handler, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/authorization:check", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer synthetic-v2-source-credential")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestIntelligenceSourceV2AuthorizationReturnsVersionedBoundDecisions(t *testing.T) {
	id, now := v2TestIdentity(), time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	var gotID IntelligenceSourceIdentity
	var gotIDs []string
	var gotOperation string
	h := v2TestHandler(IntelligenceSourceV2Operations{Authorize: func(_ context.Context, got IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
		gotID, gotIDs, gotOperation = got, ids, operation
		return []IntelligenceSourceV2AuthorizationDecision{v2TestDecision(id, ids[0], operation, now), v2TestDecision(id, ids[1], operation, now)}, nil
	}}, nil)
	w := v2Request(h, `{"schema_version":"v2","resource_ids":["message-1","message-2"],"operation":"external_transfer"}`)
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d cache=%q body=%s", w.Code, w.Header().Get("Cache-Control"), w.Body.String())
	}
	if gotID.ConnectionID != id.ConnectionID || gotID.PrincipalUserID != id.PrincipalUserID || gotID.ChatID != id.ChatID || strings.Join(gotIDs, ",") != "message-1,message-2" || gotOperation != "external_transfer" {
		t.Fatalf("policy args identity=%#v ids=%v op=%q", gotID, gotIDs, gotOperation)
	}
	var got struct {
		SchemaVersion string                                      `json:"schema_version"`
		Decisions     []IntelligenceSourceV2AuthorizationDecision `json:"decisions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.SchemaVersion != "v2" || len(got.Decisions) != 2 {
		t.Fatalf("envelope=%#v", got)
	}
	for i, d := range got.Decisions {
		if d.SchemaVersion != "v2" || d.TenantID != id.TenantID || d.ConnectionID != id.ConnectionID || d.PrincipalID != id.PrincipalUserID || d.ResourceID != gotIDs[i] || d.Operation != gotOperation || d.Scope.Kind != "chat" || d.Scope.ResourceID != id.ChatID || d.PolicyRevision == "" || !d.Allowed || d.ValidUntil.Sub(d.DecidedAt) > 5*time.Minute {
			t.Errorf("decision %d=%#v", i, d)
		}
	}
}

func TestIntelligenceSourceV2EventFenceReturnsOnlyAnOpaqueCursor(t *testing.T) {
	id := v2TestIdentity()
	called := false
	h := v2TestHandler(IntelligenceSourceV2Operations{EventFence: func(_ context.Context, got IntelligenceSourceIdentity) (IntelligenceSourceV2EventFence, error) {
		called = true
		if got.ConnectionID != id.ConnectionID || got.ChatID != id.ChatID {
			t.Fatalf("fence identity=%#v", got)
		}
		return IntelligenceSourceV2EventFence{SchemaVersion: "v2", EventCursor: "opaque-signed-fence", FenceSequence: 42}, nil
	}}, nil)
	request := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/events/fence", strings.NewReader(`{"schema_version":"v2"}`))
	request.Header.Set("Authorization", "Bearer synthetic-v2-source-credential")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, request)
	var got IntelligenceSourceV2EventFence
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" || !called || got.EventCursor != "opaque-signed-fence" || got.FenceSequence != 42 {
		t.Fatalf("fence response=%d %q called=%v body=%s", response.Code, response.Header().Get("Cache-Control"), called, response.Body.String())
	}
}

func TestIntelligenceSourceV2ReplyIsBoundAndServerStamped(t *testing.T) {
	var gotIdentity IntelligenceSourceIdentity
	var gotOperationID, gotText string
	var gotRevision int64
	var gotFinal bool
	h := v2TestHandler(IntelligenceSourceV2Operations{Reply: func(_ context.Context, identity IntelligenceSourceIdentity, operationID string, revision int64, text string, final bool) (string, error) {
		gotIdentity, gotOperationID, gotRevision, gotText, gotFinal = identity, operationID, revision, text, final
		return "message-created-by-server", nil
	}}, nil)
	request := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/replies", strings.NewReader(`{"schema_version":"v2","operation_id":"bridge-op-1","revision":1,"text":"hello from local Codex","final":true}`))
	request.Header.Set("Authorization", "Bearer synthetic-v2-source-credential")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("reply status=%d body=%s", response.Code, response.Body.String())
	}
	if gotIdentity.ConnectionID != "connection-v2" || gotIdentity.ChatID != "chat-v2" || gotIdentity.PrincipalUserID != "principal-v2" || gotOperationID != "bridge-op-1" || gotRevision != 1 || gotText != "hello from local Codex" || !gotFinal {
		t.Fatalf("reply operation received identity=%#v operation=%q revision=%d text=%q final=%v", gotIdentity, gotOperationID, gotRevision, gotText, gotFinal)
	}
	var result IntelligenceSourceV2ReplyResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode reply response: %v", err)
	}
	if result.MessageID != "message-created-by-server" || result.OperationID != gotOperationID || result.Origin != IntelligenceSourceV2CodexBridgeOrigin {
		t.Fatalf("reply result = %#v", result)
	}
}

func TestIntelligenceSourceV2ReplyRejectsCallerSelectedIdentity(t *testing.T) {
	called := false
	h := v2TestHandler(IntelligenceSourceV2Operations{Reply: func(context.Context, IntelligenceSourceIdentity, string, int64, string, bool) (string, error) {
		called = true
		return "message", nil
	}}, nil)
	for _, body := range []string{
		`{"schema_version":"v2","operation_id":"bridge-op-1","revision":1,"text":"hello","chat_id":"other-chat"}`,
		`{"schema_version":"v2","operation_id":"bridge-op-1","revision":1,"text":"hello","sender_id":"other-user"}`,
		`{"schema_version":"v2","operation_id":"bridge-op-1","revision":1,"text":"hello","origin":"trusted"}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/replies", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer synthetic-v2-source-credential")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		h.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest || called {
			t.Fatalf("forged reply body=%s status=%d operation_called=%v", body, response.Code, called)
		}
	}
}

func TestIntelligenceSourceV2RejectsUnversionedAndCallerIdentityFields(t *testing.T) {
	called := false
	h := v2TestHandler(IntelligenceSourceV2Operations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
		called = true
		return nil, nil
	}}, nil)
	for _, body := range []string{`{"resource_ids":["message-1"],"operation":"read"}`, `{"schema_version":"v2","resource_ids":["message-1"],"operation":"read","tenant_id":"forged"}`, `{"schema_version":"v1","resource_ids":["message-1"],"operation":"read"}`, `{"schema_version":"v2","resource_ids":["message-1"],"operation":"admin"}`} {
		w := v2Request(h, body)
		var envelope map[string]any
		if w.Code != http.StatusBadRequest || w.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(w.Body.Bytes(), &envelope) != nil || envelope["schema_version"] != "v2" {
			t.Errorf("invalid body %s => %d %s", body, w.Code, w.Body.String())
		}
	}
	if called {
		t.Fatal("invalid request reached policy operation")
	}
}

func TestIntelligenceSourceV2RejectsStaleOrMismatchedPolicyDecision(t *testing.T) {
	id, now := v2TestIdentity(), time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	for name, mutate := range map[string]func(*IntelligenceSourceV2AuthorizationDecision){
		"principal": func(d *IntelligenceSourceV2AuthorizationDecision) { d.PrincipalID = "forged" },
		"chat":      func(d *IntelligenceSourceV2AuthorizationDecision) { d.Scope.ResourceID = "other-chat" },
		"ttl": func(d *IntelligenceSourceV2AuthorizationDecision) {
			d.ValidUntil = now.Add(5*time.Minute + time.Second)
		},
		"expired": func(d *IntelligenceSourceV2AuthorizationDecision) { d.ValidUntil = now },
	} {
		t.Run(name, func(t *testing.T) {
			h := v2TestHandler(IntelligenceSourceV2Operations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
				d := v2TestDecision(id, "message-1", "read", now)
				mutate(&d)
				return []IntelligenceSourceV2AuthorizationDecision{d}, nil
			}}, nil)
			w := v2Request(h, `{"schema_version":"v2","resource_ids":["message-1"],"operation":"read"}`)
			if w.Code != http.StatusServiceUnavailable || strings.Contains(w.Body.String(), `"allowed":true`) {
				t.Fatalf("unsafe decision=%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestIntelligenceSourceV2CitationUsesExactRevisionAfterReadAuthorization(t *testing.T) {
	id, now := v2TestIdentity(), time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	var gotRevision string
	var gotLocator IntelligenceTextLocator
	h := v2TestHandler(IntelligenceSourceV2Operations{
		Authorize: func(_ context.Context, _ IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
			if operation != "read" || len(ids) != 1 {
				t.Fatalf("read check ids=%v op=%q", ids, operation)
			}
			return []IntelligenceSourceV2AuthorizationDecision{v2TestDecision(id, ids[0], operation, now)}, nil
		},
		ResolveCitation: func(_ context.Context, _ IntelligenceSourceIdentity, resourceID, revisionID string, locator IntelligenceTextLocator) (IntelligenceSourceV2CitationResolution, error) {
			if resourceID != "message-1" {
				t.Fatalf("resource=%q", resourceID)
			}
			gotRevision, gotLocator = revisionID, locator
			return IntelligenceSourceV2CitationResolution{RevisionID: revisionID, Excerpt: "Ж"}, nil
		},
	}, nil)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/citations:resolve", strings.NewReader(`{"schema_version":"v2","resource_id":"message-1","revision_id":"revision-exact","locator":{"kind":"text","start":1,"end":2}}`))
	r.Header.Set("Authorization", "Bearer synthetic-v2-source-credential")
	r.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" || gotRevision != "revision-exact" || gotLocator != (IntelligenceTextLocator{Kind: "text", Start: 1, End: 2}) {
		t.Fatalf("citation status=%d revision=%q locator=%#v body=%s", w.Code, gotRevision, gotLocator, w.Body.String())
	}
	var got struct {
		SchemaVersion string `json:"schema_version"`
		RevisionID    string `json:"revision_id"`
		Excerpt       string `json:"excerpt"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got.SchemaVersion != "v2" || got.RevisionID != "revision-exact" || got.Excerpt != "Ж" {
		t.Fatalf("citation=%#v err=%v body=%s", got, err, w.Body.String())
	}
}

func TestIntelligenceSourceV2FailuresAreVersionedNoStoreAndFailClosed(t *testing.T) {
	for name, values := range map[string]struct {
		policy error
		limit  error
		status int
	}{
		"storage":         {ErrIntelligenceSourceUnavailable, nil, http.StatusServiceUnavailable},
		"resource denied": {ErrIntelligenceSourceNotFound, nil, http.StatusNotFound},
		"rate limit":      {nil, ErrIntelligenceSourceRateLimited, http.StatusTooManyRequests},
	} {
		t.Run(name, func(t *testing.T) {
			h := v2TestHandler(IntelligenceSourceV2Operations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
				if values.policy != nil {
					return nil, values.policy
				}
				return nil, nil
			}}, func(cfg *IntelligenceSourceV2HandlerConfig) {
				cfg.Limit = func(context.Context, string) error { return values.limit }
			})
			w := v2Request(h, `{"schema_version":"v2","resource_ids":["message-1"],"operation":"read"}`)
			var envelope map[string]any
			if w.Code != values.status || w.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(w.Body.Bytes(), &envelope) != nil || envelope["schema_version"] != "v2" || strings.Contains(w.Body.String(), `"allowed":true`) {
				t.Fatalf("failure status=%d want=%d cache=%q body=%s", w.Code, values.status, w.Header().Get("Cache-Control"), w.Body.String())
			}
		})
	}
}

func TestIntelligenceSourceV2RejectsV1CredentialAndCancellation(t *testing.T) {
	h := v2TestHandler(IntelligenceSourceV2Operations{Authorize: func(ctx context.Context, _ IntelligenceSourceIdentity, _ []string, _ string) ([]IntelligenceSourceV2AuthorizationDecision, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}}, nil)
	for token, status := range map[string]int{"old-v1-source-credential": http.StatusUnauthorized, "synthetic-v2-source-credential": http.StatusServiceUnavailable} {
		r := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/source/authorization:check", strings.NewReader(`{"schema_version":"v2","resource_ids":["message-1"],"operation":"read"}`))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		ctx, cancel := context.WithCancel(r.Context())
		cancel()
		r = r.WithContext(ctx)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != status || w.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("token %q => status=%d cache=%q body=%s", token, w.Code, w.Header().Get("Cache-Control"), w.Body.String())
		}
	}
}

func TestIntelligenceSourceV2DisabledReturnsVersionedError(t *testing.T) {
	h := NewIntelligenceSourceV2Handler(IntelligenceSourceV2HandlerConfig{})
	w := v2Request(h, `{"schema_version":"v2","resource_ids":["message-1"],"operation":"read"}`)
	var envelope map[string]any
	if w.Code != http.StatusForbidden || w.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(w.Body.Bytes(), &envelope) != nil || envelope["schema_version"] != "v2" || envelope["error"] == nil {
		t.Fatalf("disabled source status=%d cache=%q body=%s", w.Code, w.Header().Get("Cache-Control"), w.Body.String())
	}
}
