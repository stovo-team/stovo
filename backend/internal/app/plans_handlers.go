package app

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func canManagePlan(user userPublic, plan planPublic) bool {
	return user.Role == "owner" || user.Role == "admin" || user.ID == plan.CreatedBy
}

func normalizePlanRecurrence(value string) (*string, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || value == "none" {
		return nil, nil
	}
	if value != "daily" && value != "weekly" && value != "monthly" {
		return nil, fmt.Errorf("invalid recurrence")
	}
	return &value, nil
}

func planFromEnt(p *ent.Plan) planPublic {
	return planPublic{
		ID:           p.ID,
		FamilyID:     p.FamilyID,
		Title:        p.Title,
		Notes:        p.Notes,
		Location:     p.Location,
		StartsAt:     parseTime(p.StartsAt),
		EndsAt:       parseTime(p.EndsAt),
		AllDay:       p.AllDay,
		TimeZone:     p.TimeZone,
		Recurrence:   p.Recurrence,
		CreatedBy:    p.CreatedBy,
		SourceChatID: p.SourceChatID,
		Revision:     p.Revision,
		CreatedAt:    parseTime(p.CreatedAt),
		UpdatedAt:    parseTime(p.UpdatedAt),
	}
}

func (s *Server) handleGetPlans(w http.ResponseWriter, r *http.Request, user userPublic) {
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
	if err != nil {
		start = time.Now().UTC().AddDate(0, -1, 0)
	}
	end, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
	if err != nil || !end.After(start) {
		end = start.AddDate(0, 3, 0)
	}
	rows, err := s.store.ListPlansInRange(r.Context(), user.FamilyID, start, end)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load plans")
		return
	}
	plans := make([]planPublic, 0, len(rows))
	for _, row := range rows {
		plan := planFromEnt(row)
		attendees, scanErr := s.planAttendees(r.Context(), plan.ID)
		if scanErr != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load plans")
			return
		}
		plan.Attendees = attendees
		plans = append(plans, plan)
	}
	s.json(w, http.StatusOK, plans)
}

func (s *Server) handleCreatePlan(w http.ResponseWriter, r *http.Request, user userPublic) {
	if user.Role == "child" {
		s.detail(w, http.StatusForbidden, "Children cannot create plans")
		return
	}
	var payload createPlanRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusBadRequest, "Invalid plan")
		return
	}
	if strings.TrimSpace(payload.Title) == "" || !payload.EndsAt.After(payload.StartsAt) {
		s.detail(w, http.StatusUnprocessableEntity, "A title and valid time range are required")
		return
	}
	recurrence, err := normalizePlanRecurrence(derefString(payload.Recurrence))
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid recurrence")
		return
	}
	if err := s.validatePlanAttendees(user, payload.AttendeeIDs); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if payload.SourceChatID != nil && !s.canAccessPlanChat(r.Context(), user, *payload.SourceChatID) {
		s.detail(w, http.StatusForbidden, "Chat is not available")
		return
	}
	now := nowString()
	id := uuid.NewString()
	zone := strings.TrimSpace(payload.TimeZone)
	if zone == "" {
		zone = "UTC"
	}
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		if err := s.store.CreatePlan(r.Context(), tx, repository.CreatePlanParams{
			ID:           id,
			FamilyID:     user.FamilyID,
			Title:        strings.TrimSpace(payload.Title),
			Notes:        payload.Notes,
			Location:     payload.Location,
			StartsAt:     payload.StartsAt.Format(time.RFC3339Nano),
			EndsAt:       payload.EndsAt.Format(time.RFC3339Nano),
			AllDay:       payload.AllDay,
			TimeZone:     zone,
			Recurrence:   recurrence,
			CreatedBy:    user.ID,
			SourceChatID: payload.SourceChatID,
			CreatedAt:    now,
			UpdatedAt:    now,
		}); err != nil {
			return err
		}
		return s.store.ReplacePlanAttendees(r.Context(), tx, id, payload.AttendeeIDs, user.ID, now)
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create plan")
		return
	}
	plan, err := s.getPlan(r.Context(), id)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load plan")
		return
	}
	s.emitPlanEvent(r.Context(), user.FamilyID, "plan:created", plan)
	s.json(w, http.StatusCreated, plan)
}

func (s *Server) handlePlanRSVP(w http.ResponseWriter, r *http.Request, user userPublic) {
	status := ""
	var payload planRSVPRequest
	if s.decodeJSON(r, &payload) == nil {
		status = strings.ToLower(strings.TrimSpace(payload.Status))
	}
	if status != "going" && status != "maybe" && status != "declined" {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid RSVP")
		return
	}
	plan, err := s.getPlan(r.Context(), chi.URLParam(r, "planId"))
	if err != nil || plan.FamilyID != user.FamilyID {
		s.detail(w, http.StatusNotFound, "Plan not found")
		return
	}
	if err := s.store.UpsertPlanRSVP(r.Context(), plan.ID, user.ID, status, nowString()); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update RSVP")
		return
	}
	plan, _ = s.getPlan(r.Context(), plan.ID)
	s.emitPlanEvent(r.Context(), user.FamilyID, "plan:rsvp", plan)
	s.json(w, http.StatusOK, plan)
}

func (s *Server) getPlan(ctx context.Context, id string) (planPublic, error) {
	p, err := s.store.GetPlan(ctx, id)
	if err != nil {
		return planPublic{}, err
	}
	plan := planFromEnt(p)
	attendees, err := s.planAttendees(ctx, plan.ID)
	if err != nil {
		return plan, err
	}
	plan.Attendees = attendees
	return plan, nil
}

func (s *Server) planAttendees(ctx context.Context, id string) ([]planAttendeePublic, error) {
	rows, err := s.store.ListPlanAttendees(ctx, id)
	if err != nil {
		return nil, err
	}
	values := make([]planAttendeePublic, 0, len(rows))
	for _, row := range rows {
		values = append(values, planAttendeePublic{
			UserID: row.UserID,
			Status: row.Status,
		})
	}
	return values, nil
}

func (s *Server) validatePlanAttendees(user userPublic, ids []string) error {
	for _, id := range ids {
		target, err := s.getUserByID(id)
		if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
			return fmt.Errorf("invalid attendee")
		}
	}
	return nil
}

func (s *Server) canAccessPlanChat(ctx context.Context, user userPublic, chatID string) bool {
	ok, err := s.store.CanAccessPlanChat(ctx, chatID, user.ID, user.FamilyID)
	return err == nil && ok
}

func (s *Server) emitPlanEvent(ctx context.Context, familyID, event string, plan planPublic) {
	ids, err := s.store.ListActiveUserIDsByFamily(ctx, familyID)
	if err != nil {
		return
	}
	for _, id := range ids {
		_ = s.sockets.To("user:"+id).Emit(event, plan)
	}
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
