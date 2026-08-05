package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Message holds the schema definition for the messages table.
type Message struct {
	ent.Schema
}

func (Message) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "messages"},
	}
}

func (Message) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("chat_id").NotEmpty(),
		field.String("sender_id").NotEmpty(),
		field.String("type").NotEmpty(),
		field.String("content").Optional().Nillable(),
		field.String("encryption_protocol").Default("legacy_plaintext"),
		field.String("ciphertext").Optional().Nillable(),
		field.String("nonce").Optional().Nillable(),
		field.Int("key_version").Optional().Nillable(),
		field.String("encryption_metadata").Optional().Nillable(),
		field.String("reply_to_message_id").Optional().Nillable(),
		field.String("thread_root_message_id").Optional().Nillable(),
		field.String("message_kind").Default("chat"),
		field.String("forwarded_from_message_id").Optional().Nillable(),
		field.String("forwarded_from_chat_id").Optional().Nillable(),
		field.String("created_at").NotEmpty(),
		field.String("updated_at").NotEmpty(),
		field.String("deleted_at").Optional().Nillable(),
		field.Bool("is_edited").Default(false),
	}
}

func (Message) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("chat", Chat.Type).
			Ref("messages").
			Field("chat_id").
			Unique().
			Required(),
		edge.From("sender", User.Type).
			Ref("messages_sent").
			Field("sender_id").
			Unique().
			Required(),
	}
}

func (Message) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("chat_id", "created_at").
			StorageKey("idx_messages_chat_created_active").Annotations(entsql.IndexWhere("deleted_at IS NULL")),
	}
}
