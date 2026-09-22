package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestInviteCreateHandler(t *testing.T) {
	t.Run("ForbiddenForNonAdmin", func(t *testing.T) {
		handler := InviteCreateHandler{
			IsAdmin: func() bool { return false },
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites", bytes.NewBufferString(`{}`))
		handler.CreateInvite(recorder, req)
		if recorder.Code != stdhttp.StatusForbidden {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusForbidden)
		}
	})

	t.Run("InvalidRequestBody", func(t *testing.T) {
		handler := InviteCreateHandler{
			IsAdmin: func() bool { return true },
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites", bytes.NewBufferString(`{invalid`))
		handler.CreateInvite(recorder, req)
		if recorder.Code != stdhttp.StatusUnprocessableEntity {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusUnprocessableEntity)
		}
	})

	t.Run("InvalidRole", func(t *testing.T) {
		handler := InviteCreateHandler{
			IsAdmin:     func() bool { return true },
			IsValidRole: func(r string) bool { return r == "admin" || r == "member" },
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites", bytes.NewBufferString(`{"role":"owner"}`))
		handler.CreateInvite(recorder, req)
		if recorder.Code != stdhttp.StatusUnprocessableEntity {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusUnprocessableEntity)
		}
	})

	t.Run("InvalidSettings", func(t *testing.T) {
		hours := 0
		handler := InviteCreateHandler{
			IsAdmin:     func() bool { return true },
			IsValidRole: func(r string) bool { return true },
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites", bytes.NewBufferString(`{"expiresInHours":0}`))
		handler.CreateInvite(recorder, req)
		if recorder.Code != stdhttp.StatusUnprocessableEntity {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusUnprocessableEntity)
		}
		_ = hours
	})

	t.Run("Success", func(t *testing.T) {
		handler := InviteCreateHandler{
			IsAdmin:     func() bool { return true },
			IsValidRole: func(r string) bool { return true },
			Create: func(ctx context.Context, payload InviteCreateRequest) (any, int, string, error) {
				return InviteCreateResponse{InviteURL: "http://example.com/invite/123", Invite: "invite-data"}, 0, "", nil
			},
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites", bytes.NewBufferString(`{"role":"member"}`))
		handler.CreateInvite(recorder, req)
		if recorder.Code != stdhttp.StatusCreated {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusCreated)
		}
		var resp InviteCreateResponse
		_ = json.NewDecoder(recorder.Body).Decode(&resp)
		if resp.InviteURL != "http://example.com/invite/123" {
			t.Fatalf("inviteUrl=%q, want http://example.com/invite/123", resp.InviteURL)
		}
	})
}

func TestInviteAcceptHandler(t *testing.T) {
	t.Run("InvalidPayload", func(t *testing.T) {
		handler := InviteAcceptHandler{}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites/token/accept", bytes.NewBufferString(`{"username":"","password":"short"}`))
		handler.AcceptInvite(recorder, req)
		if recorder.Code != stdhttp.StatusUnprocessableEntity {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusUnprocessableEntity)
		}
	})

	t.Run("Success", func(t *testing.T) {
		var writtenResponse any
		handler := InviteAcceptHandler{
			Accept: func(ctx context.Context, token string, payload InviteAcceptRequest, clientIP string) (any, int, string, error) {
				if token != "valid-token" {
					return nil, stdhttp.StatusNotFound, "Invite not found", errors.New("not found")
				}
				return map[string]string{"user": "new-user"}, 0, "", nil
			},
			WriteSuccess: func(w stdhttp.ResponseWriter, _ *stdhttp.Request, status int, res any) {
				writtenResponse = res
				w.WriteHeader(status)
			},
		}
		router := chi.NewRouter()
		router.Post("/api/invites/{token}/accept", handler.AcceptInvite)

		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodPost, "/api/invites/valid-token/accept", bytes.NewBufferString(`{"username":"user1","displayName":"User One","password":"password123"}`))
		router.ServeHTTP(recorder, req)
		if recorder.Code != stdhttp.StatusCreated {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusCreated)
		}
		if writtenResponse == nil {
			t.Fatal("expected writtenResponse to be populated")
		}
	})
}

func TestInviteDeleteHandler(t *testing.T) {
	t.Run("ForbiddenForNonAdmin", func(t *testing.T) {
		handler := InviteDeleteHandler{
			IsAdmin: func() bool { return false },
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodDelete, "/api/invites/inv-1", nil)
		handler.DeleteInvite(recorder, req)
		if recorder.Code != stdhttp.StatusForbidden {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusForbidden)
		}
	})

	t.Run("Success", func(t *testing.T) {
		revokedID := ""
		handler := InviteDeleteHandler{
			IsAdmin: func() bool { return true },
			Revoke: func(ctx context.Context, inviteID string) (int, string, error) {
				revokedID = inviteID
				return 0, "", nil
			},
		}
		router := chi.NewRouter()
		router.Delete("/api/invites/{inviteId}", handler.DeleteInvite)

		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(stdhttp.MethodDelete, "/api/invites/inv-123", nil)
		router.ServeHTTP(recorder, req)
		if recorder.Code != stdhttp.StatusNoContent {
			t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusNoContent)
		}
		if revokedID != "inv-123" {
			t.Fatalf("revokedID=%q, want inv-123", revokedID)
		}
	})
}
