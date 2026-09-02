package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PollOption holds the schema definition for the poll_options table.
type PollOption struct {
	ent.Schema
}

func (PollOption) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "poll_options"},
	}
}

func (PollOption) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("poll_id").NotEmpty(),
		field.String("text").NotEmpty(),
		field.Int("option_index").Default(0),
	}
}

func (PollOption) Edges() []ent.Edge {
	return nil
}

func (PollOption) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("poll_id"),
	}
}
