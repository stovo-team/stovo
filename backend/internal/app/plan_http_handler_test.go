package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

func TestPlanHTTPHandlerRejectsChildPlanCreationBeforeStorage(t *testing.T) {
	handler := httptransport.NewPlanHTTPHandler(nil, nil, nil)
	recorder := httptest.NewRecorder()

	handler.HandleCreatePlan(recorder, httptest.NewRequest(http.MethodPost, "/api/plans", nil), httptransport.PlanActor{Role: "child"})

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestPlanHTTPHandlerRejectsMalformedRSVPBeforePlanLookup(t *testing.T) {
	decode := func(r *http.Request, target any) error { return json.NewDecoder(r.Body).Decode(target) }
	handler := httptransport.NewPlanHTTPHandler(nil, decode, nil)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/plans/plan-1/rsvp", strings.NewReader(`{"status":"later"}`))

	handler.HandlePlanRSVP(recorder, req, httptransport.PlanActor{ID: "user-1"})

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}
}
