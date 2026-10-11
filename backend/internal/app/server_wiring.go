package app

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	adapterchatimports "stovo-messenger/backend/internal/adapters/chatimports"
	"stovo-messenger/backend/internal/fcm"
	featurechattransfer "stovo-messenger/backend/internal/features/chattransfer"
	workruntime "stovo-messenger/backend/internal/runtime"
)

// NewWithDependencies starts the application with infrastructure assembled by
// the composition root. It keeps application startup separate from adapter creation.
func NewWithDependencies(deps Dependencies) (*Server, error) {
	if err := deps.validate(); err != nil {
		return nil, err
	}
	app := &Server{
		cfg: deps.Config, database: deps.Database, databaseHealth: deps.DatabaseHealth, persistence: deps.Persistence,
		oidcNow: time.Now,
		redis:   deps.Redis, jobsRedis: deps.JobsRedis, logger: deps.Logger, logBuffer: deps.LogBuffer,
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
		authMethods:            deps.AuthMethods,
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
		app.chatImport = featurechattransfer.NewImportService(adapterchatimports.NewPostgresStore(db), time.Now, nil, app.storage)
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
	if err := app.initializeIntelligenceSourceV2RestoreEpoch(context.Background()); err != nil {
		app.logger.Warnf("intelligence-source-v2-restore", "restore epoch initialization failed; source routes remain closed")
	}
	app.startIntelligenceSourceV2RetentionWorker()
	app.restoreCallSessions(context.Background())
	app.initMCP()
	app.lifecycle.Go(app.startNtfyRetryWorker)
	return app, nil
}
