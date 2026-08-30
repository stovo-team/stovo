package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminPublicAccessHandlerUpdatePreservesOperationStatus(t *testing.T) {
	h := NewAdminPublicAccessHandler(AdminPublicAccessOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Update: func(context.Context, AdminActor, *string, *string) (any, error) {
			return nil, AdminHTTPError{Status: stdhttp.StatusInternalServerError, Detail: "Could not update public access"}
		},
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(stdhttp.MethodPut, "/api/admin/public-access", strings.NewReader(`{"appUrl":"https://x.test"}`))
	h.Update(recorder, request, AdminActor{Role: "admin"})
	if recorder.Code != stdhttp.StatusInternalServerError {
		t.Fatalf("status=%d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "Could not update public access") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

func TestAdminPublicAccessHandlerGetMapsMissingFamily(t *testing.T) {
	h := NewAdminPublicAccessHandler(AdminPublicAccessOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Get:     func(context.Context, AdminActor) (any, error) { return nil, errors.New("missing") },
	})
	recorder := httptest.NewRecorder()
	h.Get(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/admin/public-access", nil), AdminActor{})
	if recorder.Code != stdhttp.StatusNotFound {
		t.Fatalf("status=%d", recorder.Code)
	}
}
