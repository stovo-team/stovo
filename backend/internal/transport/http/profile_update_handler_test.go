package http

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProfileUpdateHandlerCarriesAvatarChoice(t *testing.T) {
	var got ProfileUpdateRequest
	handler := ProfileUpdateHandler{Update: func(_ context.Context, request ProfileUpdateRequest) (any, error) {
		got = request
		return map[string]bool{"ok": true}, nil
	}}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("PATCH", "/api/auth/me", strings.NewReader(`{"avatarMode":"symbol","avatarSymbolId":"sparkles","avatarColorId":"purple"}`)))
	if recorder.Code != 200 { t.Fatalf("status = %d, want 200", recorder.Code) }
	if got.AvatarMode == nil || *got.AvatarMode != "symbol" { t.Errorf("avatar mode = %v, want symbol", got.AvatarMode) }
	if got.AvatarSymbolID == nil || *got.AvatarSymbolID != "sparkles" { t.Errorf("avatar symbol = %v, want sparkles", got.AvatarSymbolID) }
	if got.AvatarColorID == nil || *got.AvatarColorID != "purple" { t.Errorf("avatar color = %v, want purple", got.AvatarColorID) }
}

func TestProfileUpdateHandlerRejectsUnapprovedAvatarValues(t *testing.T) {
	for _, body := range []string{
		`{"avatarMode":"svg"}`,
		`{"avatarSymbolId":"<svg onload=alert(1)>"}`,
		`{"avatarColorId":"url(javascript:alert(1))"}`,
	} {
		called := false
		handler := ProfileUpdateHandler{Update: func(context.Context, ProfileUpdateRequest) (any, error) { called = true; return nil, nil }}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest("PATCH", "/api/auth/me", strings.NewReader(body)))
		if recorder.Code != 422 { t.Errorf("body %s: status = %d, want 422", body, recorder.Code) }
		if called { t.Errorf("body %s: update callback called", body) }
	}
}

func TestProfileUpdateHandlerRejectsEmptyPatch(t *testing.T) {
	called := false
	handler := ProfileUpdateHandler{Update: func(context.Context, ProfileUpdateRequest) (any, error) { called = true; return nil, nil }}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("PATCH", "/api/auth/me", strings.NewReader(`{}`)))
	if recorder.Code != 422 { t.Fatalf("status = %d, want 422", recorder.Code) }
	if called { t.Fatal("update callback called for an empty patch") }
	var body map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil { t.Fatal(err) }
}
