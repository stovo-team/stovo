// Package databasehealth adapts database/sql readiness checks for transports.
package databasehealth

import (
	"context"
	"database/sql"
)

type Checker struct{ db *sql.DB }

func New(db *sql.DB) *Checker { return &Checker{db: db} }

func (c *Checker) Health(ctx context.Context) error { return c.db.PingContext(ctx) }
