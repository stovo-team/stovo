// Package bootstrap assembles production adapters at the executable boundary.
package bootstrap

import (
	"context"
	"database/sql"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/adapters/adminencryption"
	"stovo-messenger/backend/internal/adapters/callsessions"
	"stovo-messenger/backend/internal/adapters/chatarchives"
	"stovo-messenger/backend/internal/adapters/chatcreation"
	"stovo-messenger/backend/internal/adapters/chatpins"
	"stovo-messenger/backend/internal/adapters/chatqueries"
	"stovo-messenger/backend/internal/adapters/chatsettings"
	"stovo-messenger/backend/internal/adapters/databasehealth"
	"stovo-messenger/backend/internal/adapters/familydefaults"
	"stovo-messenger/backend/internal/adapters/familyinvites"
	"stovo-messenger/backend/internal/adapters/familymembers"
	"stovo-messenger/backend/internal/adapters/familyprofiles"
	"stovo-messenger/backend/internal/adapters/familyqueries"
	"stovo-messenger/backend/internal/adapters/fileaccess"
	"stovo-messenger/backend/internal/adapters/fileclones"
	"stovo-messenger/backend/internal/adapters/filedeletions"
	"stovo-messenger/backend/internal/adapters/filelisting"
	"stovo-messenger/backend/internal/adapters/filepreferences"
	"stovo-messenger/backend/internal/adapters/fileuploads"
	"stovo-messenger/backend/internal/adapters/filevalidation"
	"stovo-messenger/backend/internal/adapters/identitylogin"
	"stovo-messenger/backend/internal/adapters/identityprofiles"
	"stovo-messenger/backend/internal/adapters/identitysessions"
	"stovo-messenger/backend/internal/adapters/identitysetup"
	"stovo-messenger/backend/internal/adapters/identitystatus"
	"stovo-messenger/backend/internal/adapters/mcpaudit"
	"stovo-messenger/backend/internal/adapters/mcpconnectors"
	"stovo-messenger/backend/internal/adapters/messageattachments"
	"stovo-messenger/backend/internal/adapters/messagedetail"
	"stovo-messenger/backend/internal/adapters/messageforwards"
	"stovo-messenger/backend/internal/adapters/messagehistory"
	"stovo-messenger/backend/internal/adapters/messagemutations"
	"stovo-messenger/backend/internal/adapters/messagepersistence"
	"stovo-messenger/backend/internal/adapters/messagereactions"
	"stovo-messenger/backend/internal/adapters/messagereads"
	"stovo-messenger/backend/internal/adapters/messagesearch"
	"stovo-messenger/backend/internal/adapters/messagesync"
	"stovo-messenger/backend/internal/adapters/messageunread"
	"stovo-messenger/backend/internal/adapters/outbox"
	adapterpolls "stovo-messenger/backend/internal/adapters/polls"
	"stovo-messenger/backend/internal/adapters/publicaccess"
	"stovo-messenger/backend/internal/adapters/realtimecache"
	"stovo-messenger/backend/internal/adapters/roles"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/adapters/syncstore"
	"stovo-messenger/backend/internal/adapters/transcriptionsessions"
	"stovo-messenger/backend/internal/app"
	"stovo-messenger/backend/internal/broker"
	"stovo-messenger/backend/internal/cache"
	"stovo-messenger/backend/internal/config"
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
	"stovo-messenger/backend/internal/plugins/builtins"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/storage"
	"stovo-messenger/backend/internal/tunnel"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	socketio "github.com/doquangtan/socketio/v4"
	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"
)

// BuildDependencies creates the production adapter graph consumed by app.
func BuildDependencies(cfg config.Config) (app.Dependencies, error) {
	storageService, err := storage.New(storage.Config{
		Provider: cfg.StorageProvider, LocalPath: cfg.LocalStoragePath, Endpoint: cfg.MinIOEndpoint,
		AccessKey: cfg.MinIOAccessKey, SecretKey: cfg.MinIOSecretKey, Secure: cfg.MinIOSecure,
		PublicEndpoint: cfg.MinIOPublicEndpoint, PublicSecure: cfg.MinIOPublicSecure, Bucket: cfg.MinIOFilesBucket,
	})
	if err != nil {
		return app.Dependencies{}, err
	}
	logBuffer, err := newLogBuffer(cfg)
	if err != nil {
		return app.Dependencies{}, err
	}
	db, err := openDatabase(cfg)
	if err != nil {
		_ = logBuffer.Close()
		return app.Dependencies{}, err
	}
	redisClient, err := openRedis(cfg)
	if err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		return app.Dependencies{}, err
	}
	jobsRedisClient, err := openRedisURL(cfg.EffectiveRedisJobsURL())
	if err != nil {
		_ = redisClient.Close()
		_ = logBuffer.Close()
		_ = db.Close()
		return app.Dependencies{}, err
	}
	entClient := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	store := repository.New(entClient)
	uploadStore := fileuploads.NewReader(db)

	statsStore := statsstore.NewPostgresStore(db)
	eventBus := plugins.NewMemoryEventBus()
	pluginRegistry := plugins.NewPluginRegistry()
	statsPlugin := builtins.NewStatsPlugin(statsStore)
	_ = statsPlugin.Init(plugins.Services{
		Config:     &cfg,
		EventBus:   eventBus,
		StatsStore: statsStore,
	})
	statsPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(statsPlugin)
	canvasPlugin := builtins.NewCanvasPlugin()
	_ = canvasPlugin.Init(plugins.Services{Config: &cfg, EventBus: eventBus})
	canvasPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(canvasPlugin)
	checklistPlugin := builtins.NewChecklistPlugin()
	_ = checklistPlugin.Init(plugins.Services{Config: &cfg, EventBus: eventBus})
	checklistPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(checklistPlugin)

	return app.Dependencies{
		Config: cfg, Database: db, DatabaseHealth: databasehealth.New(db), Persistence: entClient, Redis: redisClient, JobsRedis: jobsRedisClient,
		Logger: logging.NewLogger(logBuffer), LogBuffer: logBuffer, Storage: storageService,
		Tunnel: tunnel.NewManager(), Sockets: socketio.New(), Cache: cache.NewRedisCache(redisClient), RedisHealth: cache.NewRedisCache(redisClient),
		Broker:  broker.NewRedisBroker(redisClient),
		Privacy: featureprivacy.NewService(store, time.Now), Contacts: store, Preferences: featurepreferences.NewService(store, func() string { return "stovo-user-" + uuid.NewString() }), NotificationRecipients: store,
		Plans: featureplans.NewService(store, nil, nil), MessageDelay: featuremessages.NewDelayService(store, time.Now), MessageReactions: featuremessages.NewReactionService(messagereactions.NewStore(store)), MessageMutations: featuremessages.NewMutationService(messagemutations.NewStore(store)), MessageReads: featuremessages.NewReadService(messagereads.NewStore(store)), MessageAttachments: featuremessages.NewAttachmentService(messageattachments.NewPostgresStore(db)), MessageSync: featuremessages.NewSyncedMessageService(messagesync.NewPostgresStore(db)),
		MessageForwards:       featuremessages.NewForwardLookupService(messageforwards.NewStore(store)),
		MessageHistory:        featuremessages.NewHistoryService(messagehistory.NewStore(store)),
		MessageSearch:         featuremessages.NewSearchService(messagesearch.NewStore(store)),
		MessageUnread:         featuremessages.NewUnreadService(messageunread.NewStore(store)),
		MessageDetails:        featuremessages.NewDetailService(messagedetail.NewStore(store)),
		MessagePersistence:    featuremessages.NewPersistenceService(messagepersistence.NewStore(store)),
		ChatSettings:          featurechats.NewSettingsService(chatsettings.NewDelayStore(store), time.Now),
		ChatCreation:          featurechats.NewCreationService(chatcreation.NewStore(store)),
		ChatArchive:           featurechats.NewArchiveService(chatarchives.NewStore(store)),
		ChatQueries:           featurechats.NewQueryService(chatqueries.NewStore(store)),
		Pins:                  featurechats.NewPinsService(chatpins.NewStore(store), time.Now),
		CallPersistence:       featurecalls.NewPersistenceService(callsessions.NewStore(store)),
		DirectUploads:         uploadStore,
		LegacyUploads:         featurefiles.NewLegacyUploadService(uploadStore),
		FilePreferences:       featurefiles.NewPreferenceService(filepreferences.NewPostgresStore(db)),
		FileDeletions:         featurefiles.NewDeletionService(filedeletions.NewPostgresStore(db)),
		FileValidation:        featurefiles.NewValidationService(filevalidation.NewPostgresStore(db)),
		FileLifecycle:         featurefiles.NewLifecycleService(filevalidation.NewPostgresStore(db)),
		FileClones:            featurefiles.NewCloneService(fileclones.NewPostgresStore(db)),
		FileAccess:            featurefiles.NewAccessService(fileaccess.NewStore(store)),
		FileListing:           featurefiles.NewListingService(filelisting.NewStore(store)),
		SessionWriter:         identitysessions.NewWriter(store),
		LoginAccounts:         featureidentity.NewLoginAccountService(identitylogin.NewStore(store)),
		Profile:               featureidentity.NewProfileService(identityprofiles.NewStore(store)),
		Setup:                 featureidentity.NewSetupService(identitysetup.NewStore(store)),
		SetupStatus:           featureidentity.NewSetupStatusService(identitystatus.NewStore(store)),
		FamilyDefaults:        featurefamily.NewDefaultsService(familydefaults.NewPostgresStore(db)),
		FamilyInvites:         featurefamily.NewInviteService(familyinvites.NewStore(store)),
		FamilyMembership:      featurefamily.NewMembershipService(familymembers.NewStore(store)),
		FamilyProfile:         featurefamily.NewProfileService(familyprofiles.NewPostgresStore(db)),
		FamilyQueries:         featurefamily.NewQueryService(familyqueries.NewStore(store)),
		Roles:                 featureroles.NewService(roles.NewPostgresStore(db)),
		Sync:                  featuresync.NewService(syncstore.NewPostgresStore(db), cfg.JWTSecret),
		PublicAccess:          featureadministration.NewPublicAccessService(publicaccess.NewPostgresStore(db)),
		Encryption:            featureadministration.NewEncryptionService(adminencryption.NewStore(store), time.Now),
		MCPAudit:              featuremcp.NewAuditService(mcpaudit.NewStore(store)),
		MCPConnectors:         featuremcp.NewConnectorService(mcpconnectors.NewStore(store)),
		Polls:                 featurepolls.NewService(adapterpolls.NewStore(store)),
		TranscriptionSessions: featuretranscription.NewSessionService(transcriptionsessions.NewPostgresStore(db)),
		TranscriptionChunks:   featuretranscription.NewChunkService(transcriptionsessions.NewPostgresStore(db)),
		TranscriptionQueries:  featuretranscription.NewQueryService(transcriptionsessions.NewPostgresStore(db)),
		TranscriptionSegments: featuretranscription.NewSegmentService(transcriptionsessions.NewPostgresStore(db)),
		OutboxStore:           outbox.NewPostgresStore(db),
		OutboxPublisher:       outbox.NewRedisPublisher(jobsRedisClient, "stovo:jobs"),
		JobConsumer:           outbox.NewRedisConsumer(jobsRedisClient),
		CallSessionCache:      realtimecache.NewRedisCallSessionCache(redisClient),
		PendingEvents:         realtimecache.NewRedisPendingEventQueue(redisClient),
		Plugins:               pluginRegistry,
		EventBus:              eventBus,
	}, nil
}

func newLogBuffer(cfg config.Config) (*logging.Buffer, error) {
	if cfg.StorageProvider != "minio" {
		return logging.NewBuffer(cfg.LogBufferMaxRecords, cfg.LogFilePath)
	}
	logStore, err := storage.New(storage.Config{
		Provider: "minio", Endpoint: cfg.MinIOEndpoint, AccessKey: cfg.MinIOAccessKey,
		SecretKey: cfg.MinIOSecretKey, Secure: cfg.MinIOSecure, Bucket: cfg.MinIOLogsBucket,
	})
	if err != nil {
		return nil, err
	}
	return logging.NewBufferWithArchive(cfg.LogBufferMaxRecords, logStore), nil
}

func openDatabase(cfg config.Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.EffectiveDatabaseURL())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(cfg.DatabaseMaxOpenConns)
	db.SetMaxIdleConns(cfg.DatabaseMaxIdleConns)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func openRedis(cfg config.Config) (*redis.Client, error) {
	return openRedisURL(cfg.EffectiveRedisURL())
}

func openRedisURL(redisURL string) (*redis.Client, error) {
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	options.DialTimeout = 5 * time.Second
	options.ReadTimeout = 5 * time.Second
	options.WriteTimeout = 5 * time.Second
	client := redis.NewClient(options)
	if err := client.Ping(context.Background()).Err(); err != nil {
		_ = client.Close()
		return nil, err
	}
	return client, nil
}
