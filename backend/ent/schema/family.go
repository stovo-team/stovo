package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Family holds the schema definition for the families table.
type Family struct {
	ent.Schema
}

func (Family) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "families"},
	}
}

func (Family) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("name").NotEmpty(),
		field.Int("storage_limit_mb").Optional().Nillable(),
		field.Bool("minimized_chat_layout").Default(false),
		field.String("default_message_encryption_protocol").Default("server_at_rest"),
		field.String("public_app_url").Optional().Nillable(),
		field.String("public_api_url").Optional().Nillable(),
		field.String("created_at").NotEmpty(),
		field.String("updated_at").NotEmpty(),
		field.String("default_profile_visibility").Default("everyone"),
		field.String("default_last_seen_visibility").Default("everyone"),
		field.Bool("default_read_receipts_enabled").Default(true),
		field.String("default_notification_settings").Default(`{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}`),
	}
}

func (Family) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("users", User.Type),
		edge.To("chats", Chat.Type),
		edge.To("invites", Invite.Type),
		edge.To("files", File.Type),
		edge.To("plans", Plan.Type),
		edge.To("mcp_connectors", McpConnector.Type),
		edge.To("mcp_audit_events", McpAuditEvent.Type),
	}
}
