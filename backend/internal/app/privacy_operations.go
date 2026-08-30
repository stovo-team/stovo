package app

import (
	"context"
	"slices"
)

func (s *Server) directContactBlocked(firstUserID, secondUserID string) (bool, error) {
	if s.contactPolicy == nil {
		return false, nil
	}
	return s.contactPolicy.DirectContactBlocked(context.Background(), firstUserID, secondUserID)
}

func contactPermissionAllows(target userPublic, inviterID, chatType string) bool {
	permission := target.DirectMessagePermission
	if chatType == "group" {
		permission = target.GroupInvitePermission
	}
	if chatType == "channel" {
		permission = target.ChannelInvitePermission
	}
	if chatType == "voice" {
		permission = target.VoiceInvitePermission
	}
	if chatType == "direct" {
		return permission != "nobody" && (permission != "selected" || slices.Contains(target.InvitePermissionUserIDs, inviterID))
	}
	return permission == "allow" || (permission == "selected" && slices.Contains(target.InvitePermissionUserIDs, inviterID))
}
