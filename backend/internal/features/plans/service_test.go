package plans

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestPlanJSONUsesFrontendFieldNames(t *testing.T) {
	payload, err := json.Marshal(Plan{
		ID: "plan-1", FamilyID: "family-1", StartsAt: time.Date(2026, 9, 11, 9, 0, 0, 0, time.UTC),
		Attendees: []Attendee{{UserID: "user-1", Status: "going"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["id"] != "plan-1" || decoded["familyId"] != "family-1" || decoded["startsAt"] == nil {
		t.Fatalf("unexpected plan JSON: %s", payload)
	}
	attendees, ok := decoded["attendees"].([]any)
	if !ok || len(attendees) != 1 || attendees[0].(map[string]any)["userId"] != "user-1" {
		t.Fatalf("unexpected attendee JSON: %s", payload)
	}
}

type storeStub struct {
	validAttendees bool
	chatAllowed    bool
	created        NewPlan
	plan           Plan
}

func (s *storeStub) ListPlanViews(context.Context, string, time.Time, time.Time) ([]Plan, error) {
	return nil, nil
}
func (s *storeStub) CreatePlanView(_ context.Context, input NewPlan) (Plan, error) {
	s.created = input
	s.plan = Plan{ID: input.ID, FamilyID: input.FamilyID, Title: input.Title}
	return s.plan, nil
}
func (s *storeStub) GetPlanView(context.Context, string) (Plan, error)                    { return s.plan, nil }
func (s *storeStub) SetPlanRSVP(context.Context, string, string, string, time.Time) error { return nil }
func (s *storeStub) ValidatePlanAttendees(context.Context, string, []string) error {
	if !s.validAttendees {
		return errors.New("not a family member")
	}
	return nil
}
func (s *storeStub) CanAccessPlanChat(context.Context, string, string, string) (bool, error) {
	return s.chatAllowed, nil
}
func (s *storeStub) ListActiveUserIDsByFamily(context.Context, string) ([]string, error) {
	return nil, nil
}

func TestCreateNormalizesInputAtTheUseCaseBoundary(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	store := &storeStub{validAttendees: true, chatAllowed: true}
	service := NewService(store, func() time.Time { return now }, func() string { return "plan-1" })
	_, err := service.Create(context.Background(), CreateInput{
		FamilyID: "family-1", CreatorID: "user-1", CreatorRole: "member", Title: "  Dinner  ",
		StartsAt: now, EndsAt: now.Add(time.Hour), TimeZone: " ", AttendeeUserID: []string{"user-2"},
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if store.created.ID != "plan-1" || store.created.Title != "Dinner" || store.created.TimeZone != "UTC" {
		t.Fatalf("created plan = %#v", store.created)
	}
}

func TestCreateRejectsInvalidAttendeesBeforePersistence(t *testing.T) {
	now := time.Now().UTC()
	store := &storeStub{validAttendees: false}
	service := NewService(store, nil, nil)
	_, err := service.Create(context.Background(), CreateInput{
		FamilyID: "family-1", CreatorID: "user-1", Title: "Dinner", StartsAt: now, EndsAt: now.Add(time.Hour),
	})
	if !errors.Is(err, ErrInvalidAttendee) {
		t.Fatalf("Create() error = %v, want ErrInvalidAttendee", err)
	}
	if store.created.ID != "" {
		t.Fatal("Create() persisted an invalid plan")
	}
}
