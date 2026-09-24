package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestBanMemberIPRejectsMalformedBodyBeforeCallingOperation(t *testing.T) {
	called := false
	router := chi.NewRouter()
	router.Put("/members/{userId}/ip-ban", FamilyMemberHandler{BanIP: func(_ context.Context, _, _ string) (int, string, error) {
		called = true
		return 0, "", nil
	}}.BanMemberIP)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/members/member-1/ip-ban", strings.NewReader("{")))
	if recorder.Code != http.StatusUnprocessableEntity || called {
		t.Fatalf("status=%d operation called=%v; want 422 and no operation", recorder.Code, called)
	}
}

func TestBanAndUnbanMemberIPMapStatuses(t *testing.T) {
	var seenIP string
	router := chi.NewRouter()
	memberHandler := FamilyMemberHandler{
		BanIP: func(_ context.Context, userID, ip string) (int, string, error) {
			if userID != "member-1" {
				t.Fatalf("user id = %q", userID)
			}
			seenIP = ip
			return 0, "", nil
		},
		UnbanIP: func(_ context.Context, userID string) (int, string, error) {
			if userID != "member-1" {
				t.Fatalf("unban user id = %q", userID)
			}
			return 0, "", nil
		},
	}
	router.Put("/members/{userId}/ip-ban", memberHandler.BanMemberIP)
	router.Delete("/members/{userId}/ip-ban", memberHandler.UnbanMemberIP)
	ban := httptest.NewRecorder()
	router.ServeHTTP(ban, httptest.NewRequest(http.MethodPut, "/members/member-1/ip-ban", strings.NewReader(`{"ip":"192.0.2.4"}`)))
	if ban.Code != http.StatusNoContent || seenIP != "192.0.2.4" {
		t.Fatalf("ban status=%d ip=%q, want 204 and exact address", ban.Code, seenIP)
	}
	unban := httptest.NewRecorder()
	router.ServeHTTP(unban, httptest.NewRequest(http.MethodDelete, "/members/member-1/ip-ban", nil))
	if unban.Code != http.StatusNoContent {
		t.Fatalf("unban status=%d, want 204", unban.Code)
	}
}
