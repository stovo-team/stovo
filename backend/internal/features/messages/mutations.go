package messages

import "context"

type PlainEdit struct{ MessageID, Content, UpdatedAt string }
type EncryptedEdit struct {
	MessageID, Ciphertext, Nonce, EncryptionMetadata, UpdatedAt string
	KeyVersion                                                  int
}
type Deletion struct {
	MessageID, UserID, DeletedAt string
	ForUserOnly                  bool
}

type MutationStore interface {
	EditPlain(context.Context, PlainEdit) error
	EditEncrypted(context.Context, EncryptedEdit) error
	Delete(context.Context, Deletion) error
}
type MutationService struct{ store MutationStore }

func NewMutationService(store MutationStore) *MutationService { return &MutationService{store: store} }
func (s *MutationService) EditPlain(ctx context.Context, edit PlainEdit) error {
	return s.store.EditPlain(ctx, edit)
}
func (s *MutationService) EditEncrypted(ctx context.Context, edit EncryptedEdit) error {
	return s.store.EditEncrypted(ctx, edit)
}
func (s *MutationService) Delete(ctx context.Context, deletion Deletion) error {
	return s.store.Delete(ctx, deletion)
}
