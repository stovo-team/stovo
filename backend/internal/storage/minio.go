package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStorage struct {
	client        *minio.Client
	presignClient *minio.Client
	bucket        string
	accessKey     string
	secretKey     string
	provider      string
	fallback      ObjectStore
}

func (s *MinIOStorage) SetFallback(fallback ObjectStore) {
	s.fallback = fallback
}

func NewMinIOStorage(endpoint, accessKey, secretKey string, secure bool, bucket string) (*MinIOStorage, error) {
	endpoint = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(endpoint), "https://"), "http://")
	bucket = strings.TrimSpace(bucket)
	if endpoint == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return nil, fmt.Errorf("MinIO endpoint, credentials, and bucket are required")
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
		// Cloud.ru documents path-style requests (/{bucket}/{key}). This also
		// works with MinIO and avoids requiring wildcard DNS for bucket names.
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return nil, err
	}
	store := &MinIOStorage{client: client, presignClient: client, bucket: bucket, accessKey: accessKey, secretKey: secretKey, provider: "minio"}
	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(context.Background(), bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}
	if err := enableBucketVersioning(context.Background(), client, bucket); err != nil {
		return nil, err
	}
	return store, nil
}

func NewMinIOStorageForBucket(client *minio.Client, bucket string) (*MinIOStorage, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, fmt.Errorf("bucket name is required")
	}
	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(context.Background(), bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}
	if err := enableBucketVersioning(context.Background(), client, bucket); err != nil {
		return nil, err
	}
	return &MinIOStorage{client: client, presignClient: client, bucket: bucket, provider: "minio"}, nil
}

// SetPresignEndpoint changes only the host embedded in signed URLs. The
// backend continues to use its private MinIO endpoint for all object I/O.
func (s *MinIOStorage) SetPresignEndpoint(endpoint string, secure bool) error {
	endpoint = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(endpoint), "https://"), "http://")
	if endpoint == "" {
		return fmt.Errorf("MinIO public endpoint is required")
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(s.accessKey, s.secretKey, ""),
		Secure:       secure,
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return err
	}
	s.presignClient = client
	return nil
}

// enableBucketVersioning ensures deletion creates a recoverable delete marker
// rather than irreversibly removing a user's attachment.
func enableBucketVersioning(ctx context.Context, client *minio.Client, bucket string) error {
	return client.SetBucketVersioning(ctx, bucket, minio.BucketVersioningConfiguration{Status: "Enabled"})
}

func (s *MinIOStorage) Provider() string { return s.provider }

func (s *MinIOStorage) Save(key string, data []byte) error {
	if _, err := s.client.PutObject(context.Background(), s.bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{}); err != nil {
		return err
	}
	return nil
}

func (s *MinIOStorage) Read(key string) ([]byte, error) {
	r, err := s.Open(key)
	if err != nil {
		return nil, err
	}
	defer func() { _ = r.Close() }()
	return io.ReadAll(r)
}

func (s *MinIOStorage) Open(key string) (io.ReadSeekCloser, error) {
	object, err := s.client.GetObject(context.Background(), s.bucket, key, minio.GetObjectOptions{})
	if err == nil {
		if _, statErr := object.Stat(); statErr == nil {
			return object, nil
		} else {
			err = statErr
		}
		_ = object.Close()
	}
	if s.fallback != nil {
		return s.fallback.Open(key)
	}
	return nil, err
}

func (s *MinIOStorage) Delete(key string) error {
	return s.client.RemoveObject(context.Background(), s.bucket, key, minio.RemoveObjectOptions{})
}

func (s *MinIOStorage) PresignPutObject(ctx context.Context, bucket, objectKey string, expires time.Duration, contentType string) (string, error) {
	reqParams := url.Values{}
	if contentType != "" {
		reqParams.Set("response-content-type", contentType)
	}
	u, err := s.presignClient.PresignedPutObject(ctx, bucket, objectKey, expires)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (s *MinIOStorage) PresignGetObject(ctx context.Context, bucket, objectKey string, expires time.Duration) (string, error) {
	u, err := s.presignClient.PresignedGetObject(ctx, bucket, objectKey, expires, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (s *MinIOStorage) SaveToBucket(ctx context.Context, bucket, objectKey string, data []byte, contentType string) error {
	opts := minio.PutObjectOptions{}
	if contentType != "" {
		opts.ContentType = contentType
	}
	_, err := s.client.PutObject(ctx, bucket, objectKey, bytes.NewReader(data), int64(len(data)), opts)
	return err
}

func (s *MinIOStorage) ReadFromBucket(ctx context.Context, bucket, objectKey string) ([]byte, error) {
	if bucket == "" {
		bucket = s.bucket
	}
	object, err := s.client.GetObject(ctx, bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = object.Close() }()
	if _, err := object.Stat(); err != nil {
		return nil, err
	}
	return io.ReadAll(object)
}

func (s *MinIOStorage) StatObject(ctx context.Context, bucket, objectKey string) (ObjectInfo, error) {
	if bucket == "" {
		bucket = s.bucket
	}
	info, err := s.client.StatObject(ctx, bucket, objectKey, minio.StatObjectOptions{})
	if err == nil {
		return ObjectInfo{
			Size:        info.Size,
			ContentType: info.ContentType,
			ETag:        info.ETag,
		}, nil
	}
	if fallback, ok := s.fallback.(BucketObjectStore); ok {
		return fallback.StatObject(ctx, bucket, objectKey)
	}
	return ObjectInfo{}, err
}
