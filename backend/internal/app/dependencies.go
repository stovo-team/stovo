package app

import (
	"database/sql"
	"fmt"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/config"
	featureplans "stovo-messenger/backend/internal/features/plans"
	"stovo-messenger/backend/internal/logging"
	"stovo-messenger/backend/internal/ports"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/tunnel"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/redis/go-redis/v9"
)

// Dependencies are the application-facing infrastructure contracts supplied by
// the composition root.
type Dependencies struct {
	Config config.Config
	DB     *sql.DB
	Ent    *ent.Client
	Store  *repository.Store
	Redis  *redis.Client
	// JobsRedis is optional for backward-compatible tests/local deployments;
	// NewWithDependencies falls back to Redis when it is not supplied.
	JobsRedis              *redis.Client
	Logger                 *logging.Logger
	LogBuffer              *logging.Buffer
	Storage                ports.ObjectStore
	Tunnel                 *tunnel.Manager
	Sockets                *socketio.Io
	Cache                  ports.Cache
	Broker                 ports.EventBroker
	Privacy                ports.PrivacyBlocklist
	Contacts               ports.DirectContactPolicy
	Preferences            ports.AccountPreferences
	NotificationRecipients ports.NotificationRecipients
	Plans                  *featureplans.Service
}

func (d Dependencies) validate() error {
	if d.DB == nil || d.Ent == nil || d.Store == nil || d.Redis == nil || d.Logger == nil || d.LogBuffer == nil || d.Storage == nil || d.Tunnel == nil || d.Sockets == nil || d.Cache == nil || d.Broker == nil || d.Privacy == nil || d.Contacts == nil || d.Preferences == nil || d.NotificationRecipients == nil || d.Plans == nil {
		return fmt.Errorf("application dependencies must all be provided")
	}
	return nil
}
