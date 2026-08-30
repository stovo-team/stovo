package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"stovo-messenger/backend/internal/adapters/groq"
	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	"stovo-messenger/backend/internal/runtime"
	"stovo-messenger/backend/internal/transcription"
	transporthttp "stovo-messenger/backend/internal/transport/http"
)

type transcriptionSessionPublic = transporthttp.TranscriptionSessionResponse
type transcriptSegmentPublic = transporthttp.TranscriptSegmentResponse
type summaryPublic = transporthttp.TranscriptSummaryResponse
type transcriptPublic = transporthttp.TranscriptResponse

func transcriptionSessionPublicFromFeature(session featuretranscription.SessionView) transcriptionSessionPublic {
	return transporthttp.TranscriptionSessionFromFeature(session)
}
func transcriptPublicFromFeature(transcript featuretranscription.Transcript) transcriptPublic {
	return transporthttp.TranscriptFromFeature(transcript)
}

type uploadChunkRequest = transporthttp.UploadAudioChunkRequest
type uploadChunkResponse = transporthttp.UploadAudioChunkResponse
type completeUploadRequest = transporthttp.CompleteAudioUploadRequest

// transcriptionHTTPHandler supplies only runtime/feature operations to the
// HTTP adapter. URL parameters, decoding and JSON contracts are owned by the
// transport package.
func (s *Server) transcriptionHTTPHandler() transporthttp.TranscriptionHandler {
	return transporthttp.NewTranscriptionHandler(transporthttp.TranscriptionOperations{
		CallByRoom: func(roomID string) (transporthttp.TranscriptionCall, bool) {
			call, ok := s.getCallSessionByRoom(roomID)
			if !ok {
				return transporthttp.TranscriptionCall{}, false
			}
			return transporthttp.TranscriptionCall{ID: call.ID, ChatID: call.ChatID, CallerID: call.CallerUserID}, true
		},
		IsParticipant: func(call transporthttp.TranscriptionCall, userID string) bool {
			session, ok := s.getCallSessionByRoom(call.ID)
			return ok && isCallParticipant(session, userID)
		},
		IsAdministrator: isAdmin,
		Latest: func(ctx context.Context, callID string) (any, error) {
			value, err := s.transcriptionQueries.Latest(ctx, callID)
			return transcriptionSessionPublicFromFeature(value), err
		},
		Transcript: func(ctx context.Context, roomID string) (any, error) {
			value, err := s.transcriptionQueries.Transcript(ctx, roomID)
			return transcriptPublicFromFeature(value), err
		},
		UpdateSegment: s.transcriptionQueries.UpdateCleanedText,
		ArtifactDownload: func(ctx context.Context, roomID, artifactType string) (string, int, error) {
			artifact, err := s.transcriptionQueries.Artifact(ctx, roomID, artifactType)
			if err != nil || artifact.ObjectKey == "" {
				return "", http.StatusNotFound, fmt.Errorf("artifact not found")
			}
			store, err := s.presignedObjectStore()
			if err != nil {
				return "", http.StatusInternalServerError, err
			}
			url, err := store.PresignGetObject(ctx, s.cfg.MinIOCallsBucket, artifact.ObjectKey, 5*time.Minute)
			if err != nil {
				return "", http.StatusInternalServerError, err
			}
			return url, http.StatusOK, nil
		},
		Start: func(ctx context.Context, roomID string, actor transporthttp.TranscriptionActor) (any, int, string) {
			if !s.cfg.AICallTranscriptionEnabled {
				return nil, http.StatusServiceUnavailable, "AI call transcription is not enabled"
			}
			provider := groq.Resolve(&s.cfg, s.logger)
			if provider.APIKey == "" {
				return nil, http.StatusServiceUnavailable, "Transcription service is not configured (GROQ_API_KEY missing)"
			}

			session, ok := s.getCallSessionByRoom(roomID)
			if !ok {
				return nil, http.StatusNotFound, "Call not found"
			}
			if !isCallParticipant(session, actor.ID) {
				return nil, http.StatusForbidden, "You are not a participant in this call"
			}
			if !isAdmin(actor.Role) && session.CallerUserID != actor.ID {
				return nil, http.StatusForbidden, "Only the call host or an administrator can start transcription"
			}

			now := time.Now().UTC()
			sessionID := uuid.NewString()

			if err := s.transcriptionSessions.Start(ctx, featuretranscription.StartSession{
				SessionID: sessionID, ChatID: session.ChatID, CallID: session.ID, InitiatedBy: actor.ID,
				Provider: "groq", ProviderModel: provider.STTModel, StartedAt: now,
			}); err != nil {
				s.logger.Warnf("transcription", "insert session failed session_id=%s call_id=%s error=%v", sessionID, roomID, err)
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					return nil, http.StatusConflict, "A transcription session is already active for this call"
				}
				if errors.As(err, &pgErr) && (pgErr.Code == "42P01" || pgErr.Code == "42703") {
					return nil, http.StatusServiceUnavailable, "AI Notes database migration is missing. Apply the latest backend migrations."
				}
				return nil, http.StatusInternalServerError, "Could not create the AI Notes session. Check the server logs."
			}

			broadcastPayload := map[string]any{
				"roomId":          roomID,
				"chatId":          session.ChatID,
				"sessionId":       sessionID,
				"status":          string(transcription.SessionStatusRecording),
				"initiatedBy":     actor.ID,
				"initiatedByName": actor.DisplayName,
				"startedAt":       now.Format(time.RFC3339Nano),
			}
			s.emitCallToActiveParticipants(session, "call.transcription.recording", broadcastPayload)

			s.logger.Infof("transcription", "session started session_id=%s call_id=%s initiated_by=%s", sessionID, roomID, actor.ID)
			return transcriptionSessionPublic{
				ID:                sessionID,
				CallID:            session.ID,
				InitiatedBy:       actor.ID,
				Status:            transcription.SessionStatusRecording,
				Provider:          "groq",
				ProviderModel:     provider.STTModel,
				StartedAt:         &now,
				CreatedAt:         now,
				DetectedLanguages: []string{},
			}, http.StatusCreated, ""
		},
		Stop: func(ctx context.Context, roomID, sessionID string, actor transporthttp.TranscriptionActor) (any, int, string) {
			session, ok := s.getCallSessionByRoom(roomID)
			if !ok {
				return nil, http.StatusNotFound, "Call not found"
			}
			if !isCallParticipant(session, actor.ID) {
				return nil, http.StatusForbidden, "You are not a participant in this call"
			}

			stoppedSessionID, stopped, err := s.stopTranscriptionSession(ctx, session, sessionID, "manual")
			if err != nil {
				s.logger.Warnf("transcription", "stop session failed session_id=%s error=%v", sessionID, err)
				return nil, http.StatusInternalServerError, "Could not stop transcription"
			}
			if !stopped {
				return nil, http.StatusConflict, "Transcription is not recording for this call"
			}

			s.logger.Infof("transcription", "session stopping session_id=%s call_id=%s user_id=%s", stoppedSessionID, roomID, actor.ID)
			return map[string]any{
				"sessionId": stoppedSessionID,
				"status":    string(transcription.SessionStatusStopping),
			}, http.StatusOK, ""
		},
		RequestUpload: func(ctx context.Context, roomID string, req uploadChunkRequest, actor transporthttp.TranscriptionActor) (any, int, string) {
			if !s.cfg.AICallTranscriptionEnabled {
				return nil, http.StatusServiceUnavailable, "AI call transcription is not enabled"
			}

			session, ok := s.getCallSessionByRoom(roomID)
			if !ok {
				return nil, http.StatusNotFound, "Call not found"
			}
			if !isCallParticipant(session, actor.ID) {
				return nil, http.StatusForbidden, "You are not a participant in this call"
			}

			container := req.Container
			if container != "ogg" && container != "webm" && container != "mp4" {
				container = "webm"
			}
			objectKey := fmt.Sprintf("calls/%s/%s/audio/%s/%06d.%s", session.ChatID, req.SessionID, actor.ID, req.Sequence, container)
			codec := "opus"
			if container == "mp4" {
				codec = "aac"
			}
			chunk, err := s.transcriptionChunks.Reserve(ctx, featuretranscription.AudioChunk{ID: uuid.NewString(), SessionID: req.SessionID, ParticipantID: actor.ID, ObjectKey: objectKey, Sequence: req.Sequence, Container: container, Codec: codec, CallStartMs: req.CallStartMs, CallEndMs: req.CallEndMs, DurationMs: req.DurationMs})
			if err != nil {
				s.logger.Warnf("transcription", "reserve chunk failed session_id=%s error=%v", req.SessionID, err)
				return nil, http.StatusInternalServerError, "Failed to register upload"
			}

			return uploadChunkResponse{
				ChunkID:   chunk.ID,
				UploadURL: fmt.Sprintf("/api/calls/%s/transcription/uploads/%s/data", roomID, chunk.ID),
				ObjectKey: chunk.ObjectKey,
				ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
			}, http.StatusOK, ""
		},
		UploadData: func(ctx context.Context, chunkID string, data []byte, actor transporthttp.TranscriptionActor) (any, int, string) {
			chunk, err := s.transcriptionChunks.Get(ctx, chunkID)
			if err != nil {
				return nil, http.StatusNotFound, "Upload not found"
			}
			if chunk.ParticipantID != actor.ID {
				return nil, http.StatusForbidden, "This upload does not belong to you"
			}
			contentType := "audio/webm"
			if chunk.Container == "ogg" {
				contentType = "audio/ogg"
			} else if chunk.Container == "mp4" {
				contentType = "audio/mp4"
			}
			store, err := s.bucketObjectStore()
			if err != nil {
				s.logger.Warnf("transcription", "storage does not support buckets chunk_id=%s error=%v", chunkID, err)
				return nil, http.StatusBadGateway, "Could not store audio upload"
			}
			if err := store.SaveToBucket(ctx, s.cfg.MinIOCallsBucket, chunk.ObjectKey, data, contentType); err != nil {
				s.logger.Warnf("transcription", "store chunk failed chunk_id=%s error=%v", chunkID, err)
				return nil, http.StatusBadGateway, "Could not store audio upload"
			}
			if err := s.transcriptionChunks.Complete(ctx, chunkID, int64(len(data)), ""); err != nil {
				s.logger.Warnf("transcription", "mark uploaded failed chunk_id=%s error=%v", chunkID, err)
				return nil, http.StatusInternalServerError, "Could not confirm audio upload"
			}
			return map[string]any{"chunkId": chunkID, "uploaded": true}, http.StatusOK, ""
		},
		CompleteUpload: func(ctx context.Context, chunkID string, req completeUploadRequest, actor transporthttp.TranscriptionActor) (any, int, string) {
			chunk, err := s.transcriptionChunks.Get(ctx, chunkID)
			if err != nil {
				return nil, http.StatusNotFound, "Upload not found"
			}
			if chunk.ParticipantID != actor.ID {
				return nil, http.StatusForbidden, "This upload does not belong to you"
			}

			bucket := s.cfg.MinIOCallsBucket
			store, err := s.bucketObjectStore()
			if err != nil {
				s.logger.Warnf("transcription", "storage does not support buckets chunk_id=%s error=%v", chunkID, err)
				return nil, http.StatusBadRequest, "Upload not found in storage; please retry the upload"
			}
			info, err := store.StatObject(ctx, bucket, chunk.ObjectKey)
			if err != nil {
				s.logger.Warnf("transcription", "stat object failed chunk_id=%s key=%s error=%v", chunkID, chunk.ObjectKey, err)
				return nil, http.StatusBadRequest, "Upload not found in storage; please retry the upload"
			}

			checksum := req.Checksum
			if checksum == "" {
				checksum = computeETagChecksum(info.ETag)
			}

			if err := s.transcriptionChunks.Complete(ctx, chunkID, info.Size, checksum); err != nil {
				s.logger.Warnf("transcription", "complete chunk failed chunk_id=%s error=%v", chunkID, err)
			}

			return map[string]any{
				"chunkId":   chunkID,
				"objectKey": chunk.ObjectKey,
				"valid":     true,
			}, http.StatusOK, ""
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle helpers.
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) stopTranscriptionSession(ctx context.Context, call *callSession, requestedSessionID, reason string) (string, bool, error) {
	if s.transcriptionSessions == nil || call == nil {
		return "", false, nil
	}

	sessionID, stopped, err := s.transcriptionSessions.Stop(ctx, featuretranscription.StopSession{CallID: call.ID, RequestedSessionID: requestedSessionID, StoppedAt: time.Now().UTC()})
	if !stopped && err == nil {
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

func (s *Server) stopActiveTranscriptionForEndedCall(call *callSession) {
	if _, stopped, err := s.stopTranscriptionSession(context.Background(), call, "", "call_ended"); err != nil {
		s.logger.Warnf("transcription", "automatic stop failed call_id=%s error=%v", call.ID, err)
	} else if stopped {
		s.logger.Infof("transcription", "automatically stopped session for ended call_id=%s", call.ID)
	}
}

func (s *Server) scheduleTranscriptionProcessing(sessionID, callID, chatID string) {
	runtime.StartTranscriptionProcessing(context.Background(), s.transcriptionChunks, runtime.TranscriptionProcessingJob{
		SessionID: sessionID,
		CallID:    callID,
		ChatID:    chatID,
	}, func(ctx context.Context, job runtime.TranscriptionProcessingJob) {
		s.processTranscription(ctx, job.SessionID, job.CallID, job.ChatID)
	})
}

func computeETagChecksum(etag string) string {
	h := sha256.New()
	h.Write([]byte(etag))
	return hex.EncodeToString(h.Sum(nil))
}

// ─────────────────────────────────────────────────────────────────────────────
// Background processing pipeline
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) processTranscription(ctx context.Context, sessionID, callID, chatID string) {
	provider := groq.Resolve(&s.cfg, s.logger)
	processor := runtime.TranscriptionProcessor{
		Sessions: s.transcriptionSessions, Chunks: s.transcriptionChunks, Segments: s.transcriptionSegments,
		Storage: s.storage, Logger: s.logger,
		Provider: runtime.TranscriptionProviderOptions{APIKey: provider.APIKey, BaseURL: provider.BaseURL, STTModel: provider.STTModel, ChatModel: provider.ChatModel, CostPerAudioHour: s.cfg.GroqSTTCostPerHourUSD},
		Broadcast: func(chatID, callID, sessionID, status, failure string) {
			s.broadcastTranscriptionStatus(chatID, callID, sessionID, status, failure)
		},
		Publish: s.publishAICallNotes,
	}
	processor.Process(ctx, runtime.TranscriptionProcessingJob{SessionID: sessionID, CallID: callID, ChatID: chatID})
}

func (s *Server) linkTranscriptionToCallHistory(callID, callHistoryMessageID string) {
	if s.transcriptionSessions == nil {
		return
	}
	sessionID, linked, err := s.transcriptionSessions.LinkCallHistory(context.Background(), callID, callHistoryMessageID)
	if !linked && err == nil {
		return
	}
	if err != nil {
		s.logger.Warnf("transcription", "link call history failed call_id=%s error=%v", callID, err)
		return
	}
	go s.publishAICallNotes(context.Background(), sessionID)
}

func (s *Server) publishAICallNotes(ctx context.Context, sessionID string) {
	if s.transcriptionSessions == nil {
		return
	}
	claim, claimed, err := s.transcriptionSessions.ClaimAICallNotes(ctx, sessionID)
	if err != nil || !claimed {
		if err != nil {
			s.logger.Warnf("transcription", "claim AI call notes failed session_id=%s error=%v", sessionID, err)
		}
		return
	}

	content := runtime.FormatTranscriptionNotes(claim.Summary)
	if content == "" {
		return
	}
	initiator, err := s.getUserByID(claim.InitiatedBy)
	if err != nil {
		_ = s.transcriptionSessions.ReleaseAICallNotesClaim(ctx, sessionID)
		s.logger.Warnf("transcription", "AI notes initiator lookup failed session_id=%s error=%v", sessionID, err)
		return
	}
	message, err := s.createGeneratedMessageWithPayloadContext(ctx, initiator, claim.ChatID, sendMessageRequest{
		Content:          &content,
		ReplyToMessageID: &claim.CallHistoryMessageID,
	})
	if err != nil {
		_ = s.transcriptionSessions.ReleaseAICallNotesClaim(ctx, sessionID)
		s.logger.Warnf("transcription", "AI notes message creation failed session_id=%s error=%v", sessionID, err)
		return
	}
	if err := s.transcriptionSessions.CompleteAICallNotes(ctx, sessionID, message.ID); err != nil {
		s.logger.Warnf("transcription", "AI notes message link failed session_id=%s error=%v", sessionID, err)
	}
}

func (s *Server) markTranscriptionFailed(ctx context.Context, sessionID, chatID, callID, code, message string) {
	if err := s.transcriptionSessions.Fail(ctx, featuretranscription.Failure{SessionID: sessionID, Code: code, Message: message}); err != nil {
		s.logger.Warnf("transcription", "failure status update failed session_id=%s error=%v", sessionID, err)
	}
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
