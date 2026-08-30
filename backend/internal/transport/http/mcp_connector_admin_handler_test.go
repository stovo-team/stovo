package http

import (
	"context"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMCPConnectorAdminHandlerAuthorization(t *testing.T) {
	h := NewMCPConnectorAdminHandler(MCPConnectorAdminOperations{
		IsAdmin: func(AdminActor) bool { return false },
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/admin/mcp-connectors", strings.NewReader(`{"name":"test"}`))
	h.Create(recorder, request, AdminActor{})
	if recorder.Code != stdhttp.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func TestMCPConnectorAdminHandlerCreateSuccess(t *testing.T) {
	h := NewMCPConnectorAdminHandler(MCPConnectorAdminOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Create: func(ctx context.Context, actor AdminActor, payload MCPConnectorCreatePayload, r *stdhttp.Request) (any, error) {
			return map[string]string{"id": "conn-123", "name": payload.Name}, nil
		},
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/admin/mcp-connectors", strings.NewReader(`{"name":"My Connector"}`))
	h.Create(recorder, request, AdminActor{Role: "admin"})
	if recorder.Code != stdhttp.StatusCreated {
		t.Fatalf("expected 201, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "My Connector") {
		t.Fatalf("expected body to contain My Connector, got %s", recorder.Body.String())
	}
}

func TestMCPConnectorAdminHandlerCreateErrorMapping(t *testing.T) {
	h := NewMCPConnectorAdminHandler(MCPConnectorAdminOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Create: func(ctx context.Context, actor AdminActor, payload MCPConnectorCreatePayload, r *stdhttp.Request) (any, error) {
			return nil, AdminHTTPError{Status: stdhttp.StatusConflict, Detail: "alias is already used"}
		},
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(stdhttp.MethodPost, "/api/admin/mcp-connectors", strings.NewReader(`{"name":"My Connector"}`))
	h.Create(recorder, request, AdminActor{Role: "admin"})
	if recorder.Code != stdhttp.StatusConflict {
		t.Fatalf("expected 409, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "alias is already used") {
		t.Fatalf("expected body to contain error detail, got %s", recorder.Body.String())
	}
}

func TestMCPConnectorAdminHandlerUpdateInvalidBody(t *testing.T) {
	h := NewMCPConnectorAdminHandler(MCPConnectorAdminOperations{
		IsAdmin: func(AdminActor) bool { return true },
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(stdhttp.MethodPatch, "/api/admin/mcp-connectors/123", strings.NewReader(`invalid json`))
	h.Update(recorder, request, AdminActor{Role: "admin"})
	if recorder.Code != stdhttp.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", recorder.Code)
	}
}

func TestMCPConnectorAdminHandlerRevoke(t *testing.T) {
	h := NewMCPConnectorAdminHandler(MCPConnectorAdminOperations{
		IsAdmin: func(AdminActor) bool { return true },
		Revoke: func(ctx context.Context, actor AdminActor, connectorID string) (any, error) {
			if connectorID == "unknown" {
				return nil, AdminHTTPError{Status: stdhttp.StatusNotFound, Detail: "Connector not found"}
			}
			return map[string]any{"id": connectorID, "revoked": true}, nil
		},
	})
	newReq := func(connectorID string) *stdhttp.Request {
		r := httptest.NewRequest(stdhttp.MethodPost, "/api/admin/mcp-connectors/"+connectorID+"/revoke", nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("connectorId", connectorID)
		return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	recorder := httptest.NewRecorder()
	h.Revoke(recorder, newReq("conn-1"), AdminActor{Role: "admin"})
	if recorder.Code != stdhttp.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	recorder404 := httptest.NewRecorder()
	h.Revoke(recorder404, newReq("unknown"), AdminActor{Role: "admin"})
	if recorder404.Code != stdhttp.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder404.Code)
	}
}
