package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ChatPreference holds the schema definition for the chat_preferences table.
// Atlas SQL migrations own the true composite PK (chat_id, user_id);
// Ent uses first column as ID + unique index for client access.
type ChatPreference struct {
	ent.Schema
}

func (ChatPreference) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "chat_preferences"},
	}
}

func (ChatPreference) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("chat_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.Bool("is_muted").Default(false),
		field.Bool("is_pinned").Default(false),
		field.Bool("is_favorite").Default(false),
		field.Time("muted_until").Optional().Nillable(),
		field.Bool("quiet_hours_enabled").Default(false),
		field.String("quiet_hours_start").Optional().Nillable(),
		field.String("quiet_hours_end").Optional().Nillable(),
		field.String("notification_mode").Default("all"),
		field.JSON("notify_sender_ids", []string{}).Optional(),
		field.Bool("always_notify_mentions").Default(true),
		field.String("last_read_message_id").Optional().Nillable(),
		field.String("last_read_at").Optional().Nillable(),
		field.String("wallpaper_file_id").Optional().Nillable(),
	}
}

func (ChatPreference) Edges() []ent.Edge {
	return nil
}

func (ChatPreference) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
	}
}
