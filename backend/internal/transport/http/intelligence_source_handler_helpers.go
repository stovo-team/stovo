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
)

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
