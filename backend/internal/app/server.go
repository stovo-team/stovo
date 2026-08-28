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
	"os"
	"strings"
	"sync"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/config"
	featureplans "stovo-messenger/backend/internal/features/plans"
	"stovo-messenger/backend/internal/logging"
	"stovo-messenger/backend/internal/ports"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/tunnel"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type Server struct {
	cfg                    config.Config
	db                     *sql.DB
	ent                    *ent.Client
	store                  *repository.Store
	redis                  *redis.Client
	jobsRedis              *redis.Client
	logger                 *logging.Logger
	logBuffer              *logging.Buffer
	storage                ports.ObjectStore
	tunnel                 *tunnel.Manager
	sockets                *socketio.Io
	cache                  ports.Cache
	broker                 ports.EventBroker
	privacy                ports.PrivacyBlocklist
	contactPolicy          ports.DirectContactPolicy
	preferences            ports.AccountPreferences
	notificationRecipients ports.NotificationRecipients
	plans                  *featureplans.Service

	sessions       *SessionRegistry
	calls          *CallManager
	events         *EventDeduplicator
	callTimeout    time.Duration
	frontendClient *http.Client
	frontendTarget *url.URL
	ntfyClient     *http.Client
	realtimeCtx    context.Context
	realtimeCancel context.CancelFunc
	realtimeWG     sync.WaitGroup
	ntfyRetryCh    chan ntfyRetryItem
	mcpHTTP        http.Handler
}

// NewWithDependencies starts the application with infrastructure assembled by
// the composition root. It keeps application startup separate from adapter creation.
func NewWithDependencies(deps Dependencies) (*Server, error) {
	if err := deps.validate(); err != nil {
		return nil, err
	}
	app := &Server{
		cfg: deps.Config, db: deps.DB, ent: deps.Ent, store: deps.Store,
		redis: deps.Redis, jobsRedis: deps.JobsRedis, logger: deps.Logger, logBuffer: deps.LogBuffer,
		storage: deps.Storage, tunnel: deps.Tunnel, sockets: deps.Sockets,
		cache: deps.Cache, broker: deps.Broker,
		privacy: deps.Privacy, contactPolicy: deps.Contacts, preferences: deps.Preferences,
		notificationRecipients: deps.NotificationRecipients,
		plans:                  deps.Plans,
		sessions:               NewSessionRegistry(), calls: NewCallManager(), events: NewEventDeduplicator(),
		callTimeout: 30 * time.Second, ntfyRetryCh: make(chan ntfyRetryItem, 100),
	}
	if app.jobsRedis == nil {
		app.jobsRedis = app.redis
	}

	if err := app.initSchema(); err != nil {
		_ = app.Close()
		return nil, fmt.Errorf("failed initializing schema: %w", err)
	}
	// Audio capture and post-processing workers live in this process. After a
	// deploy they cannot safely resume an old recording, but its active row
	// would otherwise block a fresh AI Notes session in a restored voice room.
	app.recoverInterruptedTranscriptionSessions(context.Background())

	frontendURL, err := url.Parse(app.cfg.FrontendOrigin)
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
	app.startOutboxDispatcher()
	app.startFileValidationWorker()
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
	if s.jobsRedis != nil && s.jobsRedis != s.redis {
		_ = s.jobsRedis.Close()
	}
	_ = s.logBuffer.Close()
	if s.ent != nil {
		_ = s.ent.Close()
	}
	return s.db.Close()
}

func (s *Server) Routes() http.Handler {
	return newRouter(s)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = s.cfg.AppURL
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Idempotency-Key, X-Refresh-Token, X-Stovo-Media-Token, X-Stovo-Operation-Id, bypass-tunnel-reminder, abypass-tunnel-reminder")
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
	user := s.userPublicFromEnt(u)
	_ = s.db.QueryRowContext(context.Background(), `SELECT COALESCE(role_id, '') FROM users WHERE id = $1`, u.ID).Scan(&user.RoleID)
	s.hydrateUserRole(context.Background(), &user)
	return user, nil
}

func (s *Server) userPublicFromEnt(u *ent.User) userPublic {
	user := userPublic{
		ID:                      u.ID,
		FamilyID:                u.FamilyID,
		Username:                u.Username,
		DisplayName:             u.DisplayName,
		Role:                    u.Role,
		IsActive:                u.IsActive == 1,
		PublicKey:               u.PublicKey,
		ProfileVisibility:       u.ProfileVisibility,
		LastSeenVisibility:      u.LastSeenVisibility,
		ReadReceiptsEnabled:     u.ReadReceiptsEnabled,
		DirectMessagePermission: "family",
		GroupInvitePermission:   "allow",
		ChannelInvitePermission: "allow",
		VoiceInvitePermission:   "allow",
		Email:                   u.Email,
		Bio:                     u.Bio,
		Timezone:                u.Timezone,
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
	if u.AudioCallSettings != nil {
		var settings audioCallSettings
		if json.Unmarshal([]byte(*u.AudioCallSettings), &settings) == nil && settings.Privacy != nil {
			user.DirectMessagePermission = settings.Privacy.DirectMessagePermission
			user.GroupInvitePermission = settings.Privacy.GroupInvitePermission
			user.ChannelInvitePermission = settings.Privacy.ChannelInvitePermission
			user.VoiceInvitePermission = settings.Privacy.VoiceInvitePermission
			user.InvitePermissionUserIDs = settings.Privacy.InvitePermissionUserIDs
		}
	}
	return user
}

func (s *Server) requireAdmin(user userPublic) error {
	if !hasPermission(user, permissionManageServer) {
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

func parseNavTabsEnv() NavTabsConfig {
	cfg := NavTabsConfig{
		Chats:    true,
		Storage:  true,
		Plans:    true,
		Settings: true,
	}
	raw := strings.TrimSpace(os.Getenv("NAV_TABS"))
	if raw == "" {
		return cfg
	}
	if err := json.Unmarshal([]byte(raw), &cfg); err == nil {
		return cfg
	}
	items := strings.Split(raw, ",")
	cfg.Chats = false
	cfg.Storage = false
	cfg.Plans = false
	cfg.Settings = false
	for _, item := range items {
		switch strings.TrimSpace(strings.ToLower(item)) {
		case "chats":
			cfg.Chats = true
		case "storage", "files":
			cfg.Storage = true
		case "plans":
			cfg.Plans = true
		case "settings":
			cfg.Settings = true
		}
	}
	return cfg
}

func familyPublicFromEnt(f *ent.Family) familyPublic {
	family := familyPublic{
		ID:                               f.ID,
		Name:                             f.Name,
		MinimizedChatLayout:              f.MinimizedChatLayout,
		DefaultMessageEncryptionProtocol: f.DefaultMessageEncryptionProtocol,
		NavTabs:                          parseNavTabsEnv(),
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
	for _, stmt := range schemaStatements {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	for _, stmt := range transcriptionSchemaStatements {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("initialize AI Notes transcription schema: %w", err)
		}
	}
	for _, stmt := range schemaRepairStatements {
		_, _ = s.db.Exec(stmt)
	}
	// Tenant servers are provisioned independently. Keep the AI Notes columns
	// available even when an older tenant database missed the Atlas migration.
	if _, err := s.db.Exec(`
		ALTER TABLE call_transcription_sessions
			ADD COLUMN IF NOT EXISTS chat_id text,
			ADD COLUMN IF NOT EXISTS call_history_message_id text,
			ADD COLUMN IF NOT EXISTS notes_message_id text,
			ADD COLUMN IF NOT EXISTS notes_publishing boolean NOT NULL DEFAULT false`); err != nil {
		return fmt.Errorf("repair AI Notes transcription schema: %w", err)
	}
	if _, err := s.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_call_transcription_sessions_notes_message_id
			ON call_transcription_sessions (notes_message_id)
			WHERE notes_message_id IS NOT NULL`); err != nil {
		return fmt.Errorf("repair AI Notes notes-message index: %w", err)
	}
	_, _ = s.db.Exec(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS message_delay_seconds INTEGER NOT NULL DEFAULT 0;`)
	_, _ = s.db.Exec(`ALTER TABLE chats ADD COLUMN message_delay_seconds INTEGER NOT NULL DEFAULT 0;`)
	// Direct-media lifecycle fields are additive so independently provisioned
	// tenant databases are ready before the reservation API is enabled.
	_, _ = s.db.Exec(`
		ALTER TABLE files
			ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'ready',
			ADD COLUMN IF NOT EXISTS object_revision TEXT,
			ADD COLUMN IF NOT EXISTS object_etag TEXT,
			ADD COLUMN IF NOT EXISTS detected_mime_type TEXT,
			ADD COLUMN IF NOT EXISTS preview_revision TEXT,
			ADD COLUMN IF NOT EXISTS preview_status TEXT NOT NULL DEFAULT 'none',
			ADD COLUMN IF NOT EXISTS validation_failure_code TEXT,
			ADD COLUMN IF NOT EXISTS validated_at TEXT`)
	return nil
}

func isMissing(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, errNotFound) || ent.IsNotFound(err)
}
