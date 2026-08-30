package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	featureprivacy "stovo-messenger/backend/internal/features/privacy"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

type privacyStoreFake struct {
	ids         []string
	blockerID   string
	blockedID   string
	unblockedID string
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
	handler := httptransport.NewPrivacyHandler(httptransport.PrivacyOperations[userPublic]{
		Privacy: featureprivacy.NewService(store, time.Now),
		LookupUser: func(_ context.Context, id string) (userPublic, error) {
			return userPublic{ID: id, FamilyID: "family-1", IsActive: true}, nil
		},
		ExtractMember: func(user userPublic) featureprivacy.Member {
			return featureprivacy.Member{ID: user.ID, FamilyID: user.FamilyID, Active: user.IsActive}
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/privacy/blocks/member-1", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("userId", "member-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
	recorder := httptest.NewRecorder()

	handler.BlockUser(userPublic{ID: "owner-1", FamilyID: "family-1"}).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if store.blockerID != "owner-1" || store.blockedID != "member-1" {
		t.Fatalf("block request = (%q, %q), want (owner-1, member-1)", store.blockerID, store.blockedID)
	}
}

func TestPrivacyHandlerRejectsOutsideFamilyAndDoesNotPersistBlock(t *testing.T) {
	store := &privacyStoreFake{}
	handler := httptransport.NewPrivacyHandler(httptransport.PrivacyOperations[userPublic]{
		Privacy: featureprivacy.NewService(store, time.Now),
		LookupUser: func(_ context.Context, id string) (userPublic, error) {
			return userPublic{ID: id, FamilyID: "other-family", IsActive: true}, nil
		},
		ExtractMember: func(user userPublic) featureprivacy.Member {
			return featureprivacy.Member{ID: user.ID, FamilyID: user.FamilyID, Active: user.IsActive}
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/privacy/blocks/member-1", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("userId", "member-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
	recorder := httptest.NewRecorder()

	handler.BlockUser(userPublic{ID: "owner-1", FamilyID: "family-1"}).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if store.blockedID != "" {
		t.Fatalf("unexpected block request for %q", store.blockedID)
	}
}
