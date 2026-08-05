package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PinnedMessage holds the schema definition for the pinned_messages table.
// Atlas SQL migrations own the true composite PK (chat_id, message_id);
// Ent uses first column as ID + unique index for client access.
type PinnedMessage struct {
	ent.Schema
}

func (PinnedMessage) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "pinned_messages"},
	}
}

func (PinnedMessage) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("chat_id").NotEmpty().Immutable(),
		field.String("message_id").NotEmpty(),
		field.String("pinned_by").NotEmpty(),
		field.Time("pinned_at").Default(time.Now),
	}
}

func (PinnedMessage) Edges() []ent.Edge {
	return nil
}

func (PinnedMessage) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "message_id").Unique(),
	}
}
