package http

import (
	"context"
	"encoding/json"
	"errors"
	stdhttp "net/http"

	featureadministration "stovo-messenger/backend/internal/features/administration"
)

type NotificationProviderOperations struct {
	IsAdmin func(AdminActor) bool
	Get     func(context.Context) (string, error)
	Set     func(context.Context, string) (string, error)
}

type AdminNotificationProviderHandler struct {
	operations NotificationProviderOperations
}

func NewAdminNotificationProviderHandler(operations NotificationProviderOperations) AdminNotificationProviderHandler {
	return AdminNotificationProviderHandler{operations: operations}
}

func (h AdminNotificationProviderHandler) Get(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	provider, err := h.operations.Get(r.Context())
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not load notification provider", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, map[string]string{"notificationProvider": provider})
}

func (h AdminNotificationProviderHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	var payload struct {
		NotificationProvider string `json:"notificationProvider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	provider, err := h.operations.Set(r.Context(), payload.NotificationProvider)
	if err != nil {
		if errors.Is(err, featureadministration.ErrUnsupportedNotificationProvider) {
			adminError(w, stdhttp.StatusUnprocessableEntity, "Unsupported notification provider", err)
			return
		}
		adminError(w, stdhttp.StatusInternalServerError, "Could not save notification provider", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, map[string]string{"notificationProvider": provider})
}

func (h AdminNotificationProviderHandler) allowed(w stdhttp.ResponseWriter, actor AdminActor) bool {
	if h.operations.IsAdmin != nil && h.operations.IsAdmin(actor) {
		return true
	}
	writeAdminPublicAccessDetail(w, stdhttp.StatusForbidden, "Administrator access required")
	return false
}
