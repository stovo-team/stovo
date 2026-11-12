package http

import (
	"context"
	stdhttp "net/http"
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

const IntelligenceSourceV2CodexBridgeOrigin = "local_codex_bridge"

const IntelligenceSourceV2ReplyMaxBytes = 4000

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
	Origin         string    `json:"origin,omitempty"`
	OperationID    string    `json:"operation_id,omitempty"`
}

type IntelligenceSourceV2EventPage struct {
	SchemaVersion string                      `json:"schema_version"`
	Events        []IntelligenceSourceV2Event `json:"events"`
	NextCursor    string                      `json:"next_cursor"`
	HasMore       bool                        `json:"has_more"`
}

type IntelligenceSourceV2EventFence struct {
	SchemaVersion string `json:"schema_version"`
	EventCursor   string `json:"event_cursor"`
	FenceSequence int64  `json:"fence_sequence"`
}

type IntelligenceSourceV2ReplyResult struct {
	MessageID   string `json:"message_id"`
	OperationID string `json:"operation_id"`
	Origin      string `json:"origin"`
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
	EventFence        func(context.Context, IntelligenceSourceIdentity) (IntelligenceSourceV2EventFence, error)
	Snapshot          func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceSourceV2ResourceSnapshot, error)
	ResolveCitation   func(context.Context, IntelligenceSourceIdentity, string, string, IntelligenceTextLocator) (IntelligenceSourceV2CitationResolution, error)
	Reply             func(context.Context, IntelligenceSourceIdentity, string, int64, string, bool) (string, error)
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
	router.Post("/events/fence", handler.eventFence)
	router.Get("/resources/{resourceID}/snapshot", handler.snapshot)
	router.Post("/authorization:check", handler.authorize)
	router.Post("/replies", handler.reply)
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

func (h *IntelligenceSourceV2Handler) eventFence(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "event_fence", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			SchemaVersion string `json:"schema_version"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if request.SchemaVersion != "v2" || h.config.Operations.EventFence == nil {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		fence, err := h.config.Operations.EventFence(ctx, identity)
		if err != nil {
			return nil, err
		}
		if fence.SchemaVersion != "v2" || fence.EventCursor == "" || len(fence.EventCursor) > 4096 || fence.FenceSequence < 0 {
			return nil, ErrIntelligenceSourceUnavailable
		}
		return fence, nil
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

func (h *IntelligenceSourceV2Handler) reply(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	h.serve(w, r, "replies", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			SchemaVersion string `json:"schema_version"`
			OperationID   string `json:"operation_id"`
			Revision      int64  `json:"revision"`
			Text          string `json:"text"`
			Final         bool   `json:"final"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if request.SchemaVersion != "v2" || !validSourceV2ConsentString(request.OperationID, 128) || request.Revision < 1 || strings.TrimSpace(request.Text) == "" || len(request.Text) > IntelligenceSourceV2ReplyMaxBytes {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.Reply == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		messageID, err := h.config.Operations.Reply(ctx, identity, request.OperationID, request.Revision, request.Text, request.Final)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(messageID) == "" || len(messageID) > 256 {
			return nil, ErrIntelligenceSourceUnavailable
		}
		return IntelligenceSourceV2ReplyResult{MessageID: messageID, OperationID: request.OperationID, Origin: IntelligenceSourceV2CodexBridgeOrigin}, nil
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
