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
	if !AllowedMIME("text/markdown") {
		t.Fatal("markdown MIME rejected")
	}
	if got, ok := NormalizeUploadMIME("application/octet-stream", "shared-photo.jpg"); !ok || got != "image/jpeg" {
		t.Fatalf("mime = %q ok=%v", got, ok)
	}
	if !AllowedMIME("text/markdown") {
		t.Fatal("Markdown MIME rejected")
	}
	if got, ok := NormalizeUploadMIME("text/markdown; charset=utf-8", "notes.md"); !ok || got != "text/markdown" {
		t.Fatalf("Markdown mime = %q ok=%v", got, ok)
	}
	if SanitizeFilename(` ../bad\\name.txt `) != "name.txt" {
		t.Fatal("filename was not sanitized")
	}
}

func TestNormalizeUploadMIMEAllowsSyntacticallyValidTypesByDefault(t *testing.T) {
	for _, tc := range []struct {
		name     string
		mimeType string
		filename string
		want     string
	}{
		{name: "svg", mimeType: "image/svg+xml", filename: "diagram.svg", want: "image/svg+xml"},
		{name: "custom type", mimeType: "application/vnd.example+binary", filename: "data.custom", want: "application/vnd.example+binary"},
		{name: "unknown extension", mimeType: "application/octet-stream", filename: "archive.unknown", want: "application/octet-stream"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := NormalizeUploadMIME(tc.mimeType, tc.filename)
			if !ok || got != tc.want {
				t.Fatalf("NormalizeUploadMIME(%q, %q) = %q, %v; want %q, true", tc.mimeType, tc.filename, got, ok, tc.want)
			}
		})
	}
	if _, ok := NormalizeUploadMIME("not a mime type", "file.svg"); ok {
		t.Fatal("malformed MIME type should remain invalid")
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
