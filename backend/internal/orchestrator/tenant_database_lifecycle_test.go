package orchestrator

import "testing"

func TestTenantDatabaseAdminURLMustMatchDirectPostgresEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		direct   string
		admin    string
		wantFail bool
	}{
		{name: "same host and port with admin database", direct: "postgres://app:pw@db.example:5432/stovo_{slug}?sslmode=require", admin: "postgres://admin:pw@db.example:5432/postgres?sslmode=require"},
		{name: "different host", direct: "postgres://app:pw@db.example:5432/stovo_{slug}", admin: "postgres://admin:pw@other.example:5432/postgres", wantFail: true},
		{name: "different port", direct: "postgres://app:pw@db.example:5432/stovo_{slug}", admin: "postgres://admin:pw@db.example:5433/postgres", wantFail: true},
		{name: "local default with external admin endpoint", direct: "postgres://postgres@postgres:5432/stovo_db_{slug}?sslmode=disable", admin: "postgres://admin:pw@managed.example:5432/postgres", wantFail: true},
		{name: "missing endpoint", direct: "postgres://app:pw@db.example:5432/stovo_{slug}", admin: "not-a-postgres-url", wantFail: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTenantDatabaseAdminURL(tt.direct, tt.admin)
			if (err != nil) != tt.wantFail {
				t.Fatalf("validateTenantDatabaseAdminURL() error = %v, wantFail %v", err, tt.wantFail)
			}
		})
	}
}
