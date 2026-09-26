package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	featurefiles "stovo-messenger/backend/internal/features/files"
)

type callRecordingPublic struct {
	ID                   string     `json:"id"`
	CallID               string     `json:"callId"`
	ChatID               string     `json:"chatId"`
	InitiatedBy          string     `json:"initiatedBy"`
	Status               string     `json:"status"`
	StartedAt            time.Time  `json:"startedAt"`
	StoppedAt            *time.Time `json:"stoppedAt,omitempty"`
	CompletedAt          *time.Time `json:"completedAt,omitempty"`
	DurationMs           int64      `json:"durationMs"`
	SizeBytes            int64      `json:"sizeBytes"`
	FileID               *string    `json:"fileId,omitempty"`
	MessageID            *string    `json:"messageId,omitempty"`
	CallHistoryMessageID *string    `json:"callHistoryMessageId,omitempty"`
	FailureMessage       *string    `json:"failureMessage,omitempty"`
}

func formatRecordingDuration(durationMs int64) string {
	seconds := durationMs / 1000
	if seconds < 0 {
		seconds = 0
	}
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60
	if hours > 0 {
		return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, secs)
	}
	return fmt.Sprintf("%02d:%02d", minutes, secs)
}

// recordingMessageContent keeps the recording label recognizable in chat while
// using the name people gave the meeting. It intentionally contains no emoji
// prefix: attachment UI already conveys that this is a video.
func recordingMessageContent(meetingName string, durationMs int64) string {
	meetingName = strings.TrimSpace(meetingName)
	if meetingName == "" {
		meetingName = "Meeting"
	}
	return fmt.Sprintf("%s Recording (%s)", meetingName, formatRecordingDuration(durationMs))
}

func (s *Server) recordingMeetingName(ctx context.Context, roomID, chatID string, user userPublic) string {
	if strings.HasPrefix(roomID, "guest-meeting:") && s.guestDB != nil {
		meetingID := strings.TrimPrefix(roomID, "guest-meeting:")
		var title string
		if err := s.guestDB.QueryRowContext(ctx, `SELECT title FROM guest_meetings WHERE id = $1`, meetingID).Scan(&title); err == nil && strings.TrimSpace(title) != "" {
			return title
		}
	}

	if s.chatQueries != nil {
		if chat, err := s.chatQueries.GetForMember(ctx, chatID, user.ID); err == nil && chat.Title != nil && strings.TrimSpace(*chat.Title) != "" {
			return *chat.Title
		}
	}

	return "Meeting"
}

func (s *Server) resolveCallChatAndAuth(ctx context.Context, roomID string, user userPublic) (chatID string, isHostOrAdmin bool, isParticipant bool, err error) {
	if strings.HasPrefix(roomID, "guest-meeting:") {
		meetingID := strings.TrimPrefix(roomID, "guest-meeting:")
		var m guestMeeting
		qErr := s.guestDB.QueryRowContext(ctx, `SELECT id,chat_id,creator_id,title,admission_mode,expires_at,scheduled_at,revoked_at,ended_at FROM guest_meetings WHERE id=$1`, meetingID).Scan(&m.ID, &m.ChatID, &m.CreatorID, &m.Title, &m.AdmissionMode, &m.ExpiresAt, &m.ScheduledAt, &m.RevokedAt, &m.EndedAt)
		if qErr != nil || m.RevokedAt != nil || m.EndedAt != nil || time.Now().After(m.ExpiresAt) {
			return "", false, false, errors.New("meeting not found or unavailable")
		}
		isHost := isAdmin(user.Role) || m.CreatorID == user.ID
		isPart := isHost
		if !isPart && s.chatQueries != nil {
			if _, chErr := s.chatQueries.GetForMember(ctx, m.ChatID, user.ID); chErr == nil {
				isPart = true
			}
		}
		return m.ChatID, isHost, isPart, nil
	}

	session, ok := s.getCallSessionByRoom(roomID)
	if !ok {
		return "", false, false, errors.New("call not found")
	}
	isHost := isAdmin(user.Role) || session.CallerUserID == user.ID
	isPart := isCallParticipant(session, user.ID)
	return session.ChatID, isHost, isPart, nil
}

func (s *Server) emitCallEventToChat(ctx context.Context, chatID, event string, payload any) {
	if s.guestDB == nil {
		return
	}
	rows, err := s.guestDB.QueryContext(ctx, `SELECT user_id FROM chat_members WHERE chat_id = $1`, chatID)
	if err != nil {
		return
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err == nil && uid != "" {
			s.emitCallToUser(uid, event, payload)
		}
	}
}

func (s *Server) handleStartRecording(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}

	chatID, _, isPart, err := s.resolveCallChatAndAuth(r.Context(), roomID, user)
	if err != nil {
		s.json(w, http.StatusNotFound, map[string]string{"message": err.Error()})
		return
	}
	if !isPart {
		s.json(w, http.StatusForbidden, map[string]string{"message": "You are not a participant in this call"})
		return
	}

	now := time.Now().UTC()
	recID := uuid.NewString()

	_, err = s.guestDB.ExecContext(r.Context(), `
		INSERT INTO call_recordings (id, call_id, chat_id, initiated_by, status, started_at)
		VALUES ($1, $2, $3, $4, 'recording', $5)
	`, recID, roomID, chatID, user.ID, now)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			s.json(w, http.StatusConflict, map[string]string{"message": "A recording is already active for this call"})
			return
		}
		s.logger.Warnf("recording", "start recording insert failed room=%s error=%v", roomID, err)
		s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not start recording"})
		return
	}

	broadcastPayload := map[string]any{
		"roomId":          roomID,
		"chatId":          chatID,
		"recordingId":     recID,
		"status":          "recording",
		"initiatedBy":     user.ID,
		"initiatedByName": user.DisplayName,
		"startedAt":       now.Format(time.RFC3339Nano),
	}

	if session, ok := s.getCallSessionByRoom(roomID); ok {
		s.emitCallToActiveParticipants(session, "call.recording.started", broadcastPayload)
	}
	s.emitCallEventToChat(r.Context(), chatID, "call.recording.started", broadcastPayload)

	s.json(w, http.StatusCreated, map[string]any{
		"id":          recID,
		"callId":      roomID,
		"chatId":      chatID,
		"status":      "recording",
		"initiatedBy": user.ID,
		"startedAt":   now,
	})
}

func (s *Server) handleStopRecording(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}

	chatID, _, isPart, err := s.resolveCallChatAndAuth(r.Context(), roomID, user)
	if err != nil {
		s.json(w, http.StatusNotFound, map[string]string{"message": err.Error()})
		return
	}
	if !isPart {
		s.json(w, http.StatusForbidden, map[string]string{"message": "You are not a participant in this call"})
		return
	}

	now := time.Now().UTC()
	var recID string
	var startedAt time.Time
	err = s.guestDB.QueryRowContext(r.Context(), `
		UPDATE call_recordings
		SET status = 'stopping', stopped_at = $1, updated_at = $1
		WHERE call_id = $2 AND status = 'recording'
		RETURNING id, started_at
	`, now, roomID).Scan(&recID, &startedAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.json(w, http.StatusConflict, map[string]string{"message": "No active recording found for this call"})
			return
		}
		s.logger.Warnf("recording", "stop recording update failed room=%s error=%v", roomID, err)
		s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not stop recording"})
		return
	}

	broadcastPayload := map[string]any{
		"roomId":      roomID,
		"chatId":      chatID,
		"recordingId": recID,
		"status":      "stopping",
		"stoppedAt":   now.Format(time.RFC3339Nano),
	}

	if session, ok := s.getCallSessionByRoom(roomID); ok {
		s.emitCallToActiveParticipants(session, "call.recording.stopping", broadcastPayload)
	}
	s.emitCallEventToChat(r.Context(), chatID, "call.recording.stopping", broadcastPayload)

	s.json(w, http.StatusOK, map[string]any{
		"id":        recID,
		"callId":    roomID,
		"status":    "stopping",
		"stoppedAt": now,
	})
}

func (s *Server) handleGetRecordingStatus(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}

	var rec callRecordingPublic
	err := s.guestDB.QueryRowContext(r.Context(), `
		SELECT id, call_id, chat_id, initiated_by, status, started_at, stopped_at, completed_at, duration_ms, size_bytes, file_id, message_id, call_history_message_id, failure_message
		FROM call_recordings
		WHERE call_id = $1
		ORDER BY started_at DESC
		LIMIT 1
	`, roomID).Scan(&rec.ID, &rec.CallID, &rec.ChatID, &rec.InitiatedBy, &rec.Status, &rec.StartedAt, &rec.StoppedAt, &rec.CompletedAt, &rec.DurationMs, &rec.SizeBytes, &rec.FileID, &rec.MessageID, &rec.CallHistoryMessageID, &rec.FailureMessage)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.json(w, http.StatusOK, map[string]any{"status": "idle"})
			return
		}
		s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not fetch recording status"})
		return
	}

	s.json(w, http.StatusOK, rec)
}

func (s *Server) handleFailRecording(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}
	chatID, _, isPart, err := s.resolveCallChatAndAuth(r.Context(), roomID, user)
	if err != nil {
		s.json(w, http.StatusNotFound, map[string]string{"message": err.Error()})
		return
	}
	if !isPart {
		s.json(w, http.StatusForbidden, map[string]string{"message": "You are not a participant in this call"})
		return
	}
	var input struct {
		RecordingID string `json:"recordingId"`
		Message     string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || strings.TrimSpace(input.RecordingID) == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "recordingId and message are required"})
		return
	}
	message := strings.TrimSpace(input.Message)
	if message == "" {
		message = "Recording failed"
	}
	result, err := s.guestDB.ExecContext(r.Context(), `
		UPDATE call_recordings AS current_recording
		SET status = 'failed', failure_message = CASE WHEN current_recording.status = 'failed' THEN current_recording.failure_message ELSE $1 END,
		stopped_at = COALESCE(current_recording.stopped_at, NOW()), updated_at = CASE WHEN current_recording.status = 'failed' THEN current_recording.updated_at ELSE NOW() END
		WHERE current_recording.id = $2 AND current_recording.call_id = $3
		AND current_recording.status IN ('recording', 'stopping', 'processing', 'failed')
		AND (current_recording.status <> 'failed' OR NOT EXISTS (
			SELECT 1 FROM call_recordings AS newer_recording
			WHERE newer_recording.call_id = current_recording.call_id
			AND (newer_recording.started_at > current_recording.started_at
				OR (newer_recording.started_at = current_recording.started_at AND newer_recording.id > current_recording.id))
		))
	`, message, input.RecordingID, roomID)
	if err != nil {
		s.logger.Warnf("recording", "recording failure update failed room=%s recording=%s error=%v", roomID, input.RecordingID, err)
		s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not mark recording as failed"})
		return
	}
	count, err := result.RowsAffected()
	if err != nil || count == 0 {
		s.json(w, http.StatusNotFound, map[string]string{"message": "Recording not found or already completed"})
		return
	}
	payload := map[string]any{
		"roomId": roomID, "chatId": chatID, "recordingId": input.RecordingID,
		"status": "failed", "message": message,
	}
	if session, ok := s.getCallSessionByRoom(roomID); ok {
		s.emitCallToActiveParticipants(session, "call.recording.failed", payload)
	}
	s.emitCallEventToChat(r.Context(), chatID, "call.recording.failed", payload)
	s.json(w, http.StatusOK, map[string]string{"id": input.RecordingID, "status": "failed", "message": message})
}

func (s *Server) handleUploadRecording(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}

	chatID, _, isPart, err := s.resolveCallChatAndAuth(r.Context(), roomID, user)
	if err != nil {
		s.json(w, http.StatusNotFound, map[string]string{"message": err.Error()})
		return
	}
	if !isPart {
		s.json(w, http.StatusForbidden, map[string]string{"message": "You are not a participant in this call"})
		return
	}
	markRecordingFailed := func(recordingID, message string) {
		if strings.TrimSpace(recordingID) == "" {
			recordingID = r.URL.Query().Get("recordingId")
		}
		if strings.TrimSpace(recordingID) == "" {
			return
		}
		result, updateErr := s.guestDB.ExecContext(r.Context(), `
			UPDATE call_recordings SET status = 'failed', failure_message = $1,
			stopped_at = COALESCE(stopped_at, NOW()), updated_at = NOW()
			WHERE call_id = $2 AND id = $3 AND status IN ('recording', 'stopping', 'processing')
		`, message, roomID, recordingID)
		if updateErr != nil {
			s.logger.Warnf("recording", "could not persist upload failure room=%s error=%v", roomID, updateErr)
			return
		}
		if affected, rowsErr := result.RowsAffected(); rowsErr == nil && affected > 0 {
			payload := map[string]any{"roomId": roomID, "chatId": chatID, "recordingId": recordingID, "status": "failed", "message": message}
			if session, ok := s.getCallSessionByRoom(roomID); ok {
				s.emitCallToActiveParticipants(session, "call.recording.failed", payload)
			}
			s.emitCallEventToChat(r.Context(), chatID, "call.recording.failed", payload)
		}
	}

	// Max 600MB
	r.Body = http.MaxBytesReader(w, r.Body, 600*1024*1024)

	var videoData []byte
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(64 * 1024 * 1024); err != nil {
			markRecordingFailed("", "Invalid recording upload")
			s.json(w, http.StatusBadRequest, map[string]string{"message": "Invalid multipart form: " + err.Error()})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			markRecordingFailed(r.FormValue("recordingId"), "Recording upload is missing its video file")
			s.json(w, http.StatusBadRequest, map[string]string{"message": "Missing file field"})
			return
		}
		defer func() { _ = file.Close() }()
		videoData, err = io.ReadAll(file)
		if err != nil {
			markRecordingFailed(r.FormValue("recordingId"), "Could not read uploaded video")
			s.json(w, http.StatusBadRequest, map[string]string{"message": "Could not read uploaded video"})
			return
		}
	} else {
		var readErr error
		videoData, readErr = io.ReadAll(r.Body)
		if readErr != nil {
			markRecordingFailed(r.FormValue("recordingId"), "Could not read uploaded video")
			s.json(w, http.StatusBadRequest, map[string]string{"message": "Could not read uploaded video: " + readErr.Error()})
			return
		}
	}

	if len(videoData) == 0 {
		markRecordingFailed(r.FormValue("recordingId"), "Uploaded video file is empty")
		s.json(w, http.StatusBadRequest, map[string]string{"message": "Uploaded video file is empty"})
		return
	}

	// Find the recording row in 'recording', 'stopping', or 'processing' state
	var recID string
	var startedAt time.Time
	var stoppedAt sql.NullTime
	var callHistoryMsgID sql.NullString

	recordingID := r.FormValue("recordingId")
	err = s.guestDB.QueryRowContext(r.Context(), `
		SELECT id, started_at, stopped_at, call_history_message_id
		FROM call_recordings
		WHERE call_id = $1 AND status IN ('recording', 'stopping', 'processing')
		AND ($2 = '' OR id = $2)
		ORDER BY started_at DESC
		LIMIT 1
	`, roomID, recordingID).Scan(&recID, &startedAt, &stoppedAt, &callHistoryMsgID)

	if err != nil {
		if recordingID != "" {
			s.json(w, http.StatusNotFound, map[string]string{"message": "Recording not found"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			// Create a fallback recording row if none active
			recID = uuid.NewString()
			startedAt = time.Now().UTC().Add(-time.Minute)
			_, _ = s.guestDB.ExecContext(r.Context(), `
				INSERT INTO call_recordings (id, call_id, chat_id, initiated_by, status, started_at)
				VALUES ($1, $2, $3, $4, 'processing', $5)
			`, recID, roomID, chatID, user.ID, startedAt)
		} else {
			s.logger.Warnf("recording", "recording lookup failed room=%s error=%v", roomID, err)
			s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not find active recording"})
			return
		}
	}

	now := time.Now().UTC()
	var durationMs int64
	if stoppedAt.Valid {
		durationMs = stoppedAt.Time.Sub(startedAt).Milliseconds()
	} else {
		durationMs = now.Sub(startedAt).Milliseconds()
	}
	if durationMs < 1000 {
		durationMs = 1000
	}

	fileID := uuid.NewString()
	checksum := sha256Hex(videoData)
	objectKey := path.Join("family", user.FamilyID, "chats", chatID, time.Now().UTC().Format("2006"), time.Now().UTC().Format("01"), fileID+"-meeting-recording.webm")

	if err := s.storage.Save(objectKey, videoData); err != nil {
		markRecordingFailed(recID, "Could not save video recording to storage")
		s.logger.Warnf("recording", "storage save failed key=%s error=%v", objectKey, err)
		s.json(w, http.StatusBadGateway, map[string]string{"message": "Could not save video recording to storage"})
		return
	}

	var thumbnailObjectKey *string
	if thumb, err := generateVideoThumbnail(r.Context(), videoData); err == nil && len(thumb) > 0 {
		tKey := objectKey + ".thumbnail.jpg"
		if err := s.storage.Save(tKey, thumb); err == nil {
			thumbnailObjectKey = &tKey
		}
	}

	chatIDPtr := &chatID
	origName := fmt.Sprintf("meeting-recording-%s.webm", now.Format("2006-01-02-150405"))
	if err := s.legacyUploads.Record(r.Context(), featurefiles.LegacyUpload{
		FileID:             fileID,
		FamilyID:           user.FamilyID,
		UserID:             user.ID,
		ChatID:             chatIDPtr,
		AccessScope:        "chat",
		StorageProvider:    "local",
		ObjectKey:          objectKey,
		ThumbnailObjectKey: thumbnailObjectKey,
		OriginalName:       origName,
		MIMEType:           "video/webm",
		SizeBytes:          int64(len(videoData)),
		Checksum:           checksum,
		CreatedAt:          now,
	}); err != nil {
		_ = s.storage.Delete(objectKey)
		if thumbnailObjectKey != nil {
			_ = s.storage.Delete(*thumbnailObjectKey)
		}
		markRecordingFailed(recID, "Could not register video file")
		s.logger.Warnf("recording", "legacy upload record failed file=%s error=%v", fileID, err)
		s.json(w, http.StatusInternalServerError, map[string]string{"message": "Could not register video file"})
		return
	}

	// Update recording row
	completion, err := s.guestDB.ExecContext(r.Context(), `
		UPDATE call_recordings
		SET status = 'completed', completed_at = $1, duration_ms = $2, size_bytes = $3, object_key = $4, file_id = $5, updated_at = $1
		WHERE id = $6 AND status IN ('recording', 'stopping', 'processing')
	`, now, durationMs, int64(len(videoData)), objectKey, fileID, recID)
	completedRows := int64(0)
	if err == nil {
		completedRows, err = completion.RowsAffected()
	}
	if err != nil || completedRows == 0 {
		s.logger.Warnf("recording", "recording completion update failed rec_id=%s error=%v", recID, err)
		_ = s.fileDeletions.Delete(r.Context(), featurefiles.Deletion{FileID: fileID, FamilyID: user.FamilyID, ChatID: &chatID})
		markRecordingFailed(recID, "Could not finalize video recording")
		s.json(w, http.StatusConflict, map[string]string{"message": "Recording is no longer available for completion"})
		return
	}

	// Create a playable video artifact message in chat, named after the meeting.
	content := recordingMessageContent(s.recordingMeetingName(r.Context(), roomID, chatID, user), durationMs)
	var replyTo *string
	if callHistoryMsgID.Valid && strings.TrimSpace(callHistoryMsgID.String) != "" {
		val := callHistoryMsgID.String
		replyTo = &val
	}

	msg, msgErr := s.createCallCompletionMessageWithPayloadContext(r.Context(), user, chatID, sendMessageRequest{
		Content:          &content,
		FileIDs:          []string{fileID},
		ReplyToMessageID: replyTo,
	})
	if msgErr == nil {
		_, _ = s.guestDB.ExecContext(r.Context(), `UPDATE call_recordings SET message_id = $1 WHERE id = $2`, msg.ID, recID)
	} else {
		s.logger.Warnf("recording", "post recording message to chat failed chat=%s error=%v", chatID, msgErr)
	}

	broadcastPayload := map[string]any{
		"roomId":      roomID,
		"chatId":      chatID,
		"recordingId": recID,
		"fileId":      fileID,
		"durationMs":  durationMs,
		"status":      "completed",
		"messageId":   msg.ID,
	}

	if session, ok := s.getCallSessionByRoom(roomID); ok {
		s.emitCallToActiveParticipants(session, "call.recording.ready", broadcastPayload)
	}
	s.emitCallEventToChat(r.Context(), chatID, "call.recording.ready", broadcastPayload)

	s.json(w, http.StatusOK, map[string]any{
		"id":         recID,
		"fileId":     fileID,
		"durationMs": durationMs,
		"status":     "completed",
		"messageId":  msg.ID,
	})
}
