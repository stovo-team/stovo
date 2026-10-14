package app

import (
	"context"
	"database/sql"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

// IntelligenceSourceV2Operations coordinates backup inventory and restore
// verification using the same database state as the source server.
type IntelligenceSourceV2Operations struct {
	db           *sql.DB
	restoreEpoch string
	now          func() time.Time
}

// NewIntelligenceSourceV2Operations constructs a database-backed coordinator
// whose freshness checks use the UTC wall clock.
func NewIntelligenceSourceV2Operations(db *sql.DB, restoreEpoch string) *IntelligenceSourceV2Operations {
	return newIntelligenceSourceV2Operations(db, restoreEpoch, func() time.Time { return time.Now().UTC() })
}

func newIntelligenceSourceV2Operations(db *sql.DB, restoreEpoch string, now func() time.Time) *IntelligenceSourceV2Operations {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &IntelligenceSourceV2Operations{db: db, restoreEpoch: restoreEpoch, now: now}
}

// IntelligenceSourceV2RestoreTombstone contains metadata-only invalidation
// data a restore coordinator must replay before source routes reopen.
type IntelligenceSourceV2RestoreTombstone struct {
	EventID      string    `json:"event_id"`
	ConnectionID string    `json:"connection_id"`
	ResourceID   string    `json:"resource_id"`
	RevisionID   string    `json:"revision_id"`
	ChatID       string    `json:"chat_id"`
	Sequence     int64     `json:"sequence"`
	Reason       string    `json:"reason"`
	CreatedAt    time.Time `json:"created_at"`
}

// RegisterIntelligenceSourceV2BackupHorizon records one backup's actual
// creation and last-restorable timestamps from the backup controller.
func (o *IntelligenceSourceV2Operations) RegisterIntelligenceSourceV2BackupHorizon(ctx context.Context, backupID string, backupCreatedAt, restorableUntil time.Time) error {
	if o.db == nil || backupID == "" || len(backupID) > 256 || backupCreatedAt.IsZero() || restorableUntil.Before(backupCreatedAt) || restorableUntil.After(backupCreatedAt.Add(intelligenceSourceV2ContentRetention)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	tx, err := o.db.BeginTx(ctx, nil)
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
func (o *IntelligenceSourceV2Operations) MarkIntelligenceSourceV2BackupInventoryVerified(ctx context.Context, verifiedAt time.Time) error {
	if o.db == nil || verifiedAt.IsZero() || verifiedAt.After(o.now().Add(time.Minute)) {
		return httptransport.ErrIntelligenceSourceInvalidRequest
	}
	result, err := o.db.ExecContext(ctx, `
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

// BeginIntelligenceSourceV2Restore blocks all v2 source routes before it
// returns any tombstones. The caller must replay every returned event and then
// report per-connection sequence watermarks to complete the restore.
func (o *IntelligenceSourceV2Operations) BeginIntelligenceSourceV2Restore(ctx context.Context, restoreID string, backupCreatedAt time.Time) ([]IntelligenceSourceV2RestoreTombstone, error) {
	if o.db == nil || restoreID == "" || len(restoreID) > 256 || backupCreatedAt.IsZero() || strings.TrimSpace(o.restoreEpoch) == "" {
		return nil, httptransport.ErrIntelligenceSourceInvalidRequest
	}
	backupCreatedAt = backupCreatedAt.UTC()
	now := o.now()
	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `
		UPDATE public.intelligence_source_v2_restore_gate
		SET blocked=true,active_restore_id=$1,backup_created_at=$2,ledger_verified_at=NULL,updated_at=$3
		WHERE gate_id='global'`, restoreID, backupCreatedAt, now)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	var backupRegistered bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_backup_horizons
		WHERE backup_created_at=$1 AND restorable_until>=$2)`, backupCreatedAt, now).Scan(&backupRegistered); err != nil || !backupRegistered {
		if commitErr := tx.Commit(); commitErr != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_restore_requirements WHERE restore_id=$1`, restoreID); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	var ledgerStartedAt time.Time
	if err := tx.QueryRowContext(ctx, `SELECT ledger_started_at FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global'`).Scan(&ledgerStartedAt); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if backupCreatedAt.Before(ledgerStartedAt) || backupCreatedAt.After(now) || now.Sub(backupCreatedAt) > intelligenceSourceV2ContentRetention {
		if err := tx.Commit(); err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_restore_requirements(restore_id,connection_id,required_sequence)
		SELECT $1,connection_id,max(sequence)
		FROM public.intelligence_source_v2_tombstone_ledger
		WHERE created_at>$2
		GROUP BY connection_id`, restoreID, backupCreatedAt); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := tx.Commit(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return o.listIntelligenceSourceV2RestoreTombstones(ctx, restoreID, backupCreatedAt)
}

func (o *IntelligenceSourceV2Operations) listIntelligenceSourceV2RestoreTombstones(ctx context.Context, restoreID string, backupCreatedAt time.Time) ([]IntelligenceSourceV2RestoreTombstone, error) {
	rows, err := o.db.QueryContext(ctx, `
		SELECT event_id,connection_id,resource_id,revision_id,chat_id,sequence,reason,created_at
		FROM public.intelligence_source_v2_tombstone_ledger
		WHERE created_at>$1 AND EXISTS (
			SELECT 1 FROM public.intelligence_source_v2_restore_requirements requirement
			WHERE requirement.restore_id=$2 AND requirement.connection_id=intelligence_source_v2_tombstone_ledger.connection_id)
		ORDER BY connection_id,sequence`, backupCreatedAt.UTC(), restoreID)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = rows.Close() }()
	tombstones := make([]IntelligenceSourceV2RestoreTombstone, 0)
	for rows.Next() {
		var item IntelligenceSourceV2RestoreTombstone
		if err := rows.Scan(&item.EventID, &item.ConnectionID, &item.ResourceID, &item.RevisionID, &item.ChatID, &item.Sequence, &item.Reason, &item.CreatedAt); err != nil {
			return nil, httptransport.ErrIntelligenceSourceUnavailable
		}
		tombstones = append(tombstones, item)
	}
	if err := rows.Err(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceUnavailable
	}
	return tombstones, nil
}

// CompleteIntelligenceSourceV2Restore opens source routes only after the
// consumer replay watermarks cover every current post-backup tombstone.
func (o *IntelligenceSourceV2Operations) CompleteIntelligenceSourceV2Restore(ctx context.Context, restoreID string, appliedThrough map[string]int64, ledgerCheckedAt time.Time) error {
	if o.db == nil || restoreID == "" {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	now := o.now()
	ledgerCheckedAt = ledgerCheckedAt.UTC()
	if ledgerCheckedAt.After(now.Add(time.Minute)) || now.Sub(ledgerCheckedAt) > intelligenceSourceV2RestoreFreshness {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var backupCreatedAt, ledgerStartedAt time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT backup_created_at,ledger_started_at
		FROM public.intelligence_source_v2_restore_gate
		WHERE gate_id='global' AND blocked AND active_restore_id=$1
		FOR UPDATE`, restoreID).Scan(&backupCreatedAt, &ledgerStartedAt)
	if err != nil || strings.TrimSpace(o.restoreEpoch) == "" || backupCreatedAt.Before(ledgerStartedAt) || backupCreatedAt.After(now) || now.Sub(backupCreatedAt) > intelligenceSourceV2ContentRetention {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	var backupRegistered bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_backup_horizons
		WHERE backup_created_at=$1 AND restorable_until>=$2)`, backupCreatedAt, now).Scan(&backupRegistered); err != nil || !backupRegistered {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	// Source writers allocate sequence numbers through these same connection
	// rows. Lock in the same order before checking the final tombstone high water.
	rows, err := tx.QueryContext(ctx, `SELECT id FROM public.intelligence_source_v2_connections ORDER BY id FOR UPDATE`)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	for rows.Next() {
		var connectionID string
		if err := rows.Scan(&connectionID); err != nil {
			_ = rows.Close()
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := rows.Close(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	rows, err = tx.QueryContext(ctx, `
		SELECT connection_id,max(sequence)
		FROM public.intelligence_source_v2_tombstone_ledger
		WHERE created_at>$1
		GROUP BY connection_id`, backupCreatedAt)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	for rows.Next() {
		var connectionID string
		var requiredSequence int64
		if err := rows.Scan(&connectionID, &requiredSequence); err != nil {
			_ = rows.Close()
			return httptransport.ErrIntelligenceSourceUnavailable
		}
		if appliedThrough[connectionID] < requiredSequence {
			_ = rows.Close()
			return httptransport.ErrIntelligenceSourceUnavailable
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := rows.Close(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE public.intelligence_source_v2_restore_gate
		SET blocked=false,restore_epoch=$2,active_restore_id=NULL,backup_created_at=NULL,ledger_verified_at=$3,updated_at=$4
		WHERE gate_id='global' AND blocked AND active_restore_id=$1`, restoreID, strings.TrimSpace(o.restoreEpoch), ledgerCheckedAt, now)
	if err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.ErrIntelligenceSourceUnavailable
	}
	return nil
}
