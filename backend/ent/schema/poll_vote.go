package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PollVote holds the schema definition for the poll_votes table.
type PollVote struct {
	ent.Schema
}

func (PollVote) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "poll_votes"},
	}
}

func (PollVote) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("poll_id").NotEmpty(),
		field.String("option_id").NotEmpty(),
		field.String("user_id").NotEmpty(),
		field.String("created_at").NotEmpty(),
	}
}

func (PollVote) Edges() []ent.Edge {
	return nil
}

func (PollVote) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("poll_id", "user_id"),
		index.Fields("poll_id", "option_id"),
	}
}
