package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	intelligenceSourceBasePath = "/api/v1/intelligence/source"
	defaultSourcePageSize      = 100
	maxSourcePageSize          = 200
	defaultSourceBodyBytes     = 256 << 10
	defaultSourceTimeout       = 5 * time.Second
)

var (
	ErrIntelligenceSourceUnauthorized    = errors.New("intelligence source unauthorized")
	ErrIntelligenceSourceDisabled        = errors.New("intelligence source disabled")
	ErrIntelligenceSourceForbidden       = errors.New("intelligence source forbidden")
	ErrIntelligenceSourceInvalidRequest  = errors.New("intelligence source invalid request")
	ErrIntelligenceSourceRequestTooLarge = errors.New("intelligence source request too large")
	ErrIntelligenceSourceInvalidCursor   = errors.New("intelligence source invalid cursor")
	ErrIntelligenceSourceCursorExpired   = errors.New("intelligence source cursor expired")
	ErrIntelligenceSourceNotFound        = errors.New("intelligence source resource not found")
	ErrIntelligenceSourceRateLimited     = errors.New("intelligence source rate limited")
	ErrIntelligenceSourceUnavailable     = errors.New("intelligence source unavailable")
)

type IntelligenceSourceIdentity struct {
	InstallationID      string `json:"-"`
	TenantID            string `json:"-"`
	ConnectionID        string `json:"-"`
	FamilyID            string `json:"-"`
	PrincipalUserID     string `json:"-"`
	InstallationEnabled bool   `json:"-"`
	ConnectionEnabled   bool   `json:"-"`
}

type IntelligenceSourceEvent struct {
	SchemaVersion  string    `json:"schema_version"`
	EventID        string    `json:"event_id"`
	TenantID       string    `json:"tenant_id"`
	ConnectionID   string    `json:"connection_id"`
	ResourceID     string    `json:"resource_id"`
	RevisionID     string    `json:"revision_id"`
	OrderToken     string    `json:"order_token"`
	SourceSequence *int64    `json:"source_sequence"`
	ContainerID    string    `json:"container_id"`
	ObservedAt     time.Time `json:"observed_at"`
	Kind           string    `json:"kind"`
	PolicyRefs     []string  `json:"policy_refs"`
	Tombstone      bool      `json:"tombstone"`
}

type IntelligenceSourceEventPage struct {
	Events     []IntelligenceSourceEvent `json:"events"`
	NextCursor string                    `json:"next_cursor"`
	HasMore    bool                      `json:"has_more"`
}

type IntelligenceResourceSnapshot struct {
	TenantID           string         `json:"tenant_id"`
	ConnectionID       string         `json:"connection_id"`
	ResourceID         string         `json:"resource_id"`
	RevisionID         string         `json:"revision_id"`
	ContentRevisionID  string         `json:"content_revision_id"`
	MetadataRevisionID string         `json:"metadata_revision_id"`
	ObservedAt         time.Time      `json:"observed_at"`
	Content            string         `json:"content"`
	Metadata           map[string]any `json:"metadata"`
}

type IntelligenceAuthorizationDecision struct {
	TenantID       string    `json:"tenant_id"`
	ResourceID     string    `json:"resource_id"`
	Operation      string    `json:"operation"`
	Allowed        bool      `json:"allowed"`
	DecidedAt      time.Time `json:"decided_at"`
	PolicyRevision string    `json:"policy_revision"`
}

type IntelligenceTextLocator struct {
	Kind  string `json:"kind"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

type IntelligenceCitationResolution struct {
	SourceReference map[string]any `json:"source_reference"`
	RevisionID      string         `json:"revision_id"`
	Excerpt         string         `json:"excerpt"`
}

type IntelligenceSourceAuditRecord struct {
	InstallationID string `json:"installation_id,omitempty"`
	ConnectionID   string `json:"connection_id,omitempty"`
	Route          string `json:"route"`
	Result         string `json:"result"`
	RequestID      string `json:"request_id,omitempty"`
}

type IntelligenceSourceOperations struct {
	Events          func(context.Context, IntelligenceSourceIdentity, string, int) (IntelligenceSourceEventPage, error)
	Snapshot        func(context.Context, IntelligenceSourceIdentity, string, string) (IntelligenceResourceSnapshot, error)
	Authorize       func(context.Context, IntelligenceSourceIdentity, []string, string) ([]IntelligenceAuthorizationDecision, error)
	ResolveCitation func(context.Context, IntelligenceSourceIdentity, string, string, IntelligenceTextLocator) (IntelligenceCitationResolution, error)
}

type IntelligenceSourceHandlerConfig struct {
	Enabled      bool
	Authenticate func(context.Context, string) (IntelligenceSourceIdentity, error)
	Operations   IntelligenceSourceOperations
	Audit        func(context.Context, IntelligenceSourceAuditRecord) error
	Limit        func(context.Context, string) error
	Timeout      time.Duration
	MaxBodyBytes int64
}

type IntelligenceSourceHandler struct {
	config IntelligenceSourceHandlerConfig
}

func NewIntelligenceSourceHandler(config IntelligenceSourceHandlerConfig) http.Handler {
	if config.Timeout <= 0 {
		config.Timeout = defaultSourceTimeout
	}
	if config.MaxBodyBytes <= 0 {
		config.MaxBodyBytes = defaultSourceBodyBytes
	}
	router := chi.NewRouter()
	handler := &IntelligenceSourceHandler{config: config}
	router.Get("/events", handler.events)
	router.Get("/resources/{resourceID}/snapshot", handler.snapshot)
	router.Post("/authorization:check", handler.authorize)
	router.Post("/citations:resolve", handler.resolveCitation)
	// Tests and embedders may call the handler at its documented absolute path,
	// while chi Mount strips the mount prefix before dispatch. Accept both forms.
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, intelligenceSourceBasePath) {
			r2 := r.Clone(r.Context())
			r2.URL.Path = strings.TrimPrefix(r.URL.Path, intelligenceSourceBasePath)
			r = r2
		}
		router.ServeHTTP(w, r)
	})
}

func (h *IntelligenceSourceHandler) events(w http.ResponseWriter, r *http.Request) {
	h.serve(w, r, "events", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		limit, err := parseSourceLimit(r.URL.Query().Get("limit"))
		if err != nil {
			return nil, err
		}
		cursor := r.URL.Query().Get("cursor")
		if len(cursor) > 4096 {
			return nil, ErrIntelligenceSourceInvalidCursor
		}
		if h.config.Operations.Events == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		page, err := h.config.Operations.Events(ctx, identity, cursor, limit)
		if err != nil {
			return nil, err
		}
		if len(page.Events) > limit || len(page.NextCursor) > 4096 || (page.HasMore && page.NextCursor == "") {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if page.Events == nil {
			page.Events = []IntelligenceSourceEvent{}
		}
		for index, event := range page.Events {
			if event.PolicyRefs == nil {
				event.PolicyRefs = []string{}
				page.Events[index].PolicyRefs = event.PolicyRefs
			}
			if !validSourceEvent(event, identity) {
				return nil, ErrIntelligenceSourceUnavailable
			}
		}
		return page, nil
	})
}

func (h *IntelligenceSourceHandler) snapshot(w http.ResponseWriter, r *http.Request) {
	h.serve(w, r, "snapshot", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		revisionID := strings.TrimSpace(r.URL.Query().Get("revision_id"))
		if revisionID == "" || len(revisionID) > 256 {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.Snapshot == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		resourceID := chi.URLParam(r, "resourceID")
		if err := h.requireCurrentRead(ctx, identity, resourceID); err != nil {
			return nil, err
		}
		snapshot, err := h.config.Operations.Snapshot(ctx, identity, resourceID, revisionID)
		if err != nil {
			return nil, err
		}
		if snapshot.TenantID != identity.TenantID || snapshot.ConnectionID != identity.ConnectionID || snapshot.ResourceID != resourceID || snapshot.RevisionID != revisionID || snapshot.ContentRevisionID != revisionID || snapshot.MetadataRevisionID != revisionID || snapshot.ObservedAt.IsZero() {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if snapshot.Metadata == nil {
			snapshot.Metadata = map[string]any{}
		}
		return snapshot, nil
	})
}

func (h *IntelligenceSourceHandler) authorize(w http.ResponseWriter, r *http.Request) {
	h.serve(w, r, "authorization:check", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			ResourceIDs []string `json:"resource_ids"`
			Operation   string   `json:"operation"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if len(request.ResourceIDs) < 1 || len(request.ResourceIDs) > 100 || !validAuthorizationOperation(request.Operation) {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		for _, resourceID := range request.ResourceIDs {
			if strings.TrimSpace(resourceID) == "" || len(resourceID) > 256 {
				return nil, ErrIntelligenceSourceInvalidRequest
			}
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
		for i := range decisions {
			if decisions[i].TenantID != identity.TenantID || decisions[i].ResourceID != request.ResourceIDs[i] || decisions[i].Operation != request.Operation || decisions[i].PolicyRevision == "" || decisions[i].DecidedAt.IsZero() {
				return nil, ErrIntelligenceSourceUnavailable
			}
		}
		return struct {
			Decisions []IntelligenceAuthorizationDecision `json:"decisions"`
		}{decisions}, nil
	})
}

func (h *IntelligenceSourceHandler) resolveCitation(w http.ResponseWriter, r *http.Request) {
	h.serve(w, r, "citations:resolve", func(ctx context.Context, identity IntelligenceSourceIdentity) (any, error) {
		var request struct {
			ResourceID string `json:"resource_id"`
			RevisionID string `json:"revision_id"`
			Locator    struct {
				Kind  string `json:"kind"`
				Start *int   `json:"start"`
				End   *int   `json:"end"`
			} `json:"locator"`
		}
		if err := h.decodeBody(w, r, &request); err != nil {
			return nil, err
		}
		if strings.TrimSpace(request.ResourceID) == "" || len(request.ResourceID) > 256 || strings.TrimSpace(request.RevisionID) == "" || len(request.RevisionID) > 256 || request.Locator.Start == nil || request.Locator.End == nil {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if request.Locator.Kind != "" && request.Locator.Kind != "text" {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		locator := IntelligenceTextLocator{Kind: "text", Start: *request.Locator.Start, End: *request.Locator.End}
		if locator.Start < 0 || locator.End <= locator.Start {
			return nil, ErrIntelligenceSourceInvalidRequest
		}
		if h.config.Operations.ResolveCitation == nil {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if err := h.requireCurrentRead(ctx, identity, request.ResourceID); err != nil {
			return nil, err
		}
		resolution, err := h.config.Operations.ResolveCitation(ctx, identity, request.ResourceID, request.RevisionID, locator)
		if err != nil {
			return nil, err
		}
		if resolution.RevisionID != request.RevisionID {
			return nil, ErrIntelligenceSourceUnavailable
		}
		if resolution.SourceReference == nil {
			resolution.SourceReference = map[string]any{}
		}
		return resolution, nil
	})
}

// requireCurrentRead ensures historical revisions and citations are never
// released solely because their old event or ACL existed. The backing policy
// operation must evaluate current membership and Messenger policy.
func (h *IntelligenceSourceHandler) requireCurrentRead(ctx context.Context, identity IntelligenceSourceIdentity, resourceID string) error {
	if h.config.Operations.Authorize == nil {
		return ErrIntelligenceSourceUnavailable
	}
	decisions, err := h.config.Operations.Authorize(ctx, identity, []string{resourceID}, "read")
	if err != nil {
		return err
	}
	if len(decisions) != 1 || decisions[0].TenantID != identity.TenantID || decisions[0].ResourceID != resourceID || decisions[0].Operation != "read" || decisions[0].PolicyRevision == "" || decisions[0].DecidedAt.IsZero() {
		return ErrIntelligenceSourceUnavailable
	}
	if !decisions[0].Allowed {
		return ErrIntelligenceSourceNotFound
	}
	return nil
}

func (h *IntelligenceSourceHandler) serve(w http.ResponseWriter, r *http.Request, route string, operation func(context.Context, IntelligenceSourceIdentity) (any, error)) {
	buffered := &intelligenceSourceResponse{header: make(http.Header)}
	buffered.Header().Set("Cache-Control", "no-store")
	buffered.Header().Set("Vary", "Authorization")
	status := http.StatusOK
	result := "ok"
	defer func() {
		if h.config.Audit != nil {
			identity := sourceIdentityFromContext(r.Context())
			// Caller-controlled request IDs may contain message or citation text.
			record := IntelligenceSourceAuditRecord{Route: route, Result: result}
			if identity.InstallationID != "" {
				record.InstallationID = identity.InstallationID
				record.ConnectionID = identity.ConnectionID
			}
			auditCtx, cancelAudit := context.WithTimeout(context.WithoutCancel(r.Context()), time.Second)
			defer cancelAudit()
			if err := h.config.Audit(auditCtx, record); err != nil {
				buffered = &intelligenceSourceResponse{header: make(http.Header)}
				status, result = http.StatusServiceUnavailable, "audit_unavailable"
				writeIntelligenceSourceError(buffered, status, "unavailable", publicSourceError(status))
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
		status, result = http.StatusForbidden, "disabled"
		writeIntelligenceSourceError(buffered, status, "disabled", "Source interface is disabled")
		return
	}
	if h.config.Authenticate == nil {
		status, result = http.StatusServiceUnavailable, "unconfigured"
		writeIntelligenceSourceError(buffered, status, "unavailable", publicSourceError(status))
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		status, result = http.StatusUnauthorized, "unauthorized"
		writeIntelligenceSourceError(buffered, status, "unauthorized", "Authentication required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.Timeout)
	defer cancel()
	identity, err := h.config.Authenticate(ctx, token)
	if err != nil {
		status, result = sourceErrorStatus(err)
		writeIntelligenceSourceError(buffered, status, sourceErrorCode(err), publicSourceError(status))
		return
	}
	r = r.WithContext(context.WithValue(ctx, sourceIdentityContextKey{}, identity))
	if !identity.InstallationEnabled || !identity.ConnectionEnabled || identity.InstallationID == "" || identity.TenantID == "" || identity.ConnectionID == "" || identity.FamilyID == "" || identity.PrincipalUserID == "" {
		status, result = http.StatusForbidden, "forbidden"
		writeIntelligenceSourceError(buffered, status, "forbidden", publicSourceError(status))
		return
	}
	if h.config.Limit != nil {
		if err := h.config.Limit(ctx, identity.ConnectionID); err != nil {
			status, result = sourceErrorStatus(err)
			writeIntelligenceSourceError(buffered, status, sourceErrorCode(err), publicSourceError(status))
			return
		}
	}
	body, err := operation(ctx, identity)
	if err == nil && ctx.Err() != nil {
		err = ErrIntelligenceSourceUnavailable
	}
	if err != nil {
		status, result = sourceErrorStatus(err)
		writeIntelligenceSourceError(buffered, status, sourceErrorCode(err), publicSourceError(status))
		return
	}
	buffered.Header().Set("Content-Type", "application/json")
	buffered.WriteHeader(status)
	_ = json.NewEncoder(buffered).Encode(body)
}

type intelligenceSourceResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (r *intelligenceSourceResponse) Header() http.Header { return r.header }
func (r *intelligenceSourceResponse) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
}
func (r *intelligenceSourceResponse) Write(body []byte) (int, error) { return r.body.Write(body) }

type sourceIdentityContextKey struct{}

func sourceIdentityFromContext(ctx context.Context) IntelligenceSourceIdentity {
	identity, _ := ctx.Value(sourceIdentityContextKey{}).(IntelligenceSourceIdentity)
	return identity
}

func (h *IntelligenceSourceHandler) decodeBody(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, h.config.MaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesError *http.MaxBytesError
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

func parseSourceLimit(raw string) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return defaultSourcePageSize, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > maxSourcePageSize {
		return 0, ErrIntelligenceSourceInvalidRequest
	}
	return limit, nil
}

func bearerToken(header string) (string, bool) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" || len(parts[1]) > 4096 {
		return "", false
	}
	return parts[1], true
}

func validSourceEventKind(kind string) bool {
	switch kind {
	case "create", "update", "delete", "acl_change", "move", "restore":
		return true
	default:
		return false
	}
}

func validAuthorizationOperation(operation string) bool {
	switch operation {
	case "read", "process", "external_transfer", "export":
		return true
	default:
		return false
	}
}

func sourceErrorStatus(err error) (int, string) {
	switch {
	case errors.Is(err, ErrIntelligenceSourceUnauthorized):
		return http.StatusUnauthorized, "unauthorized"
	case errors.Is(err, ErrIntelligenceSourceDisabled), errors.Is(err, ErrIntelligenceSourceForbidden):
		return http.StatusForbidden, "forbidden"
	case errors.Is(err, ErrIntelligenceSourceInvalidRequest), errors.Is(err, ErrIntelligenceSourceInvalidCursor):
		return http.StatusBadRequest, "invalid_request"
	case errors.Is(err, ErrIntelligenceSourceRequestTooLarge):
		return http.StatusRequestEntityTooLarge, "request_too_large"
	case errors.Is(err, ErrIntelligenceSourceCursorExpired):
		return http.StatusGone, "cursor_expired"
	case errors.Is(err, ErrIntelligenceSourceNotFound):
		return http.StatusNotFound, "not_found"
	case errors.Is(err, ErrIntelligenceSourceRateLimited):
		return http.StatusTooManyRequests, "rate_limited"
	default:
		return http.StatusServiceUnavailable, "unavailable"
	}
}

func validSourceEvent(event IntelligenceSourceEvent, identity IntelligenceSourceIdentity) bool {
	if event.SchemaVersion != "v1" || event.EventID == "" || event.TenantID != identity.TenantID || event.ConnectionID != identity.ConnectionID || event.ResourceID == "" || event.RevisionID == "" || event.OrderToken == "" || event.ContainerID == "" || event.ObservedAt.IsZero() || !validSourceEventKind(event.Kind) {
		return false
	}
	if event.SourceSequence != nil && *event.SourceSequence <= 0 {
		return false
	}
	return event.Kind != "delete" || event.Tombstone
}

func sourceErrorCode(err error) string {
	_, code := sourceErrorStatus(err)
	return code
}

func publicSourceError(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return "Authentication required"
	case http.StatusForbidden:
		return "Source interface is not enabled for this connection"
	case http.StatusBadRequest:
		return "Invalid source request"
	case http.StatusGone:
		return "Source cursor expired; a full backfill is required"
	case http.StatusNotFound:
		return "Source resource not found"
	case http.StatusTooManyRequests:
		return "Source request limit exceeded"
	default:
		return "Source service unavailable"
	}
}

func writeIntelligenceSourceError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	response := map[string]any{"error": map[string]string{"code": code, "message": message}}
	if status == http.StatusGone {
		response["recovery"] = "full_backfill_required"
	}
	_ = json.NewEncoder(w).Encode(response)
}
