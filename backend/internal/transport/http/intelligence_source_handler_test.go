package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func intelligenceTestIdentity() IntelligenceSourceIdentity {
	return IntelligenceSourceIdentity{InstallationID: "install-1", TenantID: "tenant-1", ConnectionID: "connection-1", FamilyID: "family-1", PrincipalUserID: "principal-1", InstallationEnabled: true, ConnectionEnabled: true}
}

func intelligenceAllowRead() func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceAuthorizationDecision, error) {
	return func(_ context.Context, id IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceAuthorizationDecision, error) {
		decisions := make([]IntelligenceAuthorizationDecision, 0, len(ids))
		for _, resourceID := range ids {
			decisions = append(decisions, IntelligenceAuthorizationDecision{TenantID: id.TenantID, ResourceID: resourceID, Operation: operation, Allowed: operation == "read", DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current-policy"})
		}
		return decisions, nil
	}
}

func intelligenceTestHandler(ops IntelligenceSourceOperations, configure func(*IntelligenceSourceHandlerConfig)) http.Handler {
	cfg := IntelligenceSourceHandlerConfig{
		Enabled: true,
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) {
			return intelligenceTestIdentity(), nil
		},
		Operations: ops,
	}
	if configure != nil {
		configure(&cfg)
	}
	return NewIntelligenceSourceHandler(cfg)
}

func intelligenceRequest(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer synthetic-token")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	return r
}

func TestIntelligenceSourceDisabledByDefault(t *testing.T) {
	calls := 0
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) {
			return IntelligenceSourceIdentity{}, nil
		},
		Operations: IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
			calls++
			return IntelligenceSourceEventPage{}, nil
		}},
	})
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events", nil))
	if r.Code != http.StatusForbidden {
		t.Fatalf("disabled source status = %d, want 403; body=%s", r.Code, r.Body.String())
	}
	if calls != 0 {
		t.Fatalf("disabled source called storage %d times, want 0", calls)
	}
}

func TestIntelligenceSourceRejectsInvalidBearer(t *testing.T) {
	called := false
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Enabled: true,
		Authenticate: func(_ context.Context, token string) (IntelligenceSourceIdentity, error) {
			if token != "bad-token" {
				t.Fatalf("auth token = %q, want supplied bearer", token)
			}
			return IntelligenceSourceIdentity{}, ErrIntelligenceSourceUnauthorized
		},
		Operations: IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
			called = true
			return IntelligenceSourceEventPage{}, nil
		}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events", nil)
	req.Header.Set("Authorization", "Bearer bad-token")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != http.StatusUnauthorized || called {
		t.Fatalf("invalid bearer status=%d operation_called=%v body=%s", r.Code, called, r.Body.String())
	}
}

func TestIntelligenceSourceIgnoresCallerTenantAndPrincipal(t *testing.T) {
	mapped := IntelligenceSourceIdentity{InstallationID: "inst-a", TenantID: "tenant-a", ConnectionID: "conn-a", FamilyID: "family-a", PrincipalUserID: "user-a", InstallationEnabled: true, ConnectionEnabled: true}
	var got IntelligenceSourceIdentity
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Enabled:      true,
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) { return mapped, nil },
		Operations: IntelligenceSourceOperations{Events: func(_ context.Context, identity IntelligenceSourceIdentity, _ string, _ int) (IntelligenceSourceEventPage, error) {
			got = identity
			return IntelligenceSourceEventPage{}, nil
		}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events?tenant_id=forged-tenant&principal_id=forged-user", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != http.StatusOK {
		t.Fatalf("forged identity query status=%d body=%s", r.Code, r.Body.String())
	}
	if got.TenantID != mapped.TenantID || got.PrincipalUserID != mapped.PrincipalUserID || got.ConnectionID != mapped.ConnectionID {
		t.Fatalf("operation identity = %#v, want credential-mapped identity %#v", got, mapped)
	}
}

func TestIntelligenceSourceEventsReturnsContractPage(t *testing.T) {
	observed := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)
	sequence := int64(12)
	want := IntelligenceSourceEventPage{
		Events: []IntelligenceSourceEvent{{
			SchemaVersion: "v1", EventID: "evt-12", TenantID: "tenant-1", ConnectionID: "connection-1",
			ResourceID: "resource-a", RevisionID: "rev-12", OrderToken: "opaque-order-12", SourceSequence: &sequence,
			ContainerID: "chat-1", ObservedAt: observed, Kind: "create", PolicyRefs: []string{"policy-a"},
		}},
		NextCursor: "opaque-next", HasMore: true,
	}
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Enabled: true,
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) {
			return intelligenceTestIdentity(), nil
		},
		Operations: IntelligenceSourceOperations{Events: func(_ context.Context, _ IntelligenceSourceIdentity, cursor string, limit int) (IntelligenceSourceEventPage, error) {
			if cursor != "opaque-in" || limit != 7 {
				t.Fatalf("events args cursor=%q limit=%d", cursor, limit)
			}
			return want, nil
		}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events?cursor=opaque-in&limit=7", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != http.StatusOK {
		t.Fatalf("events status=%d body=%s", r.Code, r.Body.String())
	}
	if r.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control=%q, want no-store", r.Header().Get("Cache-Control"))
	}
	var body struct {
		Events     []map[string]json.RawMessage `json:"events"`
		NextCursor string                       `json:"next_cursor"`
		HasMore    bool                         `json:"has_more"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode event page: %v", err)
	}
	if len(body.Events) != 1 || body.NextCursor != "opaque-next" || !body.HasMore {
		t.Fatalf("event page = %#v", body)
	}
	for _, key := range []string{"schema_version", "event_id", "tenant_id", "connection_id", "resource_id", "revision_id", "order_token", "source_sequence", "container_id", "observed_at", "kind", "policy_refs", "tombstone"} {
		if _, ok := body.Events[0][key]; !ok {
			t.Errorf("event missing contract field %q: %s", key, r.Body.String())
		}
	}
}

func TestIntelligenceSourceEventsSupportsAllKindsAndTombstone(t *testing.T) {
	kinds := []string{"create", "update", "delete", "acl_change", "move", "restore"}
	events := make([]IntelligenceSourceEvent, 0, len(kinds))
	for i, kind := range kinds {
		events = append(events, IntelligenceSourceEvent{SchemaVersion: "v1", EventID: fmt.Sprintf("event-%d", i+1), TenantID: "tenant-1", ConnectionID: "connection-1", ResourceID: "resource-1", RevisionID: fmt.Sprintf("revision-%d", i+1), OrderToken: fmt.Sprintf("order-%d", i+1), ContainerID: "chat-1", ObservedAt: time.Date(2026, 10, 6, 12, 0, i, 0, time.UTC), Kind: kind, Tombstone: kind == "delete"})
	}
	h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
		return IntelligenceSourceEventPage{Events: events, NextCursor: "next", HasMore: false}, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events", "")
	if r.Code != http.StatusOK {
		t.Fatalf("events status=%d body=%s", r.Code, r.Body.String())
	}
	var body struct {
		Events []IntelligenceSourceEvent `json:"events"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Events) != len(kinds) {
		t.Fatalf("got %d events, want %d", len(body.Events), len(kinds))
	}
	for i, kind := range kinds {
		if body.Events[i].Kind != kind || body.Events[i].ResourceID == "" || body.Events[i].RevisionID == "" || body.Events[i].OrderToken == "" || body.Events[i].EventID == "" {
			t.Errorf("event %d does not preserve stable identifiers/kind: %#v", i, body.Events[i])
		}
	}
	if !body.Events[2].Tombstone {
		t.Errorf("delete event is not a tombstone: %#v", body.Events[2])
	}
}

func TestIntelligenceSourceSnapshotRequiresAndReturnsExactRevision(t *testing.T) {
	called := false
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: intelligenceAllowRead(), Snapshot: func(_ context.Context, _ IntelligenceSourceIdentity, resourceID, revisionID string) (IntelligenceResourceSnapshot, error) {
		called = true
		if resourceID != "resource-1" || revisionID != "revision-exact" {
			t.Fatalf("snapshot args = %q %q", resourceID, revisionID)
		}
		return IntelligenceResourceSnapshot{TenantID: "tenant-1", ConnectionID: "connection-1", ResourceID: resourceID, RevisionID: revisionID, ContentRevisionID: revisionID, MetadataRevisionID: revisionID, ObservedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), Content: "synthetic revision content", Metadata: map[string]any{"title": "same revision"}}, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/resources/resource-1/snapshot?revision_id=revision-exact", "")
	if r.Code != http.StatusOK || !called {
		t.Fatalf("snapshot status=%d called=%v body=%s", r.Code, called, r.Body.String())
	}
	var got IntelligenceResourceSnapshot
	if err := json.Unmarshal(r.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.RevisionID != "revision-exact" || got.ContentRevisionID != got.RevisionID || got.MetadataRevisionID != got.RevisionID {
		t.Fatalf("inconsistent snapshot revisions: %#v", got)
	}
}

func TestIntelligenceSourceSnapshotHidesUnknownAndE2ERevisions(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(_ context.Context, id IntelligenceSourceIdentity, ids []string, op string) ([]IntelligenceAuthorizationDecision, error) {
		return []IntelligenceAuthorizationDecision{{TenantID: id.TenantID, ResourceID: ids[0], Operation: op, Allowed: false, DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current-policy"}}, nil
	}, Snapshot: func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceResourceSnapshot, error) {
		return IntelligenceResourceSnapshot{}, ErrIntelligenceSourceNotFound
	}}, nil)
	for _, resource := range []string{"unknown-resource", "known-e2e-resource"} {
		r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/resources/"+resource+"/snapshot?revision_id=revision-1", "")
		if r.Code != http.StatusNotFound {
			t.Errorf("resource %s status=%d, want indistinguishable 404", resource, r.Code)
		}
	}
}

func TestIntelligenceSourceAuthorizationSupportsFourOperations(t *testing.T) {
	operations := []string{"read", "process", "external_transfer", "export"}
	for _, operation := range operations {
		t.Run(operation, func(t *testing.T) {
			var gotOperation string
			h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(_ context.Context, id IntelligenceSourceIdentity, ids []string, op string) ([]IntelligenceAuthorizationDecision, error) {
				gotOperation = op
				if len(ids) != 1 || ids[0] != "resource-1" || id.PrincipalUserID != "principal-1" {
					t.Fatalf("authorization identity/resources = %#v %#v", id, ids)
				}
				return []IntelligenceAuthorizationDecision{{TenantID: id.TenantID, ResourceID: ids[0], Operation: op, Allowed: op == "read", DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "policy-current"}}, nil
			}}, nil)
			r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["resource-1"],"operation":"`+operation+`"}`)
			if r.Code != http.StatusOK || gotOperation != operation {
				t.Fatalf("status=%d operation=%q body=%s", r.Code, gotOperation, r.Body.String())
			}
			var body struct {
				Decisions []IntelligenceAuthorizationDecision `json:"decisions"`
			}
			if err := json.Unmarshal(r.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if len(body.Decisions) != 1 || body.Decisions[0].Operation != operation || body.Decisions[0].Allowed != (operation == "read") {
				t.Fatalf("decision = %#v", body.Decisions)
			}
		})
	}
}

func TestIntelligenceSourceAuthorizationFailsClosedOnPolicyFailure(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceAuthorizationDecision, error) {
		return nil, ErrIntelligenceSourceUnavailable
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["resource-1"],"operation":"read"}`)
	if r.Code != http.StatusServiceUnavailable || strings.Contains(r.Body.String(), `"allowed":true`) {
		t.Fatalf("policy failure status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceExpiredCursorRequestsFullBackfill(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
		return IntelligenceSourceEventPage{}, ErrIntelligenceSourceCursorExpired
	}}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events?cursor=expired", "")
	if r.Code != http.StatusGone || !strings.Contains(r.Body.String(), `"recovery":"full_backfill_required"`) {
		t.Fatalf("expired cursor status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceRejectsInvalidEventLimits(t *testing.T) {
	called := false
	h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
		called = true
		return IntelligenceSourceEventPage{}, nil
	}}, nil)
	for _, limit := range []string{"0", "201", "not-a-number"} {
		r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events?limit="+limit, "")
		if r.Code != http.StatusBadRequest {
			t.Errorf("limit %q status=%d body=%s", limit, r.Code, r.Body.String())
		}
	}
	if called {
		t.Fatal("invalid limit reached event operation")
	}
}

func TestIntelligenceSourceEnforcesBodyLimit(t *testing.T) {
	called := false
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceAuthorizationDecision, error) {
		called = true
		return nil, nil
	}}, func(cfg *IntelligenceSourceHandlerConfig) { cfg.MaxBodyBytes = 32 })
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["`+strings.Repeat("x", 80)+`"],"operation":"read"}`)
	if r.Code != http.StatusRequestEntityTooLarge || called {
		t.Fatalf("oversize status=%d operation_called=%v body=%s", r.Code, called, r.Body.String())
	}
}

func TestIntelligenceSourceHidesOutOfScopeResources(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(_ context.Context, id IntelligenceSourceIdentity, ids []string, op string) ([]IntelligenceAuthorizationDecision, error) {
		return []IntelligenceAuthorizationDecision{{TenantID: id.TenantID, ResourceID: ids[0], Operation: op, Allowed: false, DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current-policy"}}, nil
	}, Snapshot: func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceResourceSnapshot, error) {
		return IntelligenceResourceSnapshot{}, ErrIntelligenceSourceNotFound
	}}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/resources/out-of-scope/snapshot?revision_id=rev-1", "")
	if r.Code != http.StatusNotFound {
		t.Fatalf("out of scope status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceRequiresInstallationAndConnectionEnablement(t *testing.T) {
	for name, identity := range map[string]IntelligenceSourceIdentity{"installation disabled": {TenantID: "tenant-1", InstallationEnabled: false, ConnectionEnabled: true}, "connection disabled": {TenantID: "tenant-1", InstallationEnabled: true, ConnectionEnabled: false}} {
		t.Run(name, func(t *testing.T) {
			called := false
			h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{Enabled: true, Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) { return identity, nil }, Operations: IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
				called = true
				return IntelligenceSourceEventPage{}, nil
			}}})
			r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events", "")
			if r.Code != http.StatusForbidden || called {
				t.Fatalf("status=%d operation_called=%v", r.Code, called)
			}
		})
	}
}

func TestIntelligenceSourceRateLimitAndUnavailableAreClosed(t *testing.T) {
	for name, limitErr := range map[string]error{"rate limited": ErrIntelligenceSourceRateLimited, "limiter unavailable": ErrIntelligenceSourceUnavailable} {
		t.Run(name, func(t *testing.T) {
			called := false
			h := intelligenceTestHandler(IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
				called = true
				return IntelligenceSourceEventPage{}, nil
			}}, func(cfg *IntelligenceSourceHandlerConfig) {
				cfg.Limit = func(context.Context, string) error { return limitErr }
			})
			r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/events", "")
			want := http.StatusTooManyRequests
			if errors.Is(limitErr, ErrIntelligenceSourceUnavailable) {
				want = http.StatusServiceUnavailable
			}
			if r.Code != want || called {
				t.Fatalf("status=%d want=%d operation_called=%v", r.Code, want, called)
			}
		})
	}
}

func TestIntelligenceSourceCitationUsesExactRevisionAndUnicodeCodePoints(t *testing.T) {
	var gotRevision string
	var gotLocator IntelligenceTextLocator
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: intelligenceAllowRead(), ResolveCitation: func(_ context.Context, _ IntelligenceSourceIdentity, resourceID, revisionID string, locator IntelligenceTextLocator) (IntelligenceCitationResolution, error) {
		if resourceID != "resource-1" {
			t.Fatalf("resource id=%q", resourceID)
		}
		gotRevision, gotLocator = revisionID, locator
		return IntelligenceCitationResolution{SourceReference: map[string]any{"resource_id": resourceID, "revision_id": revisionID}, RevisionID: revisionID, Excerpt: "😀b"}, nil
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/citations:resolve", `{"resource_id":"resource-1","revision_id":"revision-exact","locator":{"kind":"text","start":1,"end":3}}`)
	if r.Code != http.StatusOK || gotRevision != "revision-exact" || gotLocator.Start != 1 || gotLocator.End != 3 {
		t.Fatalf("status=%d revision=%q locator=%#v body=%s", r.Code, gotRevision, gotLocator, r.Body.String())
	}
	if !strings.Contains(r.Body.String(), "😀b") {
		t.Fatalf("unicode excerpt missing: %s", r.Body.String())
	}
}

func TestIntelligenceSourceCitationHidesE2ERevision(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(_ context.Context, id IntelligenceSourceIdentity, ids []string, op string) ([]IntelligenceAuthorizationDecision, error) {
		return []IntelligenceAuthorizationDecision{{TenantID: id.TenantID, ResourceID: ids[0], Operation: op, Allowed: false, DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current-policy"}}, nil
	}, ResolveCitation: func(context.Context, IntelligenceSourceIdentity, string, string, IntelligenceTextLocator) (IntelligenceCitationResolution, error) {
		return IntelligenceCitationResolution{}, ErrIntelligenceSourceNotFound
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/citations:resolve", `{"resource_id":"known-e2e-resource","revision_id":"e2e-revision","locator":{"kind":"text","start":0,"end":4}}`)
	if r.Code != http.StatusNotFound {
		t.Fatalf("E2E citation status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceCitationRevisionMissingIsNotSubstituted(t *testing.T) {
	called := false
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: intelligenceAllowRead(), ResolveCitation: func(_ context.Context, _ IntelligenceSourceIdentity, _, revision string, _ IntelligenceTextLocator) (IntelligenceCitationResolution, error) {
		called = true
		if revision != "old-revision" {
			t.Fatalf("revision=%q", revision)
		}
		return IntelligenceCitationResolution{}, ErrIntelligenceSourceNotFound
	}}, nil)
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/citations:resolve", `{"resource_id":"resource-1","revision_id":"old-revision","locator":{"kind":"text","start":0,"end":2}}`)
	if r.Code != http.StatusNotFound || !called {
		t.Fatalf("status=%d called=%v body=%s", r.Code, called, r.Body.String())
	}
}

func TestIntelligenceSourceAuditDoesNotLeakSecrets(t *testing.T) {
	const token = "synthetic-secret-token"
	const content = "synthetic-private-content"
	const citationText = "private-citation-query-text"
	var audit []string
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Enabled: true,
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) {
			return intelligenceTestIdentity(), nil
		},
		Operations: IntelligenceSourceOperations{Authorize: intelligenceAllowRead(), ResolveCitation: func(_ context.Context, _ IntelligenceSourceIdentity, resourceID, revisionID string, _ IntelligenceTextLocator) (IntelligenceCitationResolution, error) {
			return IntelligenceCitationResolution{SourceReference: map[string]any{"resource_id": resourceID, "revision_id": revisionID}, RevisionID: revisionID, Excerpt: content}, nil
		}},
		Audit: func(_ context.Context, record IntelligenceSourceAuditRecord) error {
			audit = append(audit, fmt.Sprint(record))
			return nil
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/intelligence/source/citations:resolve?citation_text="+citationText, strings.NewReader(`{"resource_id":"resource-1","revision_id":"rev-1","locator":{"kind":"text","start":0,"end":2}}`))
	req.Header.Set("Authorization", "Bearer "+token)
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != http.StatusOK {
		t.Fatalf("citation status=%d body=%s", r.Code, r.Body.String())
	}
	logged := strings.Join(audit, " ")
	for _, secret := range []string{token, content, citationText} {
		if strings.Contains(logged, secret) {
			t.Errorf("audit leaked sensitive value %q: %s", secret, logged)
		}
	}
}

func TestIntelligenceSourceTimeoutFailsClosed(t *testing.T) {
	h := intelligenceTestHandler(IntelligenceSourceOperations{Authorize: func(ctx context.Context, _ IntelligenceSourceIdentity, _ []string, _ string) ([]IntelligenceAuthorizationDecision, error) {
		<-ctx.Done()
		return nil, ErrIntelligenceSourceUnavailable
	}}, func(cfg *IntelligenceSourceHandlerConfig) { cfg.Timeout = time.Millisecond })
	r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/authorization:check", `{"resource_ids":["resource-1"],"operation":"read"}`)
	if r.Code != http.StatusServiceUnavailable || strings.Contains(r.Body.String(), `"allowed":true`) {
		t.Fatalf("timeout status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceUnavailableOperationFailsClosed(t *testing.T) {
	h := NewIntelligenceSourceHandler(IntelligenceSourceHandlerConfig{
		Enabled: true,
		Authenticate: func(context.Context, string) (IntelligenceSourceIdentity, error) {
			return intelligenceTestIdentity(), nil
		},
		Operations: IntelligenceSourceOperations{Events: func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error) {
			return IntelligenceSourceEventPage{}, errors.Join(ErrIntelligenceSourceUnavailable, errors.New("storage offline"))
		}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/intelligence/source/events", strings.NewReader(""))
	req.Header.Set("Authorization", "Bearer valid-token")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != http.StatusServiceUnavailable {
		t.Fatalf("unavailable operation status=%d body=%s", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceSnapshotRejectsMismatchedResourceID(t *testing.T) {
	id := intelligenceTestIdentity()
	h := intelligenceTestHandler(IntelligenceSourceOperations{
		Authorize: intelligenceAllowRead(),
		Snapshot: func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceResourceSnapshot, error) {
			return IntelligenceResourceSnapshot{TenantID: id.TenantID, ConnectionID: id.ConnectionID, ResourceID: "different-resource", RevisionID: "rev-1", ContentRevisionID: "rev-1", MetadataRevisionID: "rev-1", Content: "must not escape"}, nil
		},
	}, nil)
	r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/resources/requested-resource/snapshot?revision_id=rev-1", "")
	if r.Code != http.StatusServiceUnavailable || strings.Contains(r.Body.String(), "must not escape") {
		t.Fatalf("mismatched snapshot status=%d body=%s, want fail-closed 503", r.Code, r.Body.String())
	}
}

func TestIntelligenceSourceSnapshotRequiresFreshReadAuthorization(t *testing.T) {
	for _, tc := range []struct {
		name       string
		authErr    error
		allowed    bool
		wantStatus int
	}{{name: "denied", wantStatus: http.StatusNotFound}, {name: "policy unavailable", authErr: ErrIntelligenceSourceUnavailable, wantStatus: http.StatusServiceUnavailable}} {
		t.Run(tc.name, func(t *testing.T) {
			snapshotCalled := false
			h := intelligenceTestHandler(IntelligenceSourceOperations{
				Authorize: func(_ context.Context, identity IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceAuthorizationDecision, error) {
					if operation != "read" || len(ids) != 1 || ids[0] != "resource-1" || identity.PrincipalUserID != intelligenceTestIdentity().PrincipalUserID {
						t.Fatalf("read authorization inputs = %#v %v %q", identity, ids, operation)
					}
					if tc.authErr != nil {
						return nil, tc.authErr
					}
					return []IntelligenceAuthorizationDecision{{TenantID: identity.TenantID, ResourceID: ids[0], Operation: operation, Allowed: tc.allowed, DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current"}}, nil
				},
				Snapshot: func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceResourceSnapshot, error) {
					snapshotCalled = true
					return IntelligenceResourceSnapshot{}, nil
				},
			}, nil)
			r := intelligenceRequest(h, http.MethodGet, "/api/v1/intelligence/source/resources/resource-1/snapshot?revision_id=rev-1", "")
			if r.Code != tc.wantStatus || snapshotCalled {
				t.Fatalf("snapshot status=%d want=%d callback_called=%v body=%s", r.Code, tc.wantStatus, snapshotCalled, r.Body.String())
			}
		})
	}
}

func TestIntelligenceSourceCitationRequiresFreshReadAuthorization(t *testing.T) {
	for _, tc := range []struct {
		name       string
		authErr    error
		wantStatus int
	}{{name: "denied", wantStatus: http.StatusNotFound}, {name: "policy unavailable", authErr: ErrIntelligenceSourceUnavailable, wantStatus: http.StatusServiceUnavailable}} {
		t.Run(tc.name, func(t *testing.T) {
			citationCalled := false
			h := intelligenceTestHandler(IntelligenceSourceOperations{
				Authorize: func(_ context.Context, identity IntelligenceSourceIdentity, ids []string, operation string) ([]IntelligenceAuthorizationDecision, error) {
					if operation != "read" || len(ids) != 1 || ids[0] != "resource-1" || identity.PrincipalUserID != intelligenceTestIdentity().PrincipalUserID {
						t.Fatalf("read authorization inputs = %#v %v %q", identity, ids, operation)
					}
					if tc.authErr != nil {
						return nil, tc.authErr
					}
					return []IntelligenceAuthorizationDecision{{TenantID: identity.TenantID, ResourceID: ids[0], Operation: operation, Allowed: false, DecidedAt: time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC), PolicyRevision: "current"}}, nil
				},
				ResolveCitation: func(context.Context, IntelligenceSourceIdentity, string, string, IntelligenceTextLocator) (IntelligenceCitationResolution, error) {
					citationCalled = true
					return IntelligenceCitationResolution{RevisionID: "rev-1", Excerpt: "must not escape"}, nil
				},
			}, nil)
			r := intelligenceRequest(h, http.MethodPost, "/api/v1/intelligence/source/citations:resolve", `{"resource_id":"resource-1","revision_id":"rev-1","locator":{"kind":"text","start":0,"end":1}}`)
			if r.Code != tc.wantStatus || citationCalled || strings.Contains(r.Body.String(), "must not escape") {
				t.Fatalf("citation status=%d want=%d callback_called=%v body=%s", r.Code, tc.wantStatus, citationCalled, r.Body.String())
			}
		})
	}
}
