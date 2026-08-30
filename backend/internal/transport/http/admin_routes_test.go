package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterAdminRoutesPreservesMethodsAndPaths(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-Admin-Route", r.Method+" "+r.URL.Path)
		w.WriteHeader(stdhttp.StatusNoContent)
	})
	routes := AdminRoutes{
		Logs: handler, GetPublicAccess: handler, UpdatePublicAccess: handler,
		PublicAccessSuggestions: handler, PublicAccessCheck: handler,
		TunnelStatus: handler, TunnelStart: handler, TunnelStop: handler,
		QuickStart: handler, PublicIPQuickStart: handler, DomainLink: handler,
		GetEncryptionSettings: handler, UpdateEncryptionSettings: handler,
		ListMCPConnectors: handler, CreateMCPConnector: handler,
		GetMCPConnector: handler, UpdateMCPConnector: handler,
		RegenerateMCPConnectorToken: handler, RevokeMCPConnector: handler,
		ListMCPConnectorAudit: handler,
	}
	RegisterAdminRoutes(router, routes)

	for _, request := range []struct{ method, path string }{
		{stdhttp.MethodGet, "/api/admin/logs"},
		{stdhttp.MethodGet, "/api/admin/public-access"},
		{stdhttp.MethodPut, "/api/admin/public-access"},
		{stdhttp.MethodGet, "/api/admin/public-access/suggestions"},
		{stdhttp.MethodGet, "/api/admin/public-access/check"},
		{stdhttp.MethodGet, "/api/admin/public-access/tunnel/status"},
		{stdhttp.MethodPost, "/api/admin/public-access/tunnel/start"},
		{stdhttp.MethodPost, "/api/admin/public-access/tunnel/stop"},
		{stdhttp.MethodPost, "/api/admin/public-access/quick-start"},
		{stdhttp.MethodPost, "/api/admin/public-access/public-ip/quick-start"},
		{stdhttp.MethodPost, "/api/admin/public-access/domain-link"},
		{stdhttp.MethodGet, "/api/admin/encryption-settings"},
		{stdhttp.MethodPut, "/api/admin/encryption-settings"},
		{stdhttp.MethodGet, "/api/admin/mcp-connectors"},
		{stdhttp.MethodPost, "/api/admin/mcp-connectors"},
		{stdhttp.MethodGet, "/api/admin/mcp-connectors/connector-1"},
		{stdhttp.MethodPatch, "/api/admin/mcp-connectors/connector-1"},
		{stdhttp.MethodPost, "/api/admin/mcp-connectors/connector-1/regenerate-token"},
		{stdhttp.MethodPost, "/api/admin/mcp-connectors/connector-1/revoke"},
		{stdhttp.MethodGet, "/api/admin/mcp-connectors/connector-1/audit"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusNoContent)
			}
			if recorder.Header().Get("X-Admin-Route") != request.method+" "+request.path {
				t.Fatalf("handler not invoked for %s %s", request.method, request.path)
			}
		})
	}
}

func TestRegisterAdminRoutesRejectsWrongMethod(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {})
	RegisterAdminRoutes(router, AdminRoutes{
		Logs: handler, GetPublicAccess: handler, UpdatePublicAccess: handler,
		PublicAccessSuggestions: handler, PublicAccessCheck: handler,
		PublicIPQuickStart: handler, DomainLink: handler,
		GetEncryptionSettings: handler, UpdateEncryptionSettings: handler,
		ListMCPConnectors: handler, CreateMCPConnector: handler,
		GetMCPConnector: handler, UpdateMCPConnector: handler,
		RegenerateMCPConnectorToken: handler, RevokeMCPConnector: handler,
		ListMCPConnectorAudit: handler,
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodDelete, "/api/admin/logs", nil))
	if recorder.Code != stdhttp.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusMethodNotAllowed)
	}
}
