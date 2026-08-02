package app

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

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

func (s *Server) handleGetPlans(w http.ResponseWriter, r *http.Request, user userPublic) {
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
	if err != nil {
		start = time.Now().UTC().AddDate(0, -1, 0)
	}
	end, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
	if err != nil || !end.After(start) {
		end = start.AddDate(0, 3, 0)
	}
	rows, err := s.db.Query(`SELECT id, family_id, title, notes, location, starts_at, ends_at, all_day, time_zone, recurrence, created_by, source_chat_id, revision, created_at, updated_at FROM plans WHERE family_id = $1 AND deleted_at IS NULL AND starts_at < $2 AND ends_at > $3 ORDER BY starts_at`, user.FamilyID, end.Format(time.RFC3339Nano), start.Format(time.RFC3339Nano))
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load plans")
		return
	}
	defer rows.Close()
	plans := make([]planPublic, 0)
	for rows.Next() {
		plan, scanErr := s.scanPlan(rows)
		if scanErr != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load plans")
			return
		}
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
	if payload.SourceChatID != nil && !s.canAccessPlanChat(user, *payload.SourceChatID) {
		s.detail(w, http.StatusForbidden, "Chat is not available")
		return
	}
	now := nowString()
	id := uuid.NewString()
	zone := strings.TrimSpace(payload.TimeZone)
	if zone == "" {
		zone = "UTC"
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create plan")
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO plans (id, family_id, title, notes, location, starts_at, ends_at, all_day, time_zone, recurrence, created_by, source_chat_id, revision, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,$13,$13)`, id, user.FamilyID, strings.TrimSpace(payload.Title), payload.Notes, payload.Location, payload.StartsAt.Format(time.RFC3339Nano), payload.EndsAt.Format(time.RFC3339Nano), payload.AllDay, zone, recurrence, user.ID, payload.SourceChatID, now)
	if err == nil {
		err = s.replacePlanAttendees(tx, id, payload.AttendeeIDs, user.ID)
	}
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create plan")
		return
	}
	if err = tx.Commit(); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create plan")
		return
	}
	plan, err := s.getPlan(id)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load plan")
		return
	}
	s.emitPlanEvent(user.FamilyID, "plan:created", plan)
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
	plan, err := s.getPlan(chi.URLParam(r, "planId"))
	if err != nil || plan.FamilyID != user.FamilyID {
		s.detail(w, http.StatusNotFound, "Plan not found")
		return
	}
	_, err = s.db.Exec(`INSERT INTO plan_attendees (plan_id,user_id,status,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,user_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`, plan.ID, user.ID, status, nowString())
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update RSVP")
		return
	}
	plan, _ = s.getPlan(plan.ID)
	s.emitPlanEvent(user.FamilyID, "plan:rsvp", plan)
	s.json(w, http.StatusOK, plan)
}

func (s *Server) getPlan(id string) (planPublic, error) {
	return s.scanPlan(s.db.QueryRow(`SELECT id, family_id, title, notes, location, starts_at, ends_at, all_day, time_zone, recurrence, created_by, source_chat_id, revision, created_at, updated_at FROM plans WHERE id=$1 AND deleted_at IS NULL`, id))
}

type planScanner interface{ Scan(...any) error }

func (s *Server) scanPlan(row planScanner) (planPublic, error) {
	var plan planPublic
	var starts, ends, created, updated string
	err := row.Scan(&plan.ID, &plan.FamilyID, &plan.Title, &plan.Notes, &plan.Location, &starts, &ends, &plan.AllDay, &plan.TimeZone, &plan.Recurrence, &plan.CreatedBy, &plan.SourceChatID, &plan.Revision, &created, &updated)
	if err != nil {
		return plan, err
	}
	plan.StartsAt = parseTime(starts)
	plan.EndsAt = parseTime(ends)
	plan.CreatedAt = parseTime(created)
	plan.UpdatedAt = parseTime(updated)
	attendees, err := s.planAttendees(plan.ID)
	if err != nil {
		return plan, err
	}
	plan.Attendees = attendees
	return plan, nil
}
func (s *Server) planAttendees(id string) ([]planAttendeePublic, error) {
	rows, err := s.db.Query(`SELECT user_id,status FROM plan_attendees WHERE plan_id=$1 ORDER BY user_id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]planAttendeePublic, 0)
	for rows.Next() {
		var value planAttendeePublic
		if err := rows.Scan(&value.UserID, &value.Status); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}
func (s *Server) replacePlanAttendees(tx *sql.Tx, planID string, ids []string, creator string) error {
	if _, err := tx.Exec(`DELETE FROM plan_attendees WHERE plan_id=$1`, planID); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, id := range append(ids, creator) {
		if seen[id] {
			continue
		}
		seen[id] = true
		if _, err := tx.Exec(`INSERT INTO plan_attendees (plan_id,user_id,status,updated_at) VALUES ($1,$2,'going',$3)`, planID, id, nowString()); err != nil {
			return err
		}
	}
	return nil
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
func (s *Server) canAccessPlanChat(user userPublic, chatID string) bool {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM chat_members cm JOIN chats c ON c.id=cm.chat_id WHERE cm.chat_id=$1 AND cm.user_id=$2 AND c.family_id=$3`, chatID, user.ID, user.FamilyID).Scan(&count)
	return err == nil && count > 0
}
func (s *Server) emitPlanEvent(familyID, event string, plan planPublic) {
	rows, err := s.db.Query(`SELECT id FROM users WHERE family_id=$1 AND is_active=1`, familyID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			_ = s.sockets.To("user:"+id).Emit(event, plan)
		}
	}
}
func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
