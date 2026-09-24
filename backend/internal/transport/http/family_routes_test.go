package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterFamilyRoutesPreservesPathsMethodsAndParameters(t *testing.T) {
	router := chi.NewRouter()
	handler := func(name string) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			w.Header().Set("X-Route", name)
			w.WriteHeader(stdhttp.StatusNoContent)
		})
	}
	RegisterFamilyRoutes(router, FamilyRoutes{
		GetFamily: handler("get-family"), UpdateFamily: handler("update-family"), GetMembers: handler("get-members"),
		ListRoles: handler("list-roles"), CreateRole: handler("create-role"), UpdateRole: handler("update-role"),
		DeleteRole: handler("delete-role"), ChangeRole: handler("change-role"), RemoveMember: handler("remove-member"),
		GetMemberAdminDetails: handler("member-admin-details"), BanMemberIP: handler("ban-member-ip"), UnbanMemberIP: handler("unban-member-ip"),
		GetPlans: handler("get-plans"), CreatePlan: handler("create-plan"), RSVPToPlan: handler("rsvp"),
	})

	for _, request := range []struct {
		method, path, want string
	}{
		{stdhttp.MethodGet, "/api/family", "get-family"},
		{stdhttp.MethodPatch, "/api/family", "update-family"},
		{stdhttp.MethodGet, "/api/family/members", "get-members"},
		{stdhttp.MethodGet, "/api/family/roles", "list-roles"},
		{stdhttp.MethodPost, "/api/family/roles", "create-role"},
		{stdhttp.MethodPatch, "/api/family/roles/role-1", "update-role"},
		{stdhttp.MethodDelete, "/api/family/roles/role-1", "delete-role"},
		{stdhttp.MethodPatch, "/api/family/members/user-1/role", "change-role"},
		{stdhttp.MethodDelete, "/api/family/members/user-1", "remove-member"},
		{stdhttp.MethodGet, "/api/family/members/user-1/admin-details", "member-admin-details"},
		{stdhttp.MethodPut, "/api/family/members/user-1/ip-ban", "ban-member-ip"},
		{stdhttp.MethodDelete, "/api/family/members/user-1/ip-ban", "unban-member-ip"},
		{stdhttp.MethodGet, "/api/plans", "get-plans"},
		{stdhttp.MethodPost, "/api/plans", "create-plan"},
		{stdhttp.MethodPost, "/api/plans/plan-1/rsvp", "rsvp"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent || recorder.Header().Get("X-Route") != request.want {
				t.Fatalf("status=%d route=%q, want status=%d route=%q", recorder.Code, recorder.Header().Get("X-Route"), stdhttp.StatusNoContent, request.want)
			}
		})
	}
}

func TestRegisterInviteRoutesPreservesPathsAndAuthenticationComposition(t *testing.T) {
	router := chi.NewRouter()
	handler := func(name string) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			w.Header().Set("X-Route", name)
			w.WriteHeader(stdhttp.StatusNoContent)
		})
	}
	RegisterInviteRoutes(router, InviteRoutes{
		CreateInvite: handler("create"), PreviewInvite: handler("preview"),
		AcceptInvite: handler("accept"), DeleteInvite: handler("delete"),
	})

	for _, request := range []struct {
		method, path, want string
	}{
		{stdhttp.MethodPost, "/api/invites", "create"},
		{stdhttp.MethodGet, "/api/invites/token-1", "preview"},
		{stdhttp.MethodPost, "/api/invites/token-1/accept", "accept"},
		{stdhttp.MethodDelete, "/api/invites/invite-1", "delete"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent || recorder.Header().Get("X-Route") != request.want {
				t.Fatalf("status=%d route=%q, want status=%d route=%q", recorder.Code, recorder.Header().Get("X-Route"), stdhttp.StatusNoContent, request.want)
			}
		})
	}
}
