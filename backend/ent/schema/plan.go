package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Plan holds the schema definition for the plans table.
type Plan struct {
	ent.Schema
}

func (Plan) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "plans"},
	}
}

func (Plan) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("title").NotEmpty(),
		field.String("notes").Optional().Nillable(),
		field.String("location").Optional().Nillable(),
		field.String("starts_at").NotEmpty(),
		field.String("ends_at").NotEmpty(),
		field.Bool("all_day").Default(false),
		field.String("time_zone").Default("UTC"),
		field.String("recurrence").Optional().Nillable(),
		field.String("created_by").NotEmpty(),
		field.String("source_chat_id").Optional().Nillable(),
		field.Int("revision").Default(1),
		field.String("created_at").NotEmpty(),
		field.String("updated_at").NotEmpty(),
		field.String("deleted_at").Optional().Nillable(),
	}
}

func (Plan) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("plans").
			Field("family_id").
			Unique().
			Required(),
		edge.From("creator", User.Type).
			Ref("plans_created").
			Field("created_by").
			Unique().
			Required(),
		edge.From("source_chat", Chat.Type).
			Ref("plans_sourced").
			Field("source_chat_id").
			Unique(),
	}
}

func (Plan) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("family_id", "starts_at").
			StorageKey("idx_plans_family_range").Annotations(entsql.IndexWhere("deleted_at IS NULL")),
	}
}
