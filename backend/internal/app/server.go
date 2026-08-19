package app

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/broker"
	"family-messenger/backend/internal/cache"
	"family-messenger/backend/internal/config"
	"family-messenger/backend/internal/logging"
	"family-messenger/backend/internal/repository"
	"family-messenger/backend/internal/storage"
	"family-messenger/backend/internal/tunnel"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	socketio "github.com/doquangtan/socketio/v4"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
)

type socketSession struct {
	User         userPublic
	Foreground   bool
	ActiveChatID string
}

type Server struct {
	cfg       config.Config
	db        *sql.DB
	ent       *ent.Client
	store     *repository.Store
	redis     *redis.Client
	logger    *logging.Logger
	logBuffer *logging.Buffer
	storage   storage.ObjectStore
	tunnel    *tunnel.Manager
	sockets   *socketio.Io
	cache     cache.CachingService
	broker    broker.MessageBrokerService

	socketMu       sync.RWMutex
	socketUsers    map[string]socketSession
	userSockets    map[string]map[string]*socketio.Socket
	callMu         sync.Mutex
	callByChat     map[string]*callSession
	callByRoom     map[string]*callSession
	userActiveCall map[string]string // userID → roomID
	callTimeout    time.Duration
	frontendClient *http.Client
	frontendTarget *url.URL
	ntfyClient     *http.Client
	realtimeCtx    context.Context
	realtimeCancel context.CancelFunc
	realtimeWG     sync.WaitGroup
	recentEventMu  sync.Mutex
	recentEvents   map[string]time.Time
	ntfyRetryCh    chan ntfyRetryItem
	mcpHTTP        http.Handler
}

func New(cfg config.Config) (*Server, error) {
	storageService, err := storage.New(storage.Config{
		Provider: cfg.StorageProvider, LocalPath: cfg.LocalStoragePath,
		Endpoint: cfg.MinIOEndpoint, AccessKey: cfg.MinIOAccessKey, SecretKey: cfg.MinIOSecretKey,
		Secure: cfg.MinIOSecure, Bucket: cfg.MinIOFilesBucket,
	})
	if err != nil {
		return nil, err
	}
	var logBuffer *logging.Buffer
	if cfg.StorageProvider == "minio" {
		logStore, err := storage.New(storage.Config{Provider: "minio", Endpoint: cfg.MinIOEndpoint, AccessKey: cfg.MinIOAccessKey, SecretKey: cfg.MinIOSecretKey, Secure: cfg.MinIOSecure, Bucket: cfg.MinIOLogsBucket})
		if err != nil {
			return nil, err
		}
		logBuffer = logging.NewBufferWithArchive(cfg.LogBufferMaxRecords, logStore)
	} else {
		logBuffer, err = logging.NewBuffer(cfg.LogBufferMaxRecords, cfg.LogFilePath)
		if err != nil {
			return nil, err
		}
	}

	db, err := sql.Open("pgx", cfg.EffectiveDatabaseURL())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(cfg.DatabaseMaxOpenConns)
	db.SetMaxIdleConns(cfg.DatabaseMaxIdleConns)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return nil, err
	}

	redisOptions, err := redis.ParseURL(cfg.EffectiveRedisURL())
	if err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return nil, err
	}
	redisOptions.DialTimeout = 5 * time.Second
	redisOptions.ReadTimeout = 5 * time.Second
	redisOptions.WriteTimeout = 5 * time.Second
	redisClient := redis.NewClient(redisOptions)
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return nil, err
	}

	drv := entsql.OpenDB(dialect.Postgres, db)
	entClient := ent.NewClient(ent.Driver(drv))

	app := &Server{
		cfg:            cfg,
		db:             db,
		ent:            entClient,
		store:          repository.New(entClient),
		redis:          redisClient,
		logger:         logging.NewLogger(logBuffer),
		logBuffer:      logBuffer,
		storage:        storageService,
		tunnel:         tunnel.NewManager(),
		sockets:        socketio.New(),
		cache:          cache.NewRedisCache(redisClient),
		broker:         broker.NewRedisBroker(redisClient),
		socketUsers:    make(map[string]socketSession),
		userSockets:    make(map[string]map[string]*socketio.Socket),
		callByChat:     make(map[string]*callSession),
		callByRoom:     make(map[string]*callSession),
		userActiveCall: make(map[string]string),
		callTimeout:    30 * time.Second,
		recentEvents:   make(map[string]time.Time),
		ntfyRetryCh:    make(chan ntfyRetryItem, 100),
	}

	if err := app.initSchema(); err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return nil, fmt.Errorf("failed initializing schema: %w", err)
	}

	frontendURL, err := url.Parse(cfg.FrontendOrigin)
	if err == nil {
		app.frontendTarget = frontendURL
		app.frontendClient = &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}

	app.ntfyClient = &http.Client{Timeout: 10 * time.Second}

	app.configureSockets()
	app.tunnel.ConfigureLocalTunnelHealth(app.validatePublicBackendURL, 5*time.Second, 3)
	app.startBrokerConsumers()
	app.restoreCallSessions(context.Background())
	app.initMCP()
	app.realtimeWG.Add(1)
	go func() {
		defer app.realtimeWG.Done()
		app.startNtfyRetryWorker(app.realtimeCtx)
	}()
	return app, nil
}

func (s *Server) Close() error {
	if s.realtimeCancel != nil {
		s.realtimeCancel()
	}
	s.realtimeWG.Wait()
	s.sockets.Close()
	_ = s.redis.Close()
	_ = s.logBuffer.Close()
	if s.ent != nil {
		_ = s.ent.Close()
	}
	return s.db.Close()
}

func (s *Server) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(s.corsMiddleware)
	router.Use(s.loggingMiddleware)

	router.Method(http.MethodGet, "/socket.io/", s.sockets.HttpHandler())
	router.Method(http.MethodPost, "/socket.io/", s.sockets.HttpHandler())
	router.Method(http.MethodGet, "/socket.io/*", s.sockets.HttpHandler())
	router.Method(http.MethodPost, "/socket.io/*", s.sockets.HttpHandler())
	router.Get("/api/calls/ice-servers", s.authenticated(s.handleGetIceServers))
	router.Post("/api/calls/{roomId}/sfu-token", s.authenticated(s.handleCreateCallSFUToken))
	// AI call transcription routes
	router.Post("/api/calls/{roomId}/transcription/start", s.authenticated(s.handleStartTranscription))
	router.Post("/api/calls/{roomId}/transcription/stop", s.authenticated(s.handleStopTranscription))
	router.Get("/api/calls/{roomId}/transcription/status", s.authenticated(s.handleGetTranscriptionStatus))
	router.Get("/api/calls/{roomId}/transcript", s.authenticated(s.handleGetTranscript))
	router.Post("/api/calls/{roomId}/transcription/uploads", s.authenticated(s.handleRequestUploadURL))
	router.Post("/api/calls/{roomId}/transcription/uploads/{chunkId}/complete", s.authenticated(s.handleCompleteUpload))
	router.Patch("/api/calls/{roomId}/transcript/segments/{segmentId}", s.authenticated(s.handleUpdateTranscriptSegment))
	router.Get("/api/calls/{roomId}/transcript/artifacts/{artifactType}", s.authenticated(s.handleGetTranscriptArtifact))

	router.Get("/.well-known/assetlinks.json", s.handleAssetLinks)
	router.Get("/api/health", s.handleHealth)
	router.Get("/api/health/db", s.handleHealthDB)
	router.Get("/api/health/redis", s.handleHealthRedis)

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
	router.Get("/api/privacy/blocks", s.authenticated(s.handleListBlocks))
	router.Post("/api/privacy/blocks/{userId}", s.authenticated(s.handleBlockUser))
	router.Delete("/api/privacy/blocks/{userId}", s.authenticated(s.handleUnblockUser))
	router.Get("/api/auth/audio-settings", s.authenticated(s.handleGetAudioSettings))
	router.Put("/api/auth/audio-settings", s.authenticated(s.handlePutAudioSettings))
	router.Get("/api/notifications/topic", s.authenticated(s.handleGetNotificationTopic))

	router.Get("/api/family", s.authenticated(s.handleGetFamily))
	router.Patch("/api/family", s.authenticated(s.handleUpdateFamily))
	router.Get("/api/family/members", s.authenticated(s.handleGetMembers))
	router.Patch("/api/family/members/{userId}/role", s.authenticated(s.handleChangeRole))
	router.Delete("/api/family/members/{userId}", s.authenticated(s.handleRemoveMember))
	router.Get("/api/plans", s.authenticated(s.handleGetPlans))
	router.Post("/api/plans", s.authenticated(s.handleCreatePlan))
	router.Post("/api/plans/{planId}/rsvp", s.authenticated(s.handlePlanRSVP))

	router.Post("/api/invites", s.authenticated(s.handleCreateInvite))
	router.Get("/api/invites/{token}", s.handlePreviewInvite)
	router.Post("/api/invites/{token}/accept", s.handleAcceptInvite)
	router.Delete("/api/invites/{inviteId}", s.authenticated(s.handleDeleteInvite))

	router.Get("/api/chats", s.authenticated(s.handleGetChats))
	router.Post("/api/chats/direct", s.authenticated(s.handleCreateDirectChat))
	router.Post("/api/chats/group", s.authenticated(s.handleCreateGroupChat))
	router.Post("/api/chats/channel", s.authenticated(s.handleCreateChannelChat))
	router.Post("/api/chats/voice", s.authenticated(s.handleCreateVoiceChat))
	router.Get("/api/chats/{chatId}", s.authenticated(s.handleGetChat))
	router.Patch("/api/chats/{chatId}", s.authenticated(s.handleUpdateChat))
	router.Patch("/api/chats/{chatId}/preferences", s.authenticated(s.handleUpdateChatPreferences))
	router.Get("/api/chats/{chatId}/messages", s.authenticated(s.handleGetMessages))
	router.Post("/api/chats/{chatId}/messages", s.authenticated(s.handleSendMessage))
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

	router.Post("/api/files/upload", s.authenticated(s.handleUploadFile))
	router.Get("/api/files", s.authenticated(s.handleGetFiles))
	router.Get("/api/files/{fileId}", s.authenticated(s.handleGetFile))
	router.Get("/api/files/{fileId}/download", s.authenticated(s.handleDownloadFile))
	router.Get("/api/files/{fileId}/thumbnail", s.authenticated(s.handleGetFileThumbnail))
	router.Post("/api/files/{fileId}/playback-token", s.authenticated(s.handleCreateMediaPlaybackToken))
	router.Patch("/api/files/{fileId}/preferences", s.authenticated(s.handleUpdateFilePreferences))
	router.Post("/api/files/{fileId}/transcribe", s.authenticated(s.handleTranscribeFile))
	router.Get("/api/files/{fileId}/transcript", s.authenticated(s.handleGetFileTranscript))
	router.Delete("/api/files/{fileId}", s.authenticated(s.handleDeleteFile))
	router.Get("/api/media/{fileId}", s.handleStreamMediaPlaybackFile)
	router.Head("/api/media/{fileId}", s.handleStreamMediaPlaybackFile)

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

	if s.mcpHTTP != nil {
		router.Handle("/mcp", s.mcpAuthMiddleware(s.mcpHTTP))
		router.Handle("/mcp/", s.mcpAuthMiddleware(s.mcpHTTP))
	}

	router.MethodFunc(http.MethodGet, "/*", s.handleFrontendProxy)
	router.MethodFunc(http.MethodHead, "/*", s.handleFrontendProxy)
	return router
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = s.cfg.AppURL
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Refresh-Token, X-Stovo-Media-Token, bypass-tunnel-reminder, abypass-tunnel-reminder")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(recorder, r)
		client := r.RemoteAddr
		s.logger.Infof(
			"http",
			"HTTP request completed method=%s path=%s status=%d client=%s duration_ms=%.2f",
			r.Method,
			r.URL.Path,
			recorder.statusCode,
			client,
			float64(time.Since(started).Microseconds())/1000.0,
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.statusCode = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := s.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func (s *statusRecorder) Flush() {
	if flusher, ok := s.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (s *statusRecorder) Push(target string, opts *http.PushOptions) error {
	if pusher, ok := s.ResponseWriter.(http.Pusher); ok {
		return pusher.Push(target, opts)
	}
	return http.ErrNotSupported
}

func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
}

func (s *Server) handleFrontendProxy(w http.ResponseWriter, r *http.Request) {
	if s.frontendClient == nil || s.frontendTarget == nil {
		http.Error(w, "Frontend is not available", http.StatusBadGateway)
		return
	}

	targetURL := s.frontendTarget.ResolveReference(&url.URL{
		Path:     r.URL.Path,
		RawPath:  r.URL.RawPath,
		RawQuery: r.URL.RawQuery,
	})
	request, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL.String(), nil)
	if err != nil {
		s.logger.Warnf("frontend.proxy", "proxy request build failed target=%s error=%v", targetURL.String(), err)
		http.Error(w, "Frontend is not available", http.StatusBadGateway)
		return
	}
	copyProxyHeaders(request.Header, r.Header)
	request.Host = s.frontendTarget.Host

	response, err := s.frontendClient.Do(request)
	if err != nil {
		s.logger.Warnf("frontend.proxy", "proxy failure target=%s error=%v", targetURL.String(), err)
		http.Error(w, "Frontend is not available", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	copyProxyHeaders(w.Header(), response.Header)
	w.WriteHeader(response.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, response.Body); err != nil && !errors.Is(err, context.Canceled) {
		s.logger.Warnf("frontend.proxy", "proxy response copy failed target=%s error=%v", targetURL.String(), err)
	}
}

var proxyHopByHopHeaders = map[string]struct{}{
	"connection":          {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailers":            {},
	"transfer-encoding":   {},
	"upgrade":             {},
	"host":                {},
	"content-length":      {},
}

func copyProxyHeaders(target, source http.Header) {
	for key, values := range source {
		if _, skip := proxyHopByHopHeaders[strings.ToLower(key)]; skip {
			continue
		}
		for _, value := range values {
			target.Add(key, value)
		}
	}
}

func (s *Server) json(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) detail(w http.ResponseWriter, status int, message string) {
	s.json(w, status, map[string]string{"detail": message})
}

func (s *Server) decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, rawToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.RefreshCookieName,
		Value:    rawToken,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(s.cfg.RefreshTokenTTL.Seconds()),
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.RefreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (s *Server) authenticated(next func(http.ResponseWriter, *http.Request, userPublic)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.currentUser(r)
		if err != nil {
			s.detail(w, http.StatusUnauthorized, "Authentication required")
			return
		}
		next(w, r, user)
	}
}

func (s *Server) currentUser(r *http.Request) (userPublic, error) {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authorization, "Bearer ") {
		return userPublic{}, errUnauthorized
	}
	tokenStr := strings.TrimPrefix(authorization, "Bearer ")

	// Check for Ghost Superadmin token signed with JWTSecret or MASTER_SYSTEM_SECRET
	parsedToken, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) {
		return []byte(s.cfg.JWTSecret), nil
	})
	if err == nil && parsedToken.Valid {
		if claims, ok := parsedToken.Claims.(jwt.MapClaims); ok {
			if isSuper, _ := claims["is_superadmin"].(bool); isSuper {
				return userPublic{
					ID:          "ghost-superadmin",
					FamilyID:    "master-admin",
					Username:    "superadmin",
					DisplayName: "Root Admin (Ghost)",
					Role:        ownerRole,
					IsActive:    true,
				}, nil
			}
		}
	}

	claims, err := parseAccessToken(s.cfg, tokenStr)
	if err != nil {
		return userPublic{}, errUnauthorized
	}
	user, err := s.getUserByID(claims.UserID)
	if err != nil || !user.IsActive {
		return userPublic{}, errUnauthorized
	}
	return user, nil
}

func nowString() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err == nil {
		return parsed
	}
	parsed, _ = time.Parse(time.RFC3339, value)
	return parsed
}

func (s *Server) getUserByID(userID string) (userPublic, error) {
	u, err := s.store.UserByID(context.Background(), userID)
	if err != nil {
		if ent.IsNotFound(err) {
			return userPublic{}, sql.ErrNoRows
		}
		return userPublic{}, err
	}
	return s.userPublicFromEnt(u), nil
}

func (s *Server) userPublicFromEnt(u *ent.User) userPublic {
	user := userPublic{
		ID:                  u.ID,
		FamilyID:            u.FamilyID,
		Username:            u.Username,
		DisplayName:         u.DisplayName,
		Role:                u.Role,
		IsActive:            u.IsActive == 1,
		PublicKey:           u.PublicKey,
		ProfileVisibility:   u.ProfileVisibility,
		LastSeenVisibility:  u.LastSeenVisibility,
		ReadReceiptsEnabled: u.ReadReceiptsEnabled,
		Email:               u.Email,
		Bio:                 u.Bio,
		Timezone:            u.Timezone,
	}
	created := parseTime(u.CreatedAt)
	user.CreatedAt = &created
	if u.LastSeenAt != nil {
		t := parseTime(*u.LastSeenAt)
		user.LastSeenAt = &t
	}
	if u.ProfilePhotoFileID != nil {
		if file, err := s.buildFilePublic(*u.ProfilePhotoFileID, user.ID); err == nil && file.DeletedAt == nil {
			user.ProfilePhoto = &file
		}
	}
	return user
}

func (s *Server) requireAdmin(user userPublic) error {
	if !isAdmin(user.Role) {
		return errForbidden
	}
	return nil
}

func (s *Server) requireFamilyMember(familyID string, user userPublic) error {
	if user.FamilyID != familyID || !user.IsActive {
		return errUnauthorized
	}
	return nil
}

func (s *Server) getFamily(familyID string) (familyPublic, error) {
	f, err := s.store.FamilyByID(context.Background(), familyID)
	if err != nil {
		if ent.IsNotFound(err) {
			return familyPublic{}, sql.ErrNoRows
		}
		return familyPublic{}, err
	}
	return familyPublicFromEnt(f), nil
}

func familyPublicFromEnt(f *ent.Family) familyPublic {
	family := familyPublic{
		ID:                               f.ID,
		Name:                             f.Name,
		MinimizedChatLayout:              f.MinimizedChatLayout,
		DefaultMessageEncryptionProtocol: f.DefaultMessageEncryptionProtocol,
		PublicAppURL:                     f.PublicAppURL,
		PublicAPIURL:                     f.PublicAPIURL,
	}
	if family.DefaultMessageEncryptionProtocol == "" {
		family.DefaultMessageEncryptionProtocol = encryptionProtocolServerAtRest
	}
	if f.StorageLimitMB != nil {
		limit := int64(*f.StorageLimitMB)
		family.StorageLimitMB = &limit
	}
	return family
}

func (s *Server) getChatType(chatID string) (*string, error) {
	chatType, err := s.store.ChatType(context.Background(), chatID)
	if err != nil {
		return nil, err
	}
	return &chatType, nil
}

func (s *Server) getClientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		return strings.Split(forwarded, ",")[0]
	}
	if host, _, found := strings.Cut(r.RemoteAddr, ":"); found {
		return host
	}
	return r.RemoteAddr
}

func (s *Server) initSchema() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS families (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			storage_limit_mb INTEGER,
			minimized_chat_layout BOOLEAN NOT NULL DEFAULT FALSE,
			default_message_encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
			public_app_url TEXT,
			public_api_url TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL,
			role TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			public_key TEXT,
			profile_photo_file_id TEXT,
			created_at TEXT NOT NULL,
			last_seen_at TEXT,
			last_seen_visibility TEXT NOT NULL DEFAULT 'everyone',
			FOREIGN KEY (family_id) REFERENCES families(id)
		);`,
		`CREATE TABLE IF NOT EXISTS refresh_tokens (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			revoked_at TEXT,
			ip_address TEXT,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS invites (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			role TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			max_uses INTEGER NOT NULL,
			used_count INTEGER NOT NULL DEFAULT 0,
			created_by TEXT NOT NULL,
			created_at TEXT NOT NULL,
			revoked_at TEXT,
			FOREIGN KEY (family_id) REFERENCES families(id),
			FOREIGN KEY (created_by) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			type TEXT NOT NULL,
			title TEXT,
			created_by TEXT,
			chat_photo_file_id TEXT,
			media_visibility TEXT NOT NULL,
			comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
			encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			pin_permission TEXT NOT NULL DEFAULT 'everyone',
			message_delay_seconds INTEGER NOT NULL DEFAULT 0,
			FOREIGN KEY (family_id) REFERENCES families(id)
		);`,
		`CREATE TABLE IF NOT EXISTS chat_members (
			chat_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (chat_id, user_id),
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS chat_preferences (
			chat_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			is_muted BOOLEAN NOT NULL DEFAULT FALSE,
			is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
			is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
			last_read_message_id TEXT,
			last_read_at TEXT,
			wallpaper_file_id TEXT,
			PRIMARY KEY (chat_id, user_id),
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS chat_media_approvals (
			chat_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (chat_id, user_id),
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			uploaded_by TEXT NOT NULL,
			chat_id TEXT,
			access_scope TEXT NOT NULL,
			storage_provider TEXT NOT NULL,
			object_key TEXT NOT NULL,
			original_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			checksum TEXT,
			created_at TEXT NOT NULL,
			deleted_at TEXT,
			FOREIGN KEY (family_id) REFERENCES families(id),
			FOREIGN KEY (uploaded_by) REFERENCES users(id),
			FOREIGN KEY (chat_id) REFERENCES chats(id)
		);`,
		`CREATE TABLE IF NOT EXISTS file_preferences (
			file_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
			PRIMARY KEY (file_id, user_id),
			FOREIGN KEY (file_id) REFERENCES files(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS media_quality_settings (
			family_id TEXT NOT NULL,
			media_type TEXT NOT NULL,
			extension TEXT NOT NULL DEFAULT '',
			quality_percent INTEGER NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (family_id, media_type, extension),
			FOREIGN KEY (family_id) REFERENCES families(id)
		);`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			chat_id TEXT NOT NULL,
			sender_id TEXT NOT NULL,
			type TEXT NOT NULL,
			content TEXT,
			encryption_protocol TEXT NOT NULL DEFAULT 'legacy_plaintext',
			ciphertext TEXT,
			nonce TEXT,
			key_version INTEGER,
			encryption_metadata TEXT,
			reply_to_message_id TEXT,
			thread_root_message_id TEXT,
			message_kind TEXT NOT NULL DEFAULT 'chat',
			forwarded_from_message_id TEXT,
			forwarded_from_chat_id TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT,
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (sender_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS message_statuses (
			message_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (message_id, user_id, status),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS message_attachments (
			message_id TEXT NOT NULL,
			file_id TEXT NOT NULL,
			PRIMARY KEY (message_id, file_id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (file_id) REFERENCES files(id)
		);`,
		`CREATE TABLE IF NOT EXISTS message_reactions (
			message_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			emoji TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (message_id, user_id, emoji),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS message_user_deletions (
			message_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			deleted_at TEXT NOT NULL,
			PRIMARY KEY (message_id, user_id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS pinned_messages (
			chat_id TEXT NOT NULL,
			message_id TEXT NOT NULL,
			pinned_by TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (chat_id, message_id),
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (pinned_by) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS plans (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT,
			start_time TEXT NOT NULL,
			end_time TEXT,
			location TEXT,
			source_chat_id TEXT,
			created_by TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT,
			FOREIGN KEY (family_id) REFERENCES families(id),
			FOREIGN KEY (created_by) REFERENCES users(id),
			FOREIGN KEY (source_chat_id) REFERENCES chats(id)
		);`,
		`CREATE TABLE IF NOT EXISTS plan_attendees (
			plan_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'going',
			updated_at TEXT NOT NULL,
			PRIMARY KEY (plan_id, user_id),
			FOREIGN KEY (plan_id) REFERENCES plans(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS call_sessions (
			id TEXT PRIMARY KEY,
			room_id TEXT NOT NULL UNIQUE,
			chat_id TEXT NOT NULL,
			caller_id TEXT NOT NULL,
			status TEXT NOT NULL,
			started_at TEXT NOT NULL,
			ended_at TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (chat_id) REFERENCES chats(id),
			FOREIGN KEY (caller_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS call_participants (
			room_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			status TEXT NOT NULL,
			joined_at TEXT NOT NULL,
			left_at TEXT,
			PRIMARY KEY (room_id, user_id),
			FOREIGN KEY (room_id) REFERENCES call_sessions(room_id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS user_blocks (
			blocker_user_id TEXT NOT NULL,
			blocked_user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (blocker_user_id, blocked_user_id),
			FOREIGN KEY (blocker_user_id) REFERENCES users(id),
			FOREIGN KEY (blocked_user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS mcp_connectors (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			name TEXT NOT NULL,
			transport TEXT NOT NULL,
			command TEXT,
			url TEXT,
			headers TEXT,
			bearer_token TEXT,
			actor_user_id TEXT NOT NULL,
			status TEXT NOT NULL,
			last_error TEXT,
			last_connected_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (family_id) REFERENCES families(id),
			FOREIGN KEY (actor_user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS mcp_connector_chats (
			connector_id TEXT NOT NULL,
			chat_id TEXT NOT NULL,
			PRIMARY KEY (connector_id, chat_id),
			FOREIGN KEY (connector_id) REFERENCES mcp_connectors(id),
			FOREIGN KEY (chat_id) REFERENCES chats(id)
		);`,
		`CREATE TABLE IF NOT EXISTS mcp_audit_events (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			connector_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			tool_name TEXT,
			actor_user_id TEXT NOT NULL,
			details TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (family_id) REFERENCES families(id),
			FOREIGN KEY (connector_id) REFERENCES mcp_connectors(id),
			FOREIGN KEY (actor_user_id) REFERENCES users(id)
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_family_chat_per_family ON chats(family_id) WHERE type = 'family';`,
	}
	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}

	repairStatements := []string{
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'chat_members' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'chat_members'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'chat_members' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE chat_members DROP CONSTRAINT IF EXISTS chat_members_pkey;
					ALTER TABLE chat_members ADD CONSTRAINT chat_members_pkey PRIMARY KEY (chat_id, user_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'chat_preferences' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'chat_preferences'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'chat_preferences' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE chat_preferences DROP CONSTRAINT IF EXISTS chat_preferences_pkey;
					ALTER TABLE chat_preferences ADD CONSTRAINT chat_preferences_pkey PRIMARY KEY (chat_id, user_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'chat_media_approvals' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'chat_media_approvals'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'chat_media_approvals' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE chat_media_approvals DROP CONSTRAINT IF EXISTS chat_media_approvals_pkey;
					ALTER TABLE chat_media_approvals ADD CONSTRAINT chat_media_approvals_pkey PRIMARY KEY (chat_id, user_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'file_preferences' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'file_preferences'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'file_preferences' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE file_preferences DROP CONSTRAINT IF EXISTS file_preferences_pkey;
					ALTER TABLE file_preferences ADD CONSTRAINT file_preferences_pkey PRIMARY KEY (file_id, user_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'message_attachments' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'message_attachments'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'message_attachments' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE message_attachments DROP CONSTRAINT IF EXISTS message_attachments_pkey;
					ALTER TABLE message_attachments ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (message_id, file_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'message_reactions' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'message_reactions'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'message_reactions' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 3 THEN
					ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_pkey;
					ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'message_statuses' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'message_statuses'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'message_statuses' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 3 THEN
					ALTER TABLE message_statuses DROP CONSTRAINT IF EXISTS message_statuses_pkey;
					ALTER TABLE message_statuses ADD CONSTRAINT message_statuses_pkey PRIMARY KEY (message_id, user_id, status);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'message_user_deletions' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'message_user_deletions'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'message_user_deletions' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE message_user_deletions DROP CONSTRAINT IF EXISTS message_user_deletions_pkey;
					ALTER TABLE message_user_deletions ADD CONSTRAINT message_user_deletions_pkey PRIMARY KEY (message_id, user_id);
				END IF;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE table_name = 'pinned_messages' AND constraint_type = 'PRIMARY KEY'
			) THEN
				IF (
					SELECT count(*) FROM information_schema.key_column_usage
					WHERE table_name = 'pinned_messages'
					  AND constraint_name = (
						SELECT constraint_name FROM information_schema.table_constraints
						WHERE table_name = 'pinned_messages' AND constraint_type = 'PRIMARY KEY' LIMIT 1
					  )
				) < 2 THEN
					ALTER TABLE pinned_messages DROP CONSTRAINT IF EXISTS pinned_messages_pkey;
					ALTER TABLE pinned_messages ADD CONSTRAINT pinned_messages_pkey PRIMARY KEY (chat_id, message_id);
				END IF;
			END IF;
		END $$;`,
	}
	for _, statement := range repairStatements {
		_, _ = s.db.Exec(statement)
	}
	_, _ = s.db.Exec(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS message_delay_seconds INTEGER NOT NULL DEFAULT 0;`)
	_, _ = s.db.Exec(`ALTER TABLE chats ADD COLUMN message_delay_seconds INTEGER NOT NULL DEFAULT 0;`)
	return nil
}

func isMissing(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, errNotFound) || ent.IsNotFound(err)
}
