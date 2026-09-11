package repository

import (
	"context"
	"fmt"
	"time"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/plan"
	"stovo-messenger/backend/ent/planattendee"
	"stovo-messenger/backend/ent/user"
	featureplans "stovo-messenger/backend/internal/features/plans"
)

// ListPlansInRange returns non-deleted plans overlapping [start, end) for a family.
func (s *Store) ListPlansInRange(ctx context.Context, familyID string, start, end time.Time) ([]*ent.Plan, error) {
	endStr := end.Format(time.RFC3339Nano)
	startStr := start.Format(time.RFC3339Nano)
	return s.Client.Plan.Query().
		Where(
			plan.FamilyIDEQ(familyID),
			plan.DeletedAtIsNil(),
			plan.StartsAtLT(endStr),
			plan.EndsAtGT(startStr),
		).
		Order(plan.ByStartsAt(sql.OrderAsc())).
		All(ctx)
}

// CreatePlanParams holds fields for inserting a plan.
type CreatePlanParams struct {
	ID           string
	FamilyID     string
	Title        string
	Notes        *string
	Location     *string
	StartsAt     string
	EndsAt       string
	AllDay       bool
	TimeZone     string
	Recurrence   *string
	CreatedBy    string
	SourceChatID *string
	CreatedAt    string
	UpdatedAt    string
}

// CreatePlan inserts a plan row with revision=1.
func (s *Store) CreatePlan(ctx context.Context, tx *ent.Tx, p CreatePlanParams) error {
	create := s.client(tx).Plan.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetTitle(p.Title).
		SetStartsAt(p.StartsAt).
		SetEndsAt(p.EndsAt).
		SetAllDay(p.AllDay).
		SetTimeZone(p.TimeZone).
		SetCreatedBy(p.CreatedBy).
		SetRevision(1).
		SetCreatedAt(p.CreatedAt).
		SetUpdatedAt(p.UpdatedAt)
	if p.Notes != nil {
		create.SetNotes(*p.Notes)
	}
	if p.Location != nil {
		create.SetLocation(*p.Location)
	}
	if p.Recurrence != nil {
		create.SetRecurrence(*p.Recurrence)
	}
	if p.SourceChatID != nil {
		create.SetSourceChatID(*p.SourceChatID)
	}
	_, err := create.Save(ctx)
	return err
}

// GetPlan loads a non-deleted plan by id.
func (s *Store) GetPlan(ctx context.Context, id string) (*ent.Plan, error) {
	return s.Client.Plan.Query().
		Where(
			plan.IDEQ(id),
			plan.DeletedAtIsNil(),
		).
		Only(ctx)
}

// ListPlanAttendees returns attendees for a plan ordered by user_id.
func (s *Store) ListPlanAttendees(ctx context.Context, planID string) ([]*ent.PlanAttendee, error) {
	return s.Client.PlanAttendee.Query().
		Where(planattendee.IDEQ(planID)).
		Order(planattendee.ByUserID(sql.OrderAsc())).
		All(ctx)
}

// UpsertPlanRSVP inserts or updates an attendee RSVP.
func (s *Store) UpsertPlanRSVP(ctx context.Context, planID, userID, status, updatedAt string) error {
	return s.Client.PlanAttendee.Create().
		SetID(planID).
		SetUserID(userID).
		SetStatus(status).
		SetUpdatedAt(updatedAt).
		OnConflictColumns(planattendee.FieldID, planattendee.FieldUserID).
		Update(func(u *ent.PlanAttendeeUpsert) {
			u.UpdateStatus()
			u.UpdateUpdatedAt()
		}).
		Exec(ctx)
}

// ReplacePlanAttendees deletes all attendees for a plan and re-inserts unique user IDs plus creator as going.
func (s *Store) ReplacePlanAttendees(ctx context.Context, tx *ent.Tx, planID string, userIDs []string, creator, updatedAt string) error {
	c := s.client(tx)
	if _, err := c.PlanAttendee.Delete().Where(planattendee.IDEQ(planID)).Exec(ctx); err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(userIDs)+1)
	for _, id := range append(userIDs, creator) {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if _, err := c.PlanAttendee.Create().
			SetID(planID).
			SetUserID(id).
			SetStatus("going").
			SetUpdatedAt(updatedAt).
			Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

// CanAccessPlanChat reports whether userID is a member of chatID in familyID.
func (s *Store) CanAccessPlanChat(ctx context.Context, chatID, userID, familyID string) (bool, error) {
	ch, err := s.Client.Chat.Get(ctx, chatID)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, nil
		}
		return false, err
	}
	if ch.FamilyID != familyID {
		return false, nil
	}
	count, err := s.Client.ChatMember.Query().
		Where(
			chatmember.IDEQ(chatID),
			chatmember.UserIDEQ(userID),
		).
		Count(ctx)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// ListActiveUserIDsByFamily returns active user ids in a family.
func (s *Store) ListActiveUserIDsByFamily(ctx context.Context, familyID string) ([]string, error) {
	users, err := s.Client.User.Query().
		Where(
			user.FamilyIDEQ(familyID),
			user.IsActiveEQ(1),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.ID)
	}
	return ids, nil
}

// ListPlanViews adapts Ent rows to the plans feature's persistence-neutral
// result type. HTTP handlers intentionally do not receive Ent entities.
func (s *Store) ListPlanViews(ctx context.Context, familyID string, start, end time.Time) ([]featureplans.Plan, error) {
	rows, err := s.ListPlansInRange(ctx, familyID, start, end)
	if err != nil {
		return nil, err
	}
	plans := make([]featureplans.Plan, 0, len(rows))
	for _, row := range rows {
		view, err := s.planView(ctx, row)
		if err != nil {
			return nil, err
		}
		plans = append(plans, view)
	}
	return plans, nil
}

// CreatePlanView owns the transaction required to create a plan and its
// attendees. The plans feature supplies only domain values, never an Ent tx.
func (s *Store) CreatePlanView(ctx context.Context, input featureplans.NewPlan) (featureplans.Plan, error) {
	err := s.WithTx(ctx, func(tx *ent.Tx) error {
		if err := s.CreatePlan(ctx, tx, CreatePlanParams{
			ID: input.ID, FamilyID: input.FamilyID, Title: input.Title, Notes: input.Notes, Location: input.Location,
			StartsAt: input.StartsAt.Format(time.RFC3339Nano), EndsAt: input.EndsAt.Format(time.RFC3339Nano),
			AllDay: input.AllDay, TimeZone: input.TimeZone, Recurrence: input.Recurrence, CreatedBy: input.CreatedBy,
			SourceChatID: input.SourceChatID, CreatedAt: input.CreatedAt.Format(time.RFC3339Nano), UpdatedAt: input.UpdatedAt.Format(time.RFC3339Nano),
		}); err != nil {
			return err
		}
		return s.ReplacePlanAttendees(ctx, tx, input.ID, input.AttendeeUserID, input.CreatedBy, input.UpdatedAt.Format(time.RFC3339Nano))
	})
	if err != nil {
		return featureplans.Plan{}, err
	}
	return s.GetPlanView(ctx, input.ID)
}

func (s *Store) GetPlanView(ctx context.Context, id string) (featureplans.Plan, error) {
	row, err := s.GetPlan(ctx, id)
	if err != nil {
		return featureplans.Plan{}, err
	}
	return s.planView(ctx, row)
}

func (s *Store) SetPlanRSVP(ctx context.Context, planID, userID, status string, updatedAt time.Time) error {
	return s.UpsertPlanRSVP(ctx, planID, userID, status, updatedAt.Format(time.RFC3339Nano))
}

func (s *Store) ValidatePlanAttendees(ctx context.Context, familyID string, ids []string) error {
	for _, id := range ids {
		member, err := s.UserByID(ctx, id)
		if err != nil || member.FamilyID != familyID || member.IsActive == 0 {
			return fmt.Errorf("invalid plan attendee")
		}
	}
	return nil
}

func (s *Store) planView(ctx context.Context, row *ent.Plan) (featureplans.Plan, error) {
	attendees, err := s.ListPlanAttendees(ctx, row.ID)
	if err != nil {
		return featureplans.Plan{}, err
	}
	view := featureplans.Plan{
		ID: row.ID, FamilyID: row.FamilyID, Title: row.Title, Notes: row.Notes, Location: row.Location,
		StartsAt: planTime(row.StartsAt), EndsAt: planTime(row.EndsAt), AllDay: row.AllDay, TimeZone: row.TimeZone,
		Recurrence: row.Recurrence, CreatedBy: row.CreatedBy, SourceChatID: row.SourceChatID, Revision: row.Revision,
		CreatedAt: planTime(row.CreatedAt), UpdatedAt: planTime(row.UpdatedAt),
		Attendees: make([]featureplans.Attendee, 0, len(attendees)),
	}
	// Plans may outlive a member's active membership. Resolve the saved creator
	// directly so clients can still present the actual person rather than a
	// generic family-member label.
	if creator, err := s.UserByID(ctx, row.CreatedBy); err == nil {
		view.CreatorDisplayName = creator.DisplayName
	}
	for _, attendee := range attendees {
		view.Attendees = append(view.Attendees, featureplans.Attendee{UserID: attendee.UserID, Status: attendee.Status})
	}
	return view, nil
}

func planTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}
