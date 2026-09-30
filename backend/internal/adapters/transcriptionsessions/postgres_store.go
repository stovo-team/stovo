// Package transcriptionsessions provides the Postgres transaction boundary for
// transcription session lifecycle commands.
package transcriptionsessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Start(ctx context.Context, command featuretranscription.StartSession) error {
	insert := func() error {
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO call_transcription_sessions
				(id, chat_id, call_id, initiated_by, status, provider, provider_model, started_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, 'recording', $5, $6, $7, $7, $7)`,
			command.SessionID, command.ChatID, command.CallID, command.InitiatedBy, command.Provider, command.ProviderModel, command.StartedAt)
		return err
	}
	if err := insert(); err == nil {
		return nil
	} else {
		result, cleanupErr := s.db.ExecContext(ctx, `
			UPDATE call_transcription_sessions
			SET status='failed', failure_code='stale_session',
				failure_message='AI Notes stopped because its recording session became inactive.',
				completed_at=COALESCE(completed_at, now()), updated_at=now()
			WHERE call_id=$1
				AND status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing')
				AND updated_at < now() - interval '45 seconds'`, command.CallID)
		if cleanupErr != nil {
			return err
		}
		if reclaimed, rowsErr := result.RowsAffected(); rowsErr != nil || reclaimed == 0 {
			return err
		}
		return insert()
	}
}

func (s *PostgresStore) Stop(ctx context.Context, command featuretranscription.StopSession) (string, bool, error) {
	var sessionID string
	err := s.db.QueryRowContext(ctx, `
		UPDATE call_transcription_sessions
		SET status='stopping', stopped_at=COALESCE(stopped_at, $1), updated_at=now()
		WHERE call_id=$2 AND ($3 = '' OR id=$3) AND status IN ('starting', 'recording')
		RETURNING id`, command.StoppedAt, command.CallID, command.RequestedSessionID).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return sessionID, true, nil
}

func (s *PostgresStore) UpdateStatus(ctx context.Context, update featuretranscription.StatusUpdate) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET status=$1, stopped_at=COALESCE($2, stopped_at), completed_at=COALESCE($3, completed_at), updated_at=now() WHERE id=$4`, update.Status, update.StoppedAt, update.CompletedAt, update.SessionID)
	return err
}
func (s *PostgresStore) UpdateMetadata(ctx context.Context, update featuretranscription.MetadataUpdate) error {
	languages, err := json.Marshal(update.DetectedLanguages)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET submitted_audio_ms=$1, estimated_cost_usd=$2, detected_languages=$3, updated_at=now() WHERE id=$4`, update.SubmittedAudioMs, update.EstimatedCostUSD, string(languages), update.SessionID)
	return err
}
func (s *PostgresStore) SaveSummary(ctx context.Context, sessionID string, summary featuretranscription.Summary) error {
	payload, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET summary_json=$1, updated_at=now() WHERE id=$2`, string(payload), sessionID)
	return err
}

func (s *PostgresStore) SaveExactArtifact(ctx context.Context, sessionID, objectKey string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET artifact_exact_key=$1, updated_at=now() WHERE id=$2`, objectKey, sessionID)
	return err
}
func (s *PostgresStore) Fail(ctx context.Context, failure featuretranscription.Failure) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET status='failed', failure_code=$1, failure_message=$2, updated_at=now() WHERE id=$3`, failure.Code, failure.Message, failure.SessionID)
	return err
}

func (s *PostgresStore) RecoverInterrupted(ctx context.Context) (int, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE call_transcription_sessions
		SET status='failed', failure_code='server_restarted',
			failure_message='AI Notes was interrupted because the server restarted.',
			completed_at=COALESCE(completed_at, now()), updated_at=now()
		WHERE status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing')`)
	if err != nil {
		return 0, err
	}
	count, err := result.RowsAffected()
	return int(count), err
}

func (s *PostgresStore) LinkCallHistory(ctx context.Context, callID, messageID string) (string, bool, error) {
	var sessionID string
	err := s.db.QueryRowContext(ctx, `
		UPDATE call_transcription_sessions
		SET call_history_message_id=$1, updated_at=now()
		WHERE call_id=$2 AND call_history_message_id IS NULL
		RETURNING id`, messageID, callID).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	return sessionID, err == nil, err
}

func (s *PostgresStore) ClaimAICallNotes(ctx context.Context, sessionID string) (featuretranscription.AICallNotesClaim, bool, error) {
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
	var rawSummary string
	var claim featuretranscription.AICallNotesClaim
	err := s.db.QueryRowContext(ctx, query, sessionID).Scan(&claim.SessionID, &claim.InitiatedBy, &claim.ChatID, &claim.CallHistoryMessageID, &rawSummary)
	if err == sql.ErrNoRows {
		return featuretranscription.AICallNotesClaim{}, false, nil
	}
	if err != nil {
		return featuretranscription.AICallNotesClaim{}, false, err
	}
	if err := json.Unmarshal([]byte(rawSummary), &claim.Summary); err != nil {
		_ = s.ReleaseAICallNotesClaim(ctx, claim.SessionID)
		return featuretranscription.AICallNotesClaim{}, false, err
	}
	return claim, true, nil
}

func (s *PostgresStore) ReleaseAICallNotesClaim(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET notes_publishing=false, updated_at=now() WHERE id=$1`, sessionID)
	return err
}

func (s *PostgresStore) CompleteAICallNotes(ctx context.Context, sessionID, messageID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET notes_message_id=$1, notes_publishing=false, updated_at=now() WHERE id=$2`, messageID, sessionID)
	return err
}

func (s *PostgresStore) Chunk(ctx context.Context, chunkID string) (featuretranscription.AudioChunk, error) {
	return scanChunk(s.db.QueryRowContext(ctx, `
		SELECT id, session_id, participant_id, object_key, sequence_number, container, codec, call_start_ms, call_end_ms, duration_ms
		FROM call_audio_chunks WHERE id=$1`, chunkID))
}

func (s *PostgresStore) ReserveChunk(ctx context.Context, chunk featuretranscription.AudioChunk) (featuretranscription.AudioChunk, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO call_audio_chunks
			(id, session_id, participant_id, sequence_number, object_key, container, codec, call_start_ms, call_end_ms, duration_ms, client_vad_score, upload_status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',now())
		ON CONFLICT (session_id, participant_id, sequence_number) DO UPDATE SET session_id=EXCLUDED.session_id
		RETURNING id, session_id, participant_id, object_key, sequence_number, container, codec, call_start_ms, call_end_ms, duration_ms`,
		chunk.ID, chunk.SessionID, chunk.ParticipantID, chunk.Sequence, chunk.ObjectKey, chunk.Container, chunk.Codec, chunk.CallStartMs, chunk.CallEndMs, chunk.DurationMs, chunk.ClientVADScore)
	reserved, err := scanChunk(row)
	if err != nil {
		return featuretranscription.AudioChunk{}, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE call_transcription_sessions SET updated_at=now() WHERE id=$1`, reserved.SessionID)
	return reserved, nil
}

func (s *PostgresStore) CompleteChunk(ctx context.Context, chunkID string, sizeBytes int64, checksum string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_audio_chunks SET upload_status='uploaded', object_size_bytes=$1, checksum_sha256=$2 WHERE id=$3`, sizeBytes, checksum, chunkID)
	return err
}

func (s *PostgresStore) PendingChunks(ctx context.Context, sessionID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM call_audio_chunks WHERE session_id=$1 AND upload_status='pending'`, sessionID).Scan(&count)
	return count, err
}

func (s *PostgresStore) UploadedChunks(ctx context.Context, sessionID string) ([]featuretranscription.AudioChunk, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, session_id, participant_id, object_key, sequence_number, container, codec, call_start_ms, call_end_ms, duration_ms FROM call_audio_chunks WHERE session_id=$1 AND upload_status='uploaded' ORDER BY participant_id, sequence_number`, sessionID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	chunks := make([]featuretranscription.AudioChunk, 0)
	for rows.Next() {
		chunk, err := scanChunk(rows)
		if err != nil {
			continue
		}
		chunks = append(chunks, chunk)
	}
	return chunks, rows.Err()
}

type chunkScanner interface{ Scan(...any) error }

func scanChunk(row chunkScanner) (featuretranscription.AudioChunk, error) {
	var chunk featuretranscription.AudioChunk
	err := row.Scan(&chunk.ID, &chunk.SessionID, &chunk.ParticipantID, &chunk.ObjectKey, &chunk.Sequence, &chunk.Container, &chunk.Codec, &chunk.CallStartMs, &chunk.CallEndMs, &chunk.DurationMs)
	return chunk, err
}

func (s *PostgresStore) LatestSession(ctx context.Context, callID string) (featuretranscription.SessionView, error) {
	return scanSession(s.db.QueryRowContext(ctx, `
		SELECT id, call_id, initiated_by, status, provider, provider_model, started_at, stopped_at, completed_at,
			submitted_audio_ms, estimated_cost_usd, failure_code, failure_message, created_at
		FROM call_transcription_sessions WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`, callID))
}

func (s *PostgresStore) Transcript(ctx context.Context, callID string) (featuretranscription.Transcript, error) {
	session, err := s.LatestSession(ctx, callID)
	if err != nil {
		return featuretranscription.Transcript{}, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, call_id, session_id, participant_id, start_ms, end_ms, exact_text, cleaned_text, detected_language, confidence
		FROM call_transcript_segments WHERE session_id=$1 ORDER BY start_ms ASC`, session.ID)
	if err != nil {
		return featuretranscription.Transcript{}, err
	}
	defer func() { _ = rows.Close() }()
	segments := make([]featuretranscription.Segment, 0)
	for rows.Next() {
		var segment featuretranscription.Segment
		if err := rows.Scan(&segment.ID, &segment.CallID, &segment.SessionID, &segment.ParticipantID, &segment.StartMs, &segment.EndMs, &segment.ExactText, &segment.CleanedText, &segment.DetectedLanguage, &segment.Confidence); err != nil {
			continue
		}
		segments = append(segments, segment)
	}
	if err := rows.Err(); err != nil {
		return featuretranscription.Transcript{}, err
	}
	var raw []byte
	summary := (*featuretranscription.Summary)(nil)
	if err := s.db.QueryRowContext(ctx, `SELECT summary_json FROM call_transcription_sessions WHERE id=$1`, session.ID).Scan(&raw); err == nil && raw != nil {
		var decoded featuretranscription.Summary
		if json.Unmarshal(raw, &decoded) == nil {
			summary = &decoded
		}
	}
	return featuretranscription.Transcript{Session: session, Segments: segments, Summary: summary}, nil
}

func (s *PostgresStore) Artifact(ctx context.Context, callID, artifactType string) (featuretranscription.Artifact, error) {
	var column, contentType string
	switch artifactType {
	case "exact":
		column, contentType = "artifact_exact_key", "application/json"
	case "cleaned":
		column, contentType = "artifact_cleaned_key", "application/json"
	case "vtt":
		column, contentType = "artifact_vtt_key", "text/vtt"
	case "summary":
		column, contentType = "artifact_summary_key", "application/json"
	default:
		return featuretranscription.Artifact{}, fmt.Errorf("unknown artifact type: %s", artifactType)
	}
	var artifact featuretranscription.Artifact
	err := s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT %s FROM call_transcription_sessions WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`, column), callID).Scan(&artifact.ObjectKey)
	artifact.ContentType = contentType
	return artifact, err
}

func (s *PostgresStore) UpdateCleanedText(ctx context.Context, segmentID, cleanedText string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_transcript_segments SET cleaned_text=$1, updated_at=now() WHERE id=$2`, cleanedText, segmentID)
	return err
}

func (s *PostgresStore) InsertSegment(ctx context.Context, segment featuretranscription.SegmentWrite) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_transcript_segments
			(id, call_id, session_id, participant_id, start_ms, end_ms, exact_text, detected_language, confidence, provider_segment_index, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
		ON CONFLICT DO NOTHING`, segment.ID, segment.CallID, segment.SessionID, segment.ParticipantID, segment.StartMs, segment.EndMs, segment.ExactText, segment.Language, segment.Confidence, segment.ProviderIndex)
	return err
}

type sessionScanner interface{ Scan(...any) error }

func scanSession(row sessionScanner) (featuretranscription.SessionView, error) {
	var session featuretranscription.SessionView
	err := row.Scan(&session.ID, &session.CallID, &session.InitiatedBy, &session.Status, &session.Provider, &session.ProviderModel, &session.StartedAt, &session.StoppedAt, &session.CompletedAt, &session.SubmittedAudioMs, &session.EstimatedCostUSD, &session.FailureCode, &session.FailureMessage, &session.CreatedAt)
	return session, err
}
