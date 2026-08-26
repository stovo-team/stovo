package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ConsumerReceipt is the durable idempotency ledger for at-least-once workers.
// Atlas owns the composite primary key (consumer_name, event_id).
type ConsumerReceipt struct {
	ent.Schema
}

func (ConsumerReceipt) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "consumer_receipts"}}
}

func (ConsumerReceipt) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("consumer_name").NotEmpty().Immutable(),
		field.String("event_id").NotEmpty().Immutable(),
		field.JSON("result", map[string]any{}).Optional(),
		field.Time("completed_at").Immutable(),
	}
}

func (ConsumerReceipt) Edges() []ent.Edge { return nil }

func (ConsumerReceipt) Indexes() []ent.Index {
	return []ent.Index{index.Fields("id", "event_id").Unique()}
}
