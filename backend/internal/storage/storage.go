package storage

import (
	"fmt"

	"stovo-messenger/backend/internal/ports"
)

type ObjectStore = ports.ObjectStore
type ObjectInfo = ports.ObjectInfo
type BucketObjectStore = ports.BucketObjectStore
type PresignedObjectStore = ports.PresignedObjectStore

type Config struct {
	Provider  string
	LocalPath string
	Endpoint  string
	AccessKey string
	SecretKey string
	Secure    bool
	// PublicEndpoint is an optional externally reachable S3 endpoint used
	// exclusively for presigning. Data-plane calls keep using Endpoint.
	PublicEndpoint string
	PublicSecure   bool
	Bucket         string
}

func New(cfg Config) (ObjectStore, error) {
	switch cfg.Provider {
	case "", "local":
		return NewLocalStorage(cfg.LocalPath)
	case "minio":
		store, err := NewMinIOStorage(cfg.Endpoint, cfg.AccessKey, cfg.SecretKey, cfg.Secure, cfg.Bucket)
		if err != nil {
			return nil, err
		}
		if cfg.LocalPath != "" {
			if local, err := NewLocalStorage(cfg.LocalPath); err == nil {
				store.SetFallback(local)
			}
		}
		if cfg.PublicEndpoint != "" {
			if err := store.SetPresignEndpoint(cfg.PublicEndpoint, cfg.PublicSecure); err != nil {
				return nil, err
			}
		}
		return store, nil
	default:
		return nil, fmt.Errorf("unsupported storage provider %q", cfg.Provider)
	}
}
