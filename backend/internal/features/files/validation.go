package files

import "context"

// ValidationUpload is the persistence-neutral input required by a runtime
// worker to inspect a direct upload's bytes.
type ValidationUpload struct {
	UploadID, FileID, ObjectKey, ExpectedMIME, State, FamilyID string
	ChatID                                                     *string
	ExpectedBytes                                              int64
	ExpectedChecksum                                           *string
}
type ValidationReady struct {
	Upload                                       ValidationUpload
	EventID, DetectedMIME, Checksum, ValidatedAt string
}
type ValidationRejected struct{ UploadID, FileID, FailureCode, DetectedMIME, ValidatedAt string }

// Lifecycle is the public-availability state of stored file metadata. It is
// intentionally separate from transport streaming and storage SDK concerns.
type Lifecycle struct {
	State          string
	ObjectRevision *string
}

type LifecycleStore interface {
	Lifecycle(context.Context, string) (Lifecycle, error)
}

type LifecycleService struct{ store LifecycleStore }

func NewLifecycleService(store LifecycleStore) *LifecycleService {
	return &LifecycleService{store: store}
}
func (s *LifecycleService) Get(ctx context.Context, fileID string) (Lifecycle, error) {
	return s.store.Lifecycle(ctx, fileID)
}
func (s *LifecycleService) Ready(ctx context.Context, fileID string) bool {
	lifecycle, err := s.Get(ctx, fileID)
	return err == nil && lifecycle.State == "ready"
}

type ValidationStore interface {
	ReceiptRecorded(context.Context, string) (bool, error)
	LoadValidationUpload(context.Context, string) (ValidationUpload, bool, error)
	MarkValidationReady(context.Context, ValidationReady) error
	RejectValidation(context.Context, ValidationRejected) error
	RecordValidationReceipt(context.Context, string) error
}
type ValidationService struct{ store ValidationStore }

func NewValidationService(store ValidationStore) *ValidationService {
	return &ValidationService{store: store}
}
func (s *ValidationService) ReceiptRecorded(ctx context.Context, eventID string) (bool, error) {
	return s.store.ReceiptRecorded(ctx, eventID)
}
func (s *ValidationService) Load(ctx context.Context, uploadID string) (ValidationUpload, bool, error) {
	return s.store.LoadValidationUpload(ctx, uploadID)
}
func (s *ValidationService) MarkReady(ctx context.Context, ready ValidationReady) error {
	return s.store.MarkValidationReady(ctx, ready)
}
func (s *ValidationService) Reject(ctx context.Context, rejection ValidationRejected) error {
	return s.store.RejectValidation(ctx, rejection)
}
func (s *ValidationService) RecordReceipt(ctx context.Context, eventID string) error {
	return s.store.RecordValidationReceipt(ctx, eventID)
}
