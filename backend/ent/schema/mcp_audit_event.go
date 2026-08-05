package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// McpAuditEvent holds the schema definition for the mcp_audit_events table.
type McpAuditEvent struct {
	ent.Schema
}

func (McpAuditEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "mcp_audit_events"},
	}
}

func (McpAuditEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("connector_id").NotEmpty(),
		field.String("actor_user_id").NotEmpty(),
		field.String("action").NotEmpty(),
		field.String("chat_id").Optional().Nillable(),
		field.String("message_id").Optional().Nillable(),
		field.Bool("success"),
		field.String("error").Optional().Nillable(),
		field.String("meta").Default("{}"),
		field.String("created_at").NotEmpty(),
	}
}

func (McpAuditEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("mcp_audit_events").
			Field("family_id").
			Unique().
			Required(),
		edge.From("connector", McpConnector.Type).
			Ref("audit_events").
			Field("connector_id").
			Unique().
			Required(),
	}
}

func (McpAuditEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("connector_id", "created_at").
			StorageKey("idx_mcp_audit_connector_created"),
	}
}
