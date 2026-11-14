package app

import "testing"

func TestManagerPermissionsDoNotIncludeMemberAdministration(t *testing.T) {
	manager := userPublic{Role: memberRole, Permissions: []string{permissionManageChannels}}
	if !hasPermission(manager, permissionManageChannels) {
		t.Fatal("manager must be allowed to create and manage server chats")
	}
	for _, permission := range []string{permissionManageMembers, permissionManageRoles, permissionManageServer} {
		if hasPermission(manager, permission) {
			t.Errorf("manager unexpectedly has %q", permission)
		}
	}
	server := &Server{}
	otherUser, managerID := "another-user", "manager"
	manager.ID = managerID
	chat := chatPublic{CreatedBy: &otherUser}
	if server.canAddChatMembers(chat, manager) {
		t.Fatal("manager must not add people to another member's chat")
	}
	chat.CreatedBy = &managerID
	if !server.canAddChatMembers(chat, manager) {
		t.Fatal("chat creator must retain authority to add people to their own chat")
	}
	chat.CreatedBy = &otherUser
	memberAdministrator := userPublic{ID: "member-admin", Role: memberRole, Permissions: []string{permissionManageMembers}}
	if !server.canAddChatMembers(chat, memberAdministrator) {
		t.Fatal("member administrators must retain authority to add people")
	}
}
