package app

import "testing"

func TestCanManagePlanAllowsAdminsAndCreators(t *testing.T) {
	plan := planPublic{CreatedBy: "creator"}
	if !canManagePlan(userPublic{ID: "creator", Role: "member"}, plan) {
		t.Fatal("creator should manage their own plan")
	}
	if !canManagePlan(userPublic{ID: "admin", Role: "admin"}, plan) {
		t.Fatal("admin should manage every plan")
	}
	if canManagePlan(userPublic{ID: "child", Role: "child"}, plan) {
		t.Fatal("child should not manage another member's plan")
	}
}

func TestNormalizePlanRecurrenceRejectsUnsupportedFrequency(t *testing.T) {
	if _, err := normalizePlanRecurrence("yearly"); err == nil {
		t.Fatal("yearly recurrence must be rejected")
	}
}
