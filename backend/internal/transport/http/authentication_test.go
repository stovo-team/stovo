package http

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthenticatedWritesStableUnauthorizedContract(t *testing.T) {
	handler := Authenticated(func(*http.Request) (any, error) { return nil, errors.New("expired") }, func(http.ResponseWriter, *http.Request, any) {
		t.Fatal("next must not be called")
	})
	recorder := httptest.NewRecorder()
	handler(recorder, httptest.NewRequest(http.MethodGet, "/api/chats", nil))
	if recorder.Code != http.StatusUnauthorized || recorder.Body.String() != "{\"detail\":\"Authentication required\"}" {
		t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
	}
}

func TestAuthenticatedPassesOpaquePrincipal(t *testing.T) {
	principal := struct{ ID string }{ID: "user-1"}
	handler := Authenticated(func(*http.Request) (any, error) { return principal, nil }, func(w http.ResponseWriter, _ *http.Request, got any) {
		if got != principal {
			t.Fatalf("principal = %#v", got)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	handler(recorder, httptest.NewRequest(http.MethodGet, "/api/chats", nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
}
