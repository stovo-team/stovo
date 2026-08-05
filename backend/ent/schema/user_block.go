package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// UserBlock holds the schema definition for the user_blocks table.
// Atlas SQL migrations own the true composite PK (blocker_user_id, blocked_user_id);
// Ent uses first column as ID + unique index for client access.
type UserBlock struct {
	ent.Schema
}

func (UserBlock) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "user_blocks"},
	}
}

func (UserBlock) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("blocker_user_id").NotEmpty().Immutable(),
		field.String("blocked_user_id").NotEmpty(),
		field.String("created_at").NotEmpty(),
	}
}

func (UserBlock) Edges() []ent.Edge {
	return nil
}

func (UserBlock) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "blocked_user_id").Unique(),
	}
}
