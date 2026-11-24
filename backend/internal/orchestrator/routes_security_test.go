package orchestrator

import (
	"strings"
	"testing"
)

func TestValidateSlugAndSanitizeDBName(t *testing.T) {
	validSlugs := []string{
		"server1",
		"cluster-prod",
		"team_alpha",
		"a1b2c3d4",
	}
	for _, slug := range validSlugs {
		if err := validateSlug(slug); err != nil {
			t.Errorf("validateSlug(%q) unexpected error: %v", slug, err)
		}
		dbIdent, err := sanitizeDBName(slug)
		if err != nil {
			t.Errorf("sanitizeDBName(%q) unexpected error: %v", slug, err)
		}
		if !strings.HasPrefix(dbIdent, `"stovo_db_`) || !strings.HasSuffix(dbIdent, `"`) {
			t.Errorf("sanitizeDBName(%q) = %q, want quoted identifier", slug, dbIdent)
		}
	}

	invalidSlugs := []string{
		"foo; DROP TABLE servers;--",
		"foo\" OR 1=1--",
		"../servers",
		"has space",
		"",
		"slug!",
		"slug$name",
		strings.Repeat("a", 65),
	}
	for _, slug := range invalidSlugs {
		if err := validateSlug(slug); err == nil {
			t.Errorf("validateSlug(%q) expected error, got nil", slug)
		}
		if _, err := sanitizeDBName(slug); err == nil {
			t.Errorf("sanitizeDBName(%q) expected error, got nil", slug)
		}
	}
}

func TestSanitizeHost(t *testing.T) {
	tests := []struct {
		name       string
		hostHeader string
		publicHost string
		want       string
	}{
		{
			name:       "valid public host takes priority",
			hostHeader: "evil.com",
			publicHost: "messenger.stovo.app",
			want:       "messenger.stovo.app",
		},
		{
			name:       "valid host header with port",
			hostHeader: "127.0.0.1:8080",
			publicHost: "",
			want:       "127.0.0.1:8080",
		},
		{
			name:       "malicious host header falls back to localhost",
			hostHeader: "evil.com/setup?foo=bar",
			publicHost: "",
			want:       "localhost",
		},
		{
			name:       "crlf host header falls back to localhost",
			hostHeader: "evil.com\r\nSet-Cookie: xss",
			publicHost: "",
			want:       "localhost",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeHost(tt.hostHeader, tt.publicHost)
			if got != tt.want {
				t.Errorf("sanitizeHost(%q, %q) = %q, want %q", tt.hostHeader, tt.publicHost, got, tt.want)
			}
		})
	}
}

func TestGetServerColumnRejectsUnknownColumns(t *testing.T) {
	o := &Orchestrator{masterDB: nil}
	if val := o.getServerColumn("slug", "non_existent; DROP TABLE servers;", "fallback"); val != "fallback" {
		t.Errorf("getServerColumn with arbitrary column = %q, want fallback", val)
	}
}
