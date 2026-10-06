package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

const intelligenceSourceCursorTTL = 7 * 24 * time.Hour

type intelligenceSourceCursor struct {
	ConnectionID string `json:"c"`
	Sequence     int64  `json:"s"`
	IssuedAt     int64  `json:"i"`
}

// intelligenceSourceHandler supplies only server-derived identity and current
// Messenger policy to the narrow transport. It has no provisioning interface;
// installation and connection rows must be created by an explicit operator
// workflow, and both enabled flags default to false.
func (s *Server) intelligenceSourceHandler() httptransport.IntelligenceSourceHandlerConfig {
	cfg := httptransport.IntelligenceSourceHandlerConfig{Enabled: s.cfg.IntelligenceSourceEnabled}
	cfg.Authenticate = s.authenticateIntelligenceSource
	cfg.Operations = httptransport.IntelligenceSourceOperations{
		Events:          s.intelligenceSourceEvents,
		Snapshot:        s.intelligenceSourceSnapshot,
		Authorize:       s.intelligenceSourceAuthorize,
		ResolveCitation: s.intelligenceSourceCitation,
	}
	cfg.Limit = func(ctx context.Context, connectionID string) error {
		if s.cache == nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		count, err := s.cache.Increment(ctx, "intelligence-source:limit:"+connectionID, 60)
		if err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		if count > 60 {
			return httptransport.ErrIntelligenceSourceRateLimited
		}
		return nil
	}
	cfg.Audit = s.auditIntelligenceSource
	return cfg
}

func (s *Server) authenticateIntelligenceSource(ctx context.Context, token string) (httptransport.IntelligenceSourceIdentity, error) {
	if s.sqlDB == nil || strings.TrimSpace(token) == "" {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	digest := sha256.Sum256([]byte(token))
	var identity httptransport.IntelligenceSourceIdentity
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT i.id,i.tenant_id,c.id,i.family_id,c.principal_user_id,i.enabled,c.enabled
		FROM public.intelligence_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id
		JOIN public.users u ON u.id=c.principal_user_id
		JOIN public.families f ON f.id=i.family_id
		WHERE c.credential_hash=$1 AND c.revoked_at IS NULL AND u.is_active=1`, digest[:]).Scan(
		&identity.InstallationID, &identity.TenantID, &identity.ConnectionID, &identity.FamilyID,
		&identity.PrincipalUserID, &identity.InstallationEnabled, &identity.ConnectionEnabled)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	var mappedFamily string
	err = s.sqlDB.QueryRowContext(ctx, `SELECT family_id FROM public.users WHERE id=$1 AND is_active=1`, identity.PrincipalUserID).Scan(&mappedFamily)
	if err != nil || mappedFamily != identity.FamilyID {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceForbidden
	}
	return identity, nil
}

func (s *Server) intelligenceSourceAuthorize(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceIDs []string, operation string) ([]httptransport.IntelligenceAuthorizationDecision, error) {
	if s.sqlDB == nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	decisions := make([]httptransport.IntelligenceAuthorizationDecision, 0, len(resourceIDs))
	for _, resourceID := range resourceIDs {
		var chatID, familyID string
		var allowed, aiNotes bool
		var policyRevision string
		err := s.sqlDB.QueryRowContext(ctx, `
			SELECT ch.id,f.id, (u.is_active=1 AND cm.user_id IS NOT NULL AND i.family_id=f.id AND scope.chat_id=ch.id
			       AND NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=m.id AND mud.user_id=u.id)),
			       f.ai_notes_enabled,
			       md5(COALESCE((SELECT string_agg(policy_member.user_id, ',' ORDER BY policy_member.user_id)
			                     FROM public.chat_members policy_member WHERE policy_member.chat_id=ch.id), '')
			           || ':' || f.ai_notes_enabled::text || ':' || u.is_active::text
			           || ':' || (NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud
			                                WHERE mud.message_id=m.id AND mud.user_id=u.id))::text)
			FROM public.messages m
			JOIN public.chats ch ON ch.id=m.chat_id
			JOIN public.families f ON f.id=ch.family_id
			JOIN public.intelligence_installations i ON i.id=$1 AND i.family_id=f.id AND i.enabled
			JOIN public.intelligence_connections c ON c.id=$2 AND c.installation_id=i.id AND c.enabled AND c.revoked_at IS NULL
			JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=ch.id
			JOIN public.users u ON u.id=$3
			LEFT JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
			WHERE m.id=$4 AND m.deleted_at IS NULL`, identity.InstallationID, identity.ConnectionID, identity.PrincipalUserID, resourceID).
			Scan(&chatID, &familyID, &allowed, &aiNotes, &policyRevision)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		if errors.Is(err, sql.ErrNoRows) {
			allowed = false
			policyRevision = "not_found"
		}
		allowed = allowed && (operation == "read" || operation == "process" && aiNotes)
		// Messenger currently has no explicit current policy for transfer/export.
		if operation == "external_transfer" || operation == "export" {
			allowed = false
		}
		decisions = append(decisions, httptransport.IntelligenceAuthorizationDecision{
			TenantID: identity.TenantID, ResourceID: resourceID, Operation: operation,
			Allowed: allowed, DecidedAt: time.Now().UTC(), PolicyRevision: policyRevision,
		})
	}
	return decisions, nil
}

func (s *Server) intelligenceSourceSnapshot(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string) (httptransport.IntelligenceResourceSnapshot, error) {
	var snapshot httptransport.IntelligenceResourceSnapshot
	var content, ciphertext, nonce sql.NullString
	var metadata []byte
	var keyVersion sql.NullInt64
	var protocol string
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT i.tenant_id,c.id,r.resource_id,r.revision_id,r.content,r.ciphertext,r.nonce,r.key_version,
		       r.encryption_protocol,r.metadata,r.observed_at
		FROM public.intelligence_source_revisions r
		JOIN public.intelligence_connections c ON c.id=r.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.family_id=$2
		JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=r.chat_id
		JOIN public.messages current_message ON current_message.id=r.resource_id
			AND current_message.deleted_at IS NULL AND current_message.encryption_protocol <> 'end_to_end'
			AND current_message.chat_id=r.chat_id
		JOIN public.users principal ON principal.id=c.principal_user_id AND principal.is_active=1
		JOIN public.chat_members current_membership ON current_membership.chat_id=current_message.chat_id AND current_membership.user_id=principal.id
		JOIN public.intelligence_connection_chats current_scope ON current_scope.connection_id=c.id AND current_scope.chat_id=current_message.chat_id
		WHERE r.resource_id=$3 AND r.revision_id=$4 AND NOT r.deleted
		  AND NOT EXISTS (SELECT 1 FROM public.message_user_deletions mud WHERE mud.message_id=current_message.id AND mud.user_id=principal.id)`,
		identity.ConnectionID, identity.FamilyID, resourceID, revisionID).Scan(
		&snapshot.TenantID, &snapshot.ConnectionID, &snapshot.ResourceID, &snapshot.RevisionID,
		&content, &ciphertext, &nonce, &keyVersion, &protocol, &metadata, &snapshot.ObservedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return snapshot, httptransport.ErrIntelligenceSourceNotFound
	}
	if err != nil {
		return snapshot, httptransport.ErrIntelligenceSourceUnavailable
	}
	if protocol == encryptionProtocolEndToEnd {
		return snapshot, httptransport.ErrIntelligenceSourceNotFound
	}
	if protocol == encryptionProtocolServerAtRest {
		if !ciphertext.Valid || !nonce.Valid || !keyVersion.Valid {
			return snapshot, httptransport.ErrIntelligenceSourceUnavailable
		}
		decrypted, decryptErr := s.decryptServerAtRest(identity.FamilyID, ciphertext.String, nonce.String)
		if decryptErr != nil || decrypted == nil {
			return snapshot, httptransport.ErrIntelligenceSourceUnavailable
		}
		snapshot.Content = *decrypted
	} else if content.Valid {
		snapshot.Content = content.String
	}
	snapshot.ContentRevisionID = revisionID
	snapshot.MetadataRevisionID = revisionID
	if err := json.Unmarshal(metadata, &snapshot.Metadata); err != nil {
		return snapshot, httptransport.ErrIntelligenceSourceUnavailable
	}
	return snapshot, nil
}

func (s *Server) intelligenceSourceCitation(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, resourceID, revisionID string, locator httptransport.IntelligenceTextLocator) (httptransport.IntelligenceCitationResolution, error) {
	snapshot, err := s.intelligenceSourceSnapshot(ctx, identity, resourceID, revisionID)
	if err != nil {
		return httptransport.IntelligenceCitationResolution{}, err
	}
	text := []rune(snapshot.Content)
	if locator.Start < 0 || locator.End <= locator.Start || locator.End > len(text) {
		return httptransport.IntelligenceCitationResolution{}, httptransport.ErrIntelligenceSourceNotFound
	}
	chatID, _ := snapshot.Metadata["chat_id"].(string)
	if chatID == "" {
		return httptransport.IntelligenceCitationResolution{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return httptransport.IntelligenceCitationResolution{
		SourceReference: map[string]any{"resource_id": resourceID, "container_id": chatID},
		RevisionID:      revisionID, Excerpt: string(text[locator.Start:locator.End]),
	}, nil
}

func (s *Server) intelligenceSourceEvents(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, rawCursor string, limit int) (httptransport.IntelligenceSourceEventPage, error) {
	if s.sqlDB == nil {
		return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	sequence := int64(0)
	if rawCursor != "" {
		cursor, err := s.decodeIntelligenceSourceCursor(rawCursor, identity.ConnectionID)
		if err != nil {
			return httptransport.IntelligenceSourceEventPage{}, err
		}
		sequence = cursor.Sequence
	}
	rows, err := s.sqlDB.QueryContext(ctx, `
		SELECT e.event_id,e.sequence,e.resource_id,e.revision_id,e.chat_id,e.kind,e.tombstone,e.observed_at
		FROM public.intelligence_source_events e
		JOIN public.intelligence_connections c ON c.id=e.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.tenant_id=$2 AND i.family_id=$3
		JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=e.chat_id
		WHERE e.sequence>$4 ORDER BY e.sequence ASC LIMIT $5`, identity.ConnectionID, identity.TenantID, identity.FamilyID, sequence, limit+1)
	if err != nil {
		return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = rows.Close() }()
	page := httptransport.IntelligenceSourceEventPage{Events: make([]httptransport.IntelligenceSourceEvent, 0, limit)}
	last := sequence
	for rows.Next() {
		var event httptransport.IntelligenceSourceEvent
		var seq int64
		var tombstone bool
		if err := rows.Scan(&event.EventID, &seq, &event.ResourceID, &event.RevisionID, &event.ContainerID, &event.Kind, &tombstone, &event.ObservedAt); err != nil {
			return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		if len(page.Events) == limit {
			page.HasMore = true
			break
		}
		// Replay never bypasses today's membership state. A stale ACL event may
		// be replayed as metadata only if its current resource scope still exists.
		visible := false
		if event.Kind == "acl_change" {
			visible, err = s.intelligenceSourceCanReceiveACLChange(ctx, identity, event.ContainerID)
			if err != nil {
				return httptransport.IntelligenceSourceEventPage{}, err
			}
		} else if tombstone {
			visible, err = s.intelligenceSourceCanReadChat(ctx, identity, event.ContainerID)
			if err != nil {
				return httptransport.IntelligenceSourceEventPage{}, err
			}
		} else {
			decision, authErr := s.intelligenceSourceAuthorize(ctx, identity, []string{event.ResourceID}, "read")
			if authErr != nil {
				return httptransport.IntelligenceSourceEventPage{}, authErr
			}
			visible = len(decision) == 1 && decision[0].Allowed
		}
		if visible {
			seqCopy := seq
			event.SchemaVersion = "v1"
			event.TenantID = identity.TenantID
			event.ConnectionID = identity.ConnectionID
			event.SourceSequence = &seqCopy
			event.OrderToken = strconv.FormatInt(seq, 10)
			event.Tombstone = tombstone
			page.Events = append(page.Events, event)
		}
		last = seq
	}
	if err := rows.Err(); err != nil {
		return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := rows.Close(); err != nil {
		return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	page.NextCursor = s.encodeIntelligenceSourceCursor(identity.ConnectionID, last)
	if page.NextCursor == "" {
		return httptransport.IntelligenceSourceEventPage{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return page, nil
}

func (s *Server) intelligenceSourceCanReadChat(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, chatID string) (bool, error) {
	var allowed bool
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT (u.is_active=1 AND cm.user_id IS NOT NULL)
		FROM public.intelligence_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.id=$1 AND i.family_id=$2 AND i.enabled
		JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$4
		JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
		JOIN public.users u ON u.id=$3
		LEFT JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
		WHERE c.id=$5 AND c.enabled AND c.revoked_at IS NULL`,
		identity.InstallationID, identity.FamilyID, identity.PrincipalUserID, chatID, identity.ConnectionID).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, httptransport.ErrIntelligenceSourceUnavailable
	}
	return allowed, nil
}

// ACL events contain no message text. Keep them deliverable to a scoped
// connection after membership removal so a consumer can invalidate old data.
func (s *Server) intelligenceSourceCanReceiveACLChange(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, chatID string) (bool, error) {
	var exists bool
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM public.intelligence_connections c
			JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.id=$1 AND i.family_id=$2 AND i.enabled
			JOIN public.intelligence_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$4
			JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
			JOIN public.users u ON u.id=c.principal_user_id AND u.id=$3 AND u.is_active=1
			WHERE c.id=$5 AND c.enabled AND c.revoked_at IS NULL
		)`, identity.InstallationID, identity.FamilyID, identity.PrincipalUserID, chatID, identity.ConnectionID).Scan(&exists)
	if err != nil {
		return false, httptransport.ErrIntelligenceSourceUnavailable
	}
	return exists, nil
}

func (s *Server) encodeIntelligenceSourceCursor(connectionID string, sequence int64) string {
	if s.cfg.JWTSecret == "" {
		return ""
	}
	payload, err := json.Marshal(intelligenceSourceCursor{ConnectionID: connectionID, Sequence: sequence, IssuedAt: time.Now().Unix()})
	if err != nil {
		return ""
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	signature := s.signIntelligenceSourceCursor(encoded)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func (s *Server) decodeIntelligenceSourceCursor(token, connectionID string) (intelligenceSourceCursor, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || s.cfg.JWTSecret == "" {
		return intelligenceSourceCursor{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, s.signIntelligenceSourceCursor(parts[0])) {
		return intelligenceSourceCursor{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return intelligenceSourceCursor{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	var cursor intelligenceSourceCursor
	if json.Unmarshal(payload, &cursor) != nil || cursor.ConnectionID != connectionID || cursor.Sequence < 0 || cursor.IssuedAt <= 0 {
		return intelligenceSourceCursor{}, httptransport.ErrIntelligenceSourceInvalidCursor
	}
	if time.Since(time.Unix(cursor.IssuedAt, 0)) > intelligenceSourceCursorTTL || time.Until(time.Unix(cursor.IssuedAt, 0)) > time.Minute {
		return intelligenceSourceCursor{}, httptransport.ErrIntelligenceSourceCursorExpired
	}
	return cursor, nil
}

func (s *Server) signIntelligenceSourceCursor(data string) []byte {
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret+":intelligence-source-cursor:v1"))
	_, _ = mac.Write([]byte(data))
	return mac.Sum(nil)
}

func (s *Server) auditIntelligenceSource(ctx context.Context, record httptransport.IntelligenceSourceAuditRecord) error {
	if s.sqlDB == nil {
		return fmt.Errorf("audit store unavailable")
	}
	_, err := s.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_source_audit
		(id,installation_id,connection_id,route,result,request_id,created_at)
		VALUES($1,$2,$3,$4,$5,$6,now())`, uuid.NewString(), nullString(record.InstallationID), nullString(record.ConnectionID), record.Route, record.Result, nullString(record.RequestID))
	return err
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
