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
	AppURL           string
	Logger           RequestLogger
	Socket           stdhttp.Handler
	Calls            CallRoutes
	Core             CoreRoutes
	Auth             AuthRoutes
	Family           FamilyRoutes
	Invites          InviteRoutes
	Chats            ChatRoutes
	Files            FileRoutes
	Admin            AdminRoutes
	MCP              stdhttp.Handler
	FrontendFallback stdhttp.Handler
}

// NewRouter installs the stable HTTP surface in its historical order.
func NewRouter(routes RouteComposition) stdhttp.Handler {
	router := chi.NewRouter()
	router.Use(CORS(routes.AppURL))
	router.Use(RequestLogging(routes.Logger))
	RegisterSocketRoutes(router, routes.Socket)
	RegisterCallRoutes(router, routes.Calls)
	RegisterCoreRoutes(router, routes.Core)
	RegisterAuthRoutes(router, routes.Auth)
	RegisterFamilyRoutes(router, routes.Family)
	RegisterInviteRoutes(router, routes.Invites)
	RegisterChatRoutes(router, routes.Chats)
	RegisterFileRoutes(router, routes.Files)
	RegisterAdminRoutes(router, routes.Admin)
	RegisterMCPRoutes(router, routes.MCP)
	if routes.FrontendFallback != nil {
		router.MethodFunc(stdhttp.MethodGet, "/*", routes.FrontendFallback.ServeHTTP)
		router.MethodFunc(stdhttp.MethodHead, "/*", routes.FrontendFallback.ServeHTTP)
	}
	return router
}
