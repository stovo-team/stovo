package notificationprovider

import (
	"context"
	"database/sql"
	"errors"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) NotificationProvider(ctx context.Context) (string, error) {
	var provider string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM server_settings WHERE key = 'notification_provider'`).Scan(&provider)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return provider, err
}

func (s *PostgresStore) SaveNotificationProvider(ctx context.Context, provider string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO server_settings (key, value) VALUES ('notification_provider', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, provider)
	return err
}
