package app

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/adapters/adminencryption"
	"stovo-messenger/backend/internal/adapters/authmethods"
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
	"stovo-messenger/backend/internal/adapters/publicaccess"
	adapterpolls "stovo-messenger/backend/internal/adapters/polls"
	"stovo-messenger/backend/internal/adapters/realtimecache"
	"stovo-messenger/backend/internal/adapters/roles"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/adapters/syncstore"
	"stovo-messenger/backend/internal/adapters/transcriptionsessions"
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

func newIntegrationTestDependencies(t *testing.T, cfg config.Config) Dependencies {
	t.Helper()
	logBuffer, err := logging.NewBuffer(cfg.LogBufferMaxRecords, cfg.LogFilePath)
	if err != nil {
		t.Fatalf("new log buffer: %v", err)
	}
	db, err := sql.Open("pgx", cfg.EffectiveDatabaseURL())
	if err != nil {
		_ = logBuffer.Close()
		t.Fatalf("open database: %v", err)
	}
	db.SetMaxOpenConns(cfg.DatabaseMaxOpenConns)
	db.SetMaxIdleConns(cfg.DatabaseMaxIdleConns)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		t.Fatalf("ping database: %v", err)
	}
	options, err := redis.ParseURL(cfg.EffectiveRedisURL())
	if err != nil {
		_ = logBuffer.Close()
		_ = db.Close()
		t.Fatalf("parse redis URL: %v", err)
	}
	client := redis.NewClient(options)
	if err := client.Ping(context.Background()).Err(); err != nil {
		_ = client.Close()
		_ = logBuffer.Close()
		_ = db.Close()
		t.Fatalf("ping redis: %v", err)
	}
	objectStore, err := storage.New(storage.Config{Provider: "local", LocalPath: cfg.LocalStoragePath})
	if err != nil {
		_ = client.Close()
		_ = logBuffer.Close()
		_ = db.Close()
		t.Fatalf("new object store: %v", err)
	}
	entClient := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	store := repository.New(entClient)
	uploadStore := fileuploads.NewReader(db)
	statsStore := statsstore.NewPostgresStore(db)
	eventBus := plugins.NewMemoryEventBus()
	pluginRegistry := plugins.NewPluginRegistry()
	statsPlugin := builtins.NewStatsPlugin(statsStore)
	_ = statsPlugin.Init(plugins.Services{Config: &cfg, EventBus: eventBus, StatsStore: statsStore})
	statsPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(statsPlugin)
	canvasPlugin := builtins.NewCanvasPlugin()
	_ = canvasPlugin.Init(plugins.Services{Config: &cfg, EventBus: eventBus, StatsStore: statsStore})
	canvasPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(canvasPlugin)
	checklistPlugin := builtins.NewChecklistPlugin()
	_ = checklistPlugin.Init(plugins.Services{Config: &cfg, EventBus: eventBus, StatsStore: statsStore})
	checklistPlugin.SubscribeEvents(eventBus)
	pluginRegistry.Register(checklistPlugin)
	return Dependencies{
		Config: cfg, Database: db, DatabaseHealth: databasehealth.New(db), Persistence: entClient, Redis: client,
		Logger: logging.NewLogger(logBuffer), LogBuffer: logBuffer, Storage: objectStore,
		Plugins: pluginRegistry, EventBus: eventBus,
		Tunnel: tunnel.NewManager(), Sockets: socketio.New(), Cache: cache.NewRedisCache(client), RedisHealth: cache.NewRedisCache(client),
		Broker:  broker.NewRedisBroker(client),
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
		AuthMethods:           authmethods.NewPostgresStore(db),
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
		OutboxPublisher:       outbox.NewRedisPublisher(client, "stovo:jobs"),
		JobConsumer:           outbox.NewRedisConsumer(client),
		CallSessionCache:      realtimecache.NewRedisCallSessionCache(client),
		PendingEvents:         realtimecache.NewRedisPendingEventQueue(client),
	}
}
