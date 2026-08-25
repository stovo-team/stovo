package storage

import (
	"fmt"

	"family-messenger/backend/internal/ports"
)

type ObjectStore = ports.ObjectStore
type ObjectInfo = ports.ObjectInfo

type Config struct {
	Provider  string
	LocalPath string
	Endpoint  string
	AccessKey string
	SecretKey string
	Secure    bool
	Bucket    string
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
		return store, nil
	default:
		return nil, fmt.Errorf("unsupported storage provider %q", cfg.Provider)
	}
}
