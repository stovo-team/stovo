package app

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/broker"
	"stovo-messenger/backend/internal/cache"
	"stovo-messenger/backend/internal/config"
	featureplans "stovo-messenger/backend/internal/features/plans"
	"stovo-messenger/backend/internal/logging"
	"stovo-messenger/backend/internal/repository"
	"stovo-messenger/backend/internal/storage"
	"stovo-messenger/backend/internal/tunnel"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	socketio "github.com/doquangtan/socketio/v4"
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
	return Dependencies{
		Config: cfg, DB: db, Ent: entClient, Store: store, Redis: client,
		Logger: logging.NewLogger(logBuffer), LogBuffer: logBuffer, Storage: objectStore,
		Tunnel: tunnel.NewManager(), Sockets: socketio.New(), Cache: cache.NewRedisCache(client),
		Broker:  broker.NewRedisBroker(client),
		Privacy: store, Contacts: store, Preferences: store, NotificationRecipients: store,
		Plans: featureplans.NewService(store, nil, nil),
	}
}
