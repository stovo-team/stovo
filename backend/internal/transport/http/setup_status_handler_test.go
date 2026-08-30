package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSetupStatusHandlerWritesStableContract(t *testing.T) {
	family := "Stovo"
	handler := NewSetupStatusHandler(SetupStatusOperations{
		Load: func(context.Context) (SetupStatus, error) {
			return SetupStatus{ActiveUserCount: 0, FamilyName: &family}, nil
		},
		NavTabs: func() any { return map[string]bool{"chats": true} },
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/auth/setup-status", nil))

	if recorder.Code != stdhttp.StatusOK || !strings.Contains(recorder.Body.String(), `"setupRequired":true`) || !strings.Contains(recorder.Body.String(), `"familyName":"Stovo"`) || !strings.Contains(recorder.Body.String(), `"navTabs":{"chats":true}`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestSetupStatusHandlerPreservesFailureContract(t *testing.T) {
	handler := NewSetupStatusHandler(SetupStatusOperations{
		Load: func(context.Context) (SetupStatus, error) { return SetupStatus{}, errors.New("down") },
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/auth/setup-status", nil))

	if recorder.Code != stdhttp.StatusInternalServerError || !strings.Contains(recorder.Body.String(), `"detail":"Could not load setup status"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}
