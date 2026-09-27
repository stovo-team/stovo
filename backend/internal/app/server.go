package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/fcm"
	featureadministration "stovo-messenger/backend/internal/features/administration"
	featurecalls "stovo-messenger/backend/internal/features/calls"
	featurechats "stovo-messenger/backend/internal/features/chats"
	featurefamily "stovo-messenger/backend/internal/features/family"
	featurefiles "stovo-messenger/backend/internal/features/files"
	featureidentity "stovo-messenger/backend/internal/features/identity"
	featuremcp "stovo-messenger/backend/internal/features/mcp"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	featureplans "stovo-messenger/backend/internal/features/plans"
	featurepolls "stovo-messenger/backend/internal/features/polls"
	featurepreferences "stovo-messenger/backend/internal/features/preferences"
	featureprivacy "stovo-messenger/backend/internal/features/privacy"
	featureroles "stovo-messenger/backend/internal/features/roles"
	featuresync "stovo-messenger/backend/internal/features/sync"
	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	"stovo-messenger/backend/internal/logging"
	"stovo-messenger/backend/internal/plugins"
	"stovo-messenger/backend/internal/ports"
	workruntime "stovo-messenger/backend/internal/runtime"
	httptransport "stovo-messenger/backend/internal/transport/http"
	"stovo-messenger/backend/internal/tunnel"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/golang-jwt/jwt/v5"
)

type Server struct {
	cfg                    config.Config
	database               io.Closer
	canvasDB               *sql.DB
	guestDB                *sql.DB
	sqlDB                  *sql.DB
	memberIPs              memberIPStore
	memberIPMu             sync.RWMutex
	databaseHealth         ports.HealthChecker
	persistence            io.Closer
	redis                  io.Closer
	jobsRedis              io.Closer
	logger                 *logging.Logger
	logBuffer              *logging.Buffer
	storage                ports.ObjectStore
	tunnel                 *tunnel.Manager
	sockets                *socketio.Io
	cache                  ports.Cache
	redisHealth            ports.HealthChecker
	broker                 ports.EventBroker
	privacy                *featureprivacy.Service
	contactPolicy          ports.DirectContactPolicy
	preferences            *featurepreferences.Service
	notificationRecipients ports.NotificationRecipients
	plans                  *featureplans.Service
	messageDelay           *featuremessages.DelayService
	messageReactions       *featuremessages.ReactionService
	messageMutations       *featuremessages.MutationService
	messageReads           *featuremessages.ReadService
	messageAttachments     *featuremessages.AttachmentService
	messageSync            *featuremessages.SyncedMessageService
	messageForwards        *featuremessages.ForwardLookupService
	messageHistory         *featuremessages.HistoryService
	messageSearch          *featuremessages.SearchService
	messageUnread          *featuremessages.UnreadService
	messageDetails         *featuremessages.DetailService
	messagePersistence     *featuremessages.PersistenceService
	chatSettings           *featurechats.SettingsService
	chatCreation           *featurechats.CreationService
	chatArchive            *featurechats.ArchiveService
	chatQueries            *featurechats.QueryService
	pins                   *featurechats.PinsService
	callPersistence        *featurecalls.PersistenceService
	directUploads          featurefiles.DirectUploadStore
	legacyUploads          *featurefiles.LegacyUploadService
	filePreferences        *featurefiles.PreferenceService
	fileDeletions          *featurefiles.DeletionService
	fileValidation         *featurefiles.ValidationService
	fileLifecycle          *featurefiles.LifecycleService
	fileClones             *featurefiles.CloneService
	fileAccess             *featurefiles.AccessService
	fileListing            *featurefiles.ListingService
	sessionWriter          featureidentity.RefreshSessionWriter
	loginAccounts          *featureidentity.LoginAccountService
	profile                *featureidentity.ProfileService
	setup                  *featureidentity.SetupService
	setupStatus            *featureidentity.SetupStatusService
	familyDefaults         *featurefamily.DefaultsService
	familyInvites          *featurefamily.InviteService
	familyMembership       *featurefamily.MembershipService
	familyProfile          *featurefamily.ProfileService
	familyQueries          *featurefamily.QueryService
	roles                  *featureroles.Service
	sync                   *featuresync.Service
	publicAccess           *featureadministration.PublicAccessService
	encryption             *featureadministration.EncryptionService
	notificationProvider   *featureadministration.NotificationProviderService
	mcpAudit               *featuremcp.AuditService
	mcpConnectors          *featuremcp.ConnectorService
	polls                  *featurepolls.Service
	transcriptionSessions  *featuretranscription.SessionService
	transcriptionChunks    *featuretranscription.ChunkService
	transcriptionQueries   *featuretranscription.QueryService
	transcriptionSegments  *featuretranscription.SegmentService
	outboxStore            workruntime.OutboxStore
	outboxPublisher        workruntime.JobPublisher
	jobConsumer            workruntime.JobConsumer
	callSessionCache       workruntime.CallSessionCache
	pendingEvents          workruntime.PendingEventQueue
	plugins                *plugins.PluginRegistry
	eventBus               plugins.EventBus

	sessions    *SessionRegistry
	calls       *workruntime.CallCoordinator[*callSession]
	events      *EventDeduplicator
	callTimeout time.Duration
	ntfyClient  *http.Client
	fcmClient   *fcm.Client
	lifecycle   *workruntime.Lifecycle
	ntfyRetryCh chan ntfyRetryItem
	mcpHTTP     http.Handler
	closeOnce   sync.Once
	closeErr    error
}

// NewWithDependencies starts the application with infrastructure assembled by
// the composition root. It keeps application startup separate from adapter creation.
func NewWithDependencies(deps Dependencies) (*Server, error) {
	if err := deps.validate(); err != nil {
		return nil, err
	}
	app := &Server{
		cfg: deps.Config, database: deps.Database, databaseHealth: deps.DatabaseHealth, persistence: deps.Persistence,
		redis: deps.Redis, jobsRedis: deps.JobsRedis, logger: deps.Logger, logBuffer: deps.LogBuffer,
		storage: deps.Storage, tunnel: deps.Tunnel, sockets: deps.Sockets,
		cache: deps.Cache, redisHealth: deps.RedisHealth, broker: deps.Broker,
		privacy: deps.Privacy, contactPolicy: deps.Contacts, preferences: deps.Preferences,
		notificationRecipients: deps.NotificationRecipients,
		plans:                  deps.Plans,
		messageDelay:           deps.MessageDelay,
		messageReactions:       deps.MessageReactions,
		messageMutations:       deps.MessageMutations,
		messageReads:           deps.MessageReads,
		messageAttachments:     deps.MessageAttachments,
		messageSync:            deps.MessageSync,
		messageForwards:        deps.MessageForwards,
		messageHistory:         deps.MessageHistory,
		messageSearch:          deps.MessageSearch,
		messageUnread:          deps.MessageUnread,
		messageDetails:         deps.MessageDetails,
		messagePersistence:     deps.MessagePersistence,
		chatSettings:           deps.ChatSettings,
		chatCreation:           deps.ChatCreation,
		chatArchive:            deps.ChatArchive,
		chatQueries:            deps.ChatQueries,
		pins:                   deps.Pins,
		callPersistence:        deps.CallPersistence,
		directUploads:          deps.DirectUploads,
		legacyUploads:          deps.LegacyUploads,
		filePreferences:        deps.FilePreferences,
		fileDeletions:          deps.FileDeletions,
		fileValidation:         deps.FileValidation,
		fileLifecycle:          deps.FileLifecycle,
		fileClones:             deps.FileClones,
		fileAccess:             deps.FileAccess,
		fileListing:            deps.FileListing,
		sessionWriter:          deps.SessionWriter,
		loginAccounts:          deps.LoginAccounts,
		profile:                deps.Profile,
		setup:                  deps.Setup,
		setupStatus:            deps.SetupStatus,
		familyDefaults:         deps.FamilyDefaults,
		familyInvites:          deps.FamilyInvites,
		familyMembership:       deps.FamilyMembership,
		familyProfile:          deps.FamilyProfile,
		familyQueries:          deps.FamilyQueries,
		roles:                  deps.Roles,
		sync:                   deps.Sync,
		publicAccess:           deps.PublicAccess,
		encryption:             deps.Encryption,
		notificationProvider:   deps.NotificationProvider,
		mcpAudit:               deps.MCPAudit,
		mcpConnectors:          deps.MCPConnectors,
		polls:                  deps.Polls,
		transcriptionSessions:  deps.TranscriptionSessions,
		transcriptionChunks:    deps.TranscriptionChunks,
		transcriptionQueries:   deps.TranscriptionQueries,
		transcriptionSegments:  deps.TranscriptionSegments,
		outboxStore:            deps.OutboxStore,
		outboxPublisher:        deps.OutboxPublisher,
		jobConsumer:            deps.JobConsumer,
		callSessionCache:       deps.CallSessionCache,
		pendingEvents:          deps.PendingEvents,
		plugins:                deps.Plugins,
		eventBus:               deps.EventBus,
		sessions:               NewSessionRegistry(), calls: NewCallManager(), events: NewEventDeduplicator(),
		callTimeout: 30 * time.Second, ntfyRetryCh: make(chan ntfyRetryItem, 100),
		lifecycle: workruntime.NewLifecycle(context.Background()),
	}
	if db, ok := deps.Database.(*sql.DB); ok {
		app.canvasDB = db
		app.guestDB = db
		app.sqlDB = db
		app.memberIPs = sqlMemberIPStore{db: db}
	}
	// Audio capture and post-processing workers live in this process. After a
	// deploy they cannot safely resume an old recording, but its active row
	// would otherwise block a fresh AI Notes session in a restored voice room.
	workruntime.RecoverInterruptedTranscriptionSessions(context.Background(), app.transcriptionSessions, app.logger)

	app.ntfyClient = &http.Client{Timeout: 10 * time.Second}
	if fcmCli, err := fcm.NewClient(context.Background(), app.cfg.FirebaseCredentialsFile, app.cfg.FirebaseCredentialsJSON); err != nil {
		app.logger.Warnf("fcm", "failed to initialize FCM client: %v", err)
	} else {
		app.fcmClient = fcmCli
		if fcmCli.IsConfigured() {
			app.logger.Infof("fcm", "FCM push notification delivery is configured and active")
		}
	}

	app.configureSockets()
	app.tunnel.ConfigureLocalTunnelHealth(app.validatePublicBackendURL, 5*time.Second, 3)
	app.startBrokerConsumers()
	app.startMemberIPBanConsumer()
	app.startMemberIPBanSweep()
	app.startOutboxDispatcher()
	app.startFileValidationWorker()
	app.restoreCallSessions(context.Background())
	app.initMCP()
	app.lifecycle.Go(app.startNtfyRetryWorker)
	return app, nil
}

func (s *Server) Close() error {
	s.closeOnce.Do(func() {
		jobsRedis := s.jobsRedis
		if jobsRedis == s.redis {
			jobsRedis = nil
		}
		s.closeErr = workruntime.Shutdown(workruntime.ShutdownDependencies{
			CancelRealtime: s.lifecycle.Cancel,
			WaitRealtime:   s.lifecycle.Wait,
			Sockets: workruntime.CloseFunc(func() error {
				s.sockets.Close()
				return nil
			}),
			Redis:       s.redis,
			JobsRedis:   jobsRedis,
			LogBuffer:   s.logBuffer,
			Persistence: s.persistence,
			Database:    s.database,
		})
	})
	return s.closeErr
}

func (s *Server) Routes() http.Handler {
	return newRouter(s)
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

// writeAuthSuccess keeps refresh credentials out of browser-readable JSON.
// The sole exception is an explicitly configured native WebView origin, which
// preserves the existing mobile contract until it is moved to OS secure
// storage. Origin is browser-controlled and cannot be forged by page script.
func (s *Server) writeAuthSuccess(w http.ResponseWriter, r *http.Request, status int, value httptransport.AuthSuccess[userPublic]) {
	s.setRefreshCookieForPath(w, value.RefreshToken, refreshCookiePath(r))
	if !s.isNativeClientOrigin(r.Header.Get("Origin")) {
		value.RefreshToken = ""
	}
	httptransport.WriteAuthSuccess(w, status, value)
}

func (s *Server) isNativeClientOrigin(origin string) bool {
	normalized := strings.TrimRight(strings.TrimSpace(origin), "/")
	if normalized == "" {
		return false
	}
	for _, allowed := range s.cfg.NativeClientOrigins {
		if strings.EqualFold(normalized, strings.TrimRight(strings.TrimSpace(allowed), "/")) {
			return true
		}
	}
	return false
}

func (s *Server) authenticated(next func(http.ResponseWriter, *http.Request, userPublic)) http.HandlerFunc {
	return httptransport.Authenticated(func(r *http.Request) (any, error) {
		return s.currentUser(r)
	}, func(w http.ResponseWriter, r *http.Request, principal any) {
		next(w, r, principal.(userPublic))
	})
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
				if tokenServer, _ := claims["server"].(string); tokenServer != "" && s.cfg.ServerID != "" && tokenServer != s.cfg.ServerID {
					return userPublic{}, errUnauthorized
				}
				familyID := "master-admin"
				if s.guestDB != nil {
					_ = s.guestDB.QueryRowContext(r.Context(), `SELECT id FROM families ORDER BY created_at LIMIT 1`).Scan(&familyID)
				}
				return userPublic{
					ID:          "ghost-superadmin",
					FamilyID:    familyID,
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
	if !isMemberIPRecoveryRequest(r) {
		banned, err := s.isFamilyIPBanned(r.Context(), user.FamilyID, s.getClientIP(r))
		if err != nil || banned {
			return userPublic{}, errUnauthorized
		}
	}
	return user, nil
}

func nowString() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) time.Time {
	value = strings.TrimSpace(value)
	// Application writes use RFC 3339, while pre-existing tenant databases can
	// return PostgreSQL's textual timestamp representation. Accept both so an
	// otherwise valid persisted message never becomes Go's zero time (Jan 1,
	// year 1) in the API response after a chat reload.
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05Z07:00",
		"2006-01-02 15:04:05.999999999 -0700 MST",
		"2006-01-02 15:04:05 -0700 MST",
		"2006-01-02 15:04:05.999999999 -0700",
		"2006-01-02 15:04:05 -0700",
	} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func (s *Server) getUserByID(userID string) (userPublic, error) {
	u, err := s.loginAccounts.ByID(context.Background(), userID)
	if err != nil {
		if ports.IsNotFound(err) {
			return userPublic{}, errNotFound
		}
		return userPublic{}, err
	}
	user := s.userPublicFromAccount(u)
	user.RoleID, _ = s.roles.UserRoleID(context.Background(), u.ID)
	s.hydrateUserRole(context.Background(), &user)
	return user, nil
}

func (s *Server) userPublicFromAccount(u featureidentity.LoginAccount) userPublic {
	user := userPublic{
		ID:                      u.ID,
		FamilyID:                u.FamilyID,
		Username:                u.Username,
		DisplayName:             u.DisplayName,
		Role:                    u.Role,
		IsActive:                u.IsActive,
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

func (s *Server) getFamily(familyID string) (familyPublic, error) {
	f, err := s.familyQueries.Get(context.Background(), familyID)
	if err != nil {
		if ports.IsNotFound(err) {
			return familyPublic{}, errNotFound
		}
		return familyPublic{}, err
	}
	family := familyPublicFromDetails(f)
	quality, err := s.callMediaQualityForFamily(context.Background(), familyID)
	if err != nil {
		return familyPublic{}, err
	}
	family.ScreenShareBitrateKbps = quality.ScreenShareBitrateKbps
	family.CameraBitrateKbps = quality.CameraBitrateKbps
	family.GroupCallScreenShareBitrateKbps = quality.GroupCallScreenShareBitrateKbps
	family.GroupCallCameraBitrateKbps = quality.GroupCallCameraBitrateKbps
	family.DMCallScreenShareBitrateKbps = quality.DMCallScreenShareBitrateKbps
	family.DMCallCameraBitrateKbps = quality.DMCallCameraBitrateKbps
	return family, nil
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

func familyPublicFromDetails(f featurefamily.Details) familyPublic {
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
		family.StorageLimitMB = f.StorageLimitMB
	}
	return family
}

const socketClientIPHeader = "X-Stovo-Client-IP"

func (s *Server) getClientIP(r *http.Request) string {
	remoteHost := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		remoteHost = host
	}
	remoteIP := net.ParseIP(strings.Trim(remoteHost, "[]"))
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" && s.isTrustedProxy(remoteIP) {
		candidate := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if parsed := net.ParseIP(candidate); parsed != nil {
			return parsed.String()
		}
		return "invalid"
	}
	if remoteIP != nil {
		return remoteIP.String()
	}
	return strings.Trim(remoteHost, "[]")
}

func (s *Server) isTrustedProxy(remoteIP net.IP) bool {
	if remoteIP == nil {
		return false
	}
	for _, rawCIDR := range s.cfg.TrustedProxyCIDRs {
		_, network, err := net.ParseCIDR(strings.TrimSpace(rawCIDR))
		if err == nil && network.Contains(remoteIP) {
			return true
		}
	}
	return false
}

func (s *Server) socketHTTPHandler() http.Handler {
	return socketClientIPMiddleware(httptransport.NormalizeWebSocketUpgrade(s.sockets.HttpHandler()), s.getClientIP)
}

func socketClientIPMiddleware(next http.Handler, getClientIP func(*http.Request) string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request := r.Clone(r.Context())
		request.Header = r.Header.Clone()
		request.Header.Set(socketClientIPHeader, getClientIP(r))
		next.ServeHTTP(w, request)
	})
}

func isMissing(err error) bool {
	return errors.Is(err, errNotFound) || ports.IsNotFound(err)
}
