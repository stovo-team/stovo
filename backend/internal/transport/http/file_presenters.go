package http

import "time"

// ReserveDirectFileUploadRequest and the response models in this file are the
// HTTP contract for file endpoints. Keeping them with the inbound adapter
// prevents feature and storage code from depending on JSON concerns.
type ReserveDirectFileUploadRequest struct {
	OriginalName string  `json:"originalName"`
	MimeType     string  `json:"mimeType"`
	SizeBytes    int64   `json:"sizeBytes"`
	Checksum     *string `json:"checksum,omitempty"`
	ChatID       *string `json:"chatId,omitempty"`
}

type DirectFileUploadResponse struct {
	UploadID      string     `json:"uploadId"`
	FileID        string     `json:"fileId"`
	State         string     `json:"state"`
	UploadURL     *string    `json:"uploadUrl,omitempty"`
	ExpiresAt     *time.Time `json:"expiresAt,omitempty"`
	ExpectedMIME  string     `json:"expectedMimeType"`
	ExpectedBytes int64      `json:"expectedSizeBytes"`
}

func PresentDirectFileUpload(uploadID, fileID, state, expectedMIME string, expectedBytes int64) DirectFileUploadResponse {
	return DirectFileUploadResponse{UploadID: uploadID, FileID: fileID, State: state, ExpectedMIME: expectedMIME, ExpectedBytes: expectedBytes}
}

type DirectFileAccessResponse struct {
	FileID    string    `json:"fileId"`
	Revision  *string   `json:"revision,omitempty"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
	MimeType  string    `json:"mimeType"`
	SizeBytes int64     `json:"sizeBytes"`
	Checksum  *string   `json:"checksum,omitempty"`
}

type MediaPlaybackTokenResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type FileTranscriptResponse struct {
	FileID   string   `json:"fileId"`
	Text     string   `json:"text"`
	Language *string  `json:"language,omitempty"`
	Duration *float64 `json:"duration,omitempty"`
}
