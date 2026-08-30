package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FamilyRoutes is the HTTP edge contract for family, membership, role, and
// plan endpoints. Authentication and request policy are composed by the
// caller, so this transport package remains independent of application code.
type FamilyRoutes struct {
	GetFamily    stdhttp.Handler
	UpdateFamily stdhttp.Handler
	GetMembers   stdhttp.Handler
	ListRoles    stdhttp.Handler
	CreateRole   stdhttp.Handler
	UpdateRole   stdhttp.Handler
	DeleteRole   stdhttp.Handler
	ChangeRole   stdhttp.Handler
	RemoveMember stdhttp.Handler
	GetPlans     stdhttp.Handler
	CreatePlan   stdhttp.Handler
	RSVPToPlan   stdhttp.Handler
}

// RegisterFamilyRoutes installs the stable REST paths for family management
// and plans. It owns route shape only; supplied handlers own authentication,
// mapping, and use-case invocation.
func RegisterFamilyRoutes(router chi.Router, routes FamilyRoutes) {
	router.Method(stdhttp.MethodGet, "/api/family", routes.GetFamily)
	router.Method(stdhttp.MethodPatch, "/api/family", routes.UpdateFamily)
	router.Method(stdhttp.MethodGet, "/api/family/members", routes.GetMembers)
	router.Method(stdhttp.MethodGet, "/api/family/roles", routes.ListRoles)
	router.Method(stdhttp.MethodPost, "/api/family/roles", routes.CreateRole)
	router.Method(stdhttp.MethodPatch, "/api/family/roles/{roleId}", routes.UpdateRole)
	router.Method(stdhttp.MethodDelete, "/api/family/roles/{roleId}", routes.DeleteRole)
	router.Method(stdhttp.MethodPatch, "/api/family/members/{userId}/role", routes.ChangeRole)
	router.Method(stdhttp.MethodDelete, "/api/family/members/{userId}", routes.RemoveMember)
	router.Method(stdhttp.MethodGet, "/api/plans", routes.GetPlans)
	router.Method(stdhttp.MethodPost, "/api/plans", routes.CreatePlan)
	router.Method(stdhttp.MethodPost, "/api/plans/{planId}/rsvp", routes.RSVPToPlan)
}

// InviteRoutes is the HTTP edge contract for invite endpoints. The preview
// and accept handlers deliberately remain unwrapped because their existing
// contracts authenticate through invite-specific request data.
type InviteRoutes struct {
	CreateInvite  stdhttp.Handler
	PreviewInvite stdhttp.Handler
	AcceptInvite  stdhttp.Handler
	DeleteInvite  stdhttp.Handler
}

// RegisterInviteRoutes installs the stable REST paths for invitations.
func RegisterInviteRoutes(router chi.Router, routes InviteRoutes) {
	router.Method(stdhttp.MethodPost, "/api/invites", routes.CreateInvite)
	router.Method(stdhttp.MethodGet, "/api/invites/{token}", routes.PreviewInvite)
	router.Method(stdhttp.MethodPost, "/api/invites/{token}/accept", routes.AcceptInvite)
	router.Method(stdhttp.MethodDelete, "/api/invites/{inviteId}", routes.DeleteInvite)
}
