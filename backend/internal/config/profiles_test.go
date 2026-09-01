package config

import (
	"testing"
)

func TestParseSolutionProfile(t *testing.T) {
	tests := []struct {
		input    string
		expected SolutionProfile
	}{
		{"family", ProfileFamily},
		{"FAMILY", ProfileFamily},
		{"gamer", ProfileGamer},
		{"GAMER", ProfileGamer},
		{"corporate", ProfileCorporate},
		{"enterprise", ProfileCorporate},
		{"custom", ProfileCustom},
		{"invalid", ProfileFamily},
		{"", ProfileFamily},
	}

	for _, tt := range tests {
		got := ParseSolutionProfile(tt.input)
		if got != tt.expected {
			t.Errorf("ParseSolutionProfile(%q) = %v; want %v", tt.input, got, tt.expected)
		}
	}
}

func TestGetPresetMatrix(t *testing.T) {
	family := GetPresetMatrix(ProfileFamily)
	if !family.Screens.Chats || !family.Screens.MediaGallery {
		t.Errorf("Family profile should enable Chats and MediaGallery")
	}
	if family.Screens.GameActivity {
		t.Errorf("Family profile should not enable GameActivity")
	}

	gamer := GetPresetMatrix(ProfileGamer)
	if !gamer.Screens.GameActivity || !gamer.Screens.VoiceRooms {
		t.Errorf("Gamer profile should enable GameActivity and VoiceRooms")
	}
	if gamer.DefaultTheme != "gamer_dark" {
		t.Errorf("Gamer profile theme = %s; want gamer_dark", gamer.DefaultTheme)
	}

	corporate := GetPresetMatrix(ProfileCorporate)
	if !corporate.Screens.AuditLogs || !corporate.Screens.SSOManagement {
		t.Errorf("Corporate profile should enable AuditLogs and SSOManagement")
	}
	if corporate.Screens.MediaGallery {
		t.Errorf("Corporate profile should disable MediaGallery by default")
	}
}
