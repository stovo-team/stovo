package http

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"
)

func TestIntelligenceSourceRejectsOversizedOperationPage(t *testing.T) {
	identity := intelligenceTestIdentity()
	first := IntelligenceSourceEvent{SchemaVersion: "v1", EventID: "evt-1", TenantID: identity.TenantID, ConnectionID: identity.ConnectionID, ResourceID: "resource-1", RevisionID: "rev-1", OrderToken: "order-1", ContainerID: "chat-1", ObservedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), Kind: "create"}
	second := first
	second.EventID, second.RevisionID, second.OrderToken = "evt-2", "rev-2", "order-2"
	h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
		return IntelligenceSourceEventPage{Events: []IntelligenceSourceEvent{first, second}, NextCursor: "next"}, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events?limit=1", "")
	if r.Code != http.StatusServiceUnavailable || r.Body.String() == "" {
		t.Fatalf("oversized operation page status=%d body=%s, want fail closed", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceRejectsAuthorizationDecisionWithoutTime(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(_ context.Context, identity IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceAuthorizationDecision, error) {
		return []IntelligenceAuthorizationDecision{{TenantID: identity.TenantID, ResourceID: ids[0], Operation: operation, Allowed: true, PolicyRevision: "policy-current"}}, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["resource-1"],"operation":"read"}`)
	if r.Code != http.StatusServiceUnavailable || r.Body.String() == "" {
		t.Fatalf("timeless authorization decision status=%d body=%s, want fail closed", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceFailsClosedWhenAuditIsUnavailable(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
		return IntelligenceSourceEventPage{Events: []IntelligenceSourceEvent{}, NextCursor: "next"}, nil
	}}, func(cfg *IntelligenceSourceHandlerConfig) {
		cfg.Audit = func(context.Context, IntelligenceSourceAuditRecord) error {
			return errors.New("audit database unavailable")
		}
	})
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events", "")
	if r.Code != http.StatusServiceUnavailable {
		t.Fatalf("audit failure status=%d body=%s, want fail-closed 503", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceRejectsCallerSuppliedIdentityFields(t *testing.T) {
	called := false
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceAuthorizationDecision, error) {
		called = true
		return nil, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["resource-1"],"operation":"read","tenant_id":"forged"}`)
	if r.Code != http.StatusBadRequest || called {
		t.Fatalf("unknown identity field status=%d operation_called=%v body=%s", r.Code, called, r.Body.String())
	}
}
