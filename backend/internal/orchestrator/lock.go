package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
	"time"
)

const (
	// AdvisoryLockID is the 64-bit integer lock key used to serialize orchestrator operations.
	AdvisoryLockID int64 = 72026102901
)

var (
	ErrLockAcquisitionFailed = errors.New("failed to acquire master deployment advisory lock")
	ErrFencingTokenMismatch  = errors.New("operation rejected: active fencing token mismatch")
)

// MasterLock manages single-writer serialization with PostgreSQL advisory locking and monotonic fencing tokens.
type MasterLock struct {
	db           *sql.DB
	fencingToken atomic.Int64
}

// NewMasterLock creates a MasterLock instance.
func NewMasterLock(db *sql.DB) *MasterLock {
	return &MasterLock{
		db: db,
	}
}

// Acquire attempts to acquire PostgreSQL session advisory lock with a bounded wait timeout.
// Upon success, it advances the monotonic fencing token.
func (m *MasterLock) Acquire(ctx context.Context, timeout time.Duration) (int64, func(), error) {
	if m.db == nil {
		token := m.fencingToken.Add(1)
		return token, func() {}, nil
	}

	conn, err := m.db.Conn(ctx)
	if err != nil {
		return 0, nil, fmt.Errorf("acquire db connection for lock: %w", err)
	}

	deadline := time.Now().Add(timeout)
	acquired := false

	for time.Now().Before(deadline) {
		var ok bool
		err := conn.QueryRowContext(ctx, "SELECT pg_try_advisory_lock($1)", AdvisoryLockID).Scan(&ok)
		if err == nil && ok {
			acquired = true
			break
		}
		select {
		case <-ctx.Done():
			_ = conn.Close()
			return 0, nil, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}

	if !acquired {
		_ = conn.Close()
		return 0, nil, ErrLockAcquisitionFailed
	}

	token := m.fencingToken.Add(1)

	release := func() {
		defer conn.Close()
		_, _ = conn.ExecContext(context.Background(), "SELECT pg_advisory_unlock($1)", AdvisoryLockID)
	}

	return token, release, nil
}

// ValidateToken verifies that the supplied token matches the current active fencing token.
func (m *MasterLock) ValidateToken(token int64) bool {
	return m.fencingToken.Load() == token
}

// CurrentToken returns the current fencing token value.
func (m *MasterLock) CurrentToken() int64 {
	return m.fencingToken.Load()
}
