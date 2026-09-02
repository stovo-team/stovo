package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Poll holds the schema definition for the polls table.
type Poll struct {
	ent.Schema
}

func (Poll) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "polls"},
	}
}

func (Poll) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("chat_id").NotEmpty(),
		field.String("message_id").NotEmpty().Unique(),
		field.String("question").NotEmpty(),
		field.Bool("is_anonymous").Default(false),
		field.Bool("allow_multiple").Default(false),
		field.Bool("is_quiz").Default(false),
		field.String("correct_option_id").Optional().Nillable(),
		field.String("explanation").Optional().Nillable(),
		field.Bool("is_closed").Default(false),
		field.String("created_at").NotEmpty(),
		field.String("closed_at").Optional().Nillable(),
	}
}

func (Poll) Edges() []ent.Edge {
	return nil
}

func (Poll) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("chat_id"),
		index.Fields("message_id").Unique(),
	}
}
