package repository

import (
	"context"
	"fmt"

	"stovo-messenger/backend/ent"
)

// Store is the Ent-backed data access layer.
type Store struct {
	Client *ent.Client
}

// New returns a Store wrapping the given Ent client.
func New(client *ent.Client) *Store {
	return &Store{Client: client}
}

// WithTx runs fn inside a database transaction.
func (s *Store) WithTx(ctx context.Context, fn func(tx *ent.Tx) error) error {
	tx, err := s.Client.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()
	if err := fn(tx); err != nil {
		if rerr := tx.Rollback(); rerr != nil {
			err = fmt.Errorf("%w: rolling back transaction: %v", err, rerr)
		}
		return err
	}
	return tx.Commit()
}

// client returns the transactional client when tx is non-nil, otherwise the root client.
func (s *Store) client(tx *ent.Tx) *ent.Client {
	if tx != nil {
		return tx.Client()
	}
	return s.Client
}
