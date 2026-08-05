package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// MessageStatus holds the schema definition for the message_statuses table.
// Atlas SQL migrations own the true composite PK (message_id, user_id, status);
// Ent uses first column as ID + unique index for client access.
type MessageStatus struct {
	ent.Schema
}

func (MessageStatus) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "message_statuses"},
	}
}

func (MessageStatus) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("message_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("status").NotEmpty(),
		field.String("created_at").NotEmpty(),
	}
}

func (MessageStatus) Edges() []ent.Edge {
	return nil
}

func (MessageStatus) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id", "status").Unique(),
		index.Fields("id").
			StorageKey("idx_message_statuses_message"),
	}
}
