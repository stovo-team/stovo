package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

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
	if strings.TrimSpace(s.cfg.GroqAPIKey) != "" {
		return strings.TrimSpace(s.cfg.GroqAPIKey)
	}
	key := config.GetOrReloadEnv("GROQ_API_KEY")
	if key != "" {
		s.cfg.GroqAPIKey = key
		return key
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
		s.detail(w, http.StatusConflict, "A transcription session may already be active for this call")
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

	ctx := r.Context()
	now := time.Now().UTC()
	if err := s.dbUpdateTranscriptionStatus(ctx, body.SessionID, string(transcription.SessionStatusStopping), &now, nil); err != nil {
		s.logger.Warnf("transcription", "stop session failed session_id=%s error=%v", body.SessionID, err)
	}

	s.emitCallToActiveParticipants(session, "call.transcription.stopping", map[string]any{
		"roomId":    roomID,
		"chatId":    session.ChatID,
		"sessionId": body.SessionID,
		"status":    string(transcription.SessionStatusStopping),
	})

	s.logger.Infof("transcription", "session stopping session_id=%s call_id=%s user_id=%s", body.SessionID, roomID, user.ID)
	s.json(w, http.StatusOK, map[string]any{
		"sessionId": body.SessionID,
		"status":    string(transcription.SessionStatusStopping),
	})

	// Wait briefly for participant uploads to complete, then process.
	go func(sessID, callID, chatID string) {
		time.Sleep(15 * time.Second)
		s.processTranscription(context.Background(), sessID, callID, chatID)
	}(body.SessionID, session.ID, session.ChatID)
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
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_transcription_sessions
			(id, call_id, initiated_by, status, provider, provider_model, started_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'groq', $5, $6, $6, $6)`,
		sessionID, callID, initiatedBy,
		string(transcription.SessionStatusRecording),
		s.cfg.GroqSTTModel,
		now,
	)
	return err
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
		Model:            s.cfg.GroqSTTModel,
		TimeoutSeconds:   120,
		CostPerAudioHour: s.cfg.GroqSTTCostPerHourUSD,
	})

	var allSegments []transcription.TranscriptSegmentForLLM
	var totalAudioMs int64
	detectedLangs := make(map[string]bool)

	// Group chunks by participant.
	participantChunks := make(map[string][]audioChunkRow)
	for _, c := range chunks {
		participantChunks[c.ParticipantID] = append(participantChunks[c.ParticipantID], c)
		totalAudioMs += c.DurationMs
	}

	for participantID, pChunks := range participantChunks {
		for _, chunk := range pChunks {
			audioData, readErr := s.storage.Read(chunk.ObjectKey)
			if readErr != nil {
				s.logger.Warnf("transcription", "read chunk failed chunk_id=%s error=%v", chunk.ID, readErr)
				continue
			}

			contentType := "audio/webm"
			filename := "audio.webm"
			if chunk.Container == "ogg" {
				contentType = "audio/ogg"
				filename = "audio.ogg"
			}

			groqResp, transcribeErr := groqClient.Transcribe(ctx, transcription.TranscribeRequest{
				AudioData:   audioData,
				Filename:    filename,
				ContentType: contentType,
			})
			if transcribeErr != nil {
				s.logger.Warnf("transcription", "groq transcribe failed participant=%s chunk=%d error=%v",
					participantID, chunk.Sequence, transcribeErr)
				continue
			}

			if groqResp.Language != "" {
				detectedLangs[groqResp.Language] = true
			}

			for i, seg := range groqResp.Segments {
				exactText := strings.TrimSpace(seg.Text)
				if exactText == "" {
					continue
				}
				segID := uuid.NewString()
				startMs := chunk.CallStartMs + int64(seg.Start*1000)
				endMs := chunk.CallStartMs + int64(seg.End*1000)
				lang := groqResp.Language
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

				if insertErr := s.dbInsertTranscriptSegment(ctx, segID, callID, sessionID, participantID,
					startMs, endMs, exactText, lang, conf, i); insertErr != nil {
					s.logger.Warnf("transcription", "insert segment failed seg_id=%s error=%v", segID, insertErr)
				}

				allSegments = append(allSegments, transcription.TranscriptSegmentForLLM{
					ID:              segID,
					ParticipantName: participantID,
					StartMs:         startMs,
					EndMs:           endMs,
					Text:            exactText,
					Language:        lang,
				})
			}
		}
	}

	// Update cost and detected languages.
	cost := groqClient.EstimateCost(totalAudioMs)
	langList := make([]string, 0, len(detectedLangs))
	for lang := range detectedLangs {
		langList = append(langList, lang)
	}
	langJSON, _ := json.Marshal(langList)
	_, _ = s.db.ExecContext(ctx,
		`UPDATE call_transcription_sessions SET submitted_audio_ms=$1, estimated_cost_usd=$2, detected_languages=$3, updated_at=now() WHERE id=$4`,
		totalAudioMs, cost, string(langJSON), sessionID,
	)

	// LLM post-processing (optional — skipped if GROQ_CHAT_MODEL is empty).
	chatModel := s.getGroqChatModel()
	if len(allSegments) > 0 && apiKey != "" && chatModel != "" {
		llmClient := transcription.NewLLMClient(transcription.LLMConfig{
			APIKey: apiKey,
			Model:  chatModel,
		})
		ppResult, ppErr := llmClient.PostProcess(ctx, allSegments)
		if ppErr == nil && ppResult != nil {
			summaryJSON, _ := json.Marshal(ppResult)
			_, _ = s.db.ExecContext(ctx,
				`UPDATE call_transcription_sessions SET summary_json=$1, updated_at=now() WHERE id=$2`,
				string(summaryJSON), sessionID,
			)
		} else if ppErr != nil {
			s.logger.Warnf("transcription", "post-processing failed session_id=%s error=%v", sessionID, ppErr)
		}
	}

	// Mark session as ready.
	completedAt := time.Now().UTC()
	if err := s.dbUpdateTranscriptionStatus(ctx, sessionID, string(transcription.SessionStatusReady), nil, &completedAt); err != nil {
		s.logger.Warnf("transcription", "final status update failed session_id=%s error=%v", sessionID, err)
	}
	s.broadcastTranscriptionStatus(chatID, callID, sessionID, string(transcription.SessionStatusReady))
	s.logger.Infof("transcription", "processing completed session_id=%s call_id=%s segments=%d", sessionID, callID, len(allSegments))
}

func (s *Server) markTranscriptionFailed(ctx context.Context, sessionID, chatID, callID, code, message string) {
	_, _ = s.db.ExecContext(ctx,
		`UPDATE call_transcription_sessions SET status='failed', failure_code=$1, failure_message=$2, updated_at=now() WHERE id=$3`,
		code, message, sessionID,
	)
	s.broadcastTranscriptionStatus(chatID, callID, sessionID, string(transcription.SessionStatusFailed))
}

func (s *Server) broadcastTranscriptionStatus(chatID, callID, sessionID, status string) {
	session, ok := s.resolveCallSession(chatID, callID)
	if !ok {
		return
	}
	s.emitCallToActiveParticipants(session, "call.transcription."+strings.ToLower(status), map[string]any{
		"roomId":    callID,
		"chatId":    chatID,
		"sessionId": sessionID,
		"status":    status,
	})
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
