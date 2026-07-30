package storage

import (
	"fmt"
	"io"
)

// ObjectStore is the backend's private object-storage boundary.
type ObjectStore interface {
	Save(objectKey string, data []byte) error
	Read(objectKey string) ([]byte, error)
	Open(objectKey string) (io.ReadSeekCloser, error)
	Delete(objectKey string) error
	Provider() string
}

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
		return NewMinIOStorage(cfg.Endpoint, cfg.AccessKey, cfg.SecretKey, cfg.Secure, cfg.Bucket)
	default:
		return nil, fmt.Errorf("unsupported storage provider %q", cfg.Provider)
	}
}
