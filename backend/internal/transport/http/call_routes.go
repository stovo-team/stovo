package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// CallRoutes contains the already-composed inbound handlers for calls and
// call transcription. Authentication remains a caller concern: every entry
// must be wrapped before it is supplied here. This transport owns only the
// stable HTTP method and path dispatch.
type CallRoutes struct {
	GetICEServers               stdhttp.Handler
	CreateSFUToken              stdhttp.Handler
	StartTranscription          stdhttp.Handler
	StopTranscription           stdhttp.Handler
	GetTranscriptionStatus      stdhttp.Handler
	GetTranscript               stdhttp.Handler
	RequestTranscriptionUpload  stdhttp.Handler
	UploadAudioChunkData        stdhttp.Handler
	CompleteTranscriptionUpload stdhttp.Handler
	UpdateTranscriptSegment     stdhttp.Handler
	GetTranscriptArtifact       stdhttp.Handler
	StartRecording              stdhttp.Handler
	StopRecording               stdhttp.Handler
	GetRecordingStatus          stdhttp.Handler
	UploadRecording             stdhttp.Handler
	FailRecording               stdhttp.Handler
	TranslateCaptions           stdhttp.Handler
	TranscribeCaptions          stdhttp.Handler
}

// RegisterCallRoutes installs the stable REST contract for calls and
// transcription. Authorization and business policy remain in supplied
// handlers.
func RegisterCallRoutes(router chi.Router, routes CallRoutes) {
	router.Method(stdhttp.MethodGet, "/api/calls/ice-servers", routes.GetICEServers)
	router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/sfu-token", routes.CreateSFUToken)
	router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/transcription/start", routes.StartTranscription)
	router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/transcription/stop", routes.StopTranscription)
	router.Method(stdhttp.MethodGet, "/api/calls/{roomId}/transcription/status", routes.GetTranscriptionStatus)
	router.Method(stdhttp.MethodGet, "/api/calls/{roomId}/transcript", routes.GetTranscript)
	router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/transcription/uploads", routes.RequestTranscriptionUpload)
	router.Method(stdhttp.MethodPut, "/api/calls/{roomId}/transcription/uploads/{chunkId}/data", routes.UploadAudioChunkData)
	router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/transcription/uploads/{chunkId}/complete", routes.CompleteTranscriptionUpload)
	router.Method(stdhttp.MethodPatch, "/api/calls/{roomId}/transcript/segments/{segmentId}", routes.UpdateTranscriptSegment)
	router.Method(stdhttp.MethodGet, "/api/calls/{roomId}/transcript/artifacts/{artifactType}", routes.GetTranscriptArtifact)
	if routes.StartRecording != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/recording/start", routes.StartRecording)
	}
	if routes.StopRecording != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/recording/stop", routes.StopRecording)
	}
	if routes.GetRecordingStatus != nil {
		router.Method(stdhttp.MethodGet, "/api/calls/{roomId}/recording/status", routes.GetRecordingStatus)
	}
	if routes.UploadRecording != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/recording/upload", routes.UploadRecording)
	}
	if routes.FailRecording != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/recording/fail", routes.FailRecording)
	}
	if routes.TranslateCaptions != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/captions/translate", routes.TranslateCaptions)
	}
	if routes.TranscribeCaptions != nil {
		router.Method(stdhttp.MethodPost, "/api/calls/{roomId}/captions/transcribe", routes.TranscribeCaptions)
	}
}
