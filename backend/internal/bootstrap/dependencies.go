// Package bootstrap assembles production adapters at the executable boundary.
package bootstrap

import (
	"context"
	"database/sql"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/app"
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
	return app.Dependencies{
		Config: cfg, DB: db, Ent: entClient, Store: store, Redis: redisClient, JobsRedis: jobsRedisClient,
		Logger: logging.NewLogger(logBuffer), LogBuffer: logBuffer, Storage: storageService,
		Tunnel: tunnel.NewManager(), Sockets: socketio.New(), Cache: cache.NewRedisCache(redisClient),
		Broker:  broker.NewRedisBroker(redisClient),
		Privacy: store, Contacts: store, Preferences: store, NotificationRecipients: store,
		Plans: featureplans.NewService(store, nil, nil),
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
