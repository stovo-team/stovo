package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PlanAttendee holds the schema definition for the plan_attendees table.
// Atlas SQL migrations own the true composite PK (plan_id, user_id);
// Ent uses first column as ID + unique index for client access.
type PlanAttendee struct {
	ent.Schema
}

func (PlanAttendee) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "plan_attendees"},
	}
}

func (PlanAttendee) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("plan_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.String("status").Default("going"),
		field.String("updated_at").NotEmpty(),
	}
}

func (PlanAttendee) Edges() []ent.Edge {
	return nil
}

func (PlanAttendee) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
	}
}
