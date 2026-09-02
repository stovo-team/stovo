package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"stovo-messenger/backend/internal/features/roles"
)

func TestRoleHandlerListLogsStoreError(t *testing.T) {
	wantErr := errors.New("relation server_roles does not exist")
	var gotOperation string
	var gotErr error
	handler := NewRoleHandler(RoleOperations{
		List: func(context.Context, string) ([]roles.Role, error) {
			return nil, wantErr
		},
		LogError: func(operation string, err error) {
			gotOperation, gotErr = operation, err
		},
	})

	recorder := httptest.NewRecorder()
	handler.List(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/family/roles", nil), RoleActor{FamilyID: "family-1"})

	if recorder.Code != stdhttp.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, stdhttp.StatusInternalServerError)
	}
	if gotOperation != "list roles" || !errors.Is(gotErr, wantErr) {
		t.Fatalf("log = (%q, %v), want (%q, %v)", gotOperation, gotErr, "list roles", wantErr)
	}
}
