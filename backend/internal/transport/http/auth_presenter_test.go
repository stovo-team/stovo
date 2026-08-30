package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteAuthSuccessPreservesWireContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteAuthSuccess(recorder, http.StatusCreated, AuthSuccess[struct {
		ID string `json:"id"`
	}]{
		AccessToken: "access", TokenType: "Bearer", ExpiresInSeconds: 900,
		User: struct {
			ID string `json:"id"`
		}{ID: "user-1"},
		RefreshToken: "refresh",
	})

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status=%d, want %d", recorder.Code, http.StatusCreated)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type=%q, want application/json", got)
	}
	const want = "{\"accessToken\":\"access\",\"tokenType\":\"Bearer\",\"expiresInSeconds\":900,\"user\":{\"id\":\"user-1\"},\"refreshToken\":\"refresh\"}\n"
	if got := recorder.Body.String(); got != want {
		t.Fatalf("body=%q, want %q", got, want)
	}
}

func TestWriteAuthSuccessOmitsEmptyRefreshToken(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteAuthSuccess(recorder, http.StatusOK, AuthSuccess[string]{User: "user"})
	if got := recorder.Body.String(); got != "{\"accessToken\":\"\",\"tokenType\":\"\",\"expiresInSeconds\":0,\"user\":\"user\"}\n" {
		t.Fatalf("body=%q", got)
	}
}
