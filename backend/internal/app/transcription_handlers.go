package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"family-messenger/backend/internal/config"
	"family-messenger/backend/internal/transcription"
)

// ─────────────────────────────────────────────────────────────────────────────
// Public response types
// ─────────────────────────────────────────────────────────────────────────────

type transcriptionSessionPublic struct {
	ID                string                      `json:"id"`
	CallID            string                      `json:"callId"`
	InitiatedBy       string                      `json:"initiatedBy"`
	Status            transcription.SessionStatus `json:"status"`
	Provider          string                      `json:"provider"`
	ProviderModel     string                      `json:"providerModel"`
	StartedAt         *time.Time                  `json:"startedAt"`
	StoppedAt         *time.Time                  `json:"stoppedAt"`
	CompletedAt       *time.Time                  `json:"completedAt"`
	SubmittedAudioMs  int64                       `json:"submittedAudioMs"`
	EstimatedCostUSD  *float64                    `json:"estimatedCostUsd"`
	DetectedLanguages []string                    `json:"detectedLanguages"`
	FailureCode       *string                     `json:"failureCode"`
	FailureMessage    *string                     `json:"failureMessage"`
	CreatedAt         time.Time                   `json:"createdAt"`
}

type transcriptSegmentPublic struct {
	ID               string   `json:"id"`
	CallID           string   `json:"callId"`
	SessionID        string   `json:"sessionId"`
	ParticipantID    string   `json:"participantId"`
	ParticipantName  string   `json:"participantName"`
	StartMs          int64    `json:"startMs"`
	EndMs            int64    `json:"endMs"`
	ExactText        string   `json:"exactText"`
	CleanedText      *string  `json:"cleanedText"`
	DetectedLanguage *string  `json:"detectedLanguage"`
	Confidence       *float64 `json:"confidence"`
}

type summaryPublic struct {
	Summary       string                       `json:"summary"`
	Decisions     []transcription.DecisionItem `json:"decisions"`
	ActionItems   []transcription.ActionItem   `json:"actionItems"`
	OpenQuestions []transcription.OpenQuestion `json:"openQuestions"`
}

type transcriptPublic struct {
	Session  transcriptionSessionPublic `json:"session"`
	Segments []transcriptSegmentPublic  `json:"segments"`
	Summary  *summaryPublic             `json:"summary"`
}

type uploadChunkRequest struct {
	SessionID     string `json:"sessionId"`
	ParticipantID string `json:"participantId"`
	Sequence      int    `json:"sequence"`
	Container     string `json:"container"` // "webm" | "ogg"
	CallStartMs   int64  `json:"callStartMs"`
	CallEndMs     int64  `json:"callEndMs"`
	DurationMs    int64  `json:"durationMs"`
}

type uploadChunkResponse struct {
	ChunkID   string `json:"chunkId"`
	UploadURL string `json:"uploadUrl"`
	ObjectKey string `json:"objectKey"`
	ExpiresAt string `json:"expiresAt"`
}

type completeUploadRequest struct {
	Checksum  string `json:"checksum"`
	SizeBytes int64  `json:"sizeBytes"`
}

// audioChunkRow is a DB row from call_audio_chunks.
type audioChunkRow struct {
	ID            string
	SessionID     string
	ParticipantID string
	ObjectKey     string
	Sequence      int
	Container     string
	Codec         string
	CallStartMs   int64
	CallEndMs     int64
	DurationMs    int64
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) getGroqAPIKey() string {
	candidates := []string{
		s.cfg.GroqAPIKey,
		config.GetOrReloadEnv("GROQ_API_KEY"),
		config.GetOrReloadEnv("groq_api_key"),
		config.GetOrReloadEnv("GROQ_KEY"),
		config.GetOrReloadEnv("groq_key"),
		config.GetOrReloadEnv("GROQ_API_TOKEN"),
		config.GetOrReloadEnv("groq_api_token"),
		config.GetOrReloadEnv("GROQ_TOKEN"),
	}
	for _, c := range candidates {
		trimmed := strings.TrimSpace(c)
		if trimmed != "" && !config.IsPlaceholderKey(trimmed) {
			s.cfg.GroqAPIKey = trimmed
			return trimmed
		}
	}
	return ""
}

func (s *Server) getGroqChatModel() string {
	if strings.TrimSpace(s.cfg.GroqChatModel) != "" {
		return strings.TrimSpace(s.cfg.GroqChatModel)
	}
	model := config.GetOrReloadEnv("GROQ_CHAT_MODEL")
	if model != "" {
		s.cfg.GroqChatModel = model
		return model
	}
	return ""
}

func (s *Server) getGroqSTTModel() string {
	model := config.GetOrReloadEnv("GROQ_STT_MODEL")
	if model != "" {
		return s.normalizedSTTModel(model)
	}
	if strings.TrimSpace(s.cfg.GroqSTTModel) != "" {
		return s.normalizedSTTModel(s.cfg.GroqSTTModel)
	}
	return "qwen3-asr-flash-2025-09-08"
}

// qwen-plus is a chat model and cannot transcribe audio. Preserve a configured
// ASR model, but recover safely from this common configuration mix-up.
func (s *Server) normalizedSTTModel(model string) string {
	model = strings.TrimSpace(model)
	if !strings.HasPrefix(strings.ToLower(model), "qwen-plus") {
		s.cfg.GroqSTTModel = model
		return model
	}
	fallback := "whisper-large-v3-turbo"
	baseURL := strings.ToLower(s.getGroqBaseURL())
	if strings.Contains(baseURL, "aliyuncs.com") || strings.Contains(baseURL, "dashscope") || strings.Contains(baseURL, "maas") {
		fallback = "qwen3-asr-flash"
	}
	s.cfg.GroqSTTModel = fallback
	s.logger.Warnf("transcription", "GROQ_STT_MODEL=%q is a chat model; using ASR model %q instead", model, fallback)
	return fallback
}

func (s *Server) getGroqBaseURL() string {
	if strings.TrimSpace(s.cfg.GroqBaseURL) != "" {
		return strings.TrimSpace(s.cfg.GroqBaseURL)
	}
	u := config.GetOrReloadEnv("GROQ_BASE_URL")
	if u == "" {
		u = config.GetOrReloadEnv("GROQ_API_BASE")
	}
	if u != "" {
		s.cfg.GroqBaseURL = u
		return u
	}
	return ""
}

// handleStartTranscription starts a new transcription session for an active call.
func (s *Server) handleStartTranscription(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !s.cfg.AICallTranscriptionEnabled {
		s.detail(w, http.StatusServiceUnavailable, "AI call transcription is not enabled")
		return
	}
	if s.getGroqAPIKey() == "" {
		s.detail(w, http.StatusServiceUnavailable, "Transcription service is not configured (GROQ_API_KEY missing)")
		return
	}

	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	session, ok := s.getCallSessionByRoom(roomID)
	if !ok {
		s.detail(w, http.StatusNotFound, "Call not found")
		return
	}
	if !isCallParticipant(session, user.ID) {
		s.detail(w, http.StatusForbidden, "You are not a participant in this call")
		return
	}
	// Only the call host or an admin can start transcription.
	if !isAdmin(user.Role) && session.CallerUserID != user.ID {
		s.detail(w, http.StatusForbidden, "Only the call host or an administrator can start transcription")
		return
	}

	now := time.Now().UTC()
	sessionID := uuid.NewString()

	ctx := r.Context()
	if err := s.dbInsertTranscriptionSession(ctx, sessionID, session.ChatID, session.ID, user.ID, now); err != nil {
		s.logger.Warnf("transcription", "insert session failed session_id=%s call_id=%s error=%v", sessionID, roomID, err)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			s.detail(w, http.StatusConflict, "A transcription session is already active for this call")
			return
		}
		if errors.As(err, &pgErr) && (pgErr.Code == "42P01" || pgErr.Code == "42703") {
			s.detail(w, http.StatusServiceUnavailable, "AI Notes database migration is missing. Apply the latest backend migrations.")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Could not create the AI Notes session. Check the server logs.")
		return
	}

	broadcastPayload := map[string]any{
		"roomId":          roomID,
		"chatId":          session.ChatID,
		"sessionId":       sessionID,
		"status":          string(transcription.SessionStatusRecording),
		"initiatedBy":     user.ID,
		"initiatedByName": user.DisplayName,
		"startedAt":       now.Format(time.RFC3339Nano),
	}
	s.emitCallToActiveParticipants(session, "call.transcription.recording", broadcastPayload)

	s.logger.Infof("transcription", "session started session_id=%s call_id=%s initiated_by=%s", sessionID, roomID, user.ID)
	s.json(w, http.StatusCreated, transcriptionSessionPublic{
		ID:                sessionID,
		CallID:            session.ID,
		InitiatedBy:       user.ID,
		Status:            transcription.SessionStatusRecording,
		Provider:          "groq",
		ProviderModel:     s.cfg.GroqSTTModel,
		StartedAt:         &now,
		CreatedAt:         now,
		DetectedLanguages: []string{},
	})
}

// handleStopTranscription marks an active transcription session as stopping and
// schedules background processing of collected audio.
func (s *Server) handleStopTranscription(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	session, ok := s.getCallSessionByRoom(roomID)
	if !ok {
		s.detail(w, http.StatusNotFound, "Call not found")
		return
	}
	if !isCallParticipant(session, user.ID) {
		s.detail(w, http.StatusForbidden, "You are not a participant in this call")
		return
	}

	var body struct {
		SessionID string `json:"sessionId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.SessionID) == "" {
		s.detail(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	stoppedSessionID, stopped, err := s.stopTranscriptionSession(r.Context(), session, body.SessionID, "manual")
	if err != nil {
		s.logger.Warnf("transcription", "stop session failed session_id=%s error=%v", body.SessionID, err)
		s.detail(w, http.StatusInternalServerError, "Could not stop transcription")
		return
	}
	if !stopped {
		s.detail(w, http.StatusConflict, "Transcription is not recording for this call")
		return
	}

	s.logger.Infof("transcription", "session stopping session_id=%s call_id=%s user_id=%s", stoppedSessionID, roomID, user.ID)
	s.json(w, http.StatusOK, map[string]any{
		"sessionId": stoppedSessionID,
		"status":    string(transcription.SessionStatusStopping),
	})
}

// handleGetTranscriptionStatus returns the latest transcription session for a call.
func (s *Server) handleGetTranscriptionStatus(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	session, ok := s.getCallSessionByRoom(roomID)
	if !ok {
		s.detail(w, http.StatusNotFound, "Call not found")
		return
	}
	if !isCallParticipant(session, user.ID) {
		s.detail(w, http.StatusForbidden, "You are not a participant in this call")
		return
	}

	ctx := r.Context()
	sess, err := s.dbGetActiveTranscriptionSession(ctx, session.ID)
	if err != nil {
		s.json(w, http.StatusOK, map[string]any{"status": "none"})
		return
	}
	s.json(w, http.StatusOK, sess)
}

// handleGetTranscript returns the full transcript (segments + summary) for a call.
func (s *Server) handleGetTranscript(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		s.detail(w, http.StatusBadRequest, "roomId required")
		return
	}

	ctx := r.Context()
	result, err := s.dbGetTranscriptByCallID(ctx, roomID)
	if err != nil || result == nil {
		s.detail(w, http.StatusNotFound, "Transcript not found")
		return
	}
	s.json(w, http.StatusOK, result)
}

// handleRequestUploadURL issues a presigned MinIO URL for uploading an audio chunk.
func (s *Server) handleRequestUploadURL(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !s.cfg.AICallTranscriptionEnabled {
		s.detail(w, http.StatusServiceUnavailable, "AI call transcription is not enabled")
		return
	}

	var req uploadChunkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.detail(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.SessionID) == "" || strings.TrimSpace(req.ParticipantID) == "" {
		s.detail(w, http.StatusBadRequest, "sessionId and participantId are required")
		return
	}
	if req.ParticipantID != user.ID {
		s.detail(w, http.StatusForbidden, "Participant ID does not match authenticated user")
		return
	}

	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	session, ok := s.getCallSessionByRoom(roomID)
	if !ok {
		s.detail(w, http.StatusNotFound, "Call not found")
		return
	}
	if !isCallParticipant(session, user.ID) {
		s.detail(w, http.StatusForbidden, "You are not a participant in this call")
		return
	}

	container := req.Container
	if container != "ogg" && container != "webm" {
		container = "webm"
	}
	objectKey := fmt.Sprintf("calls/%s/%s/audio/%s/%06d.%s",
		session.ChatID, req.SessionID, user.ID, req.Sequence, container)
	chunkID := uuid.NewString()

	ctx := r.Context()
	codec := "opus"
	contentType := "audio/webm"
	if container == "ogg" {
		contentType = "audio/ogg"
	}

	if err := s.dbInsertAudioChunk(ctx, chunkID, req.SessionID, user.ID, req.Sequence,
		objectKey, container, codec, req.CallStartMs, req.CallEndMs, req.DurationMs); err != nil {
		s.logger.Warnf("transcription", "insert chunk failed chunk_id=%s session_id=%s error=%v", chunkID, req.SessionID, err)
		s.detail(w, http.StatusInternalServerError, "Failed to register upload")
		return
	}

	bucket := s.cfg.MinIOCallsBucket
	uploadURL, err := s.storage.PresignPutObject(ctx, bucket, objectKey, 15*time.Minute, contentType)
	if err != nil {
		s.logger.Warnf("transcription", "presign failed chunk_id=%s room_id=%s error=%v", chunkID, roomID, err)
		s.detail(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	s.json(w, http.StatusOK, uploadChunkResponse{
		ChunkID:   chunkID,
		UploadURL: uploadURL,
		ObjectKey: objectKey,
		ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
	})
}

// handleCompleteUpload marks a chunk upload as complete and verifies it exists in MinIO.
func (s *Server) handleCompleteUpload(w http.ResponseWriter, r *http.Request, user userPublic) {
	chunkID := strings.TrimSpace(chi.URLParam(r, "chunkId"))
	if chunkID == "" {
		s.detail(w, http.StatusBadRequest, "chunkId required")
		return
	}

	var req completeUploadRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	ctx := r.Context()
	chunk, err := s.dbGetAudioChunk(ctx, chunkID)
	if err != nil || chunk == nil {
		s.detail(w, http.StatusNotFound, "Upload not found")
		return
	}
	if chunk.ParticipantID != user.ID {
		s.detail(w, http.StatusForbidden, "This upload does not belong to you")
		return
	}

	bucket := s.cfg.MinIOCallsBucket
	info, err := s.storage.StatObject(ctx, bucket, chunk.ObjectKey)
	if err != nil {
		s.logger.Warnf("transcription", "stat object failed chunk_id=%s key=%s error=%v", chunkID, chunk.ObjectKey, err)
		s.detail(w, http.StatusBadRequest, "Upload not found in storage; please retry the upload")
		return
	}

	checksum := req.Checksum
	if checksum == "" {
		checksum = computeETagChecksum(info.ETag)
	}

	if err := s.dbCompleteAudioChunk(ctx, chunkID, info.Size, checksum); err != nil {
		s.logger.Warnf("transcription", "complete chunk failed chunk_id=%s error=%v", chunkID, err)
	}

	s.json(w, http.StatusOK, map[string]any{
		"chunkId":   chunkID,
		"objectKey": chunk.ObjectKey,
		"valid":     true,
	})
}

// handleUpdateTranscriptSegment allows administrators to edit a segment's cleaned text.
func (s *Server) handleUpdateTranscriptSegment(w http.ResponseWriter, r *http.Request, user userPublic) {
	segmentID := strings.TrimSpace(chi.URLParam(r, "segmentId"))
	if segmentID == "" {
		s.detail(w, http.StatusBadRequest, "segmentId required")
		return
	}
	if !isAdmin(user.Role) {
		s.detail(w, http.StatusForbidden, "Only administrators can edit transcript segments")
		return
	}

	var body struct {
		CleanedText string `json:"cleanedText"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.detail(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := r.Context()
	if err := s.dbUpdateSegmentCleanedText(ctx, segmentID, body.CleanedText); err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to update segment")
		return
	}
	s.json(w, http.StatusOK, map[string]any{"segmentId": segmentID, "updated": true})
}

// handleGetTranscriptArtifact returns a short-lived presigned download URL for an artifact.
func (s *Server) handleGetTranscriptArtifact(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	artifactType := strings.TrimSpace(chi.URLParam(r, "artifactType"))
	if roomID == "" || artifactType == "" {
		s.detail(w, http.StatusBadRequest, "roomId and artifactType required")
		return
	}

	ctx := r.Context()
	artifactKey, _, err := s.dbGetArtifactKey(ctx, roomID, artifactType)
	if err != nil || artifactKey == "" {
		s.detail(w, http.StatusNotFound, "Artifact not found")
		return
	}

	downloadURL, err := s.storage.PresignGetObject(ctx, s.cfg.MinIOCallsBucket, artifactKey, 5*time.Minute)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to generate download URL")
		return
	}
	s.json(w, http.StatusOK, map[string]any{"downloadUrl": downloadURL})
}

// ─────────────────────────────────────────────────────────────────────────────
// Database helpers (raw SQL via s.db)
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) dbInsertTranscriptionSession(ctx context.Context, sessionID, chatID, callID, initiatedBy string, now time.Time) error {
	insert := func() error {
		_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_transcription_sessions
			(id, chat_id, call_id, initiated_by, status, provider, provider_model, started_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'groq', $6, $7, $7, $7)`,
			sessionID, chatID, callID, initiatedBy,
			string(transcription.SessionStatusRecording),
			s.cfg.GroqSTTModel,
			now,
		)
		return err
	}
	if err := insert(); err == nil {
		return nil
	} else {
		// A deploy, client crash, or dropped call:end can leave an active DB row
		// behind. Only reclaim it after its recorder heartbeat has been quiet long
		// enough that it cannot be a live browser recording.
		result, cleanupErr := s.db.ExecContext(ctx, `
			UPDATE call_transcription_sessions
			SET status='failed',
				failure_code='stale_session',
				failure_message='AI Notes stopped because its recording session became inactive.',
				completed_at=COALESCE(completed_at, now()),
				updated_at=now()
			WHERE call_id=$1
				AND status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing')
				AND updated_at < now() - interval '45 seconds'`, callID)
		if cleanupErr != nil {
			return err
		}
		if reclaimed, rowsErr := result.RowsAffected(); rowsErr != nil || reclaimed == 0 {
			return err
		}
		return insert()
	}
}

func (s *Server) dbUpdateTranscriptionStatus(ctx context.Context, sessionID, status string, stoppedAt, completedAt *time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE call_transcription_sessions
		SET status=$1, stopped_at=COALESCE($2, stopped_at), completed_at=COALESCE($3, completed_at), updated_at=now()
		WHERE id=$4`,
		status, stoppedAt, completedAt, sessionID,
	)
	return err
}

// recoverInterruptedTranscriptionSessions releases recordings that belonged to
// the previous server process. Browser recorders and background processing do
// not survive a deploy, so retaining these rows would both misrepresent their
// state and violate the one-active-session-per-call constraint on the next
// voice-channel join.
func (s *Server) recoverInterruptedTranscriptionSessions(ctx context.Context) {
	if s.db == nil {
		return
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE call_transcription_sessions
		SET status='failed',
			failure_code='server_restarted',
			failure_message='AI Notes was interrupted because the server restarted.',
			completed_at=COALESCE(completed_at, now()),
			updated_at=now()
		WHERE status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing')`)
	if err != nil {
		s.logger.Warnf("transcription", "recover interrupted sessions failed error=%v", err)
		return
	}
	if count, err := result.RowsAffected(); err == nil && count > 0 {
		s.logger.Infof("transcription", "marked interrupted sessions as failed count=%d", count)
	}
}

// stopTranscriptionSession is the single stop path for both the control in the
// call UI and terminal call lifecycle events. The update is conditional so a
// manual stop and a simultaneous call end schedule processing only once.
func (s *Server) stopTranscriptionSession(ctx context.Context, call *callSession, requestedSessionID, reason string) (string, bool, error) {
	if s.db == nil || call == nil {
		return "", false, nil
	}

	stoppedAt := time.Now().UTC()
	var sessionID string
	err := s.db.QueryRowContext(ctx, `
		UPDATE call_transcription_sessions
		SET status=$1, stopped_at=COALESCE(stopped_at, $2), updated_at=now()
		WHERE call_id=$3
			AND ($4 = '' OR id=$4)
			AND status IN ('starting', 'recording')
		RETURNING id`,
		string(transcription.SessionStatusStopping), stoppedAt, call.ID, requestedSessionID,
	).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}

	s.emitCallToActiveParticipants(call, "call.transcription.stopping", map[string]any{
		"roomId":    call.ID,
		"chatId":    call.ChatID,
		"sessionId": sessionID,
		"status":    string(transcription.SessionStatusStopping),
		"reason":    reason,
	})
	s.scheduleTranscriptionProcessing(sessionID, call.ID, call.ChatID)
	return sessionID, true, nil
}

// stopActiveTranscriptionForEndedCall stops recording before an ended call can
// leave its clients with a live MediaRecorder. Processing continues so the
// notes are still delivered after the call has been recorded in chat history.
func (s *Server) stopActiveTranscriptionForEndedCall(call *callSession) {
	if _, stopped, err := s.stopTranscriptionSession(context.Background(), call, "", "call_ended"); err != nil {
		s.logger.Warnf("transcription", "automatic stop failed call_id=%s error=%v", call.ID, err)
	} else if stopped {
		s.logger.Infof("transcription", "automatically stopped session for ended call_id=%s", call.ID)
	}
}

func (s *Server) scheduleTranscriptionProcessing(sessionID, callID, chatID string) {
	go func() {
		// Give each recorder time to upload its final MediaRecorder chunk.
		time.Sleep(15 * time.Second)
		s.processTranscription(context.Background(), sessionID, callID, chatID)
	}()
}

func (s *Server) dbGetAudioChunk(ctx context.Context, chunkID string) (*audioChunkRow, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, session_id, participant_id, object_key, sequence_number, container, codec, call_start_ms, call_end_ms, duration_ms
		 FROM call_audio_chunks WHERE id=$1`, chunkID)
	chunk := &audioChunkRow{}
	err := row.Scan(&chunk.ID, &chunk.SessionID, &chunk.ParticipantID, &chunk.ObjectKey,
		&chunk.Sequence, &chunk.Container, &chunk.Codec, &chunk.CallStartMs, &chunk.CallEndMs, &chunk.DurationMs)
	if err != nil {
		return nil, err
	}
	return chunk, nil
}

func (s *Server) dbInsertAudioChunk(ctx context.Context, chunkID, sessionID, participantID string,
	sequence int, objectKey, container, codec string, callStartMs, callEndMs, durationMs int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_audio_chunks
			(id, session_id, participant_id, sequence_number, object_key, container, codec,
			 call_start_ms, call_end_ms, duration_ms, upload_status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',now())
		ON CONFLICT (session_id, participant_id, sequence_number) DO NOTHING`,
		chunkID, sessionID, participantID, sequence, objectKey, container, codec,
		callStartMs, callEndMs, durationMs,
	)
	if err == nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET updated_at=now() WHERE id=$1`, sessionID)
	}
	return err
}

func (s *Server) dbCompleteAudioChunk(ctx context.Context, chunkID string, sizeBytes int64, checksum string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE call_audio_chunks SET upload_status='uploaded', object_size_bytes=$1, checksum_sha256=$2 WHERE id=$3`,
		sizeBytes, checksum, chunkID,
	)
	return err
}

func (s *Server) dbGetActiveTranscriptionSession(ctx context.Context, callID string) (*transcriptionSessionPublic, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, call_id, initiated_by, status, provider, provider_model, started_at, stopped_at, completed_at,
			submitted_audio_ms, estimated_cost_usd, failure_code, failure_message, created_at
		FROM call_transcription_sessions
		WHERE call_id=$1
		ORDER BY created_at DESC LIMIT 1`, callID)

	var sess transcriptionSessionPublic
	err := row.Scan(
		&sess.ID, &sess.CallID, &sess.InitiatedBy, &sess.Status, &sess.Provider, &sess.ProviderModel,
		&sess.StartedAt, &sess.StoppedAt, &sess.CompletedAt,
		&sess.SubmittedAudioMs, &sess.EstimatedCostUSD,
		&sess.FailureCode, &sess.FailureMessage, &sess.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if sess.DetectedLanguages == nil {
		sess.DetectedLanguages = []string{}
	}
	return &sess, nil
}

func (s *Server) dbGetTranscriptByCallID(ctx context.Context, callID string) (*transcriptPublic, error) {
	sess, err := s.dbGetActiveTranscriptionSession(ctx, callID)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, call_id, session_id, participant_id, start_ms, end_ms, exact_text, cleaned_text, detected_language, confidence
		FROM call_transcript_segments
		WHERE session_id=$1
		ORDER BY start_ms ASC`, sess.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var segments []transcriptSegmentPublic
	for rows.Next() {
		var seg transcriptSegmentPublic
		if err := rows.Scan(
			&seg.ID, &seg.CallID, &seg.SessionID, &seg.ParticipantID,
			&seg.StartMs, &seg.EndMs, &seg.ExactText, &seg.CleanedText,
			&seg.DetectedLanguage, &seg.Confidence,
		); err != nil {
			continue
		}
		segments = append(segments, seg)
	}
	if segments == nil {
		segments = []transcriptSegmentPublic{}
	}

	var summaryRow *summaryPublic
	summaryData, _ := s.dbGetSessionSummary(ctx, sess.ID)
	if summaryData != nil {
		summaryRow = summaryData
	}

	return &transcriptPublic{
		Session:  *sess,
		Segments: segments,
		Summary:  summaryRow,
	}, nil
}

func (s *Server) dbGetSessionSummary(ctx context.Context, sessionID string) (*summaryPublic, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT summary_json FROM call_transcription_sessions WHERE id=$1`, sessionID)
	var raw []byte
	if err := row.Scan(&raw); err != nil || raw == nil {
		return nil, nil //nolint:nilerr
	}
	var result transcription.PostProcessingResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return &summaryPublic{
		Summary:       result.Summary,
		Decisions:     result.Decisions,
		ActionItems:   result.ActionItems,
		OpenQuestions: result.OpenQuestions,
	}, nil
}

func (s *Server) dbGetArtifactKey(ctx context.Context, callID, artifactType string) (string, string, error) {
	var col, contentType string
	switch artifactType {
	case "exact":
		col, contentType = "artifact_exact_key", "application/json"
	case "cleaned":
		col, contentType = "artifact_cleaned_key", "application/json"
	case "vtt":
		col, contentType = "artifact_vtt_key", "text/vtt"
	case "summary":
		col, contentType = "artifact_summary_key", "application/json"
	default:
		return "", "", fmt.Errorf("unknown artifact type: %s", artifactType)
	}
	var key string
	err := s.db.QueryRowContext(ctx,
		fmt.Sprintf(`SELECT %s FROM call_transcription_sessions WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`, col),
		callID).Scan(&key)
	return key, contentType, err
}

func (s *Server) dbUpdateSegmentCleanedText(ctx context.Context, segmentID, cleanedText string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE call_transcript_segments SET cleaned_text=$1, updated_at=now() WHERE id=$2`,
		cleanedText, segmentID,
	)
	return err
}

func computeETagChecksum(etag string) string {
	h := sha256.New()
	h.Write([]byte(etag))
	return hex.EncodeToString(h.Sum(nil))
}

// ─────────────────────────────────────────────────────────────────────────────
// Background processing pipeline
// ─────────────────────────────────────────────────────────────────────────────

// processTranscription fetches uploaded audio chunks, submits them to Groq Whisper,
// runs LLM post-processing, and stores the results.
func (s *Server) processTranscription(ctx context.Context, sessionID, callID, chatID string) {
	s.logger.Infof("transcription", "processing started session_id=%s call_id=%s", sessionID, callID)

	if err := s.dbUpdateTranscriptionStatus(ctx, sessionID, string(transcription.SessionStatusTranscribing), nil, nil); err != nil {
		s.logger.Warnf("transcription", "status update failed session_id=%s error=%v", sessionID, err)
	}
	s.broadcastTranscriptionStatus(chatID, callID, sessionID, string(transcription.SessionStatusTranscribing))

	chunks, err := s.dbGetSessionChunks(ctx, sessionID)
	if err != nil || len(chunks) == 0 {
		s.logger.Warnf("transcription", "no chunks found session_id=%s error=%v", sessionID, err)
		s.markTranscriptionFailed(ctx, sessionID, chatID, callID, "no_audio", "No audio chunks were uploaded")
		return
	}

	apiKey := s.getGroqAPIKey()
	groqClient := transcription.NewGroqSTTClient(transcription.GroqSTTConfig{
		APIKey:           apiKey,
		BaseURL:          s.getGroqBaseURL(),
		Model:            s.getGroqSTTModel(),
		TimeoutSeconds:   120,
		CostPerAudioHour: s.cfg.GroqSTTCostPerHourUSD,
	})

	// Group chunks by participant and transcribe each group.
	participantChunks := make(map[string][]audioChunkRow)
	var totalAudioMs int64
	for _, c := range chunks {
		participantChunks[c.ParticipantID] = append(participantChunks[c.ParticipantID], c)
		totalAudioMs += c.DurationMs
	}

	var allSegments []transcription.TranscriptSegmentForLLM
	detectedLangs := make(map[string]bool)
	for participantID, pChunks := range participantChunks {
		segs, langs := s.transcribeParticipantChunks(ctx, callID, sessionID, participantID, pChunks, groqClient)
		allSegments = append(allSegments, segs...)
		for l := range langs {
			detectedLangs[l] = true
		}
	}
	if len(allSegments) == 0 {
		s.markTranscriptionFailed(ctx, sessionID, chatID, callID, "transcription_failed", "No speech could be transcribed. Check the AI Notes speech-to-text model and provider configuration.")
		return
	}

	s.updateTranscriptionMetadata(ctx, sessionID, totalAudioMs, detectedLangs, groqClient)
	s.runLLMPostProcessing(ctx, sessionID, allSegments, apiKey)

	completedAt := time.Now().UTC()
	if err := s.dbUpdateTranscriptionStatus(ctx, sessionID, string(transcription.SessionStatusReady), nil, &completedAt); err != nil {
		s.logger.Warnf("transcription", "final status update failed session_id=%s error=%v", sessionID, err)
	}
	s.broadcastTranscriptionStatus(chatID, callID, sessionID, string(transcription.SessionStatusReady))
	s.publishAICallNotes(ctx, sessionID)
	s.logger.Infof("transcription", "processing completed session_id=%s call_id=%s segments=%d", sessionID, callID, len(allSegments))
}

// transcribeParticipantChunks downloads and transcribes all audio chunks for a
// single participant. Returns the recognised segments and the set of detected languages.
func (s *Server) transcribeParticipantChunks(ctx context.Context, callID, sessionID, participantID string, chunks []audioChunkRow, client *transcription.GroqSTTClient) ([]transcription.TranscriptSegmentForLLM, map[string]bool) {
	var segments []transcription.TranscriptSegmentForLLM
	langs := make(map[string]bool)
	for _, chunk := range chunks {
		audioData, err := s.storage.Read(chunk.ObjectKey)
		if err != nil {
			s.logger.Warnf("transcription", "read chunk failed chunk_id=%s error=%v", chunk.ID, err)
			continue
		}
		contentType, filename := "audio/webm", "audio.webm"
		if chunk.Container == "ogg" {
			contentType, filename = "audio/ogg", "audio.ogg"
		}
		resp, err := client.Transcribe(ctx, transcription.TranscribeRequest{
			AudioData:   audioData,
			Filename:    filename,
			ContentType: contentType,
		})
		if err != nil {
			s.logger.Warnf("transcription", "groq transcribe failed participant=%s chunk=%d error=%v", participantID, chunk.Sequence, err)
			continue
		}
		if resp.Language != "" {
			langs[resp.Language] = true
		}
		for i, seg := range resp.Segments {
			exactText := strings.TrimSpace(seg.Text)
			if exactText == "" {
				continue
			}
			segID := uuid.NewString()
			startMs := chunk.CallStartMs + int64(seg.Start*1000)
			endMs := chunk.CallStartMs + int64(seg.End*1000)
			lang := resp.Language
			if seg.Language != "" {
				lang = seg.Language
			}
			// Normalize avg_logprob to a rough 0–1 confidence score.
			conf := 1.0 + seg.AvgLogProb
			if conf < 0 {
				conf = 0
			}
			if conf > 1 {
				conf = 1
			}
			if insertErr := s.dbInsertTranscriptSegment(ctx, segID, callID, sessionID, participantID, startMs, endMs, exactText, lang, conf, i); insertErr != nil {
				s.logger.Warnf("transcription", "insert segment failed seg_id=%s error=%v", segID, insertErr)
			}
			segments = append(segments, transcription.TranscriptSegmentForLLM{
				ID:              segID,
				ParticipantName: participantID,
				StartMs:         startMs,
				EndMs:           endMs,
				Text:            exactText,
				Language:        lang,
			})
		}
	}
	return segments, langs
}

// updateTranscriptionMetadata persists total audio duration, estimated cost,
// and detected languages for a completed transcription session.
func (s *Server) updateTranscriptionMetadata(ctx context.Context, sessionID string, totalAudioMs int64, detectedLangs map[string]bool, client *transcription.GroqSTTClient) {
	cost := client.EstimateCost(totalAudioMs)
	langList := make([]string, 0, len(detectedLangs))
	for lang := range detectedLangs {
		langList = append(langList, lang)
	}
	langJSON, _ := json.Marshal(langList)
	_, _ = s.db.ExecContext(ctx,
		`UPDATE call_transcription_sessions SET submitted_audio_ms=$1, estimated_cost_usd=$2, detected_languages=$3, updated_at=now() WHERE id=$4`,
		totalAudioMs, cost, string(langJSON), sessionID,
	)
}

// runLLMPostProcessing sends transcribed segments to the LLM for cleaning and
// summarisation. It is a no-op when the Groq chat model is not configured.
func (s *Server) runLLMPostProcessing(ctx context.Context, sessionID string, segments []transcription.TranscriptSegmentForLLM, apiKey string) {
	chatModel := s.getGroqChatModel()
	if len(segments) == 0 || apiKey == "" || chatModel == "" {
		return
	}
	llmClient := transcription.NewLLMClient(transcription.LLMConfig{
		APIKey:  apiKey,
		BaseURL: s.getGroqBaseURL(),
		Model:   chatModel,
	})
	ppResult, ppErr := llmClient.PostProcess(ctx, segments)
	if ppErr != nil {
		s.logger.Warnf("transcription", "post-processing failed session_id=%s error=%v", sessionID, ppErr)
		return
	}
	if ppResult != nil {
		summaryJSON, _ := json.Marshal(ppResult)
		_, _ = s.db.ExecContext(ctx,
			`UPDATE call_transcription_sessions SET summary_json=$1, updated_at=now() WHERE id=$2`,
			string(summaryJSON), sessionID,
		)
	}
}

type aiCallNotesClaim struct {
	InitiatedBy          string
	ChatID               string
	CallHistoryMessageID string
	Summary              transcription.PostProcessingResult
}

// linkTranscriptionToCallHistory records the call-history message that will
// own the notes. It is invoked as soon as the call history is durable, whether
// the transcript finished before or after the call itself ended.
func (s *Server) linkTranscriptionToCallHistory(callID, callHistoryMessageID string) {
	if s.db == nil {
		return
	}
	var sessionID string
	err := s.db.QueryRowContext(context.Background(), `
		UPDATE call_transcription_sessions
		SET call_history_message_id=$1, updated_at=now()
		WHERE call_id=$2 AND call_history_message_id IS NULL
		RETURNING id`, callHistoryMessageID, callID).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return
	}
	if err != nil {
		s.logger.Warnf("transcription", "link call history failed call_id=%s error=%v", callID, err)
		return
	}
	// A user can stop notes before ending a call. In that case processing may
	// already be ready, so retry publication when the call history appears.
	go s.publishAICallNotes(context.Background(), sessionID)
}

// publishAICallNotes posts one text message as a reply to the call-history
// message. The durable claim prevents the processing and call-end paths from
// both creating notes for the same transcription session.
func (s *Server) publishAICallNotes(ctx context.Context, sessionID string) {
	if s.db == nil {
		return
	}
	claim, err := s.dbClaimAICallNotes(ctx, sessionID)
	if err != nil || claim == nil {
		if err != nil {
			s.logger.Warnf("transcription", "claim AI call notes failed session_id=%s error=%v", sessionID, err)
		}
		return
	}

	content := formatAICallNotes(claim.Summary)
	if content == "" {
		return
	}
	initiator, err := s.getUserByID(claim.InitiatedBy)
	if err != nil {
		s.releaseAICallNotesClaim(ctx, sessionID)
		s.logger.Warnf("transcription", "AI notes initiator lookup failed session_id=%s error=%v", sessionID, err)
		return
	}
	message, err := s.createGeneratedMessageWithPayloadContext(ctx, initiator, claim.ChatID, sendMessageRequest{
		Content:          &content,
		ReplyToMessageID: &claim.CallHistoryMessageID,
	})
	if err != nil {
		s.releaseAICallNotesClaim(ctx, sessionID)
		s.logger.Warnf("transcription", "AI notes message creation failed session_id=%s error=%v", sessionID, err)
		return
	}
	if _, err := s.db.ExecContext(ctx, `
		UPDATE call_transcription_sessions
		SET notes_message_id=$1, notes_publishing=false, updated_at=now()
		WHERE id=$2`, message.ID, sessionID); err != nil {
		s.logger.Warnf("transcription", "AI notes message link failed session_id=%s error=%v", sessionID, err)
	}
}

func (s *Server) dbClaimAICallNotes(ctx context.Context, sessionID string) (*aiCallNotesClaim, error) {
	query := `
		UPDATE call_transcription_sessions
		SET notes_publishing=true, updated_at=now()
		WHERE id=$1
			AND status='ready'
			AND summary_json IS NOT NULL
			AND call_history_message_id IS NOT NULL
			AND notes_message_id IS NULL
			AND notes_publishing=false
		RETURNING id, initiated_by, chat_id, call_history_message_id, summary_json`

	var claimedSessionID, rawSummary string
	claim := &aiCallNotesClaim{}
	err := s.db.QueryRowContext(ctx, query, sessionID).Scan(&claimedSessionID, &claim.InitiatedBy, &claim.ChatID, &claim.CallHistoryMessageID, &rawSummary)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(rawSummary), &claim.Summary); err != nil {
		s.releaseAICallNotesClaim(ctx, claimedSessionID)
		return nil, err
	}
	return claim, nil
}

func (s *Server) releaseAICallNotesClaim(ctx context.Context, sessionID string) {
	if sessionID == "" || s.db == nil {
		return
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET notes_publishing=false, updated_at=now() WHERE id=$1`, sessionID)
}

func formatAICallNotes(result transcription.PostProcessingResult) string {
	sections := make([]string, 0, 4)
	if summary := strings.TrimSpace(result.Summary); summary != "" {
		sections = append(sections, "AI call notes\n\n"+summary)
	}
	if len(result.Decisions) > 0 {
		items := make([]string, 0, len(result.Decisions))
		for _, decision := range result.Decisions {
			if text := strings.TrimSpace(decision.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Decisions\n"+strings.Join(items, "\n"))
		}
	}
	if len(result.ActionItems) > 0 {
		items := make([]string, 0, len(result.ActionItems))
		for _, action := range result.ActionItems {
			if text := strings.TrimSpace(action.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Action items\n"+strings.Join(items, "\n"))
		}
	}
	if len(result.OpenQuestions) > 0 {
		items := make([]string, 0, len(result.OpenQuestions))
		for _, question := range result.OpenQuestions {
			if text := strings.TrimSpace(question.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Open questions\n"+strings.Join(items, "\n"))
		}
	}
	content := strings.Join(sections, "\n\n")
	if len(content) > 4000 {
		return strings.TrimSpace(content[:3997]) + "..."
	}
	return content
}

func (s *Server) markTranscriptionFailed(ctx context.Context, sessionID, chatID, callID, code, message string) {
	_, _ = s.db.ExecContext(ctx,
		`UPDATE call_transcription_sessions SET status='failed', failure_code=$1, failure_message=$2, updated_at=now() WHERE id=$3`,
		code, message, sessionID,
	)
	s.broadcastTranscriptionStatus(chatID, callID, sessionID, string(transcription.SessionStatusFailed), message)
}

func (s *Server) broadcastTranscriptionStatus(chatID, callID, sessionID, status string, failureMessages ...string) {
	session, ok := s.resolveCallSession(chatID, callID)
	if !ok {
		return
	}
	payload := map[string]any{
		"roomId":    callID,
		"chatId":    chatID,
		"sessionId": sessionID,
		"status":    status,
	}
	if len(failureMessages) > 0 && strings.TrimSpace(failureMessages[0]) != "" {
		payload["failureMessage"] = failureMessages[0]
	}
	s.emitCallToActiveParticipants(session, "call.transcription."+strings.ToLower(status), payload)
}

func (s *Server) dbGetSessionChunks(ctx context.Context, sessionID string) ([]audioChunkRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, session_id, participant_id, object_key, sequence_number, container, codec, call_start_ms, call_end_ms, duration_ms
		FROM call_audio_chunks
		WHERE session_id=$1 AND upload_status='uploaded'
		ORDER BY participant_id, sequence_number`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var chunks []audioChunkRow
	for rows.Next() {
		var c audioChunkRow
		if err := rows.Scan(&c.ID, &c.SessionID, &c.ParticipantID, &c.ObjectKey,
			&c.Sequence, &c.Container, &c.Codec, &c.CallStartMs, &c.CallEndMs, &c.DurationMs); err != nil {
			continue
		}
		chunks = append(chunks, c)
	}
	return chunks, nil
}

func (s *Server) dbInsertTranscriptSegment(ctx context.Context, segID, callID, sessionID, participantID string,
	startMs, endMs int64, exactText, language string, confidence float64, providerIndex int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_transcript_segments
			(id, call_id, session_id, participant_id, start_ms, end_ms, exact_text, detected_language, confidence, provider_segment_index, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
		ON CONFLICT DO NOTHING`,
		segID, callID, sessionID, participantID, startMs, endMs, exactText, language, confidence, providerIndex,
	)
	return err
}
