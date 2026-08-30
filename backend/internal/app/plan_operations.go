package app

import (
	"context"

	featureplans "stovo-messenger/backend/internal/features/plans"
)

func canManagePlan(user userPublic, plan planPublic) bool {
	return user.Role == "admin" || hasPermission(user, permissionManagePlans) || user.ID == plan.CreatedBy
}

// normalizePlanRecurrence preserves the existing package-level helper used by
// route tests while delegating recurrence policy to the plans feature.
func normalizePlanRecurrence(value string) (*string, error) {
	return featureplans.NormalizeRecurrence(value)
}

func planFromFeature(plan featureplans.Plan) planPublic {
	result := planPublic{
		ID: plan.ID, FamilyID: plan.FamilyID, Title: plan.Title, Notes: plan.Notes, Location: plan.Location,
		StartsAt: plan.StartsAt, EndsAt: plan.EndsAt, AllDay: plan.AllDay, TimeZone: plan.TimeZone,
		Recurrence: plan.Recurrence, CreatedBy: plan.CreatedBy, SourceChatID: plan.SourceChatID,
		Revision: plan.Revision, CreatedAt: plan.CreatedAt, UpdatedAt: plan.UpdatedAt,
		Attendees: make([]planAttendeePublic, 0, len(plan.Attendees)),
	}
	for _, attendee := range plan.Attendees {
		result.Attendees = append(result.Attendees, planAttendeePublic{UserID: attendee.UserID, Status: attendee.Status})
	}
	return result
}

// emitPlanEvent is the compatibility adapter for the existing Socket.IO event
// names and payloads. The plans use case remains independent of Socket.IO.
func (s *Server) emitPlanEvent(ctx context.Context, familyID, event string, plan planPublic) {
	ids, err := s.plans.ActiveUserIDs(ctx, familyID)
	if err != nil {
		return
	}
	for _, id := range ids {
		_ = s.sockets.To("user:"+id).Emit(event, plan)
	}
}
