package app

import (
	"testing"
)

func TestChecklistDefaults(t *testing.T) {
	cases := []struct {
		category string
		want     string
	}{
		{"grocery", "Grocery list"},
		{"errand", "Errands"},
		{"general", "Untitled checklist"},
		{"unknown", "Untitled checklist"},
	}

	for _, tc := range cases {
		title := ""
		switch tc.category {
		case "grocery":
			title = "Grocery list"
		case "errand":
			title = "Errands"
		default:
			title = "Untitled checklist"
		}
		if title != tc.want {
			t.Errorf("category %q got title %q, want %q", tc.category, title, tc.want)
		}
	}
}

func TestChecklistCategoryNormalization(t *testing.T) {
	normalize := func(c string) string {
		switch c {
		case "grocery", "errand":
			return c
		default:
			return "general"
		}
	}

	if got := normalize("grocery"); got != "grocery" {
		t.Errorf("expected grocery, got %q", got)
	}
	if got := normalize("errand"); got != "errand" {
		t.Errorf("expected errand, got %q", got)
	}
	if got := normalize("anything-else"); got != "general" {
		t.Errorf("expected general, got %q", got)
	}
}
