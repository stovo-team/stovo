package app

import (
	"context"
	"testing"
)

func TestListRolesRepairsMissingDefaultWithoutChangingCustomRoles(t *testing.T) {
	server, _, _ := newTestServer(t)
	ctx := context.Background()
	familyID := "roles-repair-test-family"
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO families (id,name,created_at,updated_at) VALUES ($1,'Role repair test',now()::text,now()::text)`, familyID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = server.sqlDB.ExecContext(context.Background(), `DELETE FROM users WHERE family_id=$1`, familyID)
		_, _ = server.sqlDB.ExecContext(context.Background(), `DELETE FROM server_roles WHERE family_id=$1`, familyID)
		_, _ = server.sqlDB.ExecContext(context.Background(), `DELETE FROM families WHERE id=$1`, familyID)
	})

	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO server_roles (id,family_id,name,description,permissions,is_default,created_at,updated_at) VALUES ($1,$2,'Custom reviewer','Keep this role','["manage_messages"]',false,now()::text,now()::text)`, familyID+":custom", familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO server_roles (id,family_id,name,description,permissions,is_default,created_at,updated_at) VALUES ($1,$2,'Member','Keep this same-name role','["manage_files"]',false,now()::text,now()::text)`, familyID+":custom-member", familyID); err != nil {
		t.Fatal(err)
	}
	for _, user := range []struct{ id, role, roleID string }{
		{id: familyID + ":owner", role: "owner"},
		{id: familyID + ":member", role: "member"},
		{id: familyID + ":custom", role: "member", roleID: familyID + ":custom"},
	} {
		if _, err := server.sqlDB.ExecContext(ctx, `INSERT INTO users (id,family_id,username,password_hash,display_name,role,role_id,created_at) VALUES ($1,$2,$1,'unused',$1,$3,NULLIF($4,''),now()::text)`, user.id, familyID, user.role, user.roleID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := server.sqlDB.ExecContext(ctx, `DELETE FROM server_roles WHERE id=$1`, familyID+":admin"); err != nil {
		t.Fatal(err)
	}

	loaded, err := server.roles.List(ctx, familyID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded) != 3 {
		t.Fatalf("role count after repair = %d, want custom roles preserved without conflicting defaults: %#v", len(loaded), loaded)
	}
	var preserved bool
	for _, role := range loaded {
		if role.ID == familyID+":custom-member" && role.Description == "Keep this same-name role" && len(role.Permissions) == 1 && role.Permissions[0] == "manage_files" && !role.IsDefault {
			preserved = true
		}
	}
	if !preserved {
		t.Fatalf("same-name custom role was changed: %#v", loaded)
	}
	for _, user := range []struct{ id, wantRoleID string }{
		{id: familyID + ":owner", wantRoleID: familyID + ":admin"},
		{id: familyID + ":member", wantRoleID: ""},
		{id: familyID + ":custom", wantRoleID: familyID + ":custom"},
	} {
		var roleID string
		if err := server.sqlDB.QueryRowContext(ctx, `SELECT COALESCE(role_id,'') FROM users WHERE id=$1`, user.id).Scan(&roleID); err != nil {
			t.Fatal(err)
		}
		if roleID != user.wantRoleID {
			t.Errorf("user %s role_id = %q, want %q", user.id, roleID, user.wantRoleID)
		}
	}
}
