package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	jobsStreamName       = "stovo:jobs"
	outboxDispatchBatch  = 32
	outboxLeaseDuration  = 30 * time.Second
	outboxDispatchPeriod = time.Second
	fileValidationGroup  = "file-validation"
	fileValidationBlock  = 5 * time.Second
)

type leasedOutboxEvent struct {
	ID            string
	Topic         string
	SchemaVersion int
	PartitionKey  string
	Payload       []byte
}

// startOutboxDispatcher bridges the authoritative Postgres outbox to Redis
// Streams. It is deliberately at-least-once: a crash after XADD but before
// marking published causes a retry, which consumers dedupe via consumer_receipts.
func (s *Server) startOutboxDispatcher() {
	s.realtimeWG.Add(1)
	go func() {
		defer s.realtimeWG.Done()
		ticker := time.NewTicker(outboxDispatchPeriod)
		defer ticker.Stop()
		for {
			if err := s.dispatchOutboxBatch(s.realtimeCtx); err != nil && s.realtimeCtx.Err() == nil {
				s.logger.Warnf("outbox", "dispatch failed error=%v", err)
			}
			select {
			case <-s.realtimeCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (s *Server) dispatchOutboxBatch(ctx context.Context) error {
	events, err := s.leaseOutboxEvents(ctx)
	if err != nil || len(events) == 0 {
		return err
	}
	for _, event := range events {
		if err := s.jobsRedis.XAdd(ctx, &redis.XAddArgs{Stream: jobsStreamName, Values: map[string]any{
			"event_id": event.ID, "topic": event.Topic, "schema_version": event.SchemaVersion,
			"partition_key": event.PartitionKey, "payload": string(event.Payload),
		}}).Err(); err != nil {
			return err
		}
		if _, err := s.db.ExecContext(ctx, `
			UPDATE outbox_events
			SET published_at = now(), lease_owner = NULL, lease_expires_at = NULL, last_error = NULL
			WHERE id = $1`, event.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) leaseOutboxEvents(ctx context.Context) ([]leasedOutboxEvent, error) {
	owner := uuid.NewString()
	rows, err := s.db.QueryContext(ctx, `
		WITH candidates AS (
			SELECT id FROM outbox_events
			WHERE published_at IS NULL AND available_at <= now()
			  AND (lease_expires_at IS NULL OR lease_expires_at < now())
			ORDER BY created_at ASC
			LIMIT $1 FOR UPDATE SKIP LOCKED
		)
		UPDATE outbox_events e
		SET lease_owner = $2, lease_expires_at = now() + $3::interval, attempts = attempts + 1
		FROM candidates
		WHERE e.id = candidates.id
		RETURNING e.id, e.topic, e.schema_version, e.partition_key, e.payload`,
		outboxDispatchBatch, owner, outboxLeaseDuration.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]leasedOutboxEvent, 0, outboxDispatchBatch)
	for rows.Next() {
		var event leasedOutboxEvent
		if err := rows.Scan(&event.ID, &event.Topic, &event.SchemaVersion, &event.PartitionKey, &event.Payload); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// startFileValidationWorker consumes only its own consumer group. Other
// worker groups retain the same stream entries independently for notification,
// preview, and indexing jobs.
func (s *Server) startFileValidationWorker() {
	consumer := strings.TrimSpace(s.cfg.ServerID)
	if consumer == "" {
		// A consumer name is an ownership lease in Redis Streams. Docker keeps a
		// container hostname across a normal restart, while blue/green services
		// receive distinct names. A random suffix is only the final fallback.
		if hostname, err := os.Hostname(); err == nil && hostname != "" {
			consumer = "file-validator-" + hostname
		} else {
			consumer = "file-validator-" + uuid.NewString()
		}
	}
	s.realtimeWG.Add(1)
	go func() {
		defer s.realtimeWG.Done()
		if err := s.jobsRedis.XGroupCreateMkStream(s.realtimeCtx, jobsStreamName, fileValidationGroup, "0").Err(); err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
			s.logger.Warnf("file-validation", "could not create consumer group error=%v", err)
			return
		}
		for {
			if s.realtimeCtx.Err() != nil {
				return
			}
			if err := s.consumeFileValidationBatch(s.realtimeCtx, consumer, "0"); err != nil && s.realtimeCtx.Err() == nil {
				s.logger.Warnf("file-validation", "retry pending jobs failed error=%v", err)
			}
			if err := s.consumeFileValidationBatch(s.realtimeCtx, consumer, ">"); err != nil && s.realtimeCtx.Err() == nil && !errors.Is(err, redis.Nil) {
				s.logger.Warnf("file-validation", "consume failed error=%v", err)
			}
		}
	}()
}

func (s *Server) consumeFileValidationBatch(ctx context.Context, consumer, cursor string) error {
	streams, err := s.jobsRedis.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    fileValidationGroup,
		Consumer: consumer,
		Streams:  []string{jobsStreamName, cursor},
		Count:    8,
		Block:    fileValidationBlock,
	}).Result()
	if err != nil {
		return err
	}
	for _, stream := range streams {
		for _, message := range stream.Messages {
			topic, _ := message.Values["topic"].(string)
			if topic != "file.validate" {
				if err := s.jobsRedis.XAck(ctx, jobsStreamName, fileValidationGroup, message.ID).Err(); err != nil {
					return err
				}
				continue
			}
			payload, _ := message.Values["payload"].(string)
			if err := s.processFileValidationJob(ctx, message.Values["event_id"], payload); err != nil {
				return err
			}
			if err := s.jobsRedis.XAck(ctx, jobsStreamName, fileValidationGroup, message.ID).Err(); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Server) processFileValidationJob(ctx context.Context, eventValue any, payload string) error {
	eventID, _ := eventValue.(string)
	var job struct {
		UploadID string `json:"uploadId"`
	}
	if err := json.Unmarshal([]byte(payload), &job); err != nil || strings.TrimSpace(job.UploadID) == "" {
		return errors.New("invalid file validation job")
	}
	if eventID != "" {
		var alreadyDone bool
		err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM consumer_receipts WHERE consumer_name = $1 AND event_id = $2)`, fileValidationGroup, eventID).Scan(&alreadyDone)
		if err != nil {
			return err
		}
		if alreadyDone {
			return nil
		}
	}

	var fileID, objectKey, expectedMIME, state, familyID string
	var chatID sql.NullString
	var expectedBytes int64
	var expectedChecksum sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT fu.file_id, fu.object_key, fu.expected_mime_type, fu.expected_size_bytes,
		       fu.expected_checksum, fu.state, f.family_id, f.chat_id
		FROM file_uploads fu JOIN files f ON f.id=fu.file_id WHERE fu.id = $1`, job.UploadID).Scan(
		&fileID, &objectKey, &expectedMIME, &expectedBytes, &expectedChecksum, &state, &familyID, &chatID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if state == "ready" || state == "rejected" || state == "failed" {
		return s.recordFileValidationReceipt(ctx, eventID)
	}
	if state != "validating" {
		return errors.New("file upload is not ready for validation")
	}

	reader, err := s.storage.Open(objectKey)
	if err != nil {
		return err
	}
	defer reader.Close()
	hasher := sha256.New()
	header := make([]byte, 0, 512)
	buffer := make([]byte, 32*1024)
	var total int64
	for {
		count, readErr := reader.Read(buffer)
		if count > 0 {
			total += int64(count)
			_, _ = hasher.Write(buffer[:count])
			if len(header) < cap(header) {
				remaining := cap(header) - len(header)
				if remaining > count {
					remaining = count
				}
				header = append(header, buffer[:remaining]...)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	checksum := hex.EncodeToString(hasher.Sum(nil))
	detectedMIME := http.DetectContentType(header)
	if total != expectedBytes || (expectedChecksum.Valid && !strings.EqualFold(expectedChecksum.String, checksum)) || !detectedMIMECompatible(expectedMIME, detectedMIME) {
		if err := s.rejectDirectUpload(ctx, job.UploadID, fileID, "content_validation_failed", detectedMIME); err != nil {
			return err
		}
		return s.recordFileValidationReceipt(ctx, eventID)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		UPDATE file_uploads SET state = 'ready', updated_at = $2, failure_code = NULL WHERE id = $1`, job.UploadID, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE files SET lifecycle_state = 'ready', object_revision = $2, detected_mime_type = $3,
		       checksum = $4, validated_at = $5, validation_failure_code = NULL
		WHERE id = $1`, fileID, uuid.NewString(), detectedMIME, checksum, now); err != nil {
		return err
	}
	var syncChatID *string
	if chatID.Valid {
		syncChatID = &chatID.String
	}
	if err := writeFileSyncEventTx(ctx, tx, familyID, syncChatID, "file.changed", fileID); err != nil {
		return err
	}
	if eventID != "" {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO consumer_receipts (consumer_name, event_id, result)
			VALUES ($1, $2, '{"status":"processed"}'::jsonb)
			ON CONFLICT (consumer_name, event_id) DO NOTHING`, fileValidationGroup, eventID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func detectedMIMECompatible(expected, detected string) bool {
	if detected == "application/octet-stream" {
		return true
	}
	if expected == detected {
		return true
	}
	if strings.HasPrefix(expected, "image/") || strings.HasPrefix(expected, "audio/") || strings.HasPrefix(expected, "video/") || expected == "application/pdf" || expected == "text/plain" {
		return false
	}
	// Office providers commonly expose OOXML bytes as ZIP or octet-stream;
	// accepted extensions were already checked at reservation time.
	return detected == "application/zip"
}

func (s *Server) rejectDirectUpload(ctx context.Context, uploadID, fileID, failureCode, detectedMIME string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := s.db.ExecContext(ctx, `UPDATE file_uploads SET state = 'rejected', failure_code = $2, updated_at = $3 WHERE id = $1`, uploadID, failureCode, now); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE files SET lifecycle_state = 'rejected', validation_failure_code = $2, detected_mime_type = $3, validated_at = $4
		WHERE id = $1`, fileID, failureCode, detectedMIME, now)
	return err
}

func (s *Server) recordFileValidationReceipt(ctx context.Context, eventID string) error {
	if eventID == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO consumer_receipts (consumer_name, event_id, result)
		VALUES ($1, $2, '{"status":"processed"}'::jsonb)
		ON CONFLICT (consumer_name, event_id) DO NOTHING`, fileValidationGroup, eventID)
	return err
}
