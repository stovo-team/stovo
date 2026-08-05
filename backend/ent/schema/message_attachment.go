package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// MessageAttachment holds the schema definition for the message_attachments table.
// Atlas SQL migrations own the true composite PK (message_id, file_id);
// Ent uses first column as ID + unique index for client access.
type MessageAttachment struct {
	ent.Schema
}

func (MessageAttachment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "message_attachments"},
	}
}

func (MessageAttachment) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("message_id").NotEmpty().Immutable(),
		field.String("file_id").NotEmpty(),
	}
}

func (MessageAttachment) Edges() []ent.Edge {
	return nil
}

func (MessageAttachment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "file_id").Unique(),
		index.Fields("id").
			StorageKey("idx_message_attachments_message"),
	}
}
