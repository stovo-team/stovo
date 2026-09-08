package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	socketio "github.com/doquangtan/socketio/v4"
)

const (
	checklistPluginID = "plugin-checklist"
)

type createChecklistItemInput struct {
	Text    string  `json:"text"`
	Section *string `json:"section,omitempty"`
}

type createChecklistRequest struct {
	ChatID   string                     `json:"chatId"`
	Title    string                     `json:"title"`
	Category string                     `json:"category"`
	Items    []createChecklistItemInput `json:"items,omitempty"`
}

type updateChecklistRequest struct {
	Title    *string `json:"title,omitempty"`
	Category *string `json:"category,omitempty"`
}

type updateChecklistItemRequest struct {
	Text      *string `json:"text,omitempty"`
	Completed *bool   `json:"completed,omitempty"`
	Section   *string `json:"section,omitempty"`
	Position  *int    `json:"position,omitempty"`
}

type batchSyncChecklistItemsRequest struct {
	Items []batchChecklistItemInput `json:"items"`
}

type batchChecklistItemInput struct {
	ID        *string `json:"id,omitempty"`
	Text      string  `json:"text"`
	Completed bool    `json:"completed"`
	Position  int     `json:"position"`
	Section   *string `json:"section,omitempty"`
}

type linkChecklistRequest struct {
	ChatID string `json:"chatId"`
}

func (s *Server) checklistDB() *sql.DB {
	return s.canvasDB
}

func (s *Server) checklistPluginEnabled() bool {
	if s.checklistDB() == nil || s.plugins == nil {
		return false
	}
	p, ok := s.plugins.Get(checklistPluginID)
	if !ok {
		return false
	}
	if configurable, ok := p.(interface{ Enabled() bool }); ok {
		return configurable.Enabled()
	}
	return true
}

func (s *Server) checklistUnavailable(w http.ResponseWriter) bool {
	if s.checklistPluginEnabled() {
		return false
	}
	s.detail(w, http.StatusNotFound, "Checklists are unavailable")
	return true
}

func (s *Server) checklistRoutes() http.Handler {
	r := chi.NewRouter()

	r.Get("/chats/{chatId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		chatID := chi.URLParam(r, "chatId")
		if _, err := s.buildChatPublic(chatID, user); err != nil {
			s.detail(w, http.StatusNotFound, "Chat not found")
			return
		}
		items, err := s.listChecklistsForChat(r.Context(), chatID, user)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load checklists")
			return
		}
		s.json(w, http.StatusOK, items)
	}))

	r.Get("/checklists", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		items, err := s.listChecklistsForUser(r.Context(), user)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load checklists")
			return
		}
		s.json(w, http.StatusOK, items)
	}))

	r.Post("/checklists", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var request createChecklistRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist request")
			return
		}
		checklist, err := s.createChecklist(r.Context(), user, request)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.json(w, http.StatusCreated, checklist)
	}))

	r.Get("/checklists/{checklistId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		checklist, err := s.getChecklistForUser(r.Context(), chi.URLParam(r, "checklistId"), user)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.json(w, http.StatusOK, checklist)
	}))

	r.Patch("/checklists/{checklistId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var request updateChecklistRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist request")
			return
		}
		checklist, err := s.updateChecklist(r.Context(), chi.URLParam(r, "checklistId"), user, request)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.json(w, http.StatusOK, checklist)
	}))

	r.Delete("/checklists/{checklistId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		if err := s.deleteChecklist(r.Context(), chi.URLParam(r, "checklistId"), user); err != nil {
			s.checklistError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	r.Post("/checklists/{checklistId}/items", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var itemInput createChecklistItemInput
		if err := s.decodeJSON(r, &itemInput); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist item request")
			return
		}
		item, checklist, err := s.addChecklistItem(r.Context(), chi.URLParam(r, "checklistId"), user, itemInput)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.emitChecklistUpdated(r.Context(), checklist)
		s.json(w, http.StatusCreated, item)
	}))

	r.Post("/checklists/{checklistId}/items/{itemId}/toggle", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		item, checklist, err := s.toggleChecklistItem(r.Context(), chi.URLParam(r, "checklistId"), chi.URLParam(r, "itemId"), user)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.emitChecklistUpdated(r.Context(), checklist)
		s.json(w, http.StatusOK, item)
	}))

	r.Patch("/checklists/{checklistId}/items/{itemId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var updateReq updateChecklistItemRequest
		if err := s.decodeJSON(r, &updateReq); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist item request")
			return
		}
		item, checklist, err := s.updateChecklistItem(r.Context(), chi.URLParam(r, "checklistId"), chi.URLParam(r, "itemId"), user, updateReq)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.emitChecklistUpdated(r.Context(), checklist)
		s.json(w, http.StatusOK, item)
	}))

	r.Delete("/checklists/{checklistId}/items/{itemId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		checklist, err := s.deleteChecklistItem(r.Context(), chi.URLParam(r, "checklistId"), chi.URLParam(r, "itemId"), user)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.emitChecklistUpdated(r.Context(), checklist)
		w.WriteHeader(http.StatusNoContent)
	}))

	r.Put("/checklists/{checklistId}/items", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var batchReq batchSyncChecklistItemsRequest
		if err := s.decodeJSON(r, &batchReq); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist items request")
			return
		}
		checklist, err := s.batchSyncChecklistItems(r.Context(), chi.URLParam(r, "checklistId"), user, batchReq.Items)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.emitChecklistUpdated(r.Context(), checklist)
		s.json(w, http.StatusOK, checklist)
	}))

	r.Post("/checklists/{checklistId}/links", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		var request linkChecklistRequest
		if err := s.decodeJSON(r, &request); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid Checklist link")
			return
		}
		checklist, err := s.linkChecklist(r.Context(), chi.URLParam(r, "checklistId"), request.ChatID, user)
		if err != nil {
			s.checklistError(w, err)
			return
		}
		s.json(w, http.StatusOK, checklist)
	}))

	r.Delete("/checklists/{checklistId}/links/{chatId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
		if s.checklistUnavailable(w) {
			return
		}
		if err := s.unlinkChecklist(r.Context(), chi.URLParam(r, "checklistId"), chi.URLParam(r, "chatId"), user); err != nil {
			s.checklistError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	return r
}

func (s *Server) checklistError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotFound):
		s.detail(w, http.StatusNotFound, "Checklist not found")
	case errors.Is(err, errForbidden):
		s.detail(w, http.StatusForbidden, "You cannot manage this Checklist")
	case errors.Is(err, errBadRequest):
		s.detail(w, http.StatusBadRequest, "Invalid Checklist request")
	default:
		s.detail(w, http.StatusInternalServerError, "Checklist operation failed")
	}
}

func (s *Server) createChecklist(ctx context.Context, user userPublic, request createChecklistRequest) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	chatID := strings.TrimSpace(request.ChatID)
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return checklistPublic{}, errNotFound
	}
	title := strings.TrimSpace(request.Title)
	if title == "" {
		switch request.Category {
		case "grocery":
			title = "Grocery list"
		case "errand":
			title = "Errands"
		default:
			title = "Untitled checklist"
		}
	}
	if len(title) > 160 {
		return checklistPublic{}, errBadRequest
	}
	category := strings.ToLower(strings.TrimSpace(request.Category))
	if category == "grocery" || category == "groceries" {
		category = "groceries"
	} else if category == "errand" || category == "errands" {
		category = "errands"
	} else {
		category = "general"
	}

	id := uuid.NewString()
	if _, err := db.ExecContext(ctx, `INSERT INTO checklists (id,family_id,origin_chat_id,created_by,title,category) VALUES ($1,$2,$3,$4,$5,$6)`, id, user.FamilyID, chat.ID, user.ID, title, category); err != nil {
		return checklistPublic{}, err
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO checklist_chat_links (checklist_id,chat_id,created_by) VALUES ($1,$2,$3)`, id, chat.ID, user.ID); err != nil {
		return checklistPublic{}, err
	}

	// Insert any initial items
	for i, item := range request.Items {
		itemText := strings.TrimSpace(item.Text)
		if itemText == "" {
			continue
		}
		if len(itemText) > 280 {
			itemText = itemText[:280]
		}
		var section *string
		if item.Section != nil && strings.TrimSpace(*item.Section) != "" {
			sTrim := strings.TrimSpace(*item.Section)
			section = &sTrim
		}
		itemID := uuid.NewString()
		_, _ = db.ExecContext(ctx, `INSERT INTO checklist_items (id,checklist_id,text,position,section,created_by) VALUES ($1,$2,$3,$4,$5,$6)`, itemID, id, itemText, i, section, user.ID)
	}

	if err := s.createChecklistCard(ctx, id, title, category, chat, user); err != nil {
		return checklistPublic{}, err
	}
	return s.getChecklistForUser(ctx, id, user)
}

func (s *Server) createChecklistCard(ctx context.Context, checklistID, title, category string, chat chatPublic, user userPublic) error {
	db := s.checklistDB()
	if db == nil {
		return errNotFound
	}
	content := "checklist:" + checklistID + "\n" + title
	message, replayed, err := s.createRESTMessageWithSync(ctx, user, chat.ID, sendMessageRequest{Type: "checklist", Content: &content}, "")
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO checklist_cards (message_id,checklist_id) VALUES ($1,$2) ON CONFLICT (message_id) DO NOTHING`, message.ID, checklistID); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `UPDATE checklist_chat_links SET card_message_id=$3 WHERE checklist_id=$1 AND chat_id=$2`, checklistID, chat.ID, message.ID); err != nil {
		return err
	}
	if !replayed {
		s.notifyCreatedRESTMessage(chat, user, message, sendMessageRequest{Type: "checklist", Content: &content})
	}
	return nil
}

func (s *Server) getChecklistForUser(ctx context.Context, checklistID string, user userPublic) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	checklistID = strings.TrimSpace(checklistID)
	var checklist checklistPublic
	err := db.QueryRowContext(ctx, `
		SELECT c.id,c.family_id,c.origin_chat_id,c.created_by,c.title,c.category,c.created_at,c.updated_at
		FROM checklists c WHERE c.id=$1 AND c.family_id=$2 AND c.deleted_at IS NULL
		AND (c.created_by=$3 OR EXISTS (SELECT 1 FROM checklist_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.checklist_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$3))`, checklistID, user.FamilyID, user.ID).
		Scan(&checklist.ID, &checklist.FamilyID, &checklist.OriginChatID, &checklist.CreatedBy, &checklist.Title, &checklist.Category, &checklist.CreatedAt, &checklist.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return checklistPublic{}, errNotFound
	}
	if err != nil {
		return checklistPublic{}, err
	}

	rows, err := db.QueryContext(ctx, `SELECT chat_id FROM checklist_chat_links WHERE checklist_id=$1 AND deleted_at IS NULL ORDER BY created_at`, checklist.ID)
	if err != nil {
		return checklistPublic{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			return checklistPublic{}, err
		}
		checklist.LinkedChatIDs = append(checklist.LinkedChatIDs, chatID)
	}

	checklist.Items, err = s.loadChecklistItems(ctx, checklist.ID)
	if err != nil {
		return checklistPublic{}, err
	}
	checklist.TotalItems = len(checklist.Items)
	for _, item := range checklist.Items {
		if item.Completed {
			checklist.CompletedItems++
		}
	}
	checklist.CanManage = checklist.CreatedBy == user.ID || user.Role == "admin" || user.Role == "owner"
	return checklist, rows.Err()
}

func (s *Server) loadChecklistItems(ctx context.Context, checklistID string) ([]checklistItemPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return []checklistItemPublic{}, nil
	}
	rows, err := db.QueryContext(ctx, `
		SELECT id,checklist_id,text,completed,position,section,created_by,completed_by,created_at,updated_at,completed_at
		FROM checklist_items WHERE checklist_id=$1 ORDER BY position ASC, created_at ASC`, checklistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []checklistItemPublic{}
	for rows.Next() {
		var item checklistItemPublic
		var section sql.NullString
		var completedBy sql.NullString
		var completedAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.ChecklistID, &item.Text, &item.Completed, &item.Position, &section, &item.CreatedBy, &completedBy, &item.CreatedAt, &item.UpdatedAt, &completedAt); err != nil {
			return nil, err
		}
		if section.Valid {
			item.Section = &section.String
		}
		if completedBy.Valid {
			item.CompletedBy = &completedBy.String
		}
		if completedAt.Valid {
			item.CompletedAt = &completedAt.Time
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listChecklistsForChat(ctx context.Context, chatID string, user userPublic) ([]checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return nil, errNotFound
	}
	rows, err := db.QueryContext(ctx, `SELECT checklist_id FROM checklist_chat_links WHERE chat_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []checklistPublic{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		checklist, err := s.getChecklistForUser(ctx, id, user)
		if err == nil {
			result = append(result, checklist)
		}
	}
	return result, rows.Err()
}

func (s *Server) listChecklistsForUser(ctx context.Context, user userPublic) ([]checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return nil, errNotFound
	}
	rows, err := db.QueryContext(ctx, `
		SELECT c.id
		FROM checklists c
		WHERE c.family_id=$1 AND c.deleted_at IS NULL
		AND (
			c.created_by=$2
			OR EXISTS (
				SELECT 1
				FROM checklist_chat_links l
				JOIN chat_members cm ON cm.chat_id=l.chat_id
				WHERE l.checklist_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2
			)
		)
		ORDER BY c.updated_at DESC`, user.FamilyID, user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []checklistPublic{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		checklist, err := s.getChecklistForUser(ctx, id, user)
		if err == nil {
			result = append(result, checklist)
		}
	}
	return result, rows.Err()
}

func (s *Server) updateChecklist(ctx context.Context, checklistID string, user userPublic, req updateChecklistRequest) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	checklist, err := s.getChecklistForUser(ctx, checklistID, user)
	if err != nil {
		return checklistPublic{}, err
	}
	if !checklist.CanManage {
		return checklistPublic{}, errForbidden
	}

	title := checklist.Title
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t != "" {
			if len(t) > 160 {
				return checklistPublic{}, errBadRequest
			}
			title = t
		}
	}
	category := checklist.Category
	if req.Category != nil {
		c := strings.ToLower(strings.TrimSpace(*req.Category))
		if c == "grocery" || c == "groceries" {
			category = "groceries"
		} else if c == "errand" || c == "errands" {
			category = "errands"
		} else if c == "general" {
			category = "general"
		}
	}

	if _, err := db.ExecContext(ctx, `UPDATE checklists SET title=$2,category=$3,updated_at=now() WHERE id=$1`, checklistID, title, category); err != nil {
		return checklistPublic{}, err
	}
	updated, err := s.getChecklistForUser(ctx, checklistID, user)
	if err == nil {
		s.emitChecklistUpdated(ctx, updated)
	}
	return updated, err
}

func (s *Server) deleteChecklist(ctx context.Context, checklistID string, user userPublic) error {
	db := s.checklistDB()
	if db == nil {
		return errNotFound
	}
	checklist, err := s.getChecklistForUser(ctx, checklistID, user)
	if err != nil {
		return err
	}
	if !checklist.CanManage {
		return errForbidden
	}
	_, err = db.ExecContext(ctx, `UPDATE checklists SET deleted_at=now(),updated_at=now() WHERE id=$1`, checklistID)
	return err
}

func (s *Server) addChecklistItem(ctx context.Context, checklistID string, user userPublic, req createChecklistItemInput) (checklistItemPublic, checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistItemPublic{}, checklistPublic{}, errNotFound
	}
	if _, err := s.getChecklistForUser(ctx, checklistID, user); err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		return checklistItemPublic{}, checklistPublic{}, errBadRequest
	}
	if len(text) > 280 {
		text = text[:280]
	}
	var section *string
	if req.Section != nil && strings.TrimSpace(*req.Section) != "" {
		sTrim := strings.TrimSpace(*req.Section)
		section = &sTrim
	}

	var maxPos int
	_ = db.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), -1) FROM checklist_items WHERE checklist_id=$1`, checklistID).Scan(&maxPos)
	newPos := maxPos + 1

	itemID := uuid.NewString()
	var item checklistItemPublic
	var sCol sql.NullString
	err := db.QueryRowContext(ctx, `
		INSERT INTO checklist_items (id,checklist_id,text,position,section,created_by)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id,checklist_id,text,completed,position,section,created_by,created_at,updated_at`,
		itemID, checklistID, text, newPos, section, user.ID).
		Scan(&item.ID, &item.ChecklistID, &item.Text, &item.Completed, &item.Position, &sCol, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}
	if sCol.Valid {
		item.Section = &sCol.String
	}

	_, _ = db.ExecContext(ctx, `UPDATE checklists SET updated_at=now() WHERE id=$1`, checklistID)
	updatedChecklist, _ := s.getChecklistForUser(ctx, checklistID, user)
	return item, updatedChecklist, nil
}

func (s *Server) toggleChecklistItem(ctx context.Context, checklistID, itemID string, user userPublic) (checklistItemPublic, checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistItemPublic{}, checklistPublic{}, errNotFound
	}
	if _, err := s.getChecklistForUser(ctx, checklistID, user); err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	var currentCompleted bool
	err := db.QueryRowContext(ctx, `SELECT completed FROM checklist_items WHERE id=$1 AND checklist_id=$2`, itemID, checklistID).Scan(&currentCompleted)
	if errors.Is(err, sql.ErrNoRows) {
		return checklistItemPublic{}, checklistPublic{}, errNotFound
	}
	if err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	newCompleted := !currentCompleted
	var completedBy *string
	if newCompleted {
		completedBy = &user.ID
	}

	var item checklistItemPublic
	var sCol sql.NullString
	var compByCol sql.NullString
	var compAtCol sql.NullTime

	err = db.QueryRowContext(ctx, `
		UPDATE checklist_items
		SET completed=$3, completed_by=$4, completed_at=CASE WHEN $3 THEN now() ELSE NULL END, updated_at=now()
		WHERE id=$1 AND checklist_id=$2
		RETURNING id,checklist_id,text,completed,position,section,created_by,completed_by,created_at,updated_at,completed_at`,
		itemID, checklistID, newCompleted, completedBy).
		Scan(&item.ID, &item.ChecklistID, &item.Text, &item.Completed, &item.Position, &sCol, &item.CreatedBy, &compByCol, &item.CreatedAt, &item.UpdatedAt, &compAtCol)
	if err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}
	if sCol.Valid {
		item.Section = &sCol.String
	}
	if compByCol.Valid {
		item.CompletedBy = &compByCol.String
	}
	if compAtCol.Valid {
		item.CompletedAt = &compAtCol.Time
	}

	_, _ = db.ExecContext(ctx, `UPDATE checklists SET updated_at=now() WHERE id=$1`, checklistID)
	updatedChecklist, _ := s.getChecklistForUser(ctx, checklistID, user)
	return item, updatedChecklist, nil
}

func (s *Server) updateChecklistItem(ctx context.Context, checklistID, itemID string, user userPublic, req updateChecklistItemRequest) (checklistItemPublic, checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistItemPublic{}, checklistPublic{}, errNotFound
	}
	if _, err := s.getChecklistForUser(ctx, checklistID, user); err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	var item checklistItemPublic
	var sCol sql.NullString
	var compByCol sql.NullString
	var compAtCol sql.NullTime

	err := db.QueryRowContext(ctx, `SELECT id,checklist_id,text,completed,position,section,created_by,completed_by,created_at,updated_at,completed_at FROM checklist_items WHERE id=$1 AND checklist_id=$2`, itemID, checklistID).
		Scan(&item.ID, &item.ChecklistID, &item.Text, &item.Completed, &item.Position, &sCol, &item.CreatedBy, &compByCol, &item.CreatedAt, &item.UpdatedAt, &compAtCol)
	if errors.Is(err, sql.ErrNoRows) {
		return checklistItemPublic{}, checklistPublic{}, errNotFound
	}
	if err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	if req.Text != nil {
		t := strings.TrimSpace(*req.Text)
		if t == "" {
			return checklistItemPublic{}, checklistPublic{}, errBadRequest
		}
		if len(t) > 280 {
			t = t[:280]
		}
		item.Text = t
	}
	if req.Completed != nil {
		item.Completed = *req.Completed
		if item.Completed {
			item.CompletedBy = &user.ID
			now := time.Now()
			item.CompletedAt = &now
		} else {
			item.CompletedBy = nil
			item.CompletedAt = nil
		}
	}
	if req.Section != nil {
		sec := strings.TrimSpace(*req.Section)
		if sec == "" {
			item.Section = nil
		} else {
			item.Section = &sec
		}
	}
	if req.Position != nil {
		item.Position = *req.Position
	}

	_, err = db.ExecContext(ctx, `
		UPDATE checklist_items
		SET text=$3, completed=$4, completed_by=$5, completed_at=$6, section=$7, position=$8, updated_at=now()
		WHERE id=$1 AND checklist_id=$2`,
		itemID, checklistID, item.Text, item.Completed, item.CompletedBy, item.CompletedAt, item.Section, item.Position)
	if err != nil {
		return checklistItemPublic{}, checklistPublic{}, err
	}

	_, _ = db.ExecContext(ctx, `UPDATE checklists SET updated_at=now() WHERE id=$1`, checklistID)
	updatedChecklist, _ := s.getChecklistForUser(ctx, checklistID, user)
	return item, updatedChecklist, nil
}

func (s *Server) deleteChecklistItem(ctx context.Context, checklistID, itemID string, user userPublic) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	if _, err := s.getChecklistForUser(ctx, checklistID, user); err != nil {
		return checklistPublic{}, err
	}
	_, err := db.ExecContext(ctx, `DELETE FROM checklist_items WHERE id=$1 AND checklist_id=$2`, itemID, checklistID)
	if err != nil {
		return checklistPublic{}, err
	}
	_, _ = db.ExecContext(ctx, `UPDATE checklists SET updated_at=now() WHERE id=$1`, checklistID)
	return s.getChecklistForUser(ctx, checklistID, user)
}

func (s *Server) batchSyncChecklistItems(ctx context.Context, checklistID string, user userPublic, items []batchChecklistItemInput) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	checklist, err := s.getChecklistForUser(ctx, checklistID, user)
	if err != nil {
		return checklistPublic{}, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return checklistPublic{}, err
	}
	defer tx.Rollback()

	// Load existing items map for preserved IDs and metadata
	existingMap := make(map[string]checklistItemPublic)
	for _, it := range checklist.Items {
		existingMap[it.ID] = it
	}

	// Delete all existing items in tx
	if _, err := tx.ExecContext(ctx, `DELETE FROM checklist_items WHERE checklist_id=$1`, checklistID); err != nil {
		return checklistPublic{}, err
	}

	for i, input := range items {
		text := strings.TrimSpace(input.Text)
		if text == "" {
			continue
		}
		if len(text) > 280 {
			text = text[:280]
		}
		var section *string
		if input.Section != nil && strings.TrimSpace(*input.Section) != "" {
			sTrim := strings.TrimSpace(*input.Section)
			section = &sTrim
		}
		var id string
		if input.ID != nil && *input.ID != "" {
			id = *input.ID
		} else {
			id = uuid.NewString()
		}

		completed := input.Completed
		var completedBy *string
		var completedAt *time.Time
		if completed {
			if existing, ok := existingMap[id]; ok && existing.Completed && existing.CompletedBy != nil {
				completedBy = existing.CompletedBy
				completedAt = existing.CompletedAt
			} else {
				completedBy = &user.ID
				now := time.Now()
				completedAt = &now
			}
		}

		pos := input.Position
		if pos <= 0 {
			pos = i
		}

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO checklist_items (id,checklist_id,text,completed,position,section,created_by,completed_by,completed_at,created_at,updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`,
			id, checklistID, text, completed, pos, section, user.ID, completedBy, completedAt); err != nil {
			return checklistPublic{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, `UPDATE checklists SET updated_at=now() WHERE id=$1`, checklistID); err != nil {
		return checklistPublic{}, err
	}

	if err := tx.Commit(); err != nil {
		return checklistPublic{}, err
	}

	return s.getChecklistForUser(ctx, checklistID, user)
}

func (s *Server) linkChecklist(ctx context.Context, checklistID, chatID string, user userPublic) (checklistPublic, error) {
	db := s.checklistDB()
	if db == nil {
		return checklistPublic{}, errNotFound
	}
	checklist, err := s.getChecklistForUser(ctx, checklistID, user)
	if err != nil {
		return checklistPublic{}, err
	}
	if !checklist.CanManage {
		return checklistPublic{}, errForbidden
	}
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return checklistPublic{}, errNotFound
	}
	var active bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM checklist_chat_links WHERE checklist_id=$1 AND chat_id=$2 AND deleted_at IS NULL)`, checklistID, chat.ID).Scan(&active); err != nil {
		return checklistPublic{}, err
	}
	if active {
		return checklist, nil
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO checklist_chat_links (checklist_id,chat_id,created_by,deleted_at) VALUES ($1,$2,$3,NULL) ON CONFLICT (checklist_id,chat_id) DO UPDATE SET deleted_at=NULL,created_by=EXCLUDED.created_by,card_message_id=NULL,created_at=now()`, checklistID, chat.ID, user.ID); err != nil {
		return checklistPublic{}, err
	}
	if err := s.createChecklistCard(ctx, checklistID, checklist.Title, checklist.Category, chat, user); err != nil {
		return checklistPublic{}, err
	}
	return s.getChecklistForUser(ctx, checklistID, user)
}

func (s *Server) unlinkChecklist(ctx context.Context, checklistID, chatID string, user userPublic) error {
	db := s.checklistDB()
	if db == nil {
		return errNotFound
	}
	checklist, err := s.getChecklistForUser(ctx, checklistID, user)
	if err != nil {
		return err
	}
	if !checklist.CanManage {
		return errForbidden
	}
	result, err := db.ExecContext(ctx, `UPDATE checklist_chat_links SET deleted_at=now() WHERE checklist_id=$1 AND chat_id=$2 AND deleted_at IS NULL`, checklistID, chatID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return errNotFound
	}
	return nil
}

func (s *Server) checklistCardForMessage(ctx context.Context, messageID, viewerID string) *checklistCardPublic {
	db := s.checklistDB()
	if db == nil {
		return nil
	}
	var card checklistCardPublic
	var createdBy string
	err := db.QueryRowContext(ctx, `
		SELECT c.id,c.title,c.category,c.created_by,EXISTS(SELECT 1 FROM checklist_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.checklist_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2)
		FROM checklist_cards cc
		JOIN checklists c ON c.id=cc.checklist_id
		WHERE cc.message_id=$1 AND c.deleted_at IS NULL`, messageID, viewerID).Scan(&card.ID, &card.Title, &card.Category, &createdBy, &card.Available)
	if err != nil || !card.Available {
		return &checklistCardPublic{Available: false}
	}
	card.CanManage = createdBy == viewerID
	items, err := s.loadChecklistItems(ctx, card.ID)
	if err == nil {
		card.Items = items
		card.TotalItems = len(items)
		for _, item := range items {
			if item.Completed {
				card.CompletedItems++
			}
		}
	}
	return &card
}

func (s *Server) emitChecklistUpdated(ctx context.Context, checklist checklistPublic) {
	card := checklistCardPublic{
		ID:             checklist.ID,
		Title:          checklist.Title,
		Category:       checklist.Category,
		Available:      true,
		Items:          checklist.Items,
		TotalItems:     checklist.TotalItems,
		CompletedItems: checklist.CompletedItems,
		CanManage:      checklist.CanManage,
	}

	s.emitChecklistToAuthorizedUsers(ctx, checklist.ID, "checklist.updated", card)
	s.emitChecklistToAuthorizedUsers(ctx, checklist.ID, "checklist:update", checklist)
}

func (s *Server) emitChecklistToAuthorizedUsers(ctx context.Context, checklistID, event string, payload any) {
	db := s.checklistDB()
	if db == nil || s.sockets == nil {
		return
	}
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT cm.user_id
		FROM checklist_chat_links l
		JOIN chat_members cm ON cm.chat_id = l.chat_id
		WHERE l.checklist_id = $1 AND l.deleted_at IS NULL`, checklistID)
	if err != nil {
		s.logger.Warnf("realtime.checklist", "resolve Checklist event audience failed checklist_id=%s error=%v", checklistID, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			s.logger.Warnf("realtime.checklist", "read Checklist event audience failed checklist_id=%s error=%v", checklistID, err)
			return
		}
		_ = s.sockets.To("user:"+userID).Emit(event, payload)
	}
}

func (s *Server) registerChecklistSocketHandlers(socket *socketio.Socket, user userPublic) {
	socket.On("checklist:join", func(event *socketio.EventPayload) {
		var payload struct {
			ChecklistID string `json:"checklistId"`
		}
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
			return
		}
		if _, err := s.getChecklistForUser(context.Background(), payload.ChecklistID, user); err != nil {
			_ = socket.Emit("checklist:error", map[string]string{"checklistId": payload.ChecklistID, "message": "Checklist unavailable"})
			return
		}
	})
	socket.On("checklist:toggle", func(event *socketio.EventPayload) {
		var payload struct {
			ChecklistID string `json:"checklistId"`
			ItemID      string `json:"itemId"`
		}
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
			return
		}
		_, checklist, err := s.toggleChecklistItem(context.Background(), payload.ChecklistID, payload.ItemID, user)
		if err != nil {
			_ = socket.Emit("checklist:error", map[string]string{"checklistId": payload.ChecklistID, "message": "Could not toggle checklist item"})
			return
		}
		s.emitChecklistUpdated(context.Background(), checklist)
	})
}
