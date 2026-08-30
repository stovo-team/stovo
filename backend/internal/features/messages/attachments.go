package messages

import (
	"context"
	"strings"
)

// AttachmentCommand joins completed files to a message and publishes the
// corresponding durable synchronization event as one atomic operation.
type AttachmentCommand struct {
	MessageID, ChatID, FamilyID string
	FileIDs                     []string
}

type AttachmentStore interface {
	Attach(context.Context, AttachmentCommand) error
}

type AttachmentService struct{ store AttachmentStore }

func NewAttachmentService(store AttachmentStore) *AttachmentService {
	return &AttachmentService{store: store}
}

func (s *AttachmentService) Attach(ctx context.Context, command AttachmentCommand) error {
	command.FileIDs = uniqueFileIDs(command.FileIDs)
	return s.store.Attach(ctx, command)
}

func uniqueFileIDs(fileIDs []string) []string {
	seen := make(map[string]struct{}, len(fileIDs))
	unique := make([]string, 0, len(fileIDs))
	for _, fileID := range fileIDs {
		fileID = strings.TrimSpace(fileID)
		if fileID == "" {
			continue
		}
		if _, exists := seen[fileID]; exists {
			continue
		}
		seen[fileID] = struct{}{}
		unique = append(unique, fileID)
	}
	return unique
}
