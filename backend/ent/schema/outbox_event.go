package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// OutboxEvent records asynchronous business work in the same transaction as
// its source mutation. A dispatcher publishes it at least once to Redis Streams.
type OutboxEvent struct {
	ent.Schema
}

func (OutboxEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "outbox_events"}}
}

func (OutboxEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty().Immutable(),
		field.String("sync_event_id").Optional().Nillable().Immutable(),
		field.String("family_id").Optional().Nillable().Immutable(),
		field.String("topic").NotEmpty().Immutable(),
		field.Int("schema_version").Default(1).Immutable(),
		field.String("partition_key").NotEmpty().Immutable(),
		field.JSON("payload", map[string]any{}).Default(map[string]any{}).Immutable(),
		field.Time("created_at").Immutable(),
		field.Time("available_at"),
		field.String("lease_owner").Optional().Nillable(),
		field.Time("lease_expires_at").Optional().Nillable(),
		field.Int("attempts").Default(0),
		field.Time("published_at").Optional().Nillable(),
		field.String("last_error").Optional().Nillable(),
	}
}

func (OutboxEvent) Edges() []ent.Edge { return nil }

func (OutboxEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("topic", "created_at").StorageKey("idx_outbox_events_topic_created"),
		index.Fields("sync_event_id").StorageKey("idx_outbox_events_sync_event"),
	}
}
