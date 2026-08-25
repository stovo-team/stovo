package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// NotificationDelivery tracks provider delivery attempts separately from the
// source event so retries remain auditable and recipient-specific.
// Atlas owns the composite primary key (event_id, recipient_id, channel).
type NotificationDelivery struct {
	ent.Schema
}

func (NotificationDelivery) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "notification_deliveries"}}
}

func (NotificationDelivery) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("event_id").NotEmpty().Immutable(),
		field.String("recipient_id").NotEmpty().Immutable(),
		field.String("channel").NotEmpty().Immutable(),
		field.String("state").NotEmpty(),
		field.Int("attempts").Default(0),
		field.String("provider_id").Optional().Nillable(),
		field.String("last_error").Optional().Nillable(),
		field.Time("created_at").Immutable(),
		field.Time("updated_at"),
	}
}

func (NotificationDelivery) Edges() []ent.Edge { return nil }

func (NotificationDelivery) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "recipient_id", "channel").Unique(),
		index.Fields("state", "updated_at").StorageKey("idx_notification_deliveries_state_updated"),
	}
}
