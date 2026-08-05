package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// MessageReaction holds the schema definition for the message_reactions table.
// Atlas SQL migrations own the true composite PK (message_id, user_id, emoji);
// Ent uses first column as ID + unique index for client access.
type MessageReaction struct {
	ent.Schema
}

func (MessageReaction) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "message_reactions"},
	}
}

func (MessageReaction) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("message_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("emoji").NotEmpty(),
		field.String("created_at").NotEmpty(),
	}
}

func (MessageReaction) Edges() []ent.Edge {
	return nil
}

func (MessageReaction) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id", "emoji").Unique(),
		index.Fields("id").
			StorageKey("idx_message_reactions_message"),
	}
}
