package app

import (
	"context"
	"errors"
	"strings"

	"stovo-messenger/backend/internal/adapters/canvasstore"
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
	var ciphertext, nonce string
	if request.InitialUpdate != "" {
		ciphertext, nonce, err = s.encryptServerAtRest(user.FamilyID, request.InitialUpdate)
		if err != nil { return canvasPublic{}, err }
	}
	// Persistence owns the transaction so the document and its initial state
	// commit together; retries never observe half a seed.
	_, err = s.canvasPersistence().Create(ctx, canvasstore.CreateInput{ID: id, FamilyID: user.FamilyID, ChatID: chat.ID, UserID: user.ID, Title: title, InitialCiphertext: ciphertext, InitialNonce: nonce})
	if errors.Is(err, canvasstore.ErrOwnershipConflict) {
		// Visibility alone is insufficient: another member cannot claim an
		// existing shared document as the result of their own create request.
		return canvasPublic{}, errForbidden
	}
	if err != nil { return canvasPublic{}, err }
	cardExists, err := s.canvasPersistence().CanvasCardExists(ctx, id, chat.ID)
	if err != nil {
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
	if err := s.canvasPersistence().CreateCard(ctx, message.ID, canvasID, chat.ID); err != nil {
		return err
	}
	if !replayed {
		s.notifyCreatedRESTMessage(chat, user, message, sendMessageRequest{Type: "canvas", Content: &content})
	}
	return nil
}

