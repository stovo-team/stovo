// Package plans contains transport-independent family-plan use cases.
package plans

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrCreationForbidden = errors.New("children cannot create plans")
	ErrInvalidTimeRange  = errors.New("a title and valid time range are required")
	ErrInvalidRecurrence = errors.New("invalid recurrence")
	ErrInvalidAttendee   = errors.New("invalid attendee")
	ErrSourceChatDenied  = errors.New("chat is not available")
	ErrInvalidRSVP       = errors.New("invalid rsvp")
)

type Attendee struct {
	UserID string
	Status string
}

// Plan is the persistence-neutral result shared by the plan use case and its
// HTTP/realtime adapters.
type Plan struct {
	ID           string
	FamilyID     string
	Title        string
	Notes        *string
	Location     *string
	StartsAt     time.Time
	EndsAt       time.Time
	AllDay       bool
	TimeZone     string
	Recurrence   *string
	CreatedBy    string
	SourceChatID *string
	Revision     int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Attendees    []Attendee
}

type CreateInput struct {
	FamilyID       string
	CreatorID      string
	CreatorRole    string
	Title          string
	Notes          *string
	Location       *string
	StartsAt       time.Time
	EndsAt         time.Time
	AllDay         bool
	TimeZone       string
	Recurrence     *string
	SourceChatID   *string
	AttendeeUserID []string
}

// NewPlan contains the validated values that an adapter must persist atomically.
type NewPlan struct {
	ID             string
	FamilyID       string
	Title          string
	Notes          *string
	Location       *string
	StartsAt       time.Time
	EndsAt         time.Time
	AllDay         bool
	TimeZone       string
	Recurrence     *string
	CreatedBy      string
	SourceChatID   *string
	AttendeeUserID []string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Store is the feature-owned persistence boundary. It deliberately exposes no
// generated ORM type, SQL transaction, or repository parameter object.
type Store interface {
	ListPlanViews(context.Context, string, time.Time, time.Time) ([]Plan, error)
	CreatePlanView(context.Context, NewPlan) (Plan, error)
	GetPlanView(context.Context, string) (Plan, error)
	SetPlanRSVP(context.Context, string, string, string, time.Time) error
	ValidatePlanAttendees(context.Context, string, []string) error
	CanAccessPlanChat(context.Context, string, string, string) (bool, error)
}

type Clock func() time.Time
type IDGenerator func() string

type Service struct {
	store Store
	now   Clock
	newID IDGenerator
}

func NewService(store Store, now Clock, newID IDGenerator) *Service {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	if newID == nil {
		newID = uuid.NewString
	}
	return &Service{store: store, now: now, newID: newID}
}

func (s *Service) List(ctx context.Context, familyID string, start, end time.Time) ([]Plan, error) {
	return s.store.ListPlanViews(ctx, familyID, start, end)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (Plan, error) {
	if input.CreatorRole == "child" {
		return Plan{}, ErrCreationForbidden
	}
	if strings.TrimSpace(input.Title) == "" || !input.EndsAt.After(input.StartsAt) {
		return Plan{}, ErrInvalidTimeRange
	}
	recurrence, err := normalizeRecurrence(input.Recurrence)
	if err != nil {
		return Plan{}, err
	}
	if err := s.store.ValidatePlanAttendees(ctx, input.FamilyID, input.AttendeeUserID); err != nil {
		return Plan{}, ErrInvalidAttendee
	}
	if input.SourceChatID != nil {
		allowed, err := s.store.CanAccessPlanChat(ctx, *input.SourceChatID, input.CreatorID, input.FamilyID)
		if err != nil || !allowed {
			return Plan{}, ErrSourceChatDenied
		}
	}
	now := s.now().UTC()
	zone := strings.TrimSpace(input.TimeZone)
	if zone == "" {
		zone = "UTC"
	}
	return s.store.CreatePlanView(ctx, NewPlan{
		ID: s.newID(), FamilyID: input.FamilyID, Title: strings.TrimSpace(input.Title), Notes: input.Notes,
		Location: input.Location, StartsAt: input.StartsAt, EndsAt: input.EndsAt, AllDay: input.AllDay,
		TimeZone: zone, Recurrence: recurrence, CreatedBy: input.CreatorID, SourceChatID: input.SourceChatID,
		AttendeeUserID: input.AttendeeUserID, CreatedAt: now, UpdatedAt: now,
	})
}

func (s *Service) RSVP(ctx context.Context, planID, familyID, userID, status string) (Plan, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	if status != "going" && status != "maybe" && status != "declined" {
		return Plan{}, ErrInvalidRSVP
	}
	plan, err := s.store.GetPlanView(ctx, planID)
	if err != nil || plan.FamilyID != familyID {
		return Plan{}, errPlanUnavailable
	}
	if err := s.store.SetPlanRSVP(ctx, plan.ID, userID, status, s.now().UTC()); err != nil {
		return Plan{}, err
	}
	return s.store.GetPlanView(ctx, plan.ID)
}

var errPlanUnavailable = errors.New("plan not found")

func normalizeRecurrence(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	normalized := strings.TrimSpace(strings.ToLower(*value))
	if normalized == "" || normalized == "none" {
		return nil, nil
	}
	if normalized != "daily" && normalized != "weekly" && normalized != "monthly" {
		return nil, ErrInvalidRecurrence
	}
	return &normalized, nil
}

// NormalizeRecurrence is exposed for transport compatibility helpers. The
// plan service remains the single owner of recurrence policy.
func NormalizeRecurrence(value string) (*string, error) {
	return normalizeRecurrence(&value)
}
