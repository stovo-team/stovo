package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// RefreshToken holds the schema definition for the refresh_tokens table.
type RefreshToken struct {
	ent.Schema
}

func (RefreshToken) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "refresh_tokens"},
	}
}

func (RefreshToken) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("user_id").NotEmpty(),
		field.String("token_hash").NotEmpty().Unique(),
		field.String("expires_at").NotEmpty(),
		field.String("created_at").NotEmpty(),
		field.String("revoked_at").Optional().Nillable(),
		field.String("ip_address").Optional().Nillable(),
	}
}

func (RefreshToken) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("refresh_tokens").
			Field("user_id").
			Unique().
			Required(),
	}
}
