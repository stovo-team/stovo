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
	CanvasID      string `json:"canvasId"`
	ChatID        string `json:"chatId"`
	Title         string `json:"title"`
	InitialUpdate string `json:"initialUpdate"`
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
	if s.canvasPersistence() == nil || s.plugins == nil {
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

func (s *Server) getCanvasForUser(ctx context.Context, canvasID string, user userPublic) (canvasPublic, error) {
	if s.canvasPersistence() == nil {
		return canvasPublic{}, errNotFound
	}
	canvasID = strings.TrimSpace(canvasID)
	stored, err := s.canvasPersistence().Get(ctx, canvasID, user.FamilyID, user.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return canvasPublic{}, errNotFound
	}
	if err != nil {
		return canvasPublic{}, err
	}
	canvas := canvasPublic{ID: stored.ID, FamilyID: stored.FamilyID, OriginChatID: stored.OriginChatID, CreatedBy: stored.CreatedBy, Title: stored.Title, LinkedChatIDs: stored.LinkedChatIDs, CreatedAt: stored.CreatedAt, UpdatedAt: stored.UpdatedAt}
	canvas.CanManage = canvas.CreatedBy == user.ID || user.Role == "admin"
	return canvas, nil
}

func (s *Server) listCanvasesForChat(ctx context.Context, chatID string, user userPublic) ([]canvasPublic, error) {
	ids, err := s.canvasPersistence().ListChatCanvasIDs(ctx, chatID)
	if err != nil {
		return nil, err
	}
	result := []canvasPublic{}
	for _, id := range ids {
		canvas, err := s.getCanvasForUser(ctx, id, user)
		if err == nil {
			result = append(result, canvas)
		}
	}
	return result, nil
}

// listCanvasesForUser exposes Canvas as a first-class Storage item while
// retaining chat-link permissions as the access boundary.
func (s *Server) listCanvasesForUser(ctx context.Context, user userPublic) ([]canvasPublic, error) {
	ids, err := s.canvasPersistence().ListFamilyCanvasIDs(ctx, user.FamilyID, user.ID)
	if err != nil {
		return nil, err
	}
	result := []canvasPublic{}
	for _, id := range ids {
		canvas, err := s.getCanvasForUser(ctx, id, user)
		if err == nil {
			result = append(result, canvas)
		}
	}
	return result, nil
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
	if err := s.canvasPersistence().Rename(ctx, canvasID, title); err != nil {
		return canvasPublic{}, err
	}
	return s.getCanvasForUser(ctx, canvasID, user)
}

func (s *Server) deleteCanvas(ctx context.Context, canvasID string, user userPublic) error {
	if _, err := s.requireCanvasManager(ctx, canvasID, user); err != nil {
		return err
	}
	return s.canvasPersistence().Delete(ctx, canvasID)
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
	active, err := s.canvasPersistence().HasActiveLink(ctx, canvasID, chat.ID)
	if err != nil {
		return canvasPublic{}, err
	}
	if active {
		return canvas, nil
	}
	if err := s.canvasPersistence().Link(ctx, canvasID, chat.ID, user.ID); err != nil {
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
	count, err := s.canvasPersistence().Unlink(ctx, canvasID, chatID)
	if err != nil {
		return err
	}
	if count == 0 {
		return errNotFound
	}
	return nil
}

func (s *Server) canvasCardForMessage(ctx context.Context, messageID, viewerID string) *canvasCardPublic {
	if s.canvasPersistence() == nil {
		return nil
	}
	stored, err := s.canvasPersistence().CardForMessage(ctx, messageID, viewerID)
	if err != nil || !stored.Available {
		return &canvasCardPublic{Available: false}
	}
	return &canvasCardPublic{ID: stored.ID, Title: stored.Title, Available: stored.Available}
}

func (s *Server) canvasUpdates(ctx context.Context, canvasID string) ([]canvasUpdatePublic, error) {
	storedUpdates, err := s.canvasPersistence().Updates(ctx, canvasID)
	if err != nil {
		return nil, err
	}
	updates := []canvasUpdatePublic{}
	for _, stored := range storedUpdates {
		plain, err := s.decryptServerAtRest(stored.FamilyID, stored.Ciphertext, stored.Nonce)
		if err != nil {
			return nil, fmt.Errorf("decrypt Canvas update: %w", err)
		}
		updates = append(updates, canvasUpdatePublic{Sequence: stored.Sequence, Update: *plain, CreatedBy: stored.CreatedBy, CreatedAt: stored.CreatedAt})
	}
	return updates, nil
}

func (s *Server) appendCanvasUpdate(ctx context.Context, canvasID string, user userPublic, update string) (canvasUpdatePublic, error) {
	if _, err := s.getCanvasForUser(ctx, canvasID, user); err != nil {
		return canvasUpdatePublic{}, err
	}
	decoded, err := decodeCanvasUpdate(update)
	if err != nil {
		return canvasUpdatePublic{}, err
	}
	return s.saveCanvasUpdate(ctx, canvasID, user, update, decoded)
}

func (s *Server) saveCanvasUpdate(ctx context.Context, canvasID string, user userPublic, update string, decoded []byte) (canvasUpdatePublic, error) {
	if len(decoded) == 0 || len(decoded) > maxCanvasUpdateBytes {
		return canvasUpdatePublic{}, errBadRequest
	}
	ciphertext, nonce, err := s.encryptServerAtRest(user.FamilyID, update)
	if err != nil {
		return canvasUpdatePublic{}, err
	}
	item := canvasUpdatePublic{Update: update, CreatedBy: user.ID}
	item.Sequence, item.CreatedAt, err = s.canvasPersistence().SaveUpdate(ctx, canvasID, ciphertext, nonce, user.ID)
	return item, err
}

func decodeCanvasUpdate(update string) ([]byte, error) {
	if len(update) > base64.StdEncoding.EncodedLen(maxCanvasUpdateBytes) {
		return nil, errBadRequest
	}
	decoded, err := base64.StdEncoding.DecodeString(update)
	// Excalidraw serializes a complete element while it is being drawn. A
	// detailed stroke can therefore exceed the small limit intended for text
	// updates, even though it is a valid document update.
	if err != nil || len(decoded) == 0 || len(decoded) > maxCanvasUpdateBytes {
		return nil, errBadRequest
	}
	return decoded, nil
}

// emitCanvasToAuthorizedUsers resolves the recipients for every Canvas event.
// That prevents a socket which was previously joined from receiving more data
// after its user loses access to every chat linked to the Canvas.
func (s *Server) emitCanvasToAuthorizedUsers(ctx context.Context, canvasID, event string, payload any) {
	if s.canvasPersistence() == nil || s.sockets == nil {
		return
	}
	userIDs, err := s.canvasPersistence().Audience(ctx, canvasID)
	if err != nil {
		s.logger.Warnf("realtime.canvas", "resolve Canvas event audience failed canvas_id=%s error=%v", canvasID, err)
		return
	}
	for _, userID := range userIDs {
		_ = s.sockets.To("user:"+userID).Emit(event, payload)
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
