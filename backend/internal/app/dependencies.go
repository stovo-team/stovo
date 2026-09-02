package app

import (
	"fmt"
	"io"

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
	featurepreferences "stovo-messenger/backend/internal/features/preferences"
	featureprivacy "stovo-messenger/backend/internal/features/privacy"
	featureroles "stovo-messenger/backend/internal/features/roles"
	featuresync "stovo-messenger/backend/internal/features/sync"
	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	"stovo-messenger/backend/internal/logging"
	"stovo-messenger/backend/internal/ports"
	featurepolls "stovo-messenger/backend/internal/features/polls"
	workruntime "stovo-messenger/backend/internal/runtime"
	"stovo-messenger/backend/internal/tunnel"

	socketio "github.com/doquangtan/socketio/v4"
)

// Dependencies are the application-facing infrastructure contracts supplied by
// the composition root.
type Dependencies struct {
	Config         config.Config
	Database       io.Closer
	DatabaseHealth ports.HealthChecker
	// Persistence owns the lifecycle of the persistence client constructed by
	// bootstrap. It deliberately exposes only Close to the application layer.
	Persistence io.Closer
	Redis       io.Closer
	// JobsRedis is optional for backward-compatible tests/local deployments;
	// NewWithDependencies falls back to Redis when it is not supplied.
	JobsRedis              io.Closer
	Logger                 *logging.Logger
	LogBuffer              *logging.Buffer
	Storage                ports.ObjectStore
	Tunnel                 *tunnel.Manager
	Sockets                *socketio.Io
	Cache                  ports.Cache
	RedisHealth            ports.HealthChecker
	Broker                 ports.EventBroker
	Privacy                *featureprivacy.Service
	Contacts               ports.DirectContactPolicy
	Preferences            *featurepreferences.Service
	NotificationRecipients ports.NotificationRecipients
	Plans                  *featureplans.Service
	MessageDelay           *featuremessages.DelayService
	MessageReactions       *featuremessages.ReactionService
	MessageMutations       *featuremessages.MutationService
	MessageReads           *featuremessages.ReadService
	MessageAttachments     *featuremessages.AttachmentService
	MessageSync            *featuremessages.SyncedMessageService
	MessageForwards        *featuremessages.ForwardLookupService
	MessageHistory         *featuremessages.HistoryService
	MessageSearch          *featuremessages.SearchService
	MessageUnread          *featuremessages.UnreadService
	MessageDetails         *featuremessages.DetailService
	MessagePersistence     *featuremessages.PersistenceService
	ChatSettings           *featurechats.SettingsService
	ChatCreation           *featurechats.CreationService
	ChatArchive            *featurechats.ArchiveService
	ChatQueries            *featurechats.QueryService
	Pins                   *featurechats.PinsService
	CallPersistence        *featurecalls.PersistenceService
	DirectUploads          featurefiles.DirectUploadStore
	LegacyUploads          *featurefiles.LegacyUploadService
	FilePreferences        *featurefiles.PreferenceService
	FileDeletions          *featurefiles.DeletionService
	FileValidation         *featurefiles.ValidationService
	FileLifecycle          *featurefiles.LifecycleService
	FileClones             *featurefiles.CloneService
	FileAccess             *featurefiles.AccessService
	FileListing            *featurefiles.ListingService
	SessionWriter          featureidentity.RefreshSessionWriter
	LoginAccounts          *featureidentity.LoginAccountService
	Profile                *featureidentity.ProfileService
	Setup                  *featureidentity.SetupService
	SetupStatus            *featureidentity.SetupStatusService
	FamilyDefaults         *featurefamily.DefaultsService
	FamilyInvites          *featurefamily.InviteService
	FamilyMembership       *featurefamily.MembershipService
	FamilyProfile          *featurefamily.ProfileService
	FamilyQueries          *featurefamily.QueryService
	Roles                  *featureroles.Service
	Sync                   *featuresync.Service
	PublicAccess           *featureadministration.PublicAccessService
	Encryption             *featureadministration.EncryptionService
	MCPAudit               *featuremcp.AuditService
	MCPConnectors          *featuremcp.ConnectorService
	Polls                  *featurepolls.Service
	TranscriptionSessions  *featuretranscription.SessionService
	TranscriptionChunks    *featuretranscription.ChunkService
	TranscriptionQueries   *featuretranscription.QueryService
	TranscriptionSegments  *featuretranscription.SegmentService
	OutboxStore            workruntime.OutboxStore
	OutboxPublisher        workruntime.JobPublisher
	JobConsumer            workruntime.JobConsumer
	CallSessionCache       workruntime.CallSessionCache
	PendingEvents          workruntime.PendingEventQueue
}

func (d Dependencies) validate() error {
	if d.MessageUnread == nil || d.MessageDetails == nil || d.MessagePersistence == nil || d.MessageSearch == nil {
		return fmt.Errorf("application dependencies must all be provided")
	}
	if d.Database == nil || d.DatabaseHealth == nil || d.Persistence == nil || d.Redis == nil || d.Logger == nil || d.LogBuffer == nil || d.Storage == nil || d.Tunnel == nil || d.Sockets == nil || d.Cache == nil || d.RedisHealth == nil || d.Broker == nil || d.Privacy == nil || d.Contacts == nil || d.NotificationRecipients == nil || d.Plans == nil || d.MessageDelay == nil || d.MessageReactions == nil || d.MessageMutations == nil || d.MessageReads == nil || d.MessageAttachments == nil || d.MessageSync == nil || d.MessageForwards == nil || d.MessageSearch == nil || d.MessagePersistence == nil || d.ChatSettings == nil || d.ChatCreation == nil || d.ChatArchive == nil || d.ChatQueries == nil || d.Pins == nil || d.CallPersistence == nil || d.DirectUploads == nil || d.LegacyUploads == nil || d.FilePreferences == nil || d.FileDeletions == nil || d.FileValidation == nil || d.FileLifecycle == nil || d.FileClones == nil || d.FileAccess == nil || d.FileListing == nil || d.SessionWriter == nil || d.LoginAccounts == nil || d.Profile == nil || d.Setup == nil || d.SetupStatus == nil || d.FamilyDefaults == nil || d.FamilyInvites == nil || d.FamilyMembership == nil || d.FamilyProfile == nil || d.FamilyQueries == nil || d.Roles == nil || d.Sync == nil || d.PublicAccess == nil || d.Encryption == nil || d.MCPAudit == nil || d.MCPConnectors == nil || d.TranscriptionSessions == nil || d.TranscriptionChunks == nil || d.TranscriptionQueries == nil || d.TranscriptionSegments == nil || d.OutboxStore == nil || d.OutboxPublisher == nil || d.JobConsumer == nil || d.CallSessionCache == nil || d.PendingEvents == nil {
		return fmt.Errorf("application dependencies must all be provided")
	}
	return nil
}
