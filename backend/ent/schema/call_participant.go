package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// CallParticipant holds the schema definition for the call_participants table.
// Atlas SQL migrations own the true composite PK (room_id, user_id);
// Ent uses first column as ID + unique index for client access.
type CallParticipant struct {
	ent.Schema
}

func (CallParticipant) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "call_participants"},
	}
}

func (CallParticipant) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("room_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("role").NotEmpty(),
		field.String("state").NotEmpty(),
		field.Time("joined_at").Optional().Nillable(),
	}
}

func (CallParticipant) Edges() []ent.Edge {
	return nil
}

func (CallParticipant) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
	}
}
