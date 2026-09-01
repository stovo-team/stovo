package config

import (
	"strings"
)

type SolutionProfile string

const (
	ProfileFamily    SolutionProfile = "family"
	ProfileGamer     SolutionProfile = "gamer"
	ProfileCorporate SolutionProfile = "corporate"
	ProfileCustom    SolutionProfile = "custom"
)

// ScreenConfig defines which UI screens/modules are enabled for the profile.
type ScreenConfig struct {
	Chats         bool `json:"chats"`
	MediaGallery  bool `json:"media_gallery"`
	VoiceRooms    bool `json:"voice_rooms"`
	GameActivity  bool `json:"game_activity"`
	AuditLogs     bool `json:"audit_logs"`
	MemberInvites bool `json:"member_invites"`
	SSOManagement bool `json:"sso_management"`
}

// FeatureMatrix defines operational features and defaults.
type FeatureMatrix struct {
	Profile             SolutionProfile `json:"profile"`
	DisplayName         string          `json:"display_name"`
	Screens             ScreenConfig    `json:"screens"`
	PresenceDetailLevel string          `json:"presence_detail_level"` // "basic", "rich_game_status", "working_hours"
	EndToEndEncryption  bool            `json:"end_to_end_encryption"`
	CustomEmojis        bool            `json:"custom_emojis"`
	FileUploadLimitMB   int             `json:"file_upload_limit_mb"`
	DefaultTheme        string          `json:"default_theme"` // "family_warm", "gamer_dark", "corporate_slate"
	AllowPublicInvites  bool            `json:"allow_public_invites"`
	RequireSSOAuth      bool            `json:"require_sso_auth"`
}

func ParseSolutionProfile(raw string) SolutionProfile {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "gamer":
		return ProfileGamer
	case "corporate", "enterprise":
		return ProfileCorporate
	case "custom":
		return ProfileCustom
	default:
		return ProfileFamily
	}
}

func GetPresetMatrix(profile SolutionProfile) FeatureMatrix {
	switch profile {
	case ProfileGamer:
		return FeatureMatrix{
			Profile:             ProfileGamer,
			DisplayName:         "Gamer Solution",
			PresenceDetailLevel: "rich_game_status",
			EndToEndEncryption:  false,
			CustomEmojis:        true,
			FileUploadLimitMB:   200,
			DefaultTheme:        "gamer_dark",
			AllowPublicInvites:  true,
			RequireSSOAuth:      false,
			Screens: ScreenConfig{
				Chats:         true,
				MediaGallery:  true,
				VoiceRooms:    true,
				GameActivity:  true,
				AuditLogs:     false,
				MemberInvites: true,
				SSOManagement: false,
			},
		}

	case ProfileCorporate:
		return FeatureMatrix{
			Profile:             ProfileCorporate,
			DisplayName:         "Corporate Solution",
			PresenceDetailLevel: "working_hours",
			EndToEndEncryption:  true,
			CustomEmojis:        false,
			FileUploadLimitMB:   50,
			DefaultTheme:        "corporate_slate",
			AllowPublicInvites:  false,
			RequireSSOAuth:      true,
			Screens: ScreenConfig{
				Chats:         true,
				MediaGallery:  false,
				VoiceRooms:    false,
				GameActivity:  false,
				AuditLogs:     true,
				MemberInvites: false,
				SSOManagement: true,
			},
		}

	case ProfileCustom:
		return FeatureMatrix{
			Profile:             ProfileCustom,
			DisplayName:         "Custom Solution",
			PresenceDetailLevel: "basic",
			EndToEndEncryption:  false,
			CustomEmojis:        true,
			FileUploadLimitMB:   100,
			DefaultTheme:        "family_warm",
			AllowPublicInvites:  true,
			RequireSSOAuth:      false,
			Screens: ScreenConfig{
				Chats:         true,
				MediaGallery:  true,
				VoiceRooms:    true,
				GameActivity:  true,
				AuditLogs:     true,
				MemberInvites: true,
				SSOManagement: true,
			},
		}

	default: // Family
		return FeatureMatrix{
			Profile:             ProfileFamily,
			DisplayName:         "Family Solution",
			PresenceDetailLevel: "basic",
			EndToEndEncryption:  true,
			CustomEmojis:        true,
			FileUploadLimitMB:   100,
			DefaultTheme:        "family_warm",
			AllowPublicInvites:  true,
			RequireSSOAuth:      false,
			Screens: ScreenConfig{
				Chats:         true,
				MediaGallery:  true,
				VoiceRooms:    true,
				GameActivity:  false,
				AuditLogs:     false,
				MemberInvites: true,
				SSOManagement: false,
			},
		}
	}
}
