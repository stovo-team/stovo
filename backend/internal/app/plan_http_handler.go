package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	featureplans "stovo-messenger/backend/internal/features/plans"

	"github.com/go-chi/chi/v5"
)

// PlanHTTPHandler is a transport adapter. Plan validation, identifiers,
// timestamps, transaction ownership, and persistence DTOs belong to the plans
// feature and its repository adapter.
type PlanHTTPHandler struct {
	plans      *featureplans.Service
	decodeJSON func(*http.Request, any) error
	emit       func(context.Context, string, string, planPublic)
}

func NewPlanHTTPHandler(plans *featureplans.Service, decodeJSON func(*http.Request, any) error, emit func(context.Context, string, string, planPublic)) *PlanHTTPHandler {
	return &PlanHTTPHandler{plans: plans, decodeJSON: decodeJSON, emit: emit}
}

func (h *PlanHTTPHandler) handleGetPlans(w http.ResponseWriter, r *http.Request, user userPublic) {
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
	if err != nil {
		start = time.Now().UTC().AddDate(0, -1, 0)
	}
	end, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
	if err != nil || !end.After(start) {
		end = start.AddDate(0, 3, 0)
	}
	values, err := h.plans.List(r.Context(), user.FamilyID, start, end)
	if err != nil {
		planDetail(w, http.StatusInternalServerError, "Could not load plans")
		return
	}
	response := make([]planPublic, 0, len(values))
	for _, value := range values {
		response = append(response, planFromFeature(value))
	}
	planJSON(w, http.StatusOK, response)
}

func (h *PlanHTTPHandler) handleCreatePlan(w http.ResponseWriter, r *http.Request, user userPublic) {
	// Keep the legacy authorization ordering: children receive a 403 without
	// parsing their request body or touching application dependencies.
	if user.Role == "child" {
		planDetail(w, http.StatusForbidden, "Children cannot create plans")
		return
	}
	var payload createPlanRequest
	if err := h.decodeJSON(r, &payload); err != nil {
		planDetail(w, http.StatusBadRequest, "Invalid plan")
		return
	}
	plan, err := h.plans.Create(r.Context(), featureplans.CreateInput{
		FamilyID: user.FamilyID, CreatorID: user.ID, CreatorRole: user.Role, Title: payload.Title,
		Notes: payload.Notes, Location: payload.Location, StartsAt: payload.StartsAt, EndsAt: payload.EndsAt,
		AllDay: payload.AllDay, TimeZone: payload.TimeZone, Recurrence: payload.Recurrence,
		AttendeeUserID: payload.AttendeeIDs, SourceChatID: payload.SourceChatID,
	})
	switch {
	case errors.Is(err, featureplans.ErrCreationForbidden):
		planDetail(w, http.StatusForbidden, "Children cannot create plans")
	case errors.Is(err, featureplans.ErrInvalidTimeRange):
		planDetail(w, http.StatusUnprocessableEntity, "A title and valid time range are required")
	case errors.Is(err, featureplans.ErrInvalidRecurrence):
		planDetail(w, http.StatusUnprocessableEntity, "Invalid recurrence")
	case errors.Is(err, featureplans.ErrInvalidAttendee):
		planDetail(w, http.StatusUnprocessableEntity, "invalid attendee")
	case errors.Is(err, featureplans.ErrSourceChatDenied):
		planDetail(w, http.StatusForbidden, "Chat is not available")
	case err != nil:
		planDetail(w, http.StatusInternalServerError, "Could not create plan")
	default:
		response := planFromFeature(plan)
		h.emit(r.Context(), user.FamilyID, "plan:created", response)
		planJSON(w, http.StatusCreated, response)
	}
}

func (h *PlanHTTPHandler) handlePlanRSVP(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload planRSVPRequest
	if h.decodeJSON(r, &payload) != nil {
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
		return
	}
	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if status != "going" && status != "maybe" && status != "declined" {
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
		return
	}
	plan, err := h.plans.RSVP(r.Context(), chi.URLParam(r, "planId"), user.FamilyID, user.ID, status)
	switch {
	case errors.Is(err, featureplans.ErrInvalidRSVP):
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
	case err != nil:
		planDetail(w, http.StatusNotFound, "Plan not found")
	default:
		response := planFromFeature(plan)
		h.emit(r.Context(), user.FamilyID, "plan:rsvp", response)
		planJSON(w, http.StatusOK, response)
	}
}

func planJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func planDetail(w http.ResponseWriter, status int, message string) {
	planJSON(w, status, map[string]string{"detail": message})
}
