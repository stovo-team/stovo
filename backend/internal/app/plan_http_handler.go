package app

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// planStore is the persistence boundary for plan HTTP routes.
type planStore interface {
	ListPlansInRange(context.Context, string, time.Time, time.Time) ([]*ent.Plan, error)
	WithTx(context.Context, func(*ent.Tx) error) error
	CreatePlan(context.Context, *ent.Tx, repository.CreatePlanParams) error
	ReplacePlanAttendees(context.Context, *ent.Tx, string, []string, string, string) error
	UpsertPlanRSVP(context.Context, string, string, string, string) error
}

// PlanHTTPHandler serves plan listing, creation, and RSVP routes.
type PlanHTTPHandler struct {
	store             planStore
	decodeJSON        func(*http.Request, any) error
	getPlan           func(context.Context, string) (planPublic, error)
	validateAttendees func(userPublic, []string) error
	canAccessChat     func(context.Context, userPublic, string) bool
	emit              func(context.Context, string, string, planPublic)
}

func NewPlanHTTPHandler(store planStore, decodeJSON func(*http.Request, any) error, getPlan func(context.Context, string) (planPublic, error), validateAttendees func(userPublic, []string) error, canAccessChat func(context.Context, userPublic, string) bool, emit func(context.Context, string, string, planPublic)) *PlanHTTPHandler {
	return &PlanHTTPHandler{store: store, decodeJSON: decodeJSON, getPlan: getPlan, validateAttendees: validateAttendees, canAccessChat: canAccessChat, emit: emit}
}

func (h *PlanHTTPHandler) handleGetPlans(w http.ResponseWriter, r *http.Request, user userPublic) {
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
	if err != nil { start = time.Now().UTC().AddDate(0, -1, 0) }
	end, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
	if err != nil || !end.After(start) { end = start.AddDate(0, 3, 0) }
	rows, err := h.store.ListPlansInRange(r.Context(), user.FamilyID, start, end)
	if err != nil { planDetail(w, http.StatusInternalServerError, "Could not load plans"); return }
	plans := make([]planPublic, 0, len(rows))
	for _, row := range rows {
		plan, loadErr := h.getPlan(r.Context(), row.ID)
		if loadErr != nil { planDetail(w, http.StatusInternalServerError, "Could not load plans"); return }
		plans = append(plans, plan)
	}
	planJSON(w, http.StatusOK, plans)
}

func (h *PlanHTTPHandler) handleCreatePlan(w http.ResponseWriter, r *http.Request, user userPublic) {
	if user.Role == "child" { planDetail(w, http.StatusForbidden, "Children cannot create plans"); return }
	var payload createPlanRequest
	if err := h.decodeJSON(r, &payload); err != nil { planDetail(w, http.StatusBadRequest, "Invalid plan"); return }
	if strings.TrimSpace(payload.Title) == "" || !payload.EndsAt.After(payload.StartsAt) { planDetail(w, http.StatusUnprocessableEntity, "A title and valid time range are required"); return }
	recurrence, err := normalizePlanRecurrence(derefString(payload.Recurrence))
	if err != nil { planDetail(w, http.StatusUnprocessableEntity, "Invalid recurrence"); return }
	if err := h.validateAttendees(user, payload.AttendeeIDs); err != nil { planDetail(w, http.StatusUnprocessableEntity, err.Error()); return }
	if payload.SourceChatID != nil && !h.canAccessChat(r.Context(), user, *payload.SourceChatID) { planDetail(w, http.StatusForbidden, "Chat is not available"); return }
	id, now, zone := uuid.NewString(), nowString(), strings.TrimSpace(payload.TimeZone)
	if zone == "" { zone = "UTC" }
	err = h.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		params := repository.CreatePlanParams{ID: id, FamilyID: user.FamilyID, Title: strings.TrimSpace(payload.Title), Notes: payload.Notes, Location: payload.Location, StartsAt: payload.StartsAt.Format(time.RFC3339Nano), EndsAt: payload.EndsAt.Format(time.RFC3339Nano), AllDay: payload.AllDay, TimeZone: zone, Recurrence: recurrence, CreatedBy: user.ID, SourceChatID: payload.SourceChatID, CreatedAt: now, UpdatedAt: now}
		if err := h.store.CreatePlan(r.Context(), tx, params); err != nil { return err }
		return h.store.ReplacePlanAttendees(r.Context(), tx, id, payload.AttendeeIDs, user.ID, now)
	})
	if err != nil { planDetail(w, http.StatusInternalServerError, "Could not create plan"); return }
	plan, err := h.getPlan(r.Context(), id)
	if err != nil { planDetail(w, http.StatusInternalServerError, "Could not load plan"); return }
	h.emit(r.Context(), user.FamilyID, "plan:created", plan)
	planJSON(w, http.StatusCreated, plan)
}

func (h *PlanHTTPHandler) handlePlanRSVP(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload planRSVPRequest
	if h.decodeJSON(r, &payload) != nil { planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP"); return }
	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if status != "going" && status != "maybe" && status != "declined" { planDetail(w, http.StatusUnprocessableEntity, "Invalid RSVP"); return }
	plan, err := h.getPlan(r.Context(), chi.URLParam(r, "planId"))
	if err != nil || plan.FamilyID != user.FamilyID { planDetail(w, http.StatusNotFound, "Plan not found"); return }
	if err := h.store.UpsertPlanRSVP(r.Context(), plan.ID, user.ID, status, nowString()); err != nil { planDetail(w, http.StatusInternalServerError, "Could not update RSVP"); return }
	plan, _ = h.getPlan(r.Context(), plan.ID)
	h.emit(r.Context(), user.FamilyID, "plan:rsvp", plan)
	planJSON(w, http.StatusOK, plan)
}

func planJSON(w http.ResponseWriter, status int, payload any) { w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(payload) }
func planDetail(w http.ResponseWriter, status int, message string) { planJSON(w, status, map[string]string{"detail": message}) }
