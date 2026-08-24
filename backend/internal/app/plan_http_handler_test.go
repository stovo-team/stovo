package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlanHTTPHandlerRejectsChildPlanCreationBeforeStorage(t *testing.T) {
	handler := NewPlanHTTPHandler(nil, nil, nil, nil, nil, nil)
	recorder := httptest.NewRecorder()

	handler.handleCreatePlan(recorder, httptest.NewRequest(http.MethodPost, "/api/plans", nil), userPublic{Role: "child"})

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestPlanHTTPHandlerRejectsMalformedRSVPBeforePlanLookup(t *testing.T) {
	decode := func(r *http.Request, target any) error { return json.NewDecoder(r.Body).Decode(target) }
	handler := NewPlanHTTPHandler(nil, decode, nil, nil, nil, nil)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/plans/plan-1/rsvp", strings.NewReader(`{"status":"later"}`))

	handler.handlePlanRSVP(recorder, req, userPublic{ID: "user-1"})

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}
}
