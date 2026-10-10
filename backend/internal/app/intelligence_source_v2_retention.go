package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

const (
	intelligenceSourceV2ContentRetention   = 30 * 24 * time.Hour
	intelligenceSourceV2TombstoneMargin    = 7 * 24 * time.Hour
	intelligenceSourceV2RestoreFreshness   = 5 * time.Minute
	intelligenceSourceV2InventoryFreshness = 24 * time.Hour
)

type intelligenceSourceV2RetentionResult struct {
	TombstonesPruned int64
	BackupsPruned    int64
}

// IntelligenceSourceV2RestoreTombstone contains metadata-only invalidation
// data a restore coordinator must replay before source routes reopen.
type IntelligenceSourceV2RestoreTombstone struct {
	EventID      string
	ConnectionID string
	ResourceID   string
	RevisionID   string
	ChatID       string
	Sequence     int64
	Reason       string
	CreatedAt    time.Time
}

func (s *Server) requireIntelligenceSourceV2RestoreReady(ctx context.Context) error {
	if s.sqlDB == nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	expectedEpoch := strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch)
	if expectedEpoch == "" {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	var blocked bool
	var restoreEpoch string
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT blocked,restore_epoch FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global'`).Scan(&blocked, &restoreEpoch)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if blocked {
		return httptransport.ErrIntelligenceSourceDisabled
	}
	if restoreEpoch != expectedEpoch {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

// initializeIntelligenceSourceV2RestoreEpoch binds a fresh, empty database to
// deployment state. A restored database with source history cannot take this
// path and stays closed until the restore coordinator verifies replay.
func (s *Server) initializeIntelligenceSourceV2RestoreEpoch(ctx context.Context) error {
	expectedEpoch := strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch)
	if s.sqlDB == nil || expectedEpoch == "" {
		return nil
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var currentEpoch string
	if err := tx.QueryRowContext(ctx, `SELECT restore_epoch FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global' FOR UPDATE`).Scan(&currentEpoch); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if currentEpoch != "uninitialized" {
		return nil
	}
	var hasSourceHistory bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_connections)
		    OR EXISTS(SELECT 1 FROM public.intelligence_source_v2_events)
		    OR EXISTS(SELECT 1 FROM public.intelligence_source_v2_tombstone_ledger)`).Scan(&hasSourceHistory); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if hasSourceHistory {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_restore_gate SET restore_epoch=$1,updated_at=$2 WHERE gate_id='global' AND restore_epoch='uninitialized'`, expectedEpoch, s.intelligenceOIDCNow()); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

func emitIntelligenceSourceV2ScopeTombstone(ctx context.Context, tx *sql.Tx, connectionID, chatID, reason string, purgePayloads bool) error {
	var eventID string
	err := tx.QueryRowContext(ctx, `
		SELECT public.intelligence_source_v2_emit_acl_tombstone($1,$2,$3,$4,$5)`,
		connectionID, chatID, "chat:"+chatID, reason, purgePayloads).Scan(&eventID)
	if err != nil || eventID == "" {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return nil
}

// RegisterIntelligenceSourceV2BackupHorizon records one backup's actual
// creation and last-restorable timestamps from the backup controller.
func (s *Server) RegisterIntelligenceSourceV2BackupHorizon(ctx context.Context, backupID string, backupCreatedAt, restorableUntil time.Time) error {
	if s.sqlDB == nil || backupID == "" || len(backupID) > 256 || backupCreatedAt.IsZero() || restorableUntil.Before(backupCreatedAt) || restorableUntil.After(backupCreatedAt.Add(intelligenceSourceV2ContentRetention)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var inventoryID string
	if err := tx.QueryRowContext(ctx, `SELECT inventory_id FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global' FOR UPDATE`).Scan(&inventoryID); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backup_horizons(backup_id,backup_created_at,restorable_until)
		VALUES($1,$2,$3) ON CONFLICT (backup_id) DO NOTHING`, backupID, backupCreatedAt.UTC(), restorableUntil.UTC())
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	} else if affected == 0 {
		var currentCreated, currentRestorable time.Time
		if err := tx.QueryRowContext(ctx, `SELECT backup_created_at,restorable_until FROM public.intelligence_source_v2_backup_horizons WHERE backup_id=$1`, backupID).Scan(&currentCreated, &currentRestorable); err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		if !currentCreated.Equal(backupCreatedAt.UTC()) || !currentRestorable.Equal(restorableUntil.UTC()) {
			return httptransport.ErrIntelligenceSourceInvalidRequest
		}
	} else {
		// A newly declared backup changes the restorable inventory. Invalidate
		// the previous completeness checkpoint before the backup is created.
		if _, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_backup_inventory_state
			SET complete=false,verified_at=NULL WHERE inventory_id='global'`); err != nil {
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := tx.Commit(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

// MarkIntelligenceSourceV2BackupInventoryVerified records a complete backup
// inventory from the external backup controller. Tombstone pruning remains
// disabled until this checkpoint is current.
func (s *Server) MarkIntelligenceSourceV2BackupInventoryVerified(ctx context.Context, verifiedAt time.Time) error {
	if s.sqlDB == nil || verifiedAt.IsZero() || verifiedAt.After(s.intelligenceOIDCNow().Add(time.Minute)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	result, err := s.sqlDB.ExecContext(ctx, `
		UPDATE public.intelligence_source_v2_backup_inventory_state
		SET complete=true,verified_at=$1 WHERE inventory_id='global'`, verifiedAt.UTC())
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}

func (s *Server) cleanupIntelligenceSourceV2Retention(ctx context.Context, now time.Time) (intelligenceSourceV2RetentionResult, error) {
	if s.sqlDB == nil || now.IsZero() {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var result intelligenceSourceV2RetentionResult
	var restoreBlocked bool
	err = tx.QueryRowContext(ctx, `SELECT blocked FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global' FOR UPDATE`).Scan(&restoreBlocked)
	if err != nil {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	var inventoryCurrent bool
	inventoryNow := s.intelligenceOIDCNow().UTC()
	err = tx.QueryRowContext(ctx, `
		SELECT complete AND verified_at IS NOT NULL AND verified_at >= ($1::timestamptz-interval '24 hours')
		FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global' FOR UPDATE`, inventoryNow).Scan(&inventoryCurrent)
	if err != nil {
		return intelligenceSourceV2RetentionResult{}, fmt.Errorf("%w: read verified backup inventory: %v", httptransport.ErrIntelligenceSourceUnavailable, err)
	}
	if !restoreBlocked && inventoryCurrent {
		tombstones, err := tx.ExecContext(ctx, `
			DELETE FROM public.intelligence_source_v2_tombstone_ledger tombstone
			WHERE tombstone.retain_until<=$1
			  AND NOT EXISTS (
				SELECT 1 FROM public.intelligence_source_v2_backup_horizons backup
				WHERE backup.backup_created_at<=tombstone.created_at
				  AND backup.restorable_until+interval '7 days'>$1
			  )`, now.UTC())
		if err != nil {
			return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		if result.TombstonesPruned, err = tombstones.RowsAffected(); err != nil {
			return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		backups, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_backup_horizons WHERE restorable_until+interval '7 days'<=$1`, now.UTC())
		if err != nil {
			return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
		}
		if result.BackupsPruned, err = backups.RowsAffected(); err != nil {
			return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := tx.Commit(); err != nil {
		return intelligenceSourceV2RetentionResult{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	return result, nil
}

// BeginIntelligenceSourceV2Restore blocks all v2 source routes. Reopening is
// deliberately unavailable until an independent tombstone ledger or verified
// consumer scope reset is integrated; Messenger database state alone can roll
// back with the content backup and cannot prove tombstone freshness.
func (s *Server) BeginIntelligenceSourceV2Restore(ctx context.Context, restoreID string, backupCreatedAt time.Time) ([]IntelligenceSourceV2RestoreTombstone, error) {
	if s.sqlDB == nil || restoreID == "" || len(restoreID) > 256 || backupCreatedAt.IsZero() || strings.TrimSpace(s.cfg.IntelligenceSourceV2RestoreEpoch) == "" {
		return nil, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, "UPDATE public.intelligence_source_v2_restore_gate SET blocked=true,active_restore_id=$1,backup_created_at=$2,ledger_verified_at=NULL,updated_at=$3 WHERE gate_id='global'", restoreID, backupCreatedAt.UTC(), s.intelligenceOIDCNow())
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := tx.Commit(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil, httptransport.ErrIntelligenceSourceUnavailable
}

// CompleteIntelligenceSourceV2Restore cannot reopen routes from a ledger that
// was restored from the same database snapshot as the content it must suppress.
// Keep the global gate closed until an independent proof source is wired in.
func (s *Server) CompleteIntelligenceSourceV2Restore(context.Context, string, map[string]int64, time.Time) error {
	return httptransport.ErrIntelligenceSourceUnavailable
}
