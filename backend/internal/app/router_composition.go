package app

import (
	"context"
	"net/http"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

// newRouter composes route modules. Each registration function owns one
// transport surface while the Server remains the lifecycle and middleware host.
func newRouter(s *Server) http.Handler {
	core := httptransport.NewCoreHandlers(httptransport.CoreHandlerDependencies{
		AppName: s.cfg.AppName, Environment: s.cfg.AppEnv, Version: s.cfg.AppVersion,
		DatabaseHealth: s.databaseHealth.Health,
		RedisHealth: func(ctx context.Context) error {
			if s.redisHealth == nil {
				return context.Canceled
			}
			return s.redisHealth.Health(ctx)
		},
	})
	return httptransport.NewRouter(httptransport.RouteComposition{
		AppURL:             s.cfg.AppURL,
		CORSAllowedOrigins: s.cfg.CORSAllowedOrigins,
		RefreshCookieName:  s.cfg.RefreshCookieName,
		Logger:             s.logger,
		Socket:             s.socketHTTPHandler(),
		Calls:              s.callRoutes(),
		GuestMeetings:      s.guestMeetingRoutes(),
		Core: httptransport.CoreRoutes{
			AssetLinks:  http.HandlerFunc(core.AssetLinks),
			Health:      http.HandlerFunc(core.Health),
			HealthDB:    http.HandlerFunc(core.HealthDB),
			HealthRedis: http.HandlerFunc(core.HealthRedis),
			Sync:        s.authenticated(s.handleSync),
			Manifest:    httptransport.NewManifestHandler(s.cfg, s.plugins),
		},
		Auth:                        s.authRoutes(),
		Family:                      s.familyRoutes(),
		Invites:                     s.inviteRoutes(),
		Chats:                       s.chatRoutes(),
		Files:                       s.fileRoutes(),
		Admin:                       s.adminRoutes(),
		MCP:                         s.mcpRoutes(),
		IntelligenceSource:          httptransport.NewIntelligenceSourceHandler(s.intelligenceSourceHandler()),
		IntelligenceSourceV2Consent: s.intelligenceSourceV2ConsentHandler(),
		IntelligenceOIDC:            s.intelligenceOIDCHandler(),
		Plugins:                     s.pluginRoutes(),
		FrontendFallback:            httptransport.NewFrontendProxy(s.cfg.FrontendOrigin, s.logger),
	})
}
