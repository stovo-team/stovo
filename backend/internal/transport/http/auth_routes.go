package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// AuthRoutes contains the already-composed inbound handlers for account,
// session, privacy, and preference endpoints. Authentication remains a caller
// concern: protected entries must be wrapped before they are supplied here.
// This keeps the transport responsible only for HTTP method/path dispatch.
type AuthRoutes struct {
	SetupStatus          stdhttp.Handler
	Setup                stdhttp.Handler
	Login                stdhttp.Handler
	DeviceLoginRequest   stdhttp.Handler
	DeviceLoginVerify    stdhttp.Handler
	Refresh              stdhttp.Handler
	Logout               stdhttp.Handler
	Me                   stdhttp.Handler
	UpdateMe             stdhttp.Handler
	ChangePassword       stdhttp.Handler
	ListBlocks           stdhttp.Handler
	BlockUser            stdhttp.Handler
	UnblockUser          stdhttp.Handler
	GetAudioSettings     stdhttp.Handler
	PutAudioSettings     stdhttp.Handler
	GetNotificationTopic stdhttp.Handler
	RegisterDeviceToken  stdhttp.Handler
	UnregisterDeviceToken stdhttp.Handler
}

// RegisterAuthRoutes installs the stable REST contract for authentication and
// account-adjacent endpoints.
func RegisterAuthRoutes(router chi.Router, routes AuthRoutes) {
	router.Get("/api/auth/setup-status", routes.SetupStatus.ServeHTTP)
	router.Post("/api/auth/setup", routes.Setup.ServeHTTP)
	router.Post("/api/auth/login", routes.Login.ServeHTTP)
	router.Post("/api/auth/device-login/request", routes.DeviceLoginRequest.ServeHTTP)
	router.Post("/api/auth/device-login/verify", routes.DeviceLoginVerify.ServeHTTP)
	router.Post("/api/auth/refresh", routes.Refresh.ServeHTTP)
	router.Post("/api/auth/logout", routes.Logout.ServeHTTP)
	router.Get("/api/auth/me", routes.Me.ServeHTTP)
	router.Patch("/api/auth/me", routes.UpdateMe.ServeHTTP)
	router.Post("/api/auth/change-password", routes.ChangePassword.ServeHTTP)
	router.Get("/api/privacy/blocks", routes.ListBlocks.ServeHTTP)
	router.Post("/api/privacy/blocks/{userId}", routes.BlockUser.ServeHTTP)
	router.Delete("/api/privacy/blocks/{userId}", routes.UnblockUser.ServeHTTP)
	router.Get("/api/auth/audio-settings", routes.GetAudioSettings.ServeHTTP)
	router.Put("/api/auth/audio-settings", routes.PutAudioSettings.ServeHTTP)
	router.Get("/api/notifications/topic", routes.GetNotificationTopic.ServeHTTP)
	if routes.RegisterDeviceToken != nil {
		router.Post("/api/notifications/device-token", routes.RegisterDeviceToken.ServeHTTP)
	}
	if routes.UnregisterDeviceToken != nil {
		router.Delete("/api/notifications/device-token", routes.UnregisterDeviceToken.ServeHTTP)
	}
}
