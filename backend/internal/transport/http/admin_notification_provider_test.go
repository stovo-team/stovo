package http

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	featureadministration "stovo-messenger/backend/internal/features/administration"
)

func TestAdminNotificationProviderGetRequiresAdminAndReturnsSelectedProvider(t *testing.T) {
	handler := NewAdminNotificationProviderHandler(NotificationProviderOperations{
		IsAdmin: func(actor AdminActor) bool { return actor.Role == "owner" },
		Get:     func(context.Context) (string, error) { return "ntfy", nil },
	})
	recorder := httptest.NewRecorder()
	handler.Get(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/notification-provider", nil), AdminActor{Role: "member"})
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("member status = %d, want forbidden", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	handler.Get(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/notification-provider", nil), AdminActor{Role: "owner"})
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"notificationProvider":"ntfy"`) {
		t.Fatalf("owner response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminNotificationProviderUpdateRejectsBadBodyAndReturnsSavedSetting(t *testing.T) {
	var saved string
	handler := NewAdminNotificationProviderHandler(NotificationProviderOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Set:     func(_ context.Context, value string) (string, error) { saved = value; return value, nil },
	})
	recorder := httptest.NewRecorder()
	handler.Update(recorder, httptest.NewRequest(http.MethodPut, "/api/admin/notification-provider", strings.NewReader("{")), AdminActor{})
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("malformed body status = %d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	handler.Update(recorder, httptest.NewRequest(http.MethodPut, "/api/admin/notification-provider", strings.NewReader(`{"notificationProvider":"ntfy"}`)), AdminActor{})
	if recorder.Code != http.StatusOK || saved != "ntfy" || !strings.Contains(recorder.Body.String(), `"notificationProvider":"ntfy"`) {
		t.Fatalf("update response = %d %s; saved %q", recorder.Code, recorder.Body.String(), saved)
	}
}

func TestAdminNotificationProviderUpdateDistinguishesValidationFromStorageErrors(t *testing.T) {
	request := func(handler AdminNotificationProviderHandler) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		handler.Update(recorder, httptest.NewRequest(http.MethodPut, "/api/admin/notification-provider", strings.NewReader(`{"notificationProvider":"unsupported"}`)), AdminActor{})
		return recorder
	}

	validationHandler := NewAdminNotificationProviderHandler(NotificationProviderOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Set: func(context.Context, string) (string, error) {
			return "", featureadministration.ErrUnsupportedNotificationProvider
		},
	})
	if recorder := request(validationHandler); recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unsupported provider status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}

	storageHandler := NewAdminNotificationProviderHandler(NotificationProviderOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Set: func(context.Context, string) (string, error) {
			return "", errors.New("database unavailable")
		},
	})
	if recorder := request(storageHandler); recorder.Code != http.StatusInternalServerError {
		t.Fatalf("storage failure status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
}
