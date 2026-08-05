package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// CallSession holds the schema definition for the call_sessions table.
type CallSession struct {
	ent.Schema
}

func (CallSession) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "call_sessions"},
	}
}

func (CallSession) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("caller_id").NotEmpty(),
		field.String("callee_id").NotEmpty(),
		field.String("call_type").NotEmpty(),
		field.String("state").NotEmpty(),
		field.Time("created_at").Default(time.Now),
		field.Time("ended_at").Optional().Nillable(),
		field.Int("duration_s").Optional().Nillable(),
		field.String("chat_id").Optional().Nillable(),
		field.String("topology").Default("mesh"),
	}
}

func (CallSession) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("caller", User.Type).
			Ref("calls_outgoing").
			Field("caller_id").
			Unique().
			Required(),
		edge.From("callee", User.Type).
			Ref("calls_incoming").
			Field("callee_id").
			Unique().
			Required(),
		edge.From("chat", Chat.Type).
			Ref("call_sessions").
			Field("chat_id").
			Unique(),
	}
}
