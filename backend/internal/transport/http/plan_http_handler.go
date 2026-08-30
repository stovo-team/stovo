package http

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

// PlanActor encapsulates user information required for plan operations.
type PlanActor struct {
	ID       string
	FamilyID string
	Role     string
}

// PlanHTTPHandler is a transport adapter serving calendar plan endpoints.
type PlanHTTPHandler struct {
	plans      *featureplans.Service
	decodeJSON func(*http.Request, any) error
	emit       func(context.Context, string, string, any)
}

func NewPlanHTTPHandler(plans *featureplans.Service, decodeJSON func(*http.Request, any) error, emit func(context.Context, string, string, any)) *PlanHTTPHandler {
	return &PlanHTTPHandler{plans: plans, decodeJSON: decodeJSON, emit: emit}
}

func (h *PlanHTTPHandler) HandleGetPlans(w http.ResponseWriter, r *http.Request, actor PlanActor) {
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
	if err != nil {
		start = time.Now().UTC().AddDate(0, -1, 0)
	}
	end, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
	if err != nil || !end.After(start) {
		end = start.AddDate(0, 3, 0)
	}
	values, err := h.plans.List(r.Context(), actor.FamilyID, start, end)
	if err != nil {
		planDetail(w, http.StatusInternalServerError, "Could not load plans")
		return
	}
	planJSON(w, http.StatusOK, values)
}

type CreatePlanPayload struct {
	Title        string    `json:"title"`
	Notes        *string   `json:"notes"`
	Location     *string   `json:"location"`
	StartsAt     time.Time `json:"startsAt"`
	EndsAt       time.Time `json:"endsAt"`
	AllDay       bool      `json:"allDay"`
	TimeZone     string    `json:"timeZone"`
	Recurrence   *string   `json:"recurrence"`
	AttendeeIDs  []string  `json:"attendeeIds"`
	SourceChatID *string   `json:"sourceChatId"`
}

func (h *PlanHTTPHandler) HandleCreatePlan(w http.ResponseWriter, r *http.Request, actor PlanActor) {
	if actor.Role == "child" {
		planDetail(w, http.StatusForbidden, "Children cannot create plans")
		return
	}
	var payload CreatePlanPayload
	decode := h.decodeJSON
	if decode == nil {
		decode = decodeBody
	}
	if err := decode(r, &payload); err != nil {
		planDetail(w, http.StatusBadRequest, "Invalid plan")
		return
	}
	plan, err := h.plans.Create(r.Context(), featureplans.CreateInput{
		FamilyID: actor.FamilyID, CreatorID: actor.ID, CreatorRole: actor.Role, Title: payload.Title,
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
		if h.emit != nil {
			h.emit(r.Context(), actor.FamilyID, "plan:created", plan)
		}
		planJSON(w, http.StatusCreated, plan)
	}
}

type PlanRSVPPayload struct {
	Status string `json:"status"`
}

func (h *PlanHTTPHandler) HandlePlanRSVP(w http.ResponseWriter, r *http.Request, actor PlanActor) {
	var payload PlanRSVPPayload
	decode := h.decodeJSON
	if decode == nil {
		decode = decodeBody
	}
	if decode(r, &payload) != nil {
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
		return
	}
	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if status != "going" && status != "maybe" && status != "declined" {
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
		return
	}
	plan, err := h.plans.RSVP(r.Context(), chi.URLParam(r, "planId"), actor.FamilyID, actor.ID, status)
	switch {
	case errors.Is(err, featureplans.ErrInvalidRSVP):
		planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
	case err != nil:
		planDetail(w, http.StatusNotFound, "Plan not found")
	default:
		if h.emit != nil {
			h.emit(r.Context(), actor.FamilyID, "plan:rsvp", plan)
		}
		planJSON(w, http.StatusOK, plan)
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
