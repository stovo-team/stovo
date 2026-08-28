package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// newRouter composes route modules. Each registration function owns one
// transport surface while the Server remains the lifecycle and middleware host.
func newRouter(s *Server) http.Handler {
	router := chi.NewRouter()
	router.Use(s.corsMiddleware)
	router.Use(s.loggingMiddleware)
	s.registerSocketRoutes(router)
	s.registerCallRoutes(router)
	s.registerCoreRoutes(router)
	s.registerAuthRoutes(router)
	s.registerFamilyRoutes(router)
	s.registerInviteRoutes(router)
	s.registerChatRoutes(router)
	s.registerFileRoutes(router)
	s.registerAdminRoutes(router)
	s.registerMCPRoutes(router)
	router.MethodFunc(http.MethodGet, "/*", s.handleFrontendProxy)
	router.MethodFunc(http.MethodHead, "/*", s.handleFrontendProxy)
	return router
}

func (s *Server) registerSocketRoutes(router chi.Router) {
	router.Method(http.MethodGet, "/socket.io/", s.sockets.HttpHandler())
	router.Method(http.MethodPost, "/socket.io/", s.sockets.HttpHandler())
	router.Method(http.MethodGet, "/socket.io/*", s.sockets.HttpHandler())
	router.Method(http.MethodPost, "/socket.io/*", s.sockets.HttpHandler())
}

func (s *Server) registerCallRoutes(router chi.Router) {
	router.Get("/api/calls/ice-servers", s.authenticated(s.handleGetIceServers))
	router.Post("/api/calls/{roomId}/sfu-token", s.authenticated(s.handleCreateCallSFUToken))
	router.Post("/api/calls/{roomId}/transcription/start", s.authenticated(s.handleStartTranscription))
	router.Post("/api/calls/{roomId}/transcription/stop", s.authenticated(s.handleStopTranscription))
	router.Get("/api/calls/{roomId}/transcription/status", s.authenticated(s.handleGetTranscriptionStatus))
	router.Get("/api/calls/{roomId}/transcript", s.authenticated(s.handleGetTranscript))
	router.Post("/api/calls/{roomId}/transcription/uploads", s.authenticated(s.handleRequestUploadURL))
	router.Put("/api/calls/{roomId}/transcription/uploads/{chunkId}/data", s.authenticated(s.handleUploadAudioChunkData))
	router.Post("/api/calls/{roomId}/transcription/uploads/{chunkId}/complete", s.authenticated(s.handleCompleteUpload))
	router.Patch("/api/calls/{roomId}/transcript/segments/{segmentId}", s.authenticated(s.handleUpdateTranscriptSegment))
	router.Get("/api/calls/{roomId}/transcript/artifacts/{artifactType}", s.authenticated(s.handleGetTranscriptArtifact))
}

func (s *Server) registerCoreRoutes(router chi.Router) {
	router.Get("/.well-known/assetlinks.json", s.handleAssetLinks)
	router.Get("/api/health", s.handleHealth)
	router.Get("/api/health/db", s.handleHealthDB)
	router.Get("/api/health/redis", s.handleHealthRedis)
	router.Get("/api/sync", s.authenticated(s.handleSync))
}

func (s *Server) registerAuthRoutes(router chi.Router) {
	privacy := NewPrivacyHandler(s.privacy, s.getUserByID)
	preferences := NewAccountPreferencesHandler(s.preferences, s.cfg.AppURL, s.decodeJSON)
	router.Get("/api/auth/setup-status", s.handleSetupStatus)
	router.Post("/api/auth/setup", s.handleSetup)
	router.Post("/api/auth/login", s.handleLogin)
	router.Post("/api/auth/device-login/request", s.handleDeviceLoginRequest)
	router.Post("/api/auth/device-login/verify", s.handleDeviceLoginVerify)
	router.Post("/api/auth/refresh", s.handleRefresh)
	router.Post("/api/auth/logout", s.handleLogout)
	router.Get("/api/auth/me", s.authenticated(s.handleMe))
	router.Patch("/api/auth/me", s.authenticated(s.handleUpdateMe))
	router.Post("/api/auth/change-password", s.authenticated(s.handleChangePassword))
	router.Get("/api/privacy/blocks", s.authenticated(privacy.handleListBlocks))
	router.Post("/api/privacy/blocks/{userId}", s.authenticated(privacy.handleBlockUser))
	router.Delete("/api/privacy/blocks/{userId}", s.authenticated(privacy.handleUnblockUser))
	router.Get("/api/auth/audio-settings", s.authenticated(preferences.handleGetAudioSettings))
	router.Put("/api/auth/audio-settings", s.authenticated(preferences.handlePutAudioSettings))
	router.Get("/api/notifications/topic", s.authenticated(preferences.handleGetNotificationTopic))
}

func (s *Server) registerFamilyRoutes(router chi.Router) {
	plans := NewPlanHTTPHandler(s.plans, s.decodeJSON, s.emitPlanEvent)
	router.Get("/api/family", s.authenticated(s.handleGetFamily))
	router.Patch("/api/family", s.authenticated(s.handleUpdateFamily))
	router.Get("/api/family/members", s.authenticated(s.handleGetMembers))
	router.Get("/api/family/roles", s.authenticated(s.handleListServerRoles))
	router.Post("/api/family/roles", s.authenticated(s.handleCreateServerRole))
	router.Patch("/api/family/roles/{roleId}", s.authenticated(s.handleUpdateServerRole))
	router.Delete("/api/family/roles/{roleId}", s.authenticated(s.handleDeleteServerRole))
	router.Patch("/api/family/members/{userId}/role", s.authenticated(s.handleChangeRole))
	router.Delete("/api/family/members/{userId}", s.authenticated(s.handleRemoveMember))
	router.Get("/api/plans", s.authenticated(plans.handleGetPlans))
	router.Post("/api/plans", s.authenticated(plans.handleCreatePlan))
	router.Post("/api/plans/{planId}/rsvp", s.authenticated(plans.handlePlanRSVP))
}

func (s *Server) registerInviteRoutes(router chi.Router) {
	router.Post("/api/invites", s.authenticated(s.handleCreateInvite))
	router.Get("/api/invites/{token}", s.handlePreviewInvite)
	router.Post("/api/invites/{token}/accept", s.handleAcceptInvite)
	router.Delete("/api/invites/{inviteId}", s.authenticated(s.handleDeleteInvite))
}

func (s *Server) registerChatRoutes(router chi.Router) {
	router.Get("/api/chats", s.authenticated(s.handleGetChats))
	router.Post("/api/chats/direct", s.authenticated(s.handleCreateDirectChat))
	router.Post("/api/chats/group", s.authenticated(s.handleCreateGroupChat))
	router.Post("/api/chats/channel", s.authenticated(s.handleCreateChannelChat))
	router.Post("/api/chats/voice", s.authenticated(s.handleCreateVoiceChat))
	router.Get("/api/chats/{chatId}", s.authenticated(s.handleGetChat))
	router.Patch("/api/chats/{chatId}", s.authenticated(s.handleUpdateChat))
	router.Post("/api/chats/{chatId}/members", s.authenticated(s.handleAddChatMembers))
	router.Patch("/api/chats/{chatId}/preferences", s.authenticated(s.handleUpdateChatPreferences))
	router.Get("/api/chats/{chatId}/messages", s.authenticated(s.handleGetMessages))
	router.Post("/api/chats/{chatId}/messages", s.authenticated(s.handleSendMessage))
	router.Get("/api/messages/{messageId}", s.authenticated(s.handleGetMessage))
	router.Post("/api/messages/{messageId}/attachments", s.authenticated(s.handleAttachMessageFiles))
	router.Get("/api/chats/{chatId}/pins", s.authenticated(s.handleGetPins))
	router.Post("/api/chats/{chatId}/pins/{messageId}", s.authenticated(s.handlePinMessage))
	router.Delete("/api/chats/{chatId}/pins/{messageId}", s.authenticated(s.handleUnpinMessage))
	router.Patch("/api/messages/{messageId}", s.authenticated(s.handleEditMessage))
	router.Delete("/api/messages/{messageId}", s.authenticated(s.handleDeleteMessage))
	router.Patch("/api/messages/{messageId}/read", s.authenticated(s.handleMarkMessageRead))
	router.Post("/api/messages/{messageId}/forward", s.authenticated(s.handleForwardMessage))
	router.Get("/api/message-archive", s.authenticated(s.handleGetMessageArchive))
	router.Post("/api/messages/{messageId}/archive", s.authenticated(s.handleArchiveMessage))
	router.Post("/api/messages/{messageId}/reactions", s.authenticated(s.handleAddMessageReaction))
	router.Delete("/api/messages/{messageId}/reactions/{emoji}", s.authenticated(s.handleRemoveMessageReaction))
}

func (s *Server) registerFileRoutes(router chi.Router) {
	router.Post("/api/files/upload", s.authenticated(s.handleUploadFile))
	router.Post("/api/files/uploads", s.authenticated(s.handleReserveDirectFileUpload))
	router.Get("/api/files/uploads/{uploadId}", s.authenticated(s.handleGetDirectFileUpload))
	router.Post("/api/files/uploads/{uploadId}/complete", s.authenticated(s.handleCompleteDirectFileUpload))
	router.Get("/api/files", s.authenticated(s.handleGetFiles))
	router.Get("/api/files/{fileId}", s.authenticated(s.handleGetFile))
	router.Post("/api/files/{fileId}/access", s.authenticated(s.handleCreateDirectFileAccess))
	router.Get("/api/files/{fileId}/download", s.authenticated(s.handleDownloadFile))
	router.Get("/api/files/{fileId}/thumbnail", s.authenticated(s.handleGetFileThumbnail))
	router.Post("/api/files/{fileId}/playback-token", s.authenticated(s.handleCreateMediaPlaybackToken))
	router.Patch("/api/files/{fileId}/preferences", s.authenticated(s.handleUpdateFilePreferences))
	router.Post("/api/files/{fileId}/transcribe", s.authenticated(s.handleTranscribeFile))
	router.Get("/api/files/{fileId}/transcript", s.authenticated(s.handleGetFileTranscript))
	router.Delete("/api/files/{fileId}", s.authenticated(s.handleDeleteFile))
	router.Get("/api/media/{fileId}", s.handleStreamMediaPlaybackFile)
	router.Head("/api/media/{fileId}", s.handleStreamMediaPlaybackFile)
}

func (s *Server) registerAdminRoutes(router chi.Router) {
	router.Get("/api/admin/logs", s.authenticated(s.handleAdminLogs))
	router.Get("/api/admin/public-access", s.authenticated(s.handleGetPublicAccess))
	router.Put("/api/admin/public-access", s.authenticated(s.handleUpdatePublicAccess))
	router.Get("/api/admin/public-access/suggestions", s.authenticated(s.handlePublicAccessSuggestions))
	router.Get("/api/admin/public-access/check", s.authenticated(s.handlePublicAccessCheck))
	router.Post("/api/admin/public-access/public-ip/quick-start", s.authenticated(s.handlePublicIPQuickStart))
	router.Post("/api/admin/public-access/domain-link", s.authenticated(s.handleDomainLink))
	router.Get("/api/admin/encryption-settings", s.authenticated(s.handleGetEncryptionSettings))
	router.Put("/api/admin/encryption-settings", s.authenticated(s.handleUpdateEncryptionSettings))
	router.Get("/api/admin/mcp-connectors", s.authenticated(s.handleListMCPConnectors))
	router.Post("/api/admin/mcp-connectors", s.authenticated(s.handleCreateMCPConnector))
	router.Get("/api/admin/mcp-connectors/{connectorId}", s.authenticated(s.handleGetMCPConnector))
	router.Patch("/api/admin/mcp-connectors/{connectorId}", s.authenticated(s.handleUpdateMCPConnector))
	router.Post("/api/admin/mcp-connectors/{connectorId}/regenerate-token", s.authenticated(s.handleRegenerateMCPConnectorToken))
	router.Post("/api/admin/mcp-connectors/{connectorId}/revoke", s.authenticated(s.handleRevokeMCPConnector))
	router.Get("/api/admin/mcp-connectors/{connectorId}/audit", s.authenticated(s.handleListMCPConnectorAudit))
}

func (s *Server) registerMCPRoutes(router chi.Router) {
	if s.mcpHTTP == nil {
		return
	}
	router.Handle("/mcp", s.mcpAuthMiddleware(s.mcpHTTP))
	router.Handle("/mcp/", s.mcpAuthMiddleware(s.mcpHTTP))
}
