package app

import (
	"context"
	"testing"
)

func TestIntelligenceOIDCSubjectMappingPostgresContract(t *testing.T) {
	server, _, _ := newTestServer(t)
	ctx := context.Background()
	const (
		familyID  = "oidc-subject-family-test"
		firstID   = "oidc-subject-user-one"
		secondID  = "oidc-subject-user-two"
		issuer    = "https://messenger.example"
		stableSub = "opaque-synthetic-subject-001"
	)
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.families(id,name,created_at,updated_at) VALUES($1,'Synthetic OIDC family','2026-10-10','2026-10-10')`, []any{familyID}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Initial profile','member','2026-10-10')`, []any{firstID, familyID}},
		{`INSERT INTO public.users(id,family_id,username,password_hash,display_name,role,created_at) VALUES($1,$2,$1,'synthetic','Second profile','member','2026-10-10')`, []any{secondID, familyID}},
	} {
		if _, err := server.sqlDB.ExecContext(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("insert synthetic OIDC user: %v", err)
		}
	}

	var mappingTableExists bool
	if err := server.sqlDB.QueryRowContext(ctx, `SELECT to_regclass('public.intelligence_oidc_subjects') IS NOT NULL`).Scan(&mappingTableExists); err != nil {
		t.Fatalf("inspect OIDC subject mapping: %v", err)
	}
	if !mappingTableExists {
		t.Fatal("stable OIDC subject mapping table is missing")
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject) VALUES($1,$2,$3)`, issuer, firstID, stableSub); err != nil {
		t.Fatalf("insert synthetic OIDC subject: %v", err)
	}
	if _, err := server.sqlDB.ExecContext(ctx, `UPDATE public.users SET display_name='Updated profile',email='updated@example.invalid' WHERE id=$1`, firstID); err != nil {
		t.Fatalf("update unrelated user profile fields: %v", err)
	}
	var observedSub string
	if err := server.sqlDB.QueryRowContext(ctx, `SELECT subject FROM public.intelligence_oidc_subjects WHERE issuer=$1 AND user_id=$2`, issuer, firstID).Scan(&observedSub); err != nil {
		t.Fatalf("read stable subject after profile update: %v", err)
	}
	if observedSub != stableSub {
		t.Fatalf("subject after profile update = %q, want %q", observedSub, stableSub)
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject) VALUES($1,$2,$3)`, issuer, secondID, stableSub); err == nil {
		t.Fatal("the same issuer subject was assigned to two Messenger users")
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject) VALUES($1,$2,$3)`, "https://other-issuer.example", secondID, stableSub); err != nil {
		t.Fatalf("the same subject should be independent at another issuer: %v", err)
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject) VALUES($1,$2,$3)`, issuer, "missing-user", "another-subject"); err == nil {
		t.Fatal("OIDC subject mapping accepted a missing Messenger user")
	}
	if _, err := server.sqlDB.ExecContext(ctx, `DELETE FROM public.users WHERE id=$1`, firstID); err != nil {
		t.Fatalf("delete synthetic user with an OIDC mapping: %v", err)
	}
	var remainingMappings int
	if err := server.sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM public.intelligence_oidc_subjects WHERE issuer=$1 AND user_id=$2`, issuer, firstID).Scan(&remainingMappings); err != nil {
		t.Fatalf("check mapping cascade: %v", err)
	}
	if remainingMappings != 0 {
		t.Fatal("deleting a Messenger user left an orphaned OIDC subject mapping")
	}
}
