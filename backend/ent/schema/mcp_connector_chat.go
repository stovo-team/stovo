package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// McpConnectorChat holds the schema definition for the mcp_connector_chats table.
// Atlas SQL migrations own the true composite PK (connector_id, chat_id);
// Ent uses first column as ID + unique index for client access.
type McpConnectorChat struct {
	ent.Schema
}

func (McpConnectorChat) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "mcp_connector_chats"},
	}
}

func (McpConnectorChat) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("connector_id").NotEmpty().Immutable(),
		field.String("chat_id").NotEmpty(),
	}
}

func (McpConnectorChat) Edges() []ent.Edge {
	return nil
}

func (McpConnectorChat) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "chat_id").Unique(),
	}
}
