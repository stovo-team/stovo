package app

import (
	"bytes"
	"context"
	"image/jpeg"
	"os"
	"os/exec"
	"testing"

	"family-messenger/backend/internal/storage"
)

func TestGenerateVideoThumbnailProducesJPEG(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is required to generate the video test fixture")
	}

	fixture := t.TempDir() + "/fixture.mp4"
	command := exec.Command("ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=16x16:d=0.1", "-c:v", "mpeg4", fixture)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("generate video fixture: %v: %s", err, output)
	}
	video, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatalf("read video fixture: %v", err)
	}

	thumbnail, err := generateVideoThumbnail(context.Background(), video)
	if err != nil {
		t.Fatalf("generate thumbnail: %v", err)
	}
	if _, err := jpeg.Decode(bytes.NewReader(thumbnail)); err != nil {
		t.Fatalf("thumbnail is not a JPEG: %v", err)
	}
}

func TestVideoUploadSucceedsWithoutThumbnailWhenExtractionFails(t *testing.T) {
	_, serverURL, client := newTestServer(t)
	setup := jsonRequest(t, client, "POST", serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Thumbnail family",
		"username":    "thumbnail-owner",
		"password":    "correct-horse-battery-staple",
		"displayName": "Thumbnail Owner",
	})
	if setup.StatusCode != 201 {
		t.Fatalf("setup status = %d, want 201", setup.StatusCode)
	}
	owner := decodeJSON[authResponse](t, setup)

	response := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, "", "broken.mp4", []byte("not a video"))
	if response.StatusCode != 201 {
		defer response.Body.Close()
		t.Fatalf("upload status = %d, want 201", response.StatusCode)
	}
	file := decodeJSON[filePublic](t, response)
	if file.ThumbnailObjectKey != nil {
		t.Fatalf("thumbnail key = %q, want nil after failed extraction", *file.ThumbnailObjectKey)
	}
}

func TestDeleteFileObjectsDeletesThumbnailDerivative(t *testing.T) {
	store, err := storage.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	thumbnailKey := "family/test/video.mp4.thumbnail.jpg"
	if err := store.Save("family/test/video.mp4", []byte("video")); err != nil {
		t.Fatalf("save video: %v", err)
	}
	if err := store.Save(thumbnailKey, []byte("thumbnail")); err != nil {
		t.Fatalf("save thumbnail: %v", err)
	}

	deleteFileObjects(store, "family/test/video.mp4", &thumbnailKey)

	if _, err := store.Read("family/test/video.mp4"); err == nil {
		t.Fatal("original object remains after deletion")
	}
	if _, err := store.Read(thumbnailKey); err == nil {
		t.Fatal("thumbnail derivative remains after deletion")
	}
}
