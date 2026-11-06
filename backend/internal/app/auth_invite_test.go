package app

import (
	"testing"
	"time"

	"stovo-messenger/backend/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

func TestValidateAdminInviteTokenIsScopedToTenant(t *testing.T) {
	const secret = "test-master-secret"
	t.Setenv("MASTER_SYSTEM_SECRET", secret)
	issue := func(server string) string {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"server": server,
			"type":   "admin_invite",
			"exp":    time.Now().Add(time.Hour).Unix(),
		})
		signed, err := token.SignedString([]byte(secret))
		if err != nil {
			t.Fatal(err)
		}
		return signed
	}

	server := &Server{cfg: config.Config{ServerID: "tenant-a"}}
	if !server.validateAdminInviteToken(issue("tenant-a")) {
		t.Fatal("matching tenant invitation should be accepted")
	}
	if server.validateAdminInviteToken(issue("tenant-b")) {
		t.Fatal("invitation for another tenant must be rejected")
	}
}

func TestSetupRequiresInvitationOnlyForNewlyProvisionedTenants(t *testing.T) {
	tests := []struct {
		name        string
		activeUsers int
		required    bool
		valid       bool
		want        bool
	}{
		{name: "new tenant rejects public setup", required: true, want: false},
		{name: "new tenant accepts its invitation", required: true, valid: true, want: true},
		{name: "legacy tenant keeps initial setup", want: true},
		{name: "completed setup rejects public setup", activeUsers: 1, want: false},
		{name: "completed setup accepts valid admin invitation", activeUsers: 1, valid: true, want: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := canCompleteSetup(test.activeUsers, test.required, test.valid); got != test.want {
				t.Fatalf("canCompleteSetup() = %t, want %t", got, test.want)
			}
		})
	}
}
