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
)

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
