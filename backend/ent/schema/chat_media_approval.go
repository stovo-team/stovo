package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ChatMediaApproval holds the schema definition for the chat_media_approvals table.
// Atlas SQL migrations own the true composite PK (chat_id, user_id);
// Ent uses first column as ID + unique index for client access.
type ChatMediaApproval struct {
	ent.Schema
}

func (ChatMediaApproval) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "chat_media_approvals"},
	}
}

func (ChatMediaApproval) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("chat_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("created_at").NotEmpty(),
	}
}

func (ChatMediaApproval) Edges() []ent.Edge {
	return nil
}

func (ChatMediaApproval) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
	}
}
