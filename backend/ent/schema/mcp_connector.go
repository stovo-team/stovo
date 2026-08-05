package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// McpConnector holds the schema definition for the mcp_connectors table.
type McpConnector struct {
	ent.Schema
}

func (McpConnector) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "mcp_connectors"},
	}
}

func (McpConnector) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("name").NotEmpty(),
		field.String("actor_user_id").NotEmpty().Unique(),
		field.String("token_hash").NotEmpty().Unique(),
		field.Bool("enabled").Default(true),
		field.String("revoked_at").Optional().Nillable(),
		field.String("created_by").NotEmpty(),
		field.String("created_at").NotEmpty(),
		field.String("last_used_at").Optional().Nillable(),
		field.Int("max_history_messages").Default(50),
		field.String("permissions").Default("{}"),
		field.String("provider").Default("claude_code").NotEmpty(),
		field.String("alias").Default("").NotEmpty(),
		field.String("auth_mode").Default("subscription").NotEmpty(),
	}
}

func (McpConnector) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("mcp_connectors").
			Field("family_id").
			Unique().
			Required(),
		edge.From("actor", User.Type).
			Ref("mcp_actor_connectors").
			Field("actor_user_id").
			Unique().
			Required(),
		edge.From("creator", User.Type).
			Ref("mcp_connectors_created").
			Field("created_by").
			Unique().
			Required(),
		edge.To("audit_events", McpAuditEvent.Type),
	}
}
