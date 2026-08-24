package app

import (
	"context"
	"fmt"
	"strings"

	"family-messenger/backend/ent"
)

func canManagePlan(user userPublic, plan planPublic) bool {
	return hasPermission(user, permissionManagePlans) || user.ID == plan.CreatedBy
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
