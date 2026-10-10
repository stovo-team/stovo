package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// RouteComposition is the complete inbound HTTP contract assembled by the
// composition root. It keeps route registration, middleware ordering, and the
// frontend fallback in the HTTP transport while allowing callers to supply
// already-authenticated handlers without importing Chi.
type RouteComposition struct {
	AppURL             string
	CORSAllowedOrigins []string
	RefreshCookieName  string
	Logger             RequestLogger
	Socket             stdhttp.Handler
	Calls              CallRoutes
	GuestMeetings      stdhttp.Handler
	Core               CoreRoutes
	Auth               AuthRoutes
	Family             FamilyRoutes
	Invites            InviteRoutes
	Chats              ChatRoutes
	Files              FileRoutes
	Admin              AdminRoutes
	MCP                stdhttp.Handler
	IntelligenceOIDC   stdhttp.Handler
	IntelligenceSource stdhttp.Handler
	Plugins            stdhttp.Handler
	FrontendFallback   stdhttp.Handler
}

// NewRouter installs the stable HTTP surface in its historical order.
func NewRouter(routes RouteComposition) stdhttp.Handler {
	router := chi.NewRouter()
	router.Use(CORS(routes.AppURL, routes.CORSAllowedOrigins...))
	router.Use(CookieCSRF(routes.RefreshCookieName, routes.AppURL, routes.CORSAllowedOrigins...))
	router.Use(RequestLogging(routes.Logger))
	RegisterSocketRoutes(router, routes.Socket)
	RegisterCallRoutes(router, routes.Calls)
	if routes.GuestMeetings != nil {
		router.Mount("/api/guest-meetings", routes.GuestMeetings)
	}
	RegisterCoreRoutes(router, routes.Core)
	RegisterAuthRoutes(router, routes.Auth)
	RegisterFamilyRoutes(router, routes.Family)
	RegisterInviteRoutes(router, routes.Invites)
	RegisterChatRoutes(router, routes.Chats)
	RegisterFileRoutes(router, routes.Files)
	RegisterAdminRoutes(router, routes.Admin)
	RegisterMCPRoutes(router, routes.MCP)
	if routes.IntelligenceSource != nil {
		router.Mount("/api/v1/intelligence/source", routes.IntelligenceSource)
	}
	if routes.IntelligenceOIDC != nil {
		router.MethodFunc(stdhttp.MethodGet, "/.well-known/openid-configuration", routes.IntelligenceOIDC.ServeHTTP)
		router.MethodFunc(stdhttp.MethodGet, "/oauth2/authorize", routes.IntelligenceOIDC.ServeHTTP)
		router.MethodFunc(stdhttp.MethodPost, "/oauth2/token", routes.IntelligenceOIDC.ServeHTTP)
		router.MethodFunc(stdhttp.MethodGet, "/oauth2/jwks", routes.IntelligenceOIDC.ServeHTTP)
	}
	if routes.Plugins != nil {
		router.Mount("/api/v1/plugins", routes.Plugins)
	}
	if routes.FrontendFallback != nil {
		router.MethodFunc(stdhttp.MethodGet, "/*", routes.FrontendFallback.ServeHTTP)
		router.MethodFunc(stdhttp.MethodHead, "/*", routes.FrontendFallback.ServeHTTP)
	}
	return router
}
