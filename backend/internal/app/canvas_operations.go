package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	canvasPluginID       = "plugin-canvas"
	maxCanvasUpdateBytes = 8 * 1024 * 1024
)

type canvasPublic struct {
	ID            string    `json:"id"`
	FamilyID      string    `json:"familyId"`
	OriginChatID  string    `json:"originChatId"`
	CreatedBy     string    `json:"createdBy"`
	Title         string    `json:"title"`
	LinkedChatIDs []string  `json:"linkedChatIds"`
	CanManage     bool      `json:"canManage"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type canvasUpdatePublic struct {
	Sequence  int64     `json:"sequence"`
	Update    string    `json:"update"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

type createCanvasRequest struct {
	ChatID string `json:"chatId"`
	Title  string `json:"title"`
}

type renameCanvasRequest struct {
	Title string `json:"title"`
}
type linkCanvasRequest struct {
	ChatID string `json:"chatId"`
}
type canvasDocumentUpdateRequest struct {
	Update string `json:"update"`
}

func (s *Server) canvasPluginEnabled() bool {
	if s.canvasDB == nil || s.plugins == nil {
		return false
	}
	p, ok := s.plugins.Get(canvasPluginID)
	if !ok {
		return false
	}
	if configurable, ok := p.(interface{ Enabled() bool }); ok {
		return configurable.Enabled()
	}
	return true
}

func (s *Server) canvasUnavailable(w http.ResponseWriter) bool {
	if s.canvasPluginEnabled() {
		return false
	}
	s.detail(w, http.StatusNotFound, "Canvas is unavailable")
	return true
}

func (s *Server) canvasRoutes() http.Handler {
	r := chi.NewRouter()
	r.Get("/chats/{chatId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		chatID := chi.URLParam(r, "chatId")
		if _, err := s.buildChatPublic(chatID, user); err != nil {
			s.detail(w, http.StatusNotFound, "Chat not found")
			return
		}
		items, err := s.listCanvasesForChat(r.Context(), chatID, user)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load canvases")
			return
		}
		s.json(w, http.StatusOK, items)
	}))
	r.Get("/canvases", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		items, err := s.listCanvasesForUser(r.Context(), user)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load canvases")
			return
		}
		s.json(w, http.StatusOK, items)
	}))
	r.Post("/canvases", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		var request createCanvasRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Canvas request")
			return
		}
		canvas, err := s.createCanvas(r.Context(), user, request)
		if err != nil {
			s.canvasError(w, err)
			return
		}
		s.json(w, http.StatusCreated, canvas)
	}))
	r.Get("/canvases/{canvasId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		canvas, err := s.getCanvasForUser(r.Context(), chi.URLParam(r, "canvasId"), user)
		if err != nil {
			s.canvasError(w, err)
			return
		}
		s.json(w, http.StatusOK, canvas)
	}))
	r.Patch("/canvases/{canvasId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		var request renameCanvasRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Canvas request")
			return
		}
		canvas, err := s.renameCanvas(r.Context(), chi.URLParam(r, "canvasId"), user, request.Title)
		if err != nil {
			s.canvasError(w, err)
			return
		}
		s.json(w, http.StatusOK, canvas)
	}))
	r.Delete("/canvases/{canvasId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		if err := s.deleteCanvas(r.Context(), chi.URLParam(r, "canvasId"), user); err != nil {
			s.canvasError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	r.Get("/canvases/{canvasId}/document", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		if _, err := s.getCanvasForUser(r.Context(), chi.URLParam(r, "canvasId"), user); err != nil {
			s.canvasError(w, err)
			return
		}
		updates, err := s.canvasUpdates(r.Context(), chi.URLParam(r, "canvasId"))
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load Canvas document")
			return
		}
		s.json(w, http.StatusOK, map[string]any{"updates": updates})
	}))
	r.Post("/canvases/{canvasId}/document", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		var request canvasDocumentUpdateRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Canvas update")
			return
		}
		canvasID := chi.URLParam(r, "canvasId")
		item, err := s.appendCanvasUpdate(r.Context(), canvasID, user, request.Update)
		if err != nil {
			s.canvasError(w, err)
			return
		}
		s.emitCanvasToAuthorizedUsers(r.Context(), canvasID, "canvas:update", map[string]any{"canvasId": canvasID, "update": item.Update, "sequence": item.Sequence, "createdBy": item.CreatedBy})
		s.json(w, http.StatusCreated, item)
	}))
	r.Post("/canvases/{canvasId}/links", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		var request linkCanvasRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Canvas link")
			return
		}
		canvas, err := s.linkCanvas(r.Context(), chi.URLParam(r, "canvasId"), request.ChatID, user)
		if err != nil {
			s.canvasError(w, err)
			return
		}
		s.json(w, http.StatusOK, canvas)
	}))
	r.Delete("/canvases/{canvasId}/links/{chatId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.canvasUnavailable(w) {
			return
		}
		if err := s.unlinkCanvas(r.Context(), chi.URLParam(r, "canvasId"), chi.URLParam(r, "chatId"), user); err != nil {
			s.canvasError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	return r
}

func (s *Server) canvasError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotFound):
		s.detail(w, http.StatusNotFound, "Canvas not found")
	case errors.Is(err, errForbidden):
		s.detail(w, http.StatusForbidden, "You cannot manage this Canvas")
	case errors.Is(err, errBadRequest):
		s.detail(w, http.StatusBadRequest, "Invalid Canvas request")
	default:
		s.detail(w, http.StatusInternalServerError, "Canvas operation failed")
	}
}

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
	id := uuid.NewString()
	if _, err := s.canvasDB.ExecContext(ctx, `INSERT INTO canvases (id,family_id,origin_chat_id,created_by,title) VALUES ($1,$2,$3,$4,$5)`, id, user.FamilyID, chat.ID, user.ID, title); err != nil {
		return canvasPublic{}, err
	}
	if _, err := s.canvasDB.ExecContext(ctx, `INSERT INTO canvas_chat_links (canvas_id,chat_id,created_by) VALUES ($1,$2,$3)`, id, chat.ID, user.ID); err != nil {
		return canvasPublic{}, err
	}
	if err := s.createCanvasCard(ctx, id, title, chat, user); err != nil {
		return canvasPublic{}, err
	}
	return s.getCanvasForUser(ctx, id, user)
}

func (s *Server) createCanvasCard(ctx context.Context, canvasID, title string, chat chatPublic, user userPublic) error {
	content := "canvas:" + canvasID + "\n" + title
	message, replayed, err := s.createRESTMessageWithSync(ctx, user, chat.ID, sendMessageRequest{Type: "canvas", Content: &content}, "")
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

func (s *Server) getCanvasForUser(ctx context.Context, canvasID string, user userPublic) (canvasPublic, error) {
	if s.canvasDB == nil {
		return canvasPublic{}, errNotFound
	}
	canvasID = strings.TrimSpace(canvasID)
	var canvas canvasPublic
	err := s.canvasDB.QueryRowContext(ctx, `
		SELECT c.id,c.family_id,c.origin_chat_id,c.created_by,c.title,c.created_at,c.updated_at
		FROM canvases c WHERE c.id=$1 AND c.family_id=$2 AND c.deleted_at IS NULL
		AND (c.created_by=$3 OR EXISTS (SELECT 1 FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$3))`, canvasID, user.FamilyID, user.ID).
		Scan(&canvas.ID, &canvas.FamilyID, &canvas.OriginChatID, &canvas.CreatedBy, &canvas.Title, &canvas.CreatedAt, &canvas.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return canvasPublic{}, errNotFound
	}
	if err != nil {
		return canvasPublic{}, err
	}
	rows, err := s.canvasDB.QueryContext(ctx, `SELECT chat_id FROM canvas_chat_links WHERE canvas_id=$1 AND deleted_at IS NULL ORDER BY created_at`, canvas.ID)
	if err != nil {
		return canvasPublic{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			return canvasPublic{}, err
		}
		canvas.LinkedChatIDs = append(canvas.LinkedChatIDs, chatID)
	}
	canvas.CanManage = canvas.CreatedBy == user.ID || user.Role == "admin"
	return canvas, rows.Err()
}

func (s *Server) listCanvasesForChat(ctx context.Context, chatID string, user userPublic) ([]canvasPublic, error) {
	rows, err := s.canvasDB.QueryContext(ctx, `SELECT canvas_id FROM canvas_chat_links WHERE chat_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []canvasPublic{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		canvas, err := s.getCanvasForUser(ctx, id, user)
		if err == nil {
			result = append(result, canvas)
		}
	}
	return result, rows.Err()
}

// listCanvasesForUser exposes Canvas as a first-class Storage item while
// retaining chat-link permissions as the access boundary.
func (s *Server) listCanvasesForUser(ctx context.Context, user userPublic) ([]canvasPublic, error) {
	rows, err := s.canvasDB.QueryContext(ctx, `
		SELECT c.id
		FROM canvases c
		WHERE c.family_id=$1 AND c.deleted_at IS NULL
		AND (
			c.created_by=$2
			OR EXISTS (
				SELECT 1
				FROM canvas_chat_links l
				JOIN chat_members cm ON cm.chat_id=l.chat_id
				WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2
			)
		)
		ORDER BY c.updated_at DESC`, user.FamilyID, user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []canvasPublic{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		canvas, err := s.getCanvasForUser(ctx, id, user)
		if err == nil {
			result = append(result, canvas)
		}
	}
	return result, rows.Err()
}

func (s *Server) requireCanvasManager(ctx context.Context, canvasID string, user userPublic) (canvasPublic, error) {
	canvas, err := s.getCanvasForUser(ctx, canvasID, user)
	if err != nil {
		return canvasPublic{}, err
	}
	if !canvas.CanManage {
		return canvasPublic{}, errForbidden
	}
	return canvas, nil
}

func (s *Server) renameCanvas(ctx context.Context, canvasID string, user userPublic, title string) (canvasPublic, error) {
	if _, err := s.requireCanvasManager(ctx, canvasID, user); err != nil {
		return canvasPublic{}, err
	}
	title = strings.TrimSpace(title)
	if title == "" || len(title) > 160 {
		return canvasPublic{}, errBadRequest
	}
	if _, err := s.canvasDB.ExecContext(ctx, `UPDATE canvases SET title=$2,updated_at=now() WHERE id=$1`, canvasID, title); err != nil {
		return canvasPublic{}, err
	}
	return s.getCanvasForUser(ctx, canvasID, user)
}

func (s *Server) deleteCanvas(ctx context.Context, canvasID string, user userPublic) error {
	if _, err := s.requireCanvasManager(ctx, canvasID, user); err != nil {
		return err
	}
	_, err := s.canvasDB.ExecContext(ctx, `UPDATE canvases SET deleted_at=now(),updated_at=now() WHERE id=$1`, canvasID)
	return err
}

func (s *Server) linkCanvas(ctx context.Context, canvasID, chatID string, user userPublic) (canvasPublic, error) {
	canvas, err := s.requireCanvasManager(ctx, canvasID, user)
	if err != nil {
		return canvasPublic{}, err
	}
	chat, err := s.buildChatPublic(strings.TrimSpace(chatID), user)
	if err != nil {
		return canvasPublic{}, errNotFound
	}
	if canvas.OriginChatID == chat.ID {
		return canvas, nil
	}
	var active bool
	if err := s.canvasDB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM canvas_chat_links WHERE canvas_id=$1 AND chat_id=$2 AND deleted_at IS NULL)`, canvasID, chat.ID).Scan(&active); err != nil {
		return canvasPublic{}, err
	}
	if active {
		return canvas, nil
	}
	if _, err := s.canvasDB.ExecContext(ctx, `INSERT INTO canvas_chat_links (canvas_id,chat_id,created_by,deleted_at) VALUES ($1,$2,$3,NULL) ON CONFLICT (canvas_id,chat_id) DO UPDATE SET deleted_at=NULL,created_by=EXCLUDED.created_by,card_message_id=NULL,created_at=now()`, canvasID, chat.ID, user.ID); err != nil {
		return canvasPublic{}, err
	}
	if err := s.createCanvasCard(ctx, canvasID, canvas.Title, chat, user); err != nil {
		return canvasPublic{}, err
	}
	return s.getCanvasForUser(ctx, canvasID, user)
}

func (s *Server) unlinkCanvas(ctx context.Context, canvasID, chatID string, user userPublic) error {
	canvas, err := s.requireCanvasManager(ctx, canvasID, user)
	if err != nil {
		return err
	}
	if canvas.OriginChatID == chatID {
		return errBadRequest
	}
	result, err := s.canvasDB.ExecContext(ctx, `UPDATE canvas_chat_links SET deleted_at=now() WHERE canvas_id=$1 AND chat_id=$2 AND deleted_at IS NULL`, canvasID, chatID)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return errNotFound
	}
	return nil
}

func (s *Server) canvasCardForMessage(ctx context.Context, messageID, viewerID string) *canvasCardPublic {
	if s.canvasDB == nil {
		return nil
	}
	var card canvasCardPublic
	err := s.canvasDB.QueryRowContext(ctx, `SELECT c.id,c.title,EXISTS(SELECT 1 FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2) FROM canvas_cards cc JOIN canvases c ON c.id=cc.canvas_id WHERE cc.message_id=$1`, messageID, viewerID).Scan(&card.ID, &card.Title, &card.Available)
	if err != nil || !card.Available {
		return &canvasCardPublic{Available: false}
	}
	return &card
}

func (s *Server) canvasUpdates(ctx context.Context, canvasID string) ([]canvasUpdatePublic, error) {
	rows, err := s.canvasDB.QueryContext(ctx, `SELECT u.sequence,u.ciphertext,u.nonce,u.created_by,u.created_at,c.family_id FROM canvas_updates u JOIN canvases c ON c.id=u.canvas_id WHERE u.canvas_id=$1 ORDER BY u.sequence`, canvasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	updates := []canvasUpdatePublic{}
	for rows.Next() {
		var item canvasUpdatePublic
		var ciphertext, nonce, familyID string
		if err := rows.Scan(&item.Sequence, &ciphertext, &nonce, &item.CreatedBy, &item.CreatedAt, &familyID); err != nil {
			return nil, err
		}
		plain, err := s.decryptServerAtRest(familyID, ciphertext, nonce)
		if err != nil {
			return nil, fmt.Errorf("decrypt Canvas update: %w", err)
		}
		item.Update = *plain
		updates = append(updates, item)
	}
	return updates, rows.Err()
}

func (s *Server) appendCanvasUpdate(ctx context.Context, canvasID string, user userPublic, update string) (canvasUpdatePublic, error) {
	if _, err := s.getCanvasForUser(ctx, canvasID, user); err != nil {
		return canvasUpdatePublic{}, err
	}
	decoded, err := base64.StdEncoding.DecodeString(update)
	// Excalidraw serializes a complete element while it is being drawn. A
	// detailed stroke can therefore exceed the small limit intended for text
	// updates, even though it is a valid document update.
	if err != nil || len(decoded) == 0 || len(decoded) > maxCanvasUpdateBytes {
		return canvasUpdatePublic{}, errBadRequest
	}
	ciphertext, nonce, err := s.encryptServerAtRest(user.FamilyID, update)
	if err != nil {
		return canvasUpdatePublic{}, err
	}
	item := canvasUpdatePublic{Update: update, CreatedBy: user.ID}
	err = s.canvasDB.QueryRowContext(ctx, `INSERT INTO canvas_updates (canvas_id,ciphertext,nonce,created_by) VALUES ($1,$2,$3,$4) RETURNING sequence,created_at`, canvasID, ciphertext, nonce, user.ID).Scan(&item.Sequence, &item.CreatedAt)
	if err == nil {
		_, _ = s.canvasDB.ExecContext(ctx, `UPDATE canvases SET updated_at=now() WHERE id=$1`, canvasID)
	}
	return item, err
}

// emitCanvasToAuthorizedUsers resolves the recipients for every Canvas event.
// That prevents a socket which was previously joined from receiving more data
// after its user loses access to every chat linked to the Canvas.
func (s *Server) emitCanvasToAuthorizedUsers(ctx context.Context, canvasID, event string, payload any) {
	if s.canvasDB == nil || s.sockets == nil {
		return
	}
	rows, err := s.canvasDB.QueryContext(ctx, `
		SELECT DISTINCT cm.user_id
		FROM canvas_chat_links l
		JOIN chat_members cm ON cm.chat_id = l.chat_id
		WHERE l.canvas_id = $1 AND l.deleted_at IS NULL`, canvasID)
	if err != nil {
		s.logger.Warnf("realtime.canvas", "resolve Canvas event audience failed canvas_id=%s error=%v", canvasID, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			s.logger.Warnf("realtime.canvas", "read Canvas event audience failed canvas_id=%s error=%v", canvasID, err)
			return
		}
		_ = s.sockets.To("user:"+userID).Emit(event, payload)
	}
	if err := rows.Err(); err != nil {
		s.logger.Warnf("realtime.canvas", "iterate Canvas event audience failed canvas_id=%s error=%v", canvasID, err)
	}
}

func (s *Server) registerCanvasSocketHandlers(socket *socketio.Socket, user userPublic) {
	socket.On("canvas:join", func(event *socketio.EventPayload) {
		var payload struct {
			CanvasID string `json:"canvasId"`
		}
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
			return
		}
		if _, err := s.getCanvasForUser(context.Background(), payload.CanvasID, user); err != nil {
			_ = socket.Emit("canvas:error", map[string]string{"canvasId": payload.CanvasID, "message": "Canvas unavailable"})
			return
		}
	})
	socket.On("canvas:update", func(event *socketio.EventPayload) {
		var payload struct {
			CanvasID string `json:"canvasId"`
			Update   string `json:"update"`
		}
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
			return
		}
		item, err := s.appendCanvasUpdate(context.Background(), payload.CanvasID, user, payload.Update)
		if err != nil {
			_ = socket.Emit("canvas:error", map[string]string{"canvasId": payload.CanvasID, "message": "Canvas update was rejected"})
			return
		}
		s.emitCanvasToAuthorizedUsers(context.Background(), payload.CanvasID, "canvas:update", map[string]any{"canvasId": payload.CanvasID, "update": item.Update, "sequence": item.Sequence, "createdBy": item.CreatedBy})
	})
	socket.On("canvas:presence", func(event *socketio.EventPayload) {
		var payload struct {
			CanvasID string `json:"canvasId"`
			State    any    `json:"state"`
		}
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
			return
		}
		if _, err := s.getCanvasForUser(context.Background(), payload.CanvasID, user); err != nil {
			return
		}
		s.emitCanvasToAuthorizedUsers(context.Background(), payload.CanvasID, "canvas:presence", map[string]any{"canvasId": payload.CanvasID, "userId": user.ID, "displayName": user.DisplayName, "state": payload.State})
	})
}
