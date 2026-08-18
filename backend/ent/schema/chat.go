package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Chat holds the schema definition for the chats table.
type Chat struct {
	ent.Schema
}

func (Chat) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "chats"},
	}
}

func (Chat) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("type").NotEmpty(),
		field.String("title").Optional().Nillable(),
		field.String("created_by").Optional().Nillable(),
		field.String("chat_photo_file_id").Optional().Nillable(),
		field.String("media_visibility").NotEmpty(),
		field.Bool("comments_enabled").Default(true),
		field.String("encryption_protocol").Default("server_at_rest"),
		field.String("created_at").NotEmpty(),
		field.String("updated_at").NotEmpty(),
		field.String("pin_permission").Default("everyone"),
		field.Int("message_delay_seconds").Default(0),
	}
}

func (Chat) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("chats").
			Field("family_id").
			Unique().
			Required(),
		edge.From("creator", User.Type).
			Ref("chats_created").
			Field("created_by").
			Unique(),
		edge.To("files", File.Type),
		edge.To("messages", Message.Type),
		edge.To("call_sessions", CallSession.Type),
		edge.To("plans_sourced", Plan.Type),
	}
}

func (Chat) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("family_id").
			Unique().
			StorageKey("uq_family_chat_per_family").Annotations(entsql.IndexWhere("type = 'family'")),
	}
}
