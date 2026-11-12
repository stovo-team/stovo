package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

func (s *Server) intelligenceSourceV2Reply(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, operationID string, revision int64, text string, final bool) (string, error) {
	if s.sqlDB == nil || operationID == "" || revision < 1 || text == "" || len(text) > httptransport.IntelligenceSourceV2ReplyMaxBytes {
		return "", httptransport.ErrIntelligenceSourceInvalidRequest
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return "", httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()

	var userID string
	err = tx.QueryRowContext(ctx, `
		SELECT c.principal_user_id
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.family_id=$3 AND i.tenant_id=$4 AND i.enabled
		JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id AND scope.chat_id=$5
		JOIN public.intelligence_source_v2_connection_grants reply_grant ON reply_grant.connection_id=c.id AND reply_grant.grant_type='reply' AND reply_grant.granted
		JOIN public.intelligence_source_v2_connection_grants codex_grant ON codex_grant.connection_id=c.id AND codex_grant.grant_type='codex' AND codex_grant.granted
		JOIN public.users u ON u.id=c.principal_user_id AND u.family_id=i.family_id AND u.is_active=1
		JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
		JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
		WHERE c.id=$1 AND c.installation_id=$2 AND c.enabled AND c.revoked_at IS NULL AND c.credential_expires_at>$6
		FOR SHARE OF reply_grant,codex_grant,u,ch,cm,i`, identity.ConnectionID, identity.InstallationID, identity.FamilyID, identity.TenantID, identity.ChatID, s.intelligenceOIDCNow()).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httptransport.ErrIntelligenceSourceForbidden
	}
	if err != nil || userID != identity.PrincipalUserID {
		return "", httptransport.ErrIntelligenceSourceUnavailable
	}
	user, err := s.getUserByID(userID)
	if err != nil || !user.IsActive || user.FamilyID != identity.FamilyID {
		return "", httptransport.ErrIntelligenceSourceForbidden
	}

	hash := sha256.Sum256([]byte(text))
	var messageID string
	var currentRevision int64
	var currentHash []byte
	var currentFinal bool
	err = tx.QueryRowContext(ctx, `
		SELECT message_id,revision,content_hash,final
		FROM public.intelligence_source_v2_reply_origins
		WHERE connection_id=$1 AND operation_id=$2 FOR UPDATE`, identity.ConnectionID, operationID).
		Scan(&messageID, &currentRevision, &currentHash, &currentFinal)
	if errors.Is(err, sql.ErrNoRows) {
		if revision != 1 {
			return "", httptransport.ErrIntelligenceSourceInvalidRequest
		}
		operationKey := "codex-bridge:" + identity.ConnectionID + ":" + operationID
		payload := sendMessageRequest{
			Type: "text", Content: &text,
			SourceConnectionID: identity.ConnectionID, SourceOperationID: operationID,
			SourceOrigin:   httptransport.IntelligenceSourceV2CodexBridgeOrigin,
			SourceRevision: revision, SourceContentHash: hash[:], SourceFinal: final,
		}
		message, replayed, sendErr := s.createRESTMessageWithSync(ctx, user, identity.ChatID, payload, operationKey)
		if sendErr != nil {
			return "", httptransport.ErrIntelligenceSourceUnavailable
		}
		messageID = message.ID
		if !replayed {
			chat, chatErr := s.buildChatPublic(identity.ChatID, user)
			if chatErr != nil {
				return "", httptransport.ErrIntelligenceSourceUnavailable
			}
			s.notifyCreatedRESTMessage(chat, user, message, payload)
			s.bumpChatHistoryRevision(ctx, identity.ChatID)
		}
	} else if err != nil {
		return "", httptransport.ErrIntelligenceSourceUnavailable
	} else {
		if revision == currentRevision && bytes.Equal(hash[:], currentHash) && final == currentFinal {
			return messageID, nil
		}
		if currentFinal || revision != currentRevision+1 {
			return "", httptransport.ErrIntelligenceSourceInvalidRequest
		}
		if _, err := s.editMessage(ctx, user, messageID, text); err != nil {
			return "", httptransport.ErrIntelligenceSourceUnavailable
		}
		if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_reply_origins SET revision=$1,content_hash=$2,final=$3 WHERE connection_id=$4 AND operation_id=$5`, revision, hash[:], final, identity.ConnectionID, operationID); err != nil {
			return "", httptransport.ErrIntelligenceSourceUnavailable
		}
	}

	if err := tx.Commit(); err != nil {
		return "", httptransport.ErrIntelligenceSourceUnavailable
	}
	return messageID, nil
}
