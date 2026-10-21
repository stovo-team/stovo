package app

import (
	"context"
	"database/sql"
	"strings"

	"github.com/google/uuid"
)

func (s *Server) createCanvas(ctx context.Context, user userPublic, request createCanvasRequest) (canvasPublic, error) {
	chatID := strings.TrimSpace(request.ChatID)
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return canvasPublic{}, errNotFound
	}
	title := strings.TrimSpace(request.Title)
	if title == "" {
		title = "Untitled canvas"
	}
	if len(title) > 160 {
		return canvasPublic{}, errBadRequest
	}
	if request.InitialUpdate != "" {
		_, err = decodeCanvasUpdate(request.InitialUpdate)
		if err != nil {
			return canvasPublic{}, err
		}
	}
	id := strings.TrimSpace(request.CanvasID)
	if id == "" {
		id = uuid.NewString()
	} else {
		parsed, err := uuid.Parse(id)
		if err != nil || parsed == uuid.Nil {
			return canvasPublic{}, errBadRequest
		}
		id = parsed.String()
	}
	// Commit the document and its initial state together. A conflicting insert
	// waits for the original transaction, so retries never observe half a seed.
	tx, err := s.canvasDB.BeginTx(ctx, nil)
	if err != nil {
		return canvasPublic{}, err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `INSERT INTO canvases (id,family_id,origin_chat_id,created_by,title) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, id, user.FamilyID, chat.ID, user.ID, title)
	if err != nil {
		return canvasPublic{}, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return canvasPublic{}, err
	}
	if inserted == 0 {
		var familyID, originChatID, createdBy string
		var deletedAt sql.NullTime
		if err := tx.QueryRowContext(ctx, `SELECT family_id,origin_chat_id,created_by,deleted_at FROM canvases WHERE id=$1`, id).Scan(&familyID, &originChatID, &createdBy, &deletedAt); err != nil {
			return canvasPublic{}, err
		}
		// Visibility alone is insufficient: another member cannot claim an
		// existing shared document as the result of their own create request.
		if familyID != user.FamilyID || createdBy != user.ID || originChatID != chat.ID || deletedAt.Valid {
			return canvasPublic{}, errForbidden
		}
	} else {
		if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_chat_links (canvas_id,chat_id,created_by) VALUES ($1,$2,$3)`, id, chat.ID, user.ID); err != nil {
			return canvasPublic{}, err
		}
		if request.InitialUpdate != "" {
			ciphertext, nonce, err := s.encryptServerAtRest(user.FamilyID, request.InitialUpdate)
			if err != nil {
				return canvasPublic{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_updates (canvas_id,ciphertext,nonce,created_by) VALUES ($1,$2,$3,$4)`, id, ciphertext, nonce, user.ID); err != nil {
				return canvasPublic{}, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return canvasPublic{}, err
	}
	var cardExists bool
	if err := s.canvasDB.QueryRowContext(ctx, `SELECT card_message_id IS NOT NULL FROM canvas_chat_links WHERE canvas_id=$1 AND chat_id=$2`, id, chat.ID).Scan(&cardExists); err != nil {
		return canvasPublic{}, err
	}
	if !cardExists {
		// A crash can occur after the message commits but before its Canvas
		// mapping is recorded. Replay the same durable message operation then.
		operationID := uuid.NewSHA1(uuid.NameSpaceOID, []byte("canvas-create:"+id)).String()
		if err := s.createCanvasCardWithOperationID(ctx, id, title, chat, user, operationID); err != nil {
			return canvasPublic{}, err
		}
	}
	return s.getCanvasForUser(ctx, id, user)
}

func (s *Server) createCanvasCard(ctx context.Context, canvasID, title string, chat chatPublic, user userPublic) error {
	return s.createCanvasCardWithOperationID(ctx, canvasID, title, chat, user, "")
}

func (s *Server) createCanvasCardWithOperationID(ctx context.Context, canvasID, title string, chat chatPublic, user userPublic, operationID string) error {
	content := "canvas:" + canvasID + "\n" + title
	message, replayed, err := s.createRESTMessageWithSyncImmediately(ctx, user, chat.ID, sendMessageRequest{Type: "canvas", Content: &content}, operationID)
	if err != nil {
		return err
	}
	if _, err := s.canvasDB.ExecContext(ctx, `INSERT INTO canvas_cards (message_id,canvas_id) VALUES ($1,$2) ON CONFLICT (message_id) DO NOTHING`, message.ID, canvasID); err != nil {
		return err
	}
	if _, err := s.canvasDB.ExecContext(ctx, `UPDATE canvas_chat_links SET card_message_id=$3 WHERE canvas_id=$1 AND chat_id=$2`, canvasID, chat.ID, message.ID); err != nil {
		return err
	}
	if !replayed {
		s.notifyCreatedRESTMessage(chat, user, message, sendMessageRequest{Type: "canvas", Content: &content})
	}
	return nil
}

