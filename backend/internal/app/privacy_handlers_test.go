package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type privacyStoreFake struct {
	ids          []string
	blockerID    string
	blockedID    string
	unblockedID  string
}

func (f *privacyStoreFake) ListBlockedUserIDs(_ context.Context, _ string) ([]string, error) {
	return f.ids, nil
}

func (f *privacyStoreFake) BlockUser(_ context.Context, blockerID, blockedID, _ string) error {
	f.blockerID = blockerID
	f.blockedID = blockedID
	return nil
}

func (f *privacyStoreFake) UnblockUser(_ context.Context, _, blockedID string) error {
	f.unblockedID = blockedID
	return nil
}

func TestPrivacyHandlerBlocksActiveFamilyMember(t *testing.T) {
	store := &privacyStoreFake{}
	handler := NewPrivacyHandler(store, func(id string) (userPublic, error) {
		return userPublic{ID: id, FamilyID: "family-1", IsActive: true}, nil
	})
	req := httptest.NewRequest(http.MethodPost, "/api/privacy/blocks/member-1", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("userId", "member-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
	recorder := httptest.NewRecorder()

	handler.handleBlockUser(recorder, req, userPublic{ID: "owner-1", FamilyID: "family-1"})

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if store.blockerID != "owner-1" || store.blockedID != "member-1" {
		t.Fatalf("block request = (%q, %q), want (owner-1, member-1)", store.blockerID, store.blockedID)
	}
}

func TestPrivacyHandlerRejectsOutsideFamilyAndDoesNotPersistBlock(t *testing.T) {
	store := &privacyStoreFake{}
	handler := NewPrivacyHandler(store, func(id string) (userPublic, error) {
		return userPublic{ID: id, FamilyID: "other-family", IsActive: true}, nil
	})
	req := httptest.NewRequest(http.MethodPost, "/api/privacy/blocks/member-1", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("userId", "member-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
	recorder := httptest.NewRecorder()

	handler.handleBlockUser(recorder, req, userPublic{ID: "owner-1", FamilyID: "family-1"})

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if store.blockedID != "" {
		t.Fatalf("unexpected block request for %q", store.blockedID)
	}
}
