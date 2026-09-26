package app

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"io"
	"time"
)

type captionGuestConnector struct {
	expiresAt time.Time
	revokedAt any
}

func (c captionGuestConnector) Connect(context.Context) (driver.Conn, error) {
	return captionGuestConn{connector: c}, nil
}
func (captionGuestConnector) Driver() driver.Driver { return captionGuestDriver{} }
func (captionGuestDriver) Open(string) (driver.Conn, error) {
	return captionGuestConn{}, nil
}

type captionGuestDriver struct{}
type captionGuestConn struct{ connector captionGuestConnector }

func (captionGuestConn) Prepare(string) (driver.Stmt, error) { return nil, driver.ErrSkip }
func (captionGuestConn) Close() error                        { return nil }
func (captionGuestConn) Begin() (driver.Tx, error)           { return nil, driver.ErrSkip }
func (c captionGuestConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &captionGuestRows{values: []driver.Value{
		"meeting-1", "chat-1", "creator-1", "Caption test", "immediate",
		c.connector.expiresAt, nil, c.connector.revokedAt, nil,
	}}, nil
}

type captionGuestRows struct {
	values []driver.Value
	done   bool
}

func (*captionGuestRows) Columns() []string {
	return []string{"id", "chat_id", "creator_id", "title", "admission_mode", "expires_at", "scheduled_at", "revoked_at", "ended_at"}
}
func (*captionGuestRows) Close() error { return nil }
func (r *captionGuestRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	copy(dest, r.values)
	return nil
}

func captionGuestTestDB(expiresAt time.Time, revokedAt any) *sql.DB {
	return sql.OpenDB(captionGuestConnector{expiresAt: expiresAt, revokedAt: revokedAt})
}
