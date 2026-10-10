package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	stdhttp "net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	intelligenceSourceV2BasePath       = "/api/v2/intelligence/source"
	intelligenceSourceV2MaxBatch       = 100
	intelligenceSourceV2MaxBody        = 256 << 10
	intelligenceSourceV2SnapshotPage   = 100
	intelligenceSourceV2Timeout        = 5 * time.Second
	intelligenceSourceV2MaxDecisionAge = 5 * time.Minute
)

type IntelligenceSourceV2DecisionScope struct {
	Kind       string `json:"kind"`
	ResourceID string `json:"resource_id"`
}

type IntelligenceSourceV2AuthorizationDecision struct {
	SchemaVersion  string                            `json:"schema_version"`
	TenantID       string                            `json:"tenant_id"`
	ConnectionID   string                            `json:"connection_id"`
	PrincipalID    string                            `json:"principal_id"`
	ResourceID     string                            `json:"resource_id"`
	Operation      string                            `json:"operation"`
	Allowed        bool                              `json:"allowed"`
	Scope          IntelligenceSourceV2DecisionScope `json:"scope"`
	PolicyRevision string                            `json:"policy_revision"`
	DecidedAt      time.Time                         `json:"decided_at"`
	ValidUntil     time.Time                         `json:"valid_until"`
}

type IntelligenceSourceV2CitationResolution struct {
	RevisionID      string         `json:"revision_id"`
	SourceReference map[string]any `json:"source_reference"`
	Excerpt         string         `json:"excerpt"`
}

type IntelligenceSourceV2Event struct {
	SchemaVersion  string    `json:"schema_version"`
	EventID        string    `json:"event_id"`
	TenantID       string    `json:"tenant_id"`
	ConnectionID   string    `json:"connection_id"`
	PrincipalID    string    `json:"principal_id"`
	ResourceID     string    `json:"resource_id"`
	RevisionID     string    `json:"revision_id"`
	OrderToken     string    `json:"order_token"`
	SourceSequence int64     `json:"source_sequence"`
	ContainerID    string    `json:"container_id"`
	ObservedAt     time.Time `json:"observed_at"`
	Kind           string    `json:"kind"`
	PolicyRefs     []string  `json:"policy_refs"`
	Tombstone      bool      `json:"tombstone"`
}

type IntelligenceSourceV2EventPage struct {
	SchemaVersion string                      `json:"schema_version"`
	Events        []IntelligenceSourceV2Event `json:"events"`
	NextCursor    string                      `json:"next_cursor"`
	HasMore       bool                        `json:"has_more"`
}

type IntelligenceSourceV2ResourceSnapshot struct {
	SchemaVersion      string         `json:"schema_version"`
	TenantID           string         `json:"tenant_id"`
	ConnectionID       string         `json:"connection_id"`
	PrincipalID        string         `json:"principal_id"`
	ResourceID         string         `json:"resource_id"`
	RevisionID         string         `json:"revision_id"`
	ContentRevisionID  string         `json:"content_revision_id"`
	MetadataRevisionID string         `json:"metadata_revision_id"`
	ObservedAt         time.Time      `json:"observed_at"`
	Content            string         `json:"content"`
	Metadata           map[string]any `json:"metadata"`
}

type IntelligenceSourceV2BackfillStart struct {
	SchemaVersion  string `json:"schema_version"`
	BackfillID     string `json:"backfill_id"`
	SnapshotCursor string `json:"snapshot_cursor"`
	ScopeReset     bool   `json:"scope_reset"`
}

type IntelligenceSourceV2SnapshotPage struct {
	SchemaVersion      string                                 `json:"schema_version"`
	Snapshots          []IntelligenceSourceV2ResourceSnapshot `json:"snapshots"`
	NextSnapshotCursor string                                 `json:"next_snapshot_cursor"`
	HasMore            bool                                   `json:"has_more"`
	FenceCursor        string                                 `json:"fence_cursor,omitempty"`
}

type IntelligenceSourceV2AuditRecord struct {
	InstallationID string `json:"installation_id,omitempty"`
	ConnectionID   string `json:"connection_id,omitempty"`
	Route          string `json:"route"`
	Result         string `json:"result"`
}

type IntelligenceSourceV2Operations struct {
	Authorize         func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceSourceV2AuthorizationDecision, error)
	StartBackfill     func(context.Context, IntelligenceSourceIdentity) (IntelligenceSourceV2BackfillStart, error)
	BackfillSnapshots func(context.Context, IntelligenceSourceIdentity, string, string, int) (IntelligenceSourceV2SnapshotPage, error)
	Events            func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceV2EventPage, error)
	Snapshot          func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceSourceV2ResourceSnapshot, error)
	ResolveCitation   func(context.Context, IntelligenceSourceIdentity, string, string, IntelligenceTextLocator) (IntelligenceSourceV2CitationResolution, error)
}

type IntelligenceSourceV2HandlerConfig struct {
	Enabled      bool
	Authenticate func(context.Context, string) (IntelligenceSourceIdentity, error)
	Operations   IntelligenceSourceV2Operations
	Audit        func(context.Context, IntelligenceSourceV2AuditRecord) error
	Limit        func(context.Context, string) error
	Timeout      time.Duration
	MaxBodyBytes int64
	Now          func() time.Time
}

type IntelligenceSourceV2Handler struct {
	config IntelligenceSourceV2HandlerConfig
}

func NewIntelligenceSourceV2Handler(config IntelligenceSourceV2HandlerConfig) stdhttp.Handler {
	if config.Timeout <= 0 {
		config.Timeout = intelligenceSourceV2Timeout
	}
	if config.MaxBodyBytes <= 0 {
		config.MaxBodyBytes = intelligenceSourceV2MaxBody
	}
	if config.Now == nil {
		config.Now = func() time.Time { return time.Now().UTC() }
	}
	handler := &IntelligenceSourceV2Handler{config: config}
	router := chi.NewRouter()
	router.Post("/backfills", handler.startBackfill)
	router.Get("/backfills/{backfillID}/snapshots", handler.backfillSnapshots)
	router.Get("/events", handler.events)
	router.Get("/resources/{resourceID}/snapshot", handler.snapshot)
	router.Post("/authorization:check", handler.authorize)
	router.Post("/citations:resolve", handler.resolveCitation)
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if strings.HasPrefix(r.URL.Path, intelligenceSourceV2BasePath) {
			r2 := r.Clone(r.Context())
			r2.URL.Path = strings.TrimPrefix(r.URL.Path, intelligenceSourceV2BasePath)
			r = r2
		}
		router.ServeHTTP(w, r)
	})
}

func (h *IntelligenceSourceV2Handler) startBackfill(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "backfills", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			SchemaVersion string `json:"schema_version"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if request.SchemaVersion != "" && request.SchemaVersion != "v2" {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.StartBackfill == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		started, err := h.config.Operations.StartBackfill(ctx, identity)
		if err != nil {
			return nil, err
		}
		if started.SchemaVersion != "v2" || started.BackfillID == "" || len(started.BackfillID) > 256 || started.SnapshotCursor == "" || len(started.SnapshotCursor) > 4096 || !started.ScopeReset {
			return nil, ErrIntelligenceSourceUnavailable
		}
		return started, nil
	})
}

func (h *IntelligenceSourceV2Handler) backfillSnapshots(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "backfill_snapshots", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		backfillID := chi.URLParam(r, "backfillID")
		cursor := r.URL.Query().Get("cursor")
		limit, err := parseIntelligenceSourceV2SnapshotLimit(r.URL.Query().Get("limit"))
		if backfillID == "" || len(backfillID) > 256 || cursor == "" || len(cursor) > 4096 || err != nil {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.BackfillSnapshots == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		page, err := h.config.Operations.BackfillSnapshots(ctx, identity, backfillID, cursor, limit)
		if err != nil {
			return nil, err
		}
		if page.SchemaVersion != "v2" || len(page.Snapshots) > limit || page.HasMore && (page.NextSnapshotCursor == "" || page.FenceCursor != "") || !page.HasMore && (page.NextSnapshotCursor != "" || page.FenceCursor == "") {
			return nil, ErrIntelligenceSourceUnavailable
		}
		for _, snapshot := range page.Snapshots {
			if !validIntelligenceSourceV2Snapshot(snapshot, identity, snapshot.ResourceID, snapshot.RevisionID) {
				return nil, ErrIntelligenceSourceUnavailable
			}
		}
		return page, nil
	})
}

func (h *IntelligenceSourceV2Handler) events(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "events", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		cursor := r.URL.Query().Get("cursor")
		limit, err := parseSourceLimit(r.URL.Query().Get("limit"))
		if cursor == "" || len(cursor) > 4096 || err != nil {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.Events == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		page, err := h.config.Operations.Events(ctx, identity, cursor, limit)
		if err != nil {
			return nil, err
		}
		if page.SchemaVersion != "v2" || len(page.Events) > limit || len(page.NextCursor) > 4096 || page.HasMore && page.NextCursor == "" {
			return nil, ErrIntelligenceSourceUnavailable
		}
		for _, event := range page.Events {
			if !validIntelligenceSourceV2Event(event, identity) {
				return nil, ErrIntelligenceSourceUnavailable
			}
		}
		if page.Events == nil {
			page.Events = []IntelligenceSourceV2Event{}
		}
		return page, nil
	})
}

func (h *IntelligenceSourceV2Handler) snapshot(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "snapshot", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		resourceID := chi.URLParam(r, "resourceID")
		revisionID := strings.TrimSpace(r.URL.Query().Get("revision_id"))
		if strings.TrimSpace(resourceID) == "" || len(resourceID) > 256 || revisionID == "" || len(revisionID) > 256 {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.Snapshot == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if err := h.requireCurrentRead(ctx, identity, resourceID); err != nil {
			return nil, err
		}
		snapshot, err := h.config.Operations.Snapshot(ctx, identity, resourceID, revisionID)
		if err != nil {
			return nil, err
		}
		if !validIntelligenceSourceV2Snapshot(snapshot, identity, resourceID, revisionID) {
			return nil, ErrIntelligenceSourceUnavailable
		}
		return snapshot, nil
	})
}

func (h *IntelligenceSourceV2Handler) authorize(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "authorization:check", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			SchemaVersion string   `json:"schema_version"`
			ResourceIDs   []string `json:"resource_ids"`
			Operation     string   `json:"operation"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if request.SchemaVersion != "v2" || len(request.ResourceIDs) == 0 || len(request.ResourceIDs) > intelligenceSourceV2MaxBatch || !validAuthorizationOperation(request.Operation) {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		seen := make(map[string]struct{}, len(request.ResourceIDs))
		for _, resourceID := range request.ResourceIDs {
			if strings.TrimSpace(resourceID) == "" || len(resourceID) > 256 {
				return nil, ErrIntelligenceSourceInvalidRequest
			}
			if _, exists := seen[resourceID]; exists {
				return nil, ErrIntelligenceSourceInvalidRequest
			}
			seen[resourceID] = struct{}{}
		}
		if h.config.Operations.Authorize == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		decisions, err := h.config.Operations.Authorize(ctx, identity, request.ResourceIDs, request.Operation)
		if err != nil {
			return nil, err
		}
		if len(decisions) != len(request.ResourceIDs) {
			return nil, ErrIntelligenceSourceUnavailable
		}
		now := h.config.Now().UTC()
		for i := range decisions {
			if !validIntelligenceSourceV2Decision(decisions[i], identity, request.ResourceIDs[i], request.Operation, now) {
				return nil, ErrIntelligenceSourceUnavailable
			}
		}
		return struct {
			SchemaVersion string                                      `json:"schema_version"`
			Decisions     []IntelligenceSourceV2AuthorizationDecision `json:"decisions"`
		}{SchemaVersion: "v2", Decisions: decisions}, nil
	})
}

func (h *IntelligenceSourceV2Handler) resolveCitation(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "citations:resolve", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			SchemaVersion string `json:"schema_version"`
			ResourceID    string `json:"resource_id"`
			RevisionID    string `json:"revision_id"`
			Locator       struct {
				Kind  string `json:"kind"`
				Start *int   `json:"start"`
				End   *int   `json:"end"`
			} `json:"locator"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if request.SchemaVersion != "v2" || strings.TrimSpace(request.ResourceID) == "" || len(request.ResourceID) > 256 || strings.TrimSpace(request.RevisionID) == "" || len(request.RevisionID) > 256 || request.Locator.Kind != "text" || request.Locator.Start == nil || request.Locator.End == nil || *request.Locator.Start < 0 || *request.Locator.End <= *request.Locator.Start {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.Authorize == nil || h.config.Operations.ResolveCitation == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		decisions, err := h.config.Operations.Authorize(ctx, identity, []string{request.ResourceID}, "read")
		if err != nil {
			return nil, err
		}
		if len(decisions) != 1 || !validIntelligenceSourceV2Decision(decisions[0], identity, request.ResourceID, "read", h.config.Now().UTC()) {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if !decisions[0].Allowed {
			return nil, ErrIntelligenceSourceNotFound
		}
		resolution, err := h.config.Operations.ResolveCitation(ctx, identity, request.ResourceID, request.RevisionID, IntelligenceTextLocator{Kind: "text", Start: *request.Locator.Start, End: *request.Locator.End})
		if err != nil {
			return nil, err
		}
		if resolution.RevisionID != request.RevisionID {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if resolution.SourceReference == nil {
			resolution.SourceReference = map[string]any{}
		}
		return struct {
			SchemaVersion string `json:"schema_version"`
			IntelligenceSourceV2CitationResolution
		}{SchemaVersion: "v2", IntelligenceSourceV2CitationResolution: resolution}, nil
	})
}

func validIntelligenceSourceV2Decision(decision IntelligenceSourceV2AuthorizationDecision, identity IntelligenceSourceIdentity, resourceID, operation string, now time.Time) bool {
	ttl := decision.ValidUntil.Sub(decision.DecidedAt)
	return decision.SchemaVersion == "v2" && decision.TenantID == identity.TenantID && decision.ConnectionID == identity.ConnectionID && decision.PrincipalID == identity.PrincipalUserID && decision.ResourceID == resourceID && decision.Operation == operation && decision.Scope.Kind == "chat" && decision.Scope.ResourceID == identity.ChatID && decision.PolicyRevision != "" && !decision.DecidedAt.IsZero() && !decision.ValidUntil.IsZero() && ttl > 0 && ttl <= intelligenceSourceV2MaxDecisionAge && !decision.DecidedAt.After(now) && now.Before(decision.ValidUntil) && now.Sub(decision.DecidedAt) <= intelligenceSourceV2MaxDecisionAge
}

func (h *IntelligenceSourceV2Handler) requireCurrentRead(ctx context.Context, identity IntelligenceSourceIdentity, resourceID string) error {
	if h.config.Operations.Authorize == nil {
		return ErrIntelligenceSourceUnavailable
	}
	decisions, err := h.config.Operations.Authorize(ctx, identity, []string{resourceID}, "read")
	if err != nil {
		return err
	}
	if len(decisions) != 1 || !validIntelligenceSourceV2Decision(decisions[0], identity, resourceID, "read", h.config.Now().UTC()) {
		return ErrIntelligenceSourceUnavailable
	}
	if !decisions[0].Allowed {
		return ErrIntelligenceSourceNotFound
	}
	return nil
}

func validIntelligenceSourceV2Snapshot(snapshot IntelligenceSourceV2ResourceSnapshot, identity IntelligenceSourceIdentity, resourceID, revisionID string) bool {
	return snapshot.SchemaVersion == "v2" && snapshot.TenantID == identity.TenantID && snapshot.ConnectionID == identity.ConnectionID && snapshot.PrincipalID == identity.PrincipalUserID && snapshot.ResourceID == resourceID && snapshot.RevisionID == revisionID && snapshot.ContentRevisionID == revisionID && snapshot.MetadataRevisionID == revisionID && !snapshot.ObservedAt.IsZero()
}

func validIntelligenceSourceV2Event(event IntelligenceSourceV2Event, identity IntelligenceSourceIdentity) bool {
	if event.SchemaVersion != "v2" || event.EventID == "" || event.TenantID != identity.TenantID || event.ConnectionID != identity.ConnectionID || event.PrincipalID != identity.PrincipalUserID || event.ResourceID == "" || event.RevisionID == "" || event.OrderToken == "" || event.SourceSequence <= 0 || event.ContainerID != identity.ChatID || event.ObservedAt.IsZero() || !validSourceEventKind(event.Kind) {
		return false
	}
	return event.Kind != "delete" || event.Tombstone
}

func parseIntelligenceSourceV2SnapshotLimit(raw string) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return intelligenceSourceV2SnapshotPage, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > intelligenceSourceV2SnapshotPage {
		return 0, ErrIntelligenceSourceInvalidRequest
	}
	return limit, nil
}

func (h *IntelligenceSourceV2Handler) serve(w stdhttp.ResponseWriter, r *stdhttp.Request, route string, operation func(context.Context, IntelligenceSourceIdentity) (any, error)) {
	buffered := &intelligenceSourceResponse{header: make(stdhttp.Header)}
	buffered.Header().Set("Cache-Control", "no-store")
	buffered.Header().Set("Vary", "Authorization")
	status, result := stdhttp.StatusOK, "ok"
	identity := IntelligenceSourceIdentity{}
	defer func() {
		if h.config.Audit != nil {
			record := IntelligenceSourceV2AuditRecord{Route: route, Result: result}
			if identity.InstallationID != "" {
				record.InstallationID, record.ConnectionID = identity.InstallationID, identity.ConnectionID
			}
			auditCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), time.Second)
			defer cancel()
			if err := h.config.Audit(auditCtx, record); err != nil {
				buffered = &intelligenceSourceResponse{header: make(stdhttp.Header)}
				buffered.Header().Set("Cache-Control", "no-store")
				buffered.Header().Set("Vary", "Authorization")
				status, result = stdhttp.StatusServiceUnavailable, "audit_unavailable"
				writeIntelligenceSourceV2Error(buffered, status, "source_unavailable")
			}
		}
		for key, values := range buffered.header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		if buffered.status == 0 {
			buffered.status = status
		}
		w.WriteHeader(buffered.status)
		_, _ = w.Write(buffered.body.Bytes())
	}()
	if !h.config.Enabled {
		status, result = stdhttp.StatusForbidden, "disabled"
		writeIntelligenceSourceV2Error(buffered, status, "disabled_or_denied")
		return
	}
	if h.config.Authenticate == nil {
		status, result = stdhttp.StatusServiceUnavailable, "unconfigured"
		writeIntelligenceSourceV2Error(buffered, status, "source_unavailable")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		status, result = stdhttp.StatusUnauthorized, "invalid_credential"
		writeIntelligenceSourceV2Error(buffered, status, "invalid_credential")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	var err error
	identity, err = h.config.Authenticate(ctx, token)
	if err != nil {
		status, result = intelligenceSourceV2ErrorStatus(err)
		writeIntelligenceSourceV2Error(buffered, status, result)
		return
	}
	if !identity.InstallationEnabled || !identity.ConnectionEnabled || identity.InstallationID == "" || identity.TenantID == "" || identity.ConnectionID == "" || identity.FamilyID == "" || identity.PrincipalUserID == "" || identity.ChatID == "" {
		status, result = stdhttp.StatusForbidden, "disabled_or_denied"
		writeIntelligenceSourceV2Error(buffered, status, "disabled_or_denied")
		return
	}
	if h.config.Limit != nil {
		if err := h.config.Limit(ctx, identity.ConnectionID); err != nil {
			status, result = intelligenceSourceV2ErrorStatus(err)
			writeIntelligenceSourceV2Error(buffered, status, result)
			return
		}
	}
	body, err := operation(ctx, identity)
	if err == nil && ctx.Err() != nil {
		err = ErrIntelligenceSourceUnavailable
	}
	if err != nil {
		status, result = intelligenceSourceV2ErrorStatus(err)
		writeIntelligenceSourceV2Error(buffered, status, result)
		return
	}
	buffered.Header().Set("Content-Type", "application/json")
	buffered.WriteHeader(status)
	_ = json.NewEncoder(buffered).Encode(body)
}

func (h *IntelligenceSourceV2Handler) decodeBody(w stdhttp.ResponseWriter, r *stdhttp.Request, target any) error {
	r.Body = stdhttp.MaxBytesReader(w, r.Body, h.config.MaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesError *stdhttp.MaxBytesError
		if errors.As(err, &maxBytesError) {
			return ErrIntelligenceSourceRequestTooLarge
		}
		return ErrIntelligenceSourceInvalidRequest
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return ErrIntelligenceSourceInvalidRequest
	}
	return nil
}

func intelligenceSourceV2ErrorStatus(err error) (int, string) {
	status, _ := sourceErrorStatus(err)
	return status, intelligenceSourceV2ErrorCodeFor(err, status)
}

func intelligenceSourceV2ErrorCodeFor(err error, status int) string {
	switch {
	case errors.Is(err, ErrIntelligenceSourceInvalidCursor):
		return "invalid_cursor"
	case errors.Is(err, ErrIntelligenceSourceCursorExpired):
		return "cursor_expired"
	default:
		return intelligenceSourceV2ErrorCode(status)
	}
}

func intelligenceSourceV2ErrorCode(status int) string {
	switch status {
	case stdhttp.StatusUnauthorized:
		return "invalid_credential"
	case stdhttp.StatusForbidden:
		return "disabled_or_denied"
	case stdhttp.StatusBadRequest:
		return "invalid_request"
	case stdhttp.StatusRequestEntityTooLarge:
		return "request_too_large"
	case stdhttp.StatusNotFound:
		return "not_found"
	case stdhttp.StatusGone:
		return "cursor_expired"
	case stdhttp.StatusTooManyRequests:
		return "rate_limited"
	default:
		return "source_unavailable"
	}
}

func writeIntelligenceSourceV2Error(w stdhttp.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	response := map[string]any{"schema_version": "v2", "error": map[string]any{"code": code, "message": v2PublicSourceError(code), "recovery": nil}}
	if status == stdhttp.StatusGone {
		response["error"].(map[string]any)["recovery"] = map[string]string{"action": "full_backfill_required", "endpoint": "/api/v2/intelligence/source/backfills"}
	}
	_ = json.NewEncoder(w).Encode(response)
}

func v2PublicSourceError(code string) string {
	switch code {
	case "invalid_credential":
		return "Source credential is invalid"
	case "disabled_or_denied":
		return "Source access is disabled or denied"
	case "invalid_request":
		return "Invalid source request"
	case "request_too_large":
		return "Source request is too large"
	case "not_found":
		return "Source resource not found"
	case "cursor_expired":
		return "Source cursor expired; a full backfill is required"
	case "rate_limited":
		return "Source request limit exceeded"
	default:
		return "Source service unavailable"
	}
}
