package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// ChatCreateRequest and ChatUpdateRequest are owned by the HTTP edge. They
// intentionally contain no application, persistence, or framework values.
type ChatCreateRequest struct {
	UserID    string   `json:"userId"`
	Title     string   `json:"title"`
	MemberIDs []string `json:"memberIds"`
}

type ChatUpdateRequest struct {
	Title               *string `json:"title"`
	Description         *string `json:"description"`
	MediaVisibility     *string `json:"mediaVisibility"`
	ChatPhotoFileID     *string `json:"chatPhotoFileId"`
	CommentsEnabled     *bool   `json:"commentsEnabled"`
	PinPermission       *string `json:"pinPermission"`
	MessageDelaySeconds *int    `json:"messageDelaySeconds"`
	AvatarMode          *string `json:"avatarMode"`
	AvatarSymbolID      *string `json:"avatarSymbolId"`
	AvatarColorID       *string `json:"avatarColorId"`
}

type ChatPreferencesRequest struct {
	IsMuted              *bool      `json:"isMuted"`
	MutedUntil           *time.Time `json:"mutedUntil"`
	ClearMutedUntil      bool       `json:"clearMutedUntil"`
	QuietHoursEnabled    *bool      `json:"quietHoursEnabled"`
	QuietHoursStart      *string    `json:"quietHoursStart"`
	QuietHoursEnd        *string    `json:"quietHoursEnd"`
	NotificationMode     *string    `json:"notificationMode"`
	NotifySenderIDs      *[]string  `json:"notifySenderIds"`
	AlwaysNotifyMentions *bool      `json:"alwaysNotifyMentions"`
	IsPinned             *bool      `json:"isPinned"`
	IsFavorite           *bool      `json:"isFavorite"`
	WallpaperFileID      *string    `json:"wallpaperFileId"`
}

// ChatMutationOperations is the transport-to-use-case seam. The transport
// owns decoding, URL extraction and response serialization; the supplied
// operations own authorization and feature policy.
type ChatMutationOperations struct {
	Create      func(context.Context, string, ChatCreateRequest) (any, int, error)
	Update      func(context.Context, string, ChatUpdateRequest) (any, int, error)
	AddMembers  func(context.Context, string, []string) (any, int, error)
	Preferences func(context.Context, string, ChatPreferencesRequest) (any, int, error)
	StatusFor   func(error) int
	DetailFor   func(error) string
}

type ChatMutationHandler struct{ operations ChatMutationOperations }

func NewChatMutationHandler(operations ChatMutationOperations) ChatMutationHandler {
	return ChatMutationHandler{operations: operations}
}

func (h ChatMutationHandler) Create(kind string) stdhttp.HandlerFunc {
	return func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		var request ChatCreateRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeChatMutationError(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
			return
		}
		request.UserID, request.Title = strings.TrimSpace(request.UserID), strings.TrimSpace(request.Title)
		value, status, err := h.operations.Create(r.Context(), kind, request)
		if err != nil {
			writeChatMutationError(w, h.status(err), h.detail(err))
			return
		}
		if status == 0 {
			status = stdhttp.StatusCreated
		}
		writeChatMutationValue(w, status, value)
	}
}

func (h ChatMutationHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request ChatUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeChatMutationError(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if request.Title != nil {
		value := strings.TrimSpace(*request.Title)
		request.Title = &value
	}
	for _, value := range []*string{request.AvatarMode, request.AvatarSymbolID, request.AvatarColorID} {
		if value != nil {
			trimmed := strings.TrimSpace(*value)
			*value = trimmed
		}
	}
	if request.AvatarMode != nil && *request.AvatarMode == "" { request.AvatarMode = nil }
	if request.AvatarSymbolID != nil && *request.AvatarSymbolID == "" { request.AvatarSymbolID = nil }
	if request.AvatarColorID != nil && *request.AvatarColorID == "" { request.AvatarColorID = nil }
	if detail := avatarValidationDetail(request.AvatarMode, request.AvatarSymbolID, request.AvatarColorID); detail != "" {
		writeChatMutationError(w, stdhttp.StatusUnprocessableEntity, detail)
		return
	}
	value, status, err := h.operations.Update(r.Context(), chi.URLParam(r, "chatId"), request)
	if err != nil {
		writeChatMutationError(w, h.status(err), h.detail(err))
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeChatMutationValue(w, status, value)
}

func (h ChatMutationHandler) AddMembers(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request struct {
		UserIDs []string `json:"userIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || len(request.UserIDs) == 0 {
		writeChatMutationError(w, stdhttp.StatusUnprocessableEntity, "userIds are required")
		return
	}
	value, status, err := h.operations.AddMembers(r.Context(), chi.URLParam(r, "chatId"), request.UserIDs)
	if err != nil {
		writeChatMutationError(w, h.status(err), h.detail(err))
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeChatMutationValue(w, status, value)
}

func (h ChatMutationHandler) UpdatePreferences(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request ChatPreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeChatMutationError(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	value, status, err := h.operations.Preferences(r.Context(), chi.URLParam(r, "chatId"), request)
	if err != nil {
		writeChatMutationError(w, h.status(err), h.detail(err))
		return
	}
	if status == 0 {
		status = stdhttp.StatusOK
	}
	writeChatMutationValue(w, status, value)
}

func (h ChatMutationHandler) status(err error) int {
	if h.operations.StatusFor != nil {
		return h.operations.StatusFor(err)
	}
	return stdhttp.StatusInternalServerError
}
func (h ChatMutationHandler) detail(err error) string {
	if h.operations.DetailFor != nil {
		return h.operations.DetailFor(err)
	}
	return err.Error()
}
func writeChatMutationValue(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeChatMutationError(w stdhttp.ResponseWriter, status int, detail string) {
	writeChatMutationValue(w, status, map[string]string{"detail": detail})
}
