package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// AdminRoutes contains the already-composed handlers for administration
// endpoints. Authentication is deliberately composed by the caller so this
// transport package remains independent of application policy.
type AdminRoutes struct {
	Logs                        stdhttp.Handler
	GetPublicAccess             stdhttp.Handler
	UpdatePublicAccess          stdhttp.Handler
	PublicAccessSuggestions     stdhttp.Handler
	PublicAccessCheck           stdhttp.Handler
	TunnelStatus                stdhttp.Handler
	TunnelStart                 stdhttp.Handler
	TunnelStop                  stdhttp.Handler
	QuickStart                  stdhttp.Handler
	PublicIPQuickStart          stdhttp.Handler
	DomainLink                  stdhttp.Handler
	GetEncryptionSettings       stdhttp.Handler
	UpdateEncryptionSettings    stdhttp.Handler
	GetNotificationProvider     stdhttp.Handler
	UpdateNotificationProvider  stdhttp.Handler
	ListMCPConnectors           stdhttp.Handler
	CreateMCPConnector          stdhttp.Handler
	GetMCPConnector             stdhttp.Handler
	UpdateMCPConnector          stdhttp.Handler
	RegenerateMCPConnectorToken stdhttp.Handler
	RevokeMCPConnector          stdhttp.Handler
	ListMCPConnectorAudit       stdhttp.Handler
	ListPlugins                 stdhttp.Handler
	UpdatePlugin                stdhttp.Handler
}

// RegisterAdminRoutes installs the stable administration REST surface. Route
// shape belongs to this transport adapter; supplied handlers own request
// policy, use-case invocation, and response serialization.
func RegisterAdminRoutes(router chi.Router, routes AdminRoutes) {
	router.Method(stdhttp.MethodGet, "/api/admin/logs", routes.Logs)
	router.Method(stdhttp.MethodGet, "/api/admin/public-access", routes.GetPublicAccess)
	router.Method(stdhttp.MethodPut, "/api/admin/public-access", routes.UpdatePublicAccess)
	router.Method(stdhttp.MethodGet, "/api/admin/public-access/suggestions", routes.PublicAccessSuggestions)
	router.Method(stdhttp.MethodGet, "/api/admin/public-access/check", routes.PublicAccessCheck)
	router.Method(stdhttp.MethodGet, "/api/admin/public-access/tunnel/status", routes.TunnelStatus)
	router.Method(stdhttp.MethodPost, "/api/admin/public-access/tunnel/start", routes.TunnelStart)
	router.Method(stdhttp.MethodPost, "/api/admin/public-access/tunnel/stop", routes.TunnelStop)
	router.Method(stdhttp.MethodPost, "/api/admin/public-access/quick-start", routes.QuickStart)
	router.Method(stdhttp.MethodPost, "/api/admin/public-access/public-ip/quick-start", routes.PublicIPQuickStart)
	router.Method(stdhttp.MethodPost, "/api/admin/public-access/domain-link", routes.DomainLink)
	router.Method(stdhttp.MethodGet, "/api/admin/encryption-settings", routes.GetEncryptionSettings)
	router.Method(stdhttp.MethodPut, "/api/admin/encryption-settings", routes.UpdateEncryptionSettings)
	router.Method(stdhttp.MethodGet, "/api/admin/notification-provider", routes.GetNotificationProvider)
	router.Method(stdhttp.MethodPut, "/api/admin/notification-provider", routes.UpdateNotificationProvider)
	router.Method(stdhttp.MethodGet, "/api/admin/mcp-connectors", routes.ListMCPConnectors)
	router.Method(stdhttp.MethodPost, "/api/admin/mcp-connectors", routes.CreateMCPConnector)
	router.Method(stdhttp.MethodGet, "/api/admin/mcp-connectors/{connectorId}", routes.GetMCPConnector)
	router.Method(stdhttp.MethodPatch, "/api/admin/mcp-connectors/{connectorId}", routes.UpdateMCPConnector)
	router.Method(stdhttp.MethodPost, "/api/admin/mcp-connectors/{connectorId}/regenerate-token", routes.RegenerateMCPConnectorToken)
	router.Method(stdhttp.MethodPost, "/api/admin/mcp-connectors/{connectorId}/revoke", routes.RevokeMCPConnector)
	router.Method(stdhttp.MethodGet, "/api/admin/mcp-connectors/{connectorId}/audit", routes.ListMCPConnectorAudit)
	router.Method(stdhttp.MethodGet, "/api/admin/plugins", routes.ListPlugins)
	router.Method(stdhttp.MethodPatch, "/api/admin/plugins/{pluginId}", routes.UpdatePlugin)
}
