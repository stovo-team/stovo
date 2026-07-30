package app

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"family-messenger/backend/internal/broker"
	"family-messenger/backend/internal/cache"
	"family-messenger/backend/internal/config"
	"family-messenger/backend/internal/logging"
	"family-messenger/backend/internal/storage"
	"family-messenger/backend/internal/tunnel"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/go-chi/chi/v5"
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
	userActiveCall map[string]string
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
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
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

	app := &Server{
		cfg:            cfg,
		db:             db,
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
		userActiveCall: make(map[string]string),
		callTimeout:    30 * time.Second,
		recentEvents:   make(map[string]time.Time),
		ntfyRetryCh:    make(chan ntfyRetryItem, 100),
	}

	if err := app.initSchema(); err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return nil, err
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

	router.Get("/api/health", s.handleHealth)
	router.Get("/api/health/db", s.handleHealthDB)
	router.Get("/api/health/redis", s.handleHealthRedis)

	router.Get("/api/auth/setup-status", s.handleSetupStatus)
	router.Post("/api/auth/setup", s.handleSetup)
	router.Post("/api/auth/login", s.handleLogin)
	router.Post("/api/auth/refresh", s.handleRefresh)
	router.Post("/api/auth/logout", s.handleLogout)
	router.Get("/api/auth/me", s.authenticated(s.handleMe))
	router.Patch("/api/auth/me", s.authenticated(s.handleUpdateMe))
	router.Get("/api/auth/audio-settings", s.authenticated(s.handleGetAudioSettings))
	router.Put("/api/auth/audio-settings", s.authenticated(s.handlePutAudioSettings))
	router.Get("/api/notifications/topic", s.authenticated(s.handleGetNotificationTopic))

	router.Get("/api/family", s.authenticated(s.handleGetFamily))
	router.Patch("/api/family", s.authenticated(s.handleUpdateFamily))
	router.Get("/api/family/members", s.authenticated(s.handleGetMembers))
	router.Patch("/api/family/members/{userId}/role", s.authenticated(s.handleChangeRole))
	router.Delete("/api/family/members/{userId}", s.authenticated(s.handleRemoveMember))

	router.Post("/api/invites", s.authenticated(s.handleCreateInvite))
	router.Get("/api/invites/{token}", s.handlePreviewInvite)
	router.Post("/api/invites/{token}/accept", s.handleAcceptInvite)
	router.Delete("/api/invites/{inviteId}", s.authenticated(s.handleDeleteInvite))

	router.Get("/api/chats", s.authenticated(s.handleGetChats))
	router.Post("/api/chats/direct", s.authenticated(s.handleCreateDirectChat))
	router.Post("/api/chats/group", s.authenticated(s.handleCreateGroupChat))
	router.Post("/api/chats/channel", s.authenticated(s.handleCreateChannelChat))
	router.Get("/api/chats/{chatId}", s.authenticated(s.handleGetChat))
	router.Patch("/api/chats/{chatId}", s.authenticated(s.handleUpdateChat))
	router.Patch("/api/chats/{chatId}/preferences", s.authenticated(s.handleUpdateChatPreferences))
	router.Get("/api/chats/{chatId}/messages", s.authenticated(s.handleGetMessages))
	router.Post("/api/chats/{chatId}/messages", s.authenticated(s.handleSendMessage))

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
	router.Post("/api/files/{fileId}/playback-token", s.authenticated(s.handleCreateMediaPlaybackToken))
	router.Patch("/api/files/{fileId}/preferences", s.authenticated(s.handleUpdateFilePreferences))
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

func (s *Server) initSchema() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS families (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			storage_limit_mb INTEGER,
			default_message_encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
			public_app_url TEXT,
			public_api_url TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			family_id TEXT NOT NULL,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL,
			role TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			public_key TEXT,
			profile_photo_file_id TEXT,
			created_at TEXT NOT NULL,
			last_seen_at TEXT,
			FOREIGN KEY (family_id) REFERENCES families(id)
		);`,
		`ALTER TABLE users DROP COLUMN IF EXISTS email;`,
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
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id TEXT;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_chat_id TEXT;`,
		`ALTER TABLE families ADD COLUMN IF NOT EXISTS default_message_encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest';`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest';`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_protocol TEXT NOT NULL DEFAULT 'legacy_plaintext';`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS ciphertext TEXT;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS nonce TEXT;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS key_version INTEGER;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_metadata TEXT;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_root_message_id TEXT;`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'chat';`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_file_id TEXT;`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_photo_file_id TEXT;`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;`,
		`UPDATE families SET default_message_encryption_protocol = 'server_at_rest' WHERE default_message_encryption_protocol IS NULL OR default_message_encryption_protocol = '';`,
		`UPDATE families SET default_message_encryption_protocol = 'server_at_rest' WHERE default_message_encryption_protocol = 'end_to_end';`,
		`UPDATE chats SET encryption_protocol = 'server_at_rest' WHERE encryption_protocol IS NULL OR encryption_protocol = '';`,
		`UPDATE chats SET encryption_protocol = 'server_at_rest' WHERE encryption_protocol = 'end_to_end';`,
		`UPDATE messages SET encryption_protocol = 'legacy_plaintext' WHERE encryption_protocol IS NULL OR encryption_protocol = '';`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_family_chat_per_family ON chats(family_id) WHERE type = 'family';`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS audio_call_settings TEXT;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS ntfy_topic_token TEXT DEFAULT NULL;`,
		`CREATE TABLE IF NOT EXISTS call_sessions (
			id          TEXT PRIMARY KEY,
			caller_id   TEXT NOT NULL,
			callee_id   TEXT NOT NULL,
			call_type   TEXT NOT NULL,
			state       TEXT NOT NULL,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			ended_at    TIMESTAMPTZ,
			duration_s  INTEGER
		);`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;`,
		`CREATE TABLE IF NOT EXISTS message_user_deletions (
			message_id TEXT NOT NULL,
			user_id    TEXT NOT NULL,
			deleted_at TEXT NOT NULL,
			PRIMARY KEY (message_id, user_id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE TABLE IF NOT EXISTS pinned_messages (
			chat_id    TEXT NOT NULL,
			message_id TEXT NOT NULL,
			pinned_by  TEXT NOT NULL,
			pinned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (chat_id, message_id),
			FOREIGN KEY (chat_id)    REFERENCES chats(id),
			FOREIGN KEY (message_id) REFERENCES messages(id),
			FOREIGN KEY (pinned_by)  REFERENCES users(id)
		);`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS pin_permission TEXT NOT NULL DEFAULT 'everyone';`,
	}
	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
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
	claims, err := parseAccessToken(s.cfg, strings.TrimPrefix(authorization, "Bearer "))
	if err != nil {
		return userPublic{}, errUnauthorized
	}
	user, err := s.getUserByID(claims.UserID)
	if err != nil || !user.IsActive {
		return userPublic{}, errUnauthorized
	}
	return user, nil
}

func (s *Server) withTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *Server) query(query string, args ...any) (*sql.Rows, error) {
	return s.db.Query(s.rebind(query), args...)
}

func (s *Server) queryRow(query string, args ...any) *sql.Row {
	return s.db.QueryRow(s.rebind(query), args...)
}

func (s *Server) exec(query string, args ...any) (sql.Result, error) {
	return s.db.Exec(s.rebind(query), args...)
}

func (s *Server) txQuery(tx *sql.Tx, query string, args ...any) (*sql.Rows, error) {
	return tx.Query(s.rebind(query), args...)
}

func (s *Server) txQueryRow(tx *sql.Tx, query string, args ...any) *sql.Row {
	return tx.QueryRow(s.rebind(query), args...)
}

func (s *Server) txExec(tx *sql.Tx, query string, args ...any) (sql.Result, error) {
	return tx.Exec(s.rebind(query), args...)
}

func (s *Server) rebind(query string) string {
	var builder strings.Builder
	builder.Grow(len(query) + 16)
	index := 1
	for _, char := range query {
		if char == '?' {
			builder.WriteByte('$')
			builder.WriteString(strconv.Itoa(index))
			index++
			continue
		}
		builder.WriteRune(char)
	}
	return builder.String()
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
	row := s.queryRow(`
		SELECT id, family_id, username, display_name, role, is_active, public_key, profile_photo_file_id, created_at, last_seen_at
		FROM users
		WHERE id = ?
	`, userID)

	var user userPublic
	var createdAt string
	var publicKey, profilePhotoFileID, lastSeen sql.NullString
	var active int
	if err := row.Scan(
		&user.ID,
		&user.FamilyID,
		&user.Username,
		&user.DisplayName,
		&user.Role,
		&active,
		&publicKey,
		&profilePhotoFileID,
		&createdAt,
		&lastSeen,
	); err != nil {
		return userPublic{}, err
	}

	created := parseTime(createdAt)
	user.IsActive = active == 1
	user.PublicKey = stringPtrFromNull(publicKey)
	if profilePhotoFileID.Valid {
		if file, err := s.buildFilePublic(profilePhotoFileID.String, user.ID); err == nil && file.DeletedAt == nil {
			user.ProfilePhoto = &file
		}
	}
	user.CreatedAt = &created
	user.LastSeenAt = timePtrFromNull(sql.NullTime{Time: parseTime(lastSeen.String), Valid: lastSeen.Valid})
	return user, nil
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
	row := s.queryRow(`
		SELECT id, name, storage_limit_mb, default_message_encryption_protocol, public_app_url, public_api_url
		FROM families
		WHERE id = ?
	`, familyID)
	var family familyPublic
	var storageLimit sql.NullInt64
	var publicApp, publicAPI sql.NullString
	if err := row.Scan(&family.ID, &family.Name, &storageLimit, &family.DefaultMessageEncryptionProtocol, &publicApp, &publicAPI); err != nil {
		return familyPublic{}, err
	}
	if family.DefaultMessageEncryptionProtocol == "" {
		family.DefaultMessageEncryptionProtocol = encryptionProtocolServerAtRest
	}
	if storageLimit.Valid {
		family.StorageLimitMB = &storageLimit.Int64
	}
	family.PublicAppURL = stringPtrFromNull(publicApp)
	family.PublicAPIURL = stringPtrFromNull(publicAPI)
	return family, nil
}

func (s *Server) getChatType(chatID string) (*string, error) {
	row := s.queryRow(`SELECT type FROM chats WHERE id = ?`, chatID)
	var chatType string
	if err := row.Scan(&chatType); err != nil {
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

func isMissing(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, errNotFound)
}
