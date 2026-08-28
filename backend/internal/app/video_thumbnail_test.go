package app

import (
	"bytes"
	"context"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"os/exec"
	"testing"

	"stovo-messenger/backend/internal/storage"
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

func TestThumbnailEndpointServesStoredJPEGToAuthorizedViewer(t *testing.T) {
	server, serverURL, client := newTestServer(t)
	setup := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Thumbnail family",
		"username":    "thumbnail-owner",
		"password":    "correct-horse-battery-staple",
		"displayName": "Thumbnail Owner",
	})
	if setup.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setup.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setup)

	upload := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, "", "photo.jpg", []byte("photo"))
	if upload.StatusCode != http.StatusCreated {
		t.Fatalf("upload status = %d, want %d", upload.StatusCode, http.StatusCreated)
	}
	file := decodeJSON[filePublic](t, upload)
	thumbnailKey := "family/test/photo.jpg.thumbnail.jpg"
	thumbnail := []byte{0xff, 0xd8, 0xff, 0xd9}
	if err := server.storage.Save(thumbnailKey, thumbnail); err != nil {
		t.Fatalf("save thumbnail: %v", err)
	}
	if _, err := server.ent.File.UpdateOneID(file.ID).SetThumbnailObjectKey(thumbnailKey).Save(context.Background()); err != nil {
		t.Fatalf("set thumbnail key: %v", err)
	}

	response := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+file.ID+"/thumbnail", owner.AccessToken, nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("thumbnail status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "image/jpeg" {
		t.Fatalf("thumbnail content type = %q, want %q", contentType, "image/jpeg")
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read thumbnail: %v", err)
	}
	if !bytes.Equal(body, thumbnail) {
		t.Fatalf("thumbnail body = %x, want %x", body, thumbnail)
	}
}

func TestThumbnailEndpointHidesInvisibleDeletedAndUnthumbnailedFiles(t *testing.T) {
	server, serverURL, client := newTestServer(t)
	setup := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Thumbnail visibility family",
		"username":    "thumbnail-owner",
		"password":    "correct-horse-battery-staple",
		"displayName": "Thumbnail Owner",
	})
	if setup.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setup.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setup)
	member := createInvitedUser(t, client, serverURL.URL, owner, "thumbnail-member")
	observer := createInvitedUser(t, client, serverURL.URL, owner, "thumbnail-observer")
	chatResponse := jsonRequest(t, client, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{
		"userId": member.User.ID,
	})
	if chatResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create direct chat status = %d, want %d", chatResponse.StatusCode, http.StatusCreated)
	}
	chat := decodeJSON[chatPublic](t, chatResponse)
	upload := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, chat.ID, "photo.jpg", []byte("photo"))
	if upload.StatusCode != http.StatusCreated {
		t.Fatalf("upload private file status = %d, want %d", upload.StatusCode, http.StatusCreated)
	}
	file := decodeJSON[filePublic](t, upload)
	thumbnailKey := "family/test/track.mp3.thumbnail.jpg"
	if err := server.storage.Save(thumbnailKey, []byte{0xff, 0xd8, 0xff, 0xd9}); err != nil {
		t.Fatalf("save thumbnail: %v", err)
	}
	if _, err := server.ent.File.UpdateOneID(file.ID).SetThumbnailObjectKey(thumbnailKey).Save(context.Background()); err != nil {
		t.Fatalf("set thumbnail key: %v", err)
	}
	target := serverURL.URL + "/api/files/" + file.ID + "/thumbnail"

	invisible := jsonRequest(t, client, http.MethodGet, target, observer.AccessToken, nil)
	invisible.Body.Close()
	if invisible.StatusCode != http.StatusNotFound {
		t.Fatalf("invisible thumbnail status = %d, want %d", invisible.StatusCode, http.StatusNotFound)
	}

	if err := server.store.SoftDeleteFile(context.Background(), nil, file.ID, nowString()); err != nil {
		t.Fatalf("mark file deleted: %v", err)
	}
	deleted := jsonRequest(t, client, http.MethodGet, target, owner.AccessToken, nil)
	deleted.Body.Close()
	if deleted.StatusCode != http.StatusNotFound {
		t.Fatalf("deleted thumbnail status = %d, want %d", deleted.StatusCode, http.StatusNotFound)
	}

	uploadWithoutThumbnail := uploadFileRequest(t, client, serverURL.URL+"/api/files/upload", owner.AccessToken, "", "another-photo.jpg", []byte("photo"))
	if uploadWithoutThumbnail.StatusCode != http.StatusCreated {
		t.Fatalf("upload file without thumbnail status = %d, want %d", uploadWithoutThumbnail.StatusCode, http.StatusCreated)
	}
	unthumbnailed := decodeJSON[filePublic](t, uploadWithoutThumbnail)
	missing := jsonRequest(t, client, http.MethodGet, serverURL.URL+"/api/files/"+unthumbnailed.ID+"/thumbnail", owner.AccessToken, nil)
	missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("unthumbnailed file status = %d, want %d", missing.StatusCode, http.StatusNotFound)
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
