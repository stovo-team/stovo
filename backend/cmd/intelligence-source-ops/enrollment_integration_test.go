package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"testing"
)

func TestPilotEnrollmentBindsOneActiveUserAndIsIdempotent(t *testing.T) {
	dsn := os.Getenv("TEST_ENROLL_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_ENROLL_DATABASE_URL requires a disposable database")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	ctx := context.Background()
	_, err = db.ExecContext(ctx, `
        CREATE TABLE families(id text PRIMARY KEY);
        CREATE TABLE users(id text PRIMARY KEY, family_id text NOT NULL REFERENCES families(id), is_active integer NOT NULL);
        CREATE TABLE intelligence_installations(id text PRIMARY KEY, tenant_id text NOT NULL UNIQUE, family_id text NOT NULL REFERENCES families(id), enabled boolean NOT NULL);
        CREATE TABLE intelligence_oidc_subjects(issuer text NOT NULL, user_id text NOT NULL REFERENCES users(id), subject text NOT NULL, PRIMARY KEY(issuer,user_id), UNIQUE(issuer,subject));
        INSERT INTO families(id) VALUES ('family-1'), ('family-2');
        INSERT INTO users(id,family_id,is_active) VALUES ('user-1','family-1',1), ('user-2','family-2',1), ('inactive','family-1',0);
    `)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DROP TABLE IF EXISTS intelligence_oidc_subjects, intelligence_installations, users, families CASCADE`)
		_ = db.Close()
	})
	request := enrollmentRequest{FamilyID: "family-1", TenantID: "pilot-space", UserID: "user-1", Issuer: "https://messenger.example"}
	first, err := enrollInstallation(ctx, db, request)
	if err != nil {
		t.Fatal(err)
	}
	if first.Subject == "" || first.Subject == request.UserID || first.InstallationID == "" {
		t.Fatalf("invalid result: %+v", first)
	}
	second, err := enrollInstallation(ctx, db, request)
	if err != nil || second != first {
		t.Fatalf("non-idempotent: %+v %v", second, err)
	}
	var stdout, stderr bytes.Buffer
	if code := runEnrollment(ctx, []string{"--family-id", "family-1", "--tenant-id", "pilot-space", "--user-id", "user-1"}, &stdout, &stderr, db, request.Issuer); code != 0 {
		t.Fatalf("enrollment command failed: %s", stderr.String())
	}
	var output enrollmentResult
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil || output != first {
		t.Fatalf("enrollment command returned unexpected output: %q", stdout.String())
	}
	for _, bad := range []enrollmentRequest{
		{FamilyID: "family-1", TenantID: "other", UserID: "user-1", Issuer: request.Issuer},
		{FamilyID: "family-1", TenantID: "pilot-space", UserID: "user-2", Issuer: request.Issuer},
		{FamilyID: "family-1", TenantID: "pilot-space", UserID: "inactive", Issuer: request.Issuer},
		{FamilyID: "family-2", TenantID: "pilot-space", UserID: "user-2", Issuer: request.Issuer},
		{FamilyID: "family-1", TenantID: "pilot-space", UserID: "user-1", Issuer: "http://messenger.example"},
		{FamilyID: "family-1", TenantID: "pilot-space", UserID: "user-1", Issuer: "https://messenger.example/"},
	} {
		if _, err := enrollInstallation(ctx, db, bad); err == nil {
			t.Fatalf("accepted invalid enrollment: %+v", bad)
		}
	}
	var installations, subjects int
	if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM intelligence_installations), (SELECT count(*) FROM intelligence_oidc_subjects)`).Scan(&installations, &subjects); err != nil {
		t.Fatal(err)
	}
	if installations != 1 || subjects != 1 {
		t.Fatalf("failed request left state: %d installations, %d subjects", installations, subjects)
	}
}
