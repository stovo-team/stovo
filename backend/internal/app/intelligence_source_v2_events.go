package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

func (s *Server) intelligenceSourceV2Events(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, rawCursor string, limit int) (httptransport.IntelligenceSourceV2EventPage, error) {
	if s.intelligenceSourceV2Persistence() == nil || limit < 1 || limit > 200 {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	cursor, err := s.decodeIntelligenceSourceV2Cursor(rawCursor, identity, "event")
	if err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, err
	}
	storedEvents, hasMore, err := s.intelligenceSourceV2Persistence().LoadEvents(ctx, identity, cursor.BackfillID, cursor.Sequence, limit)
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	events := make([]httptransport.IntelligenceSourceV2Event, 0, len(storedEvents))
	for _, stored := range storedEvents {
		event := httptransport.IntelligenceSourceV2Event{
			EventID: stored.EventID, ResourceID: stored.ResourceID, RevisionID: stored.RevisionID,
			SourceSequence: stored.Sequence, ContainerID: stored.ContainerID,
			ObservedAt: stored.ObservedAt, Kind: stored.Kind, Tombstone: stored.Tombstone,
			Origin: stored.Origin, OperationID: stored.OperationID,
		}
		event.SchemaVersion = "v2"
		event.TenantID = identity.TenantID
		event.ConnectionID = identity.ConnectionID
		event.PrincipalID = identity.PrincipalUserID
		event.OrderToken = strconv.FormatInt(event.SourceSequence, 10)
		event.PolicyRefs = []string{}
		events = append(events, event)
	}
	page := httptransport.IntelligenceSourceV2EventPage{SchemaVersion: "v2", Events: events, HasMore: hasMore, NextCursor: rawCursor}
	if len(events) > 0 {
		cursor.Sequence = events[len(events)-1].SourceSequence
		cursor.IssuedAt = s.intelligenceOIDCNow().Unix()
		page.NextCursor = s.encodeIntelligenceSourceV2Cursor(cursor)
		if page.NextCursor == "" {
			return httptransport.IntelligenceSourceV2EventPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	return page, nil
}

func (s *Server) intelligenceSourceV2Snapshot(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string) (httptransport.IntelligenceSourceV2ResourceSnapshot, error) {
	if s.intelligenceSourceV2Persistence() == nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	record, err := s.intelligenceSourceV2Persistence().LoadSnapshotForRead(ctx, identity, resourceID, revisionID, s.intelligenceOIDCNow())
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceNotFound
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	var snapshot httptransport.IntelligenceSourceV2ResourceSnapshot
	snapshot.ResourceID, snapshot.RevisionID, snapshot.ObservedAt = record.ResourceID, record.RevisionID, record.ObservedAt
	if err := json.Unmarshal(record.Metadata, &snapshot.Metadata); err != nil {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if record.Protocol == "server_at_rest" {
		if !record.Ciphertext.Valid || !record.Nonce.Valid {
			return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		plaintext, err := s.decryptServerAtRest(identity.FamilyID, record.Ciphertext.String, record.Nonce.String)
		if err != nil || plaintext == nil {
			return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		snapshot.Content = *plaintext
	} else if record.Protocol == "legacy_plaintext" && record.Content.Valid {
		snapshot.Content = record.Content.String
	} else {
		return httptransport.IntelligenceSourceV2ResourceSnapshot{}, httptransport.ErrIntelligenceSourceNotFound
	}
	snapshot.SchemaVersion = "v2"
	snapshot.TenantID = identity.TenantID
	snapshot.ConnectionID = identity.ConnectionID
	snapshot.PrincipalID = identity.PrincipalUserID
	snapshot.ContentRevisionID = snapshot.RevisionID
	snapshot.MetadataRevisionID = snapshot.RevisionID
	return snapshot, nil
}

func (s *Server) intelligenceSourceV2ResolveCitation(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string, locator httptransport.IntelligenceTextLocator) (httptransport.IntelligenceSourceV2CitationResolution, error) {
	snapshot, err := s.intelligenceSourceV2Snapshot(ctx, identity, resourceID, revisionID)
	if err != nil {
		return httptransport.IntelligenceSourceV2CitationResolution{}, err
	}
	text := []rune(snapshot.Content)
	if locator.Start < 0 || locator.End <= locator.Start || locator.End > len(text) {
		return httptransport.IntelligenceSourceV2CitationResolution{}, httptransport.ErrIntelligenceSourceNotFound
	}
	chatID, _ := snapshot.Metadata["chat_id"].(string)
	if chatID == "" || chatID != identity.ChatID {
		return httptransport.IntelligenceSourceV2CitationResolution{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceSourceV2CitationResolution{
		RevisionID:      revisionID,
		SourceReference: map[string]any{"resource_id": resourceID, "container_id": chatID},
		Excerpt:         string(text[locator.Start:locator.End]),
	}, nil
}

func (s *Server) encodeIntelligenceSourceV2Cursor(cursor intelligenceSourceV2Cursor) string {
	if s.cfg.JWTSecret == "" {
		return ""
	}
	payload, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret+":intelligence-source-cursor:v2"))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) decodeIntelligenceSourceV2Cursor(token string, identity httptransport.IntelligenceSourceIdentity, expectedKind string) (intelligenceSourceV2Cursor, error) {
	invalid := httptransport.ErrIntelligenceSourceInvalidCursor
	parts := splitSourceCursor(token)
	if len(parts) != 2 || s.cfg.JWTSecret == "" {
		return intelligenceSourceV2Cursor{}, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret+":intelligence-source-cursor:v2"))
	_, _ = mac.Write([]byte(parts[0]))
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return intelligenceSourceV2Cursor{}, invalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return intelligenceSourceV2Cursor{}, invalid
	}
	var cursor intelligenceSourceV2Cursor
	if json.Unmarshal(payload, &cursor) != nil || cursor.Kind != expectedKind || cursor.ConnectionID != identity.ConnectionID || cursor.ChatID != identity.ChatID || cursor.BackfillID == "" || cursor.Page < 0 || cursor.Sequence < 0 || cursor.IssuedAt <= 0 {
		return intelligenceSourceV2Cursor{}, invalid
	}
	now := s.intelligenceOIDCNow()
	issuedAt := time.Unix(cursor.IssuedAt, 0)
	if now.Sub(issuedAt) > intelligenceSourceV2CursorTTL || issuedAt.After(now.Add(time.Minute)) {
		return intelligenceSourceV2Cursor{}, httptransport.ErrIntelligenceSourceCursorExpired
	}
	return cursor, nil
}

func splitSourceCursor(token string) []string {
	if len(token) > 4096 {
		return nil
	}
	separator := -1
	for index, char := range token {
		if char == '.' {
			if separator >= 0 {
				return nil
			}
			separator = index
		}
	}
	if separator <= 0 || separator == len(token)-1 {
		return nil
	}
	return []string{token[:separator], token[separator+1:]}
}
