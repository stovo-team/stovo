package mcp

import (
	"context"
	"testing"
)

type auditStoreFake struct {
	record AuditRecord
	limit  int
}

func (s *auditStoreFake) RecordAudit(_ context.Context, record AuditRecord) error {
	s.record = record
	return nil
}
func (s *auditStoreFake) ListAudit(_ context.Context, _, _ string, limit int) ([]AuditEvent, error) {
	s.limit = limit
	return nil, nil
}

func TestAuditServiceDefaultsMetadataAndClampsListLimit(t *testing.T) {
	store := &auditStoreFake{}
	service := NewAuditService(store)
	if err := service.Record(context.Background(), AuditRecord{ID: "event"}); err != nil {
		t.Fatal(err)
	}
	if string(store.record.Meta) != "{}" {
		t.Fatalf("meta=%q", store.record.Meta)
	}
	if _, err := service.List(context.Background(), "family", "connector", 999); err != nil {
		t.Fatal(err)
	}
	if store.limit != 200 {
		t.Fatalf("limit=%d", store.limit)
	}
}
