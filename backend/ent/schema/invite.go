package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Invite holds the schema definition for the invites table.
type Invite struct {
	ent.Schema
}

func (Invite) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "invites"},
	}
}

func (Invite) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("token_hash").NotEmpty().Unique(),
		field.String("role").NotEmpty(),
		field.String("expires_at").NotEmpty(),
		field.Int("max_uses"),
		field.Int("used_count").Default(0),
		field.String("created_by").NotEmpty(),
		field.String("created_at").NotEmpty(),
		field.String("revoked_at").Optional().Nillable(),
	}
}

func (Invite) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("invites").
			Field("family_id").
			Unique().
			Required(),
		edge.From("creator", User.Type).
			Ref("invites_created").
			Field("created_by").
			Unique().
			Required(),
	}
}
