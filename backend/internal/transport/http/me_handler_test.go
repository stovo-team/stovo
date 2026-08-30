package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"
)

func TestMeHandlerWritesStableCurrentUserContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewMeHandler().Write(recorder, struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	}{ID: "user-1", Username: "ivan"})

	if recorder.Code != stdhttp.StatusOK {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type=%q, want application/json", got)
	}
	if got, want := recorder.Body.String(), "{\"id\":\"user-1\",\"username\":\"ivan\"}\n"; got != want {
		t.Fatalf("body=%q, want %q", got, want)
	}
}
