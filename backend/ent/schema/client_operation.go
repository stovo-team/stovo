package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ClientOperation stores a completed idempotent client mutation and its
// canonical response. Atlas owns the composite primary key.
type ClientOperation struct {
	ent.Schema
}

func (ClientOperation) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "client_operations"}}
}

func (ClientOperation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("actor_user_id").NotEmpty().Immutable(),
		field.String("operation_id").NotEmpty().Immutable(),
		field.String("operation_type").NotEmpty().Immutable(),
		field.String("request_hash").NotEmpty().Immutable(),
		field.Int("response_status").Immutable(),
		field.JSON("response_body", map[string]any{}).Default(map[string]any{}).Immutable(),
		field.Time("created_at").Immutable(),
		field.Time("expires_at").Immutable(),
	}
}

func (ClientOperation) Edges() []ent.Edge { return nil }

func (ClientOperation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "operation_id").Unique(),
		index.Fields("expires_at").StorageKey("idx_client_operations_expires_at"),
	}
}
