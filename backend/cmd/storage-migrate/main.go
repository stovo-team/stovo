package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/storage"
)

type result struct {
	ID        string `json:"id"`
	ObjectKey string `json:"objectKey"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	if cfg.StorageProvider != "minio" && cfg.StorageProvider != "s3" {
		panic("STORAGE_PROVIDER must be minio or s3")
	}
	source, err := storage.New(storage.Config{Provider: "local", LocalPath: cfg.LocalStoragePath})
	if err != nil {
		panic(err)
	}
	target, err := storage.New(storage.Config{Provider: cfg.StorageProvider, Endpoint: cfg.MinIOEndpoint, AccessKey: cfg.MinIOAccessKey, SecretKey: cfg.MinIOSecretKey, Secure: cfg.MinIOSecure, Bucket: cfg.MinIOFilesBucket})
	if err != nil {
		panic(err)
	}
	logs, err := storage.New(storage.Config{Provider: cfg.StorageProvider, Endpoint: cfg.MinIOEndpoint, AccessKey: cfg.MinIOAccessKey, SecretKey: cfg.MinIOSecretKey, Secure: cfg.MinIOSecure, Bucket: cfg.MinIOLogsBucket})
	if err != nil {
		panic(err)
	}
	db, err := sql.Open("pgx", cfg.EffectiveDatabaseURL())
	if err != nil {
		panic(err)
	}
	defer func() { _ = db.Close() }()
	rows, err := db.Query(`SELECT id, object_key, checksum FROM files ORDER BY id`)
	if err != nil {
		panic(err)
	}
	defer func() { _ = rows.Close() }()
	results := []result{}
	for rows.Next() {
		var id, key string
		var checksum sql.NullString
		if err := rows.Scan(&id, &key, &checksum); err != nil {
			panic(err)
		}
		data, err := source.Read(key)
		if err == nil && checksum.Valid {
			sum := sha256.Sum256(data)
			if hex.EncodeToString(sum[:]) != checksum.String {
				err = fmt.Errorf("checksum mismatch")
			}
		}
		if err == nil {
			err = target.Save(key, data)
		}
		if err == nil {
			_, err = db.Exec(`UPDATE files SET storage_provider = 'minio' WHERE id = $1`, id)
		}
		item := result{ID: id, ObjectKey: key, Status: "migrated"}
		if err != nil {
			item.Status = "failed"
			item.Error = err.Error()
		}
		results = append(results, item)
	}
	manifest, _ := json.MarshalIndent(results, "", "  ")
	manifest = append(manifest, '\n')
	key := "migrations/file-migration-" + time.Now().UTC().Format("20060102T150405Z") + ".json"
	if err := logs.Save(key, manifest); err != nil {
		panic(err)
	}
	for _, item := range results {
		if item.Status == "failed" {
			fmt.Fprintln(os.Stderr, item.Error)
			os.Exit(1)
		}
	}
}
