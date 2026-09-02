package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// SyncEvent is the immutable, ordered client-replication log. The Atlas
// migration owns the identity sequence and audience constraints.
type SyncEvent struct {
	ent.Schema
}

func (SyncEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "sync_events"}}
}

func (SyncEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty().Immutable(),
		field.Int64("sequence").Unique().Immutable().Optional(),
		field.String("family_id").NotEmpty().Immutable(),
		field.String("audience").NotEmpty().Immutable(),
		field.String("event_type").NotEmpty().Immutable(),
		field.Int("schema_version").Default(1).Immutable(),
		field.String("aggregate_type").NotEmpty().Immutable(),
		field.String("aggregate_id").NotEmpty().Immutable(),
		field.JSON("payload", map[string]any{}).Default(map[string]any{}).Immutable(),
		field.Time("occurred_at").Immutable(),
	}
}

func (SyncEvent) Edges() []ent.Edge { return nil }

func (SyncEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("family_id", "sequence").StorageKey("idx_sync_events_family_sequence"),
		index.Fields("occurred_at").StorageKey("idx_sync_events_occurred_at"),
	}
}
