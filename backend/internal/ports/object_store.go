package ports

import (
	"context"
	"io"
	"time"
)

// ObjectStore is the application-facing contract for file storage adapters.
type ObjectStore interface {
	Save(string, []byte) error
	Read(string) ([]byte, error)
	Open(string) (io.ReadSeekCloser, error)
	Delete(string) error
	Provider() string
	PresignPutObject(context.Context, string, string, time.Duration, string) (string, error)
	PresignGetObject(context.Context, string, string, time.Duration) (string, error)
	SaveToBucket(context.Context, string, string, []byte, string) error
	StatObject(context.Context, string, string) (ObjectInfo, error)
}

type ObjectInfo struct {
	Size        int64
	ContentType string
	ETag        string
}
