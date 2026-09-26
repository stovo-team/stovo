package storage

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type LocalStorage struct {
	root string
}

func NewLocalStorage(root string) (*LocalStorage, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absRoot, 0o755); err != nil {
		return nil, err
	}
	return &LocalStorage{root: absRoot}, nil
}

func (s *LocalStorage) Save(objectKey string, data []byte) error {
	path, err := s.resolve(objectKey)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func (s *LocalStorage) Provider() string { return "local" }

func (s *LocalStorage) Read(objectKey string) ([]byte, error) {
	path, err := s.resolve(objectKey)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

func (s *LocalStorage) Open(objectKey string) (io.ReadSeekCloser, error) {
	path, err := s.resolve(objectKey)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *LocalStorage) Delete(objectKey string) error {
	path, err := s.resolve(objectKey)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *LocalStorage) resolve(objectKey string) (string, error) {
	cleaned := filepath.Clean(strings.TrimSpace(objectKey))
	if cleaned == "." || cleaned == "" {
		return "", errors.New("invalid object key")
	}
	fullPath := filepath.Join(s.root, cleaned)
	rel, err := filepath.Rel(s.root, fullPath)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(rel, "..") {
		return "", errors.New("path escapes storage root")
	}
	return fullPath, nil
}

func (s *LocalStorage) SaveToBucket(_ context.Context, _ string, objectKey string, data []byte, _ string) error {
	return s.Save(objectKey, data)
}

func (s *LocalStorage) ReadFromBucket(_ context.Context, _ string, objectKey string) ([]byte, error) {
	return s.Read(objectKey)
}

func (s *LocalStorage) StatObject(_ context.Context, _ string, objectKey string) (ObjectInfo, error) {
	path, err := s.resolve(objectKey)
	if err != nil {
		return ObjectInfo{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return ObjectInfo{}, err
	}
	return ObjectInfo{
		Size: info.Size(),
	}, nil
}
