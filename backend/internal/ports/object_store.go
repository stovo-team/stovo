package ports

import (
	"context"
	"io"
	"time"
)

// ObjectReader reads application-owned objects.
type ObjectReader interface {
	Read(string) ([]byte, error)
	Open(string) (io.ReadSeekCloser, error)
}

// ObjectWriter persists application-owned objects.
type ObjectWriter interface {
	Save(string, []byte) error
}

// ObjectDeleter removes application-owned objects.
type ObjectDeleter interface {
	Delete(string) error
}

// ObjectStore is the common capability required by ordinary application file
// handling. Provider-specific bucket and presigning operations are separate.
type ObjectStore interface {
	ObjectReader
	ObjectWriter
	ObjectDeleter
	Provider() string
}

// BucketObjectStore supports operations against an explicitly named bucket.
// It is used by direct uploads and call-transcription artifacts.
type BucketObjectStore interface {
	SaveToBucket(context.Context, string, string, []byte, string) error
	StatObject(context.Context, string, string) (ObjectInfo, error)
}

// PresignedObjectStore creates time-limited S3-compatible object URLs.
// Local storage intentionally does not need to implement this capability.
type PresignedObjectStore interface {
	PresignPutObject(context.Context, string, string, time.Duration, string) (string, error)
	PresignGetObject(context.Context, string, string, time.Duration) (string, error)
}

type ObjectInfo struct {
	Size        int64
	ContentType string
	ETag        string
}
