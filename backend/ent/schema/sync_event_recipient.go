package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// SyncEventRecipient targets an event at a user even when the user is no
// longer eligible to read the event through current family membership.
// Atlas owns the composite primary key (event_id, user_id).
type SyncEventRecipient struct {
	ent.Schema
}

func (SyncEventRecipient) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "sync_event_recipients"}}
}

func (SyncEventRecipient) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("event_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty().Immutable(),
		field.Time("created_at").Immutable(),
	}
}

func (SyncEventRecipient) Edges() []ent.Edge { return nil }

func (SyncEventRecipient) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
		index.Fields("user_id", "id").StorageKey("idx_sync_event_recipients_user_event"),
	}
}
