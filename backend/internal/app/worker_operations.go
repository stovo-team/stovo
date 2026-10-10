package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	featurecalls "stovo-messenger/backend/internal/features/calls"
	featurefiles "stovo-messenger/backend/internal/features/files"
	workruntime "stovo-messenger/backend/internal/runtime"
)

const (
	jobsStreamName           = "stovo:jobs"
	outboxDispatchBatch      = 32
	outboxLeaseDuration      = 30 * time.Second
	outboxDispatchPeriod     = time.Second
	fileValidationGroup      = "file-validation"
	fileValidationBlock      = 5 * time.Second
	memberIPBanSweepInterval = 5 * time.Second

	pendingEventTTL    = 5 * 60 // 300 seconds
	pendingEventMaxLen = 50
)

type ntfyRetryItem = workruntime.NtfyRetryItem
type ntfyPayload = workruntime.NtfyPayload

type pendingEvent struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
}

// ---- Outbox dispatcher supervision ----

// startOutboxDispatcher bridges the authoritative Postgres outbox to Redis
// Streams. It is deliberately at-least-once: a crash after XADD but before
// marking published causes a retry, which consumers dedupe via consumer_receipts.
func (s *Server) startOutboxDispatcher() {
	s.lifecycle.Go(func(ctx context.Context) {
		workruntime.RunOutboxDispatcher(ctx, outboxDispatchPeriod, outboxLeaseDuration, outboxDispatchBatch, s.outboxStore, s.outboxPublisher, func(err error) { s.logger.Warnf("outbox", "dispatch failed error=%v", err) })
	})
}

// ---- File validation consumer supervision ----

// startFileValidationWorker consumes only its own consumer group. Other
// worker groups retain the same stream entries independently for notification,
// preview, and indexing jobs.
func (s *Server) startFileValidationWorker() {
	consumer := strings.TrimSpace(s.cfg.ServerID)
	if consumer == "" {
		if hostname, err := os.Hostname(); err == nil && hostname != "" {
			consumer = "file-validator-" + hostname
		} else {
			consumer = "file-validator-" + uuid.NewString()
		}
	}
	s.lifecycle.Go(func(ctx context.Context) {
		workruntime.RunFileValidationWorker(ctx, workruntime.FileValidationRunner{
			StreamName:  jobsStreamName,
			GroupName:   fileValidationGroup,
			ConsumerID:  consumer,
			BlockTime:   fileValidationBlock,
			BatchSize:   8,
			JobConsumer: s.jobConsumer,
			ProcessJob:  s.processFileValidationJob,
			Report: func(err error) {
				s.logger.Warnf("file-validation", "file validation worker error=%v", err)
			},
		})
	})
}

// startMemberIPBanSweep recovers active sessions when this backend missed the
// non-durable Redis Pub/Sub revocation event while it was disconnected.
func (s *Server) startMemberIPBanSweep() {
	s.lifecycle.Go(func(ctx context.Context) {
		ticker := time.NewTicker(memberIPBanSweepInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := s.sweepBannedMemberIPSockets(ctx); err != nil {
					s.logger.Warnf("member-ip", "active socket ban sweep failed error=%v", err)
				}
			}
		}
	})
}

func (s *Server) startIntelligenceSourceV2RetentionWorker() {
	if s.sqlDB == nil {
		return
	}
	s.lifecycle.Go(func(ctx context.Context) {
		if _, err := s.cleanupIntelligenceSourceV2Retention(ctx, time.Now().UTC()); err != nil {
			s.logger.Warnf("intelligence-source-v2-retention", "initial retention cleanup failed")
		}
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if _, err := s.cleanupIntelligenceSourceV2Retention(ctx, now.UTC()); err != nil {
					s.logger.Warnf("intelligence-source-v2-retention", "scheduled retention cleanup failed")
				}
			}
		}
	})
}

func (s *Server) processFileValidationJob(ctx context.Context, eventID, payload string) error {
	var job struct {
		UploadID string `json:"uploadId"`
	}
	if err := json.Unmarshal([]byte(payload), &job); err != nil || strings.TrimSpace(job.UploadID) == "" {
		return errors.New("invalid file validation job")
	}
	if eventID != "" {
		alreadyDone, err := s.fileValidation.ReceiptRecorded(ctx, eventID)
		if err != nil {
			return err
		}
		if alreadyDone {
			return nil
		}
	}

	upload, found, err := s.fileValidation.Load(ctx, job.UploadID)
	if !found && err == nil {
		return nil
	}
	if err != nil {
		return err
	}
	if upload.State == "ready" || upload.State == "rejected" || upload.State == "failed" {
		return s.recordFileValidationReceipt(ctx, eventID)
	}
	if upload.State != "validating" {
		return errors.New("file upload is not ready for validation")
	}

	reader, err := s.storage.Open(upload.ObjectKey)
	if err != nil {
		return err
	}
	defer func() { _ = reader.Close() }()
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
	if total != upload.ExpectedBytes || (upload.ExpectedChecksum != nil && !strings.EqualFold(*upload.ExpectedChecksum, checksum)) || !detectedMIMECompatible(upload.ExpectedMIME, detectedMIME) {
		if err := s.rejectDirectUpload(ctx, upload.UploadID, upload.FileID, "content_validation_failed", detectedMIME); err != nil {
			return err
		}
		return s.recordFileValidationReceipt(ctx, eventID)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return s.fileValidation.MarkReady(ctx, featurefiles.ValidationReady{Upload: upload, EventID: eventID, DetectedMIME: detectedMIME, Checksum: checksum, ValidatedAt: now})
}

func detectedMIMECompatible(expected, detected string) bool {
	detectedType, _, detectedErr := mime.ParseMediaType(detected)
	if detectedErr != nil {
		detectedType = detected
	}
	expectedType, _, expectedErr := mime.ParseMediaType(expected)
	if expectedErr != nil {
		expectedType = expected
	}
	if detectedType == "application/octet-stream" {
		return true
	}
	if expectedType == detectedType {
		return true
	}
	if expectedType == "text/plain" || expectedType == "text/markdown" {
		return detectedType == "text/plain"
	}
	if strings.HasPrefix(expectedType, "image/") || strings.HasPrefix(expectedType, "audio/") || strings.HasPrefix(expectedType, "video/") || expectedType == "application/pdf" {
		return false
	}
	// Office providers commonly expose OOXML bytes as ZIP or octet-stream;
	// accepted extensions were already checked at reservation time.
	return detectedType == "application/zip"
}

func (s *Server) rejectDirectUpload(ctx context.Context, uploadID, fileID, failureCode, detectedMIME string) error {
	return s.fileValidation.Reject(ctx, featurefiles.ValidationRejected{UploadID: uploadID, FileID: fileID, FailureCode: failureCode, DetectedMIME: detectedMIME, ValidatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
}

func (s *Server) recordFileValidationReceipt(ctx context.Context, eventID string) error {
	return s.fileValidation.RecordReceipt(ctx, eventID)
}

// ---- Call session Redis TTL helpers ----

func callSessionKey(id string) string { return "call:session:" + id }

func (s *Server) persistCallSession(ctx context.Context, session *callSession, ttl time.Duration) {
	if session == nil {
		return
	}
	s.callSnapshots().Save(ctx, session, session.ID, session.ChatID, ttl)
}

func (s *Server) deleteCallSession(ctx context.Context, id string) {
	s.callSnapshots().Delete(ctx, id)
}

func (s *Server) loadCallSessionFromRedis(ctx context.Context, id string) *callSession {
	session, found := s.callSnapshots().Load(ctx, id)
	if !found {
		return nil
	}
	return session
}

func (s *Server) callSnapshots() workruntime.CallSessionSnapshots[*callSession] {
	return workruntime.CallSessionSnapshots[*callSession]{
		Cache: s.callSessionCache,
		Key:   callSessionKey,
		OnError: func(operation string, err error) {
			s.logger.Warnf("delivery", "call session cache %s error: %v", operation, err)
		},
	}
}

func (s *Server) restoreCallSessions(ctx context.Context) {
	workruntime.RestoreActiveCalls(ctx, s.callPersistence, time.Hour, func(row featurecalls.Session, partRows []featurecalls.Participant) {
		s.calls.Lock()
		defer s.calls.Unlock()
		var sess callSession
		sess.ID = row.ID
		if row.ChatID != "" {
			sess.ChatID = row.ChatID
		} else {
			sess.ChatID = row.ID
		}
		sess.CallerUserID = row.CallerID
		sess.CalleeUserID = row.CalleeID
		sess.CallType = row.CallType
		sess.State = callState(row.State)
		topology := row.Topology
		sess.Topology = callTopology(topology)
		if sess.Topology == "" {
			sess.Topology = callTopologyMesh
		}
		sess.CreatedAt = row.CreatedAt.UTC()
		sess.ExpiresAt = sess.CreatedAt.Add(s.callTimeout)
		sess.Participants = map[string]*callParticipant{
			sess.CallerUserID: {UserID: sess.CallerUserID, Role: "host", State: participantRinging},
			sess.CalleeUserID: {UserID: sess.CalleeUserID, Role: "member", State: participantRinging},
		}
		for _, part := range partRows {
			p := &callParticipant{
				UserID: part.UserID,
				Role:   part.Role,
				State:  callParticipantState(part.State),
			}
			if part.JoinedAt != nil {
				p.JoinedAt = part.JoinedAt.UTC()
			}
			sess.Participants[part.UserID] = p
		}
		ptr := &sess
		s.calls.IndexLocked(ptr)
	}, s.logger)
}

// ---- Pending event queue helpers ----

func pendingEventsKey(userID string) string { return "events:pending:" + userID }

func (s *Server) enqueueEventForUser(ctx context.Context, userID string, event string, payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	item, err := json.Marshal(pendingEvent{Event: event, Payload: raw})
	if err != nil {
		return
	}
	key := pendingEventsKey(userID)
	if s.pendingEvents == nil {
		return
	}
	if err := s.pendingEvents.Enqueue(ctx, key, item, pendingEventMaxLen, time.Duration(pendingEventTTL)*time.Second); err != nil {
		s.logger.Warnf("delivery", "enqueueEventForUser error user_id=%s: %v", userID, err)
	}
}

func (s *Server) drainPendingEvents(ctx context.Context, userID string) []pendingEvent {
	key := pendingEventsKey(userID)
	if s.pendingEvents == nil {
		return nil
	}
	raw, err := s.pendingEvents.Drain(ctx, key)
	if err != nil {
		s.logger.Warnf("delivery", "drainPendingEvents error user_id=%s: %v", userID, err)
		return nil
	}
	events := make([]pendingEvent, 0, len(raw))
	for i := len(raw) - 1; i >= 0; i-- { // reverse: LPUSH makes newest first
		var ev pendingEvent
		if err := json.Unmarshal(raw[i], &ev); err == nil {
			events = append(events, ev)
		}
	}
	return events
}

// ---- ntfy retry worker ----

func (s *Server) startNtfyRetryWorker(ctx context.Context) {
	workruntime.RunNtfyRetryWorker(ctx, s.ntfyRetryCh, workruntime.NtfyRetryWorkerOptions{
		Deliver: func(ctx context.Context, item workruntime.NtfyRetryItem) error {
			return s.publishToNtfy(ctx, item.Payload)
		},
		Succeeded: func(item workruntime.NtfyRetryItem, attempt int) {
			s.logger.Infof("delivery", "ntfy retry succeeded user_id=%s attempt=%d", item.UserID, attempt)
		},
		Exhausted: func(item workruntime.NtfyRetryItem, attempt int) {
			s.logger.Warnf("delivery", "ntfy retry exhausted user_id=%s after %d attempts", item.UserID, attempt)
		},
	})
}
