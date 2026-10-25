package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrBackupHorizonConflict = errors.New("backup horizon differs from existing record")

type Store struct{ db *sql.DB }

type BackupStore = Store

func NewPostgresStore(db *sql.DB) *Store { return &Store{db: db} }
func NewBackupStore(db *sql.DB) *Store { return NewPostgresStore(db) }

func (s *Store) RegisterBackupHorizon(ctx context.Context, backupID string, createdAt, restorableUntil time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	var inventoryID string
	if err := tx.QueryRowContext(ctx, `SELECT inventory_id FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global' FOR UPDATE`).Scan(&inventoryID); err != nil { return err }
	result, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_backup_horizons(backup_id,backup_created_at,restorable_until)
		VALUES($1,$2,$3) ON CONFLICT (backup_id) DO NOTHING`, backupID, createdAt.UTC(), restorableUntil.UTC())
	if err != nil { return err }
	affected, err := result.RowsAffected()
	if err != nil { return err }
	if affected == 0 {
		var currentCreated, currentRestorable time.Time
		if err := tx.QueryRowContext(ctx, `SELECT backup_created_at,restorable_until FROM public.intelligence_source_v2_backup_horizons WHERE backup_id=$1`, backupID).Scan(&currentCreated, &currentRestorable); err != nil { return err }
		if !currentCreated.Equal(createdAt.UTC()) || !currentRestorable.Equal(restorableUntil.UTC()) { return ErrBackupHorizonConflict }
	} else {
		if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_backup_inventory_state SET complete=false,verified_at=NULL WHERE inventory_id='global'`); err != nil { return err }
	}
	return tx.Commit()
}

func (s *Store) MarkInventoryVerified(ctx context.Context, verifiedAt time.Time) (bool, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE public.intelligence_source_v2_backup_inventory_state SET complete=true,verified_at=$1 WHERE inventory_id='global'`, verifiedAt.UTC())
	if err != nil { return false, err }
	affected, err := result.RowsAffected()
	if err != nil { return false, err }
	return affected == 1, nil
}

type RetentionResult struct { TombstonesPruned, BackupsPruned int64 }

type RestoreTombstone struct {
	EventID, ConnectionID, ResourceID, RevisionID, ChatID, Reason string
	Sequence int64
	CreatedAt time.Time
}

func (s *Store) RestoreStatus(ctx context.Context) (bool, string, error) {
	var blocked bool
	var epoch string
	err := s.db.QueryRowContext(ctx, `SELECT blocked,restore_epoch FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global'`).Scan(&blocked, &epoch)
	return blocked, epoch, err
}

func (s *Store) InitializeRestoreEpoch(ctx context.Context, expectedEpoch string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	var currentEpoch string
	if err := tx.QueryRowContext(ctx, `SELECT restore_epoch FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global' FOR UPDATE`).Scan(&currentEpoch); err != nil { return err }
	if currentEpoch != "uninitialized" { return nil }
	var hasHistory bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_connections) OR EXISTS(SELECT 1 FROM public.intelligence_source_v2_events) OR EXISTS(SELECT 1 FROM public.intelligence_source_v2_tombstone_ledger)`).Scan(&hasHistory); err != nil { return err }
	if hasHistory { return sql.ErrNoRows }
	if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_restore_gate SET restore_epoch=$1,updated_at=$2 WHERE gate_id='global' AND restore_epoch='uninitialized'`, expectedEpoch, now); err != nil { return err }
	return tx.Commit()
}

func (s *Store) CleanupRetention(ctx context.Context, now, inventoryNow time.Time) (RetentionResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return RetentionResult{}, err }
	defer func() { _ = tx.Rollback() }()
	var result RetentionResult
	var restoreBlocked bool
	if err := tx.QueryRowContext(ctx, `SELECT blocked FROM public.intelligence_source_v2_restore_gate WHERE gate_id='global' FOR UPDATE`).Scan(&restoreBlocked); err != nil { return RetentionResult{}, err }
	var inventoryCurrent bool
	if err := tx.QueryRowContext(ctx, `SELECT complete AND verified_at IS NOT NULL AND verified_at >= ($1::timestamptz-interval '24 hours') FROM public.intelligence_source_v2_backup_inventory_state WHERE inventory_id='global' FOR UPDATE`, inventoryNow.UTC()).Scan(&inventoryCurrent); err != nil { return RetentionResult{}, err }
	if !restoreBlocked && inventoryCurrent {
		tombstones, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_tombstone_ledger tombstone WHERE tombstone.retain_until<=$1 AND NOT EXISTS (SELECT 1 FROM public.intelligence_source_v2_backup_horizons backup WHERE backup.backup_created_at<=tombstone.created_at AND backup.restorable_until+interval '7 days'>$1)`, now.UTC())
		if err != nil { return RetentionResult{}, err }
		if result.TombstonesPruned, err = tombstones.RowsAffected(); err != nil { return RetentionResult{}, err }
		backups, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_backup_horizons WHERE restorable_until+interval '7 days'<=$1`, now.UTC())
		if err != nil { return RetentionResult{}, err }
		if result.BackupsPruned, err = backups.RowsAffected(); err != nil { return RetentionResult{}, err }
	}
	if err := tx.Commit(); err != nil { return RetentionResult{}, err }
	return result, nil
}

func (s *Store) BeginRestore(ctx context.Context, restoreID string, backupCreatedAt, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_restore_gate SET blocked=true,active_restore_id=$1,backup_created_at=$2,ledger_verified_at=NULL,updated_at=$3 WHERE gate_id='global'`, restoreID, backupCreatedAt.UTC(), now)
	if err != nil { return err }
	if affected, err := result.RowsAffected(); err != nil || affected != 1 { return errors.New("restore gate unavailable") }
	return tx.Commit()
}

func (s *Store) EmitScopeTombstone(ctx context.Context, connectionID, chatID, reason string, purgePayloads bool) error {
	var eventID string
	err := s.db.QueryRowContext(ctx, `SELECT public.intelligence_source_v2_emit_acl_tombstone($1,$2,$3,$4,$5)`, connectionID, chatID, "chat:"+chatID, reason, purgePayloads).Scan(&eventID)
	if err != nil || eventID == "" { return errors.New("tombstone emission failed") }
	return nil
}
