package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// MessageUserDeletion holds the schema definition for the message_user_deletions table.
// Atlas SQL migrations own the true composite PK (message_id, user_id);
// Ent uses first column as ID + unique index for client access.
type MessageUserDeletion struct {
	ent.Schema
}

func (MessageUserDeletion) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "message_user_deletions"},
	}
}

func (MessageUserDeletion) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("message_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("deleted_at").NotEmpty(),
	}
}

func (MessageUserDeletion) Edges() []ent.Edge {
	return nil
}

func (MessageUserDeletion) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
		index.Fields("user_id", "id").
			StorageKey("idx_message_user_deletions_user_message"),
	}
}
