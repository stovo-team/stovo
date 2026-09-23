package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User holds the schema definition for the users table.
type User struct {
	ent.Schema
}

func (User) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "users"},
	}
}

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("username").NotEmpty().Unique(),
		field.String("password_hash").NotEmpty(),
		field.String("display_name").NotEmpty(),
		field.String("role").NotEmpty(),
		field.Int("is_active").Default(1),
		field.String("public_key").Optional().Nillable(),
		field.String("profile_photo_file_id").Optional().Nillable(),
		field.String("created_at").NotEmpty(),
		field.String("last_seen_at").Optional().Nillable(),
		field.String("profile_visibility").Default("family"),
		field.String("last_seen_visibility").Default("family"),
		field.Bool("read_receipts_enabled").Default(true),
		field.String("audio_call_settings").Optional().Nillable(),
		field.String("ntfy_topic_token").Optional().Nillable(),
		field.String("fcm_device_token").Sensitive().Optional().Nillable(),
		field.String("email").Optional().Nillable(),
		field.String("bio").Optional().Nillable(),
		field.String("timezone").Optional().Nillable(),
	}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("users").
			Field("family_id").
			Unique().
			Required(),
		edge.To("refresh_tokens", RefreshToken.Type),
		edge.To("invites_created", Invite.Type),
		edge.To("chats_created", Chat.Type),
		edge.To("files_uploaded", File.Type),
		edge.To("messages_sent", Message.Type),
		edge.To("calls_outgoing", CallSession.Type),
		edge.To("calls_incoming", CallSession.Type),
		edge.To("plans_created", Plan.Type),
		edge.To("mcp_actor_connectors", McpConnector.Type),
		edge.To("mcp_connectors_created", McpConnector.Type),
	}
}
