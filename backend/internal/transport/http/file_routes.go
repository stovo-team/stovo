package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// FileRoutes contains the already-composed inbound handlers for file and
// media endpoints. Protected entries must be wrapped by the caller before
// registration. StreamMedia intentionally remains unwrapped so playback-token
// authorization continues to be performed by its handler for GET and HEAD.
type FileRoutes struct {
	Upload               stdhttp.Handler
	ReserveDirectUpload  stdhttp.Handler
	GetDirectUpload      stdhttp.Handler
	CompleteDirectUpload stdhttp.Handler
	List                 stdhttp.Handler
	Get                  stdhttp.Handler
	CreateDirectAccess   stdhttp.Handler
	Download             stdhttp.Handler
	Thumbnail            stdhttp.Handler
	CreatePlaybackToken  stdhttp.Handler
	UpdatePreferences    stdhttp.Handler
	Transcribe           stdhttp.Handler
	GetTranscript        stdhttp.Handler
	Delete               stdhttp.Handler
	StreamMedia          stdhttp.Handler
}

// RegisterFileRoutes installs the stable REST contract for files and media.
func RegisterFileRoutes(router chi.Router, routes FileRoutes) {
	router.Post("/api/files/upload", routes.Upload.ServeHTTP)
	router.Post("/api/files/uploads", routes.ReserveDirectUpload.ServeHTTP)
	router.Get("/api/files/uploads/{uploadId}", routes.GetDirectUpload.ServeHTTP)
	router.Post("/api/files/uploads/{uploadId}/complete", routes.CompleteDirectUpload.ServeHTTP)
	router.Get("/api/files", routes.List.ServeHTTP)
	router.Get("/api/files/{fileId}", routes.Get.ServeHTTP)
	router.Post("/api/files/{fileId}/access", routes.CreateDirectAccess.ServeHTTP)
	router.Get("/api/files/{fileId}/download", routes.Download.ServeHTTP)
	router.Get("/api/files/{fileId}/thumbnail", routes.Thumbnail.ServeHTTP)
	router.Post("/api/files/{fileId}/playback-token", routes.CreatePlaybackToken.ServeHTTP)
	router.Patch("/api/files/{fileId}/preferences", routes.UpdatePreferences.ServeHTTP)
	router.Post("/api/files/{fileId}/transcribe", routes.Transcribe.ServeHTTP)
	router.Get("/api/files/{fileId}/transcript", routes.GetTranscript.ServeHTTP)
	router.Delete("/api/files/{fileId}", routes.Delete.ServeHTTP)
	router.Get("/api/media/{fileId}", routes.StreamMedia.ServeHTTP)
	router.Head("/api/media/{fileId}", routes.StreamMedia.ServeHTTP)
}
