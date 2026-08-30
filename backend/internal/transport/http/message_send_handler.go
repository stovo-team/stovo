package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const ClientOperationHeader = "X-Stovo-Operation-Id"

// MessageSendRequest is the stable REST request DTO. It belongs to the HTTP
// transport so application code never needs to decode net/http bodies.
type MessageSendRequest struct {
	Type                string   `json:"type"`
	Content             *string  `json:"content"`
	FileIDs             []string `json:"fileIds"`
	ReplyToMessageID    *string  `json:"replyToMessageId"`
	ThreadRootMessageID *string  `json:"threadRootMessageId"`
	EncryptionProtocol  *string  `json:"encryptionProtocol"`
	Ciphertext          *string  `json:"ciphertext"`
	Nonce               *string  `json:"nonce"`
	KeyVersion          *int     `json:"keyVersion"`
	EncryptionMetadata  *string  `json:"encryptionMetadata"`
	MentionedUserIDs    []string `json:"mentionedUserIds"`
	AttachmentsPending  bool     `json:"attachmentsPending"`
}
type MessageSendOperations struct {
	Send      func(context.Context, string, MessageSendRequest, string) (any, error)
	StatusFor func(error) int
	DetailFor func(error) string
}
type MessageSendHandler struct{ operations MessageSendOperations }

func NewMessageSendHandler(operations MessageSendOperations) MessageSendHandler {
	return MessageSendHandler{operations}
}
func (h MessageSendHandler) Send(w http.ResponseWriter, r *http.Request) {
	var payload MessageSendRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	operationID := strings.TrimSpace(r.Header.Get(ClientOperationHeader))
	if operationID != "" {
		if _, err := uuid.Parse(operationID); err != nil {
			writeMessageDetail(w, http.StatusBadRequest, "Invalid operation ID")
			return
		}
	}
	value, err := h.operations.Send(r.Context(), chi.URLParam(r, "chatId"), payload, operationID)
	if err != nil {
		status := http.StatusInternalServerError
		if h.operations.StatusFor != nil {
			status = h.operations.StatusFor(err)
		}
		detail := err.Error()
		if h.operations.DetailFor != nil {
			detail = h.operations.DetailFor(err)
		}
		writeMessageDetail(w, status, detail)
		return
	}
	writeMessageValue(w, http.StatusCreated, value)
}
