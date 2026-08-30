package files

import (
	"context"
	"errors"
	"testing"
	"time"
)

type preferenceStoreFake struct{ change FavoriteChange }

func (s *preferenceStoreFake) SetFavorite(_ context.Context, change FavoriteChange) error {
	s.change = change
	return nil
}

func TestPreferenceServicePassesPrivateFavoriteChange(t *testing.T) {
	store := &preferenceStoreFake{}
	service := NewPreferenceService(store)
	change := FavoriteChange{FileID: "file", UserID: "user", FamilyID: "family", IsFavorite: true}
	if err := service.SetFavorite(context.Background(), change); err != nil {
		t.Fatal(err)
	}
	if store.change != change {
		t.Fatalf("change=%+v", store.change)
	}
}

type deletionStoreFake struct {
	deletion Deletion
	err      error
}

func (s *deletionStoreFake) Delete(_ context.Context, deletion Deletion) error {
	s.deletion = deletion
	return s.err
}

func TestDeletionServiceDelegatesAtomicDeletion(t *testing.T) {
	chatID := "chat"
	store := &deletionStoreFake{}
	deletion := Deletion{FileID: "file", FamilyID: "family", ChatID: &chatID}
	if err := NewDeletionService(store).Delete(context.Background(), deletion); err != nil {
		t.Fatal(err)
	}
	if store.deletion.FileID != deletion.FileID || store.deletion.FamilyID != deletion.FamilyID || store.deletion.ChatID == nil || *store.deletion.ChatID != chatID {
		t.Fatalf("deletion=%+v", store.deletion)
	}
	store.err = errors.New("transaction failed")
	if err := NewDeletionService(store).Delete(context.Background(), deletion); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}

type legacyUploadStoreFake struct {
	upload LegacyUpload
	err    error
}

func (s *legacyUploadStoreFake) RecordLegacyUpload(_ context.Context, upload LegacyUpload) error {
	s.upload = upload
	return s.err
}

func TestLegacyUploadServiceDelegatesDurableRecord(t *testing.T) {
	store := &legacyUploadStoreFake{}
	upload := LegacyUpload{FileID: "file", FamilyID: "family", UserID: "user", ObjectKey: "object", CreatedAt: time.Now().UTC()}
	if err := NewLegacyUploadService(store).Record(context.Background(), upload); err != nil {
		t.Fatal(err)
	}
	if store.upload.FileID != upload.FileID || store.upload.ObjectKey != upload.ObjectKey {
		t.Fatalf("upload=%+v", store.upload)
	}
	store.err = errors.New("record failed")
	if err := NewLegacyUploadService(store).Record(context.Background(), upload); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeChecksum(t *testing.T) {
	value := " ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD "
	got, err := NormalizeChecksum(&value)
	if err != nil || *got != "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" {
		t.Fatalf("got=%v err=%v", got, err)
	}
	invalid := "not-a-checksum"
	if _, err := NormalizeChecksum(&invalid); !errors.Is(err, ErrInvalidChecksum) {
		t.Fatalf("err=%v", err)
	}
}

func TestUploadMetadataMIMEAndFilenamePolicy(t *testing.T) {
	if !AllowedMIME("audio/webm;codecs=opus") {
		t.Fatal("parameterized MIME rejected")
	}
	if got, ok := NormalizeUploadMIME("application/octet-stream", "shared-photo.jpg"); !ok || got != "image/jpeg" {
		t.Fatalf("mime = %q ok=%v", got, ok)
	}
	if SanitizeFilename(` ../bad\\name.txt `) != "name.txt" {
		t.Fatal("filename was not sanitized")
	}
}

func TestUploadCompletionState(t *testing.T) {
	now := time.Now().UTC()
	if next, ok := UploadCompletionState("reserved", now.Add(time.Minute), now); !ok || next != "validating" {
		t.Fatalf("reserved = %q %v", next, ok)
	}
	if _, ok := UploadCompletionState("reserved", now, now); ok {
		t.Fatal("expired reservation accepted")
	}
	if next, ok := UploadCompletionState("ready", now.Add(-time.Hour), now); !ok || next != "ready" {
		t.Fatalf("ready = %q %v", next, ok)
	}
}

func TestReservationRequestHashIsStable(t *testing.T) {
	request := ReservationRequest{OriginalName: "file.txt", MIMEType: "text/plain", SizeBytes: 12, ChatID: "chat"}
	first, err := ReservationRequestHash(request)
	second, secondErr := ReservationRequestHash(request)
	if err != nil || secondErr != nil || first == "" || first != second {
		t.Fatalf("hashes %q %q; errors %v %v", first, second, err, secondErr)
	}
}
