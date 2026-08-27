package app

import (
	"fmt"

	"family-messenger/backend/internal/ports"
)

func (s *Server) bucketObjectStore() (ports.BucketObjectStore, error) {
	store, ok := s.storage.(ports.BucketObjectStore)
	if !ok {
		return nil, fmt.Errorf("bucket operations are not supported with %s storage", s.storage.Provider())
	}
	return store, nil
}

func (s *Server) presignedObjectStore() (ports.PresignedObjectStore, error) {
	store, ok := s.storage.(ports.PresignedObjectStore)
	if !ok {
		return nil, fmt.Errorf("presigned URLs are not supported with %s storage", s.storage.Provider())
	}
	return store, nil
}
