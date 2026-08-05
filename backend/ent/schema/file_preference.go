package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// FilePreference holds the schema definition for the file_preferences table.
// Atlas SQL migrations own the true composite PK (file_id, user_id);
// Ent uses first column as ID + unique index for client access.
type FilePreference struct {
	ent.Schema
}

func (FilePreference) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "file_preferences"},
	}
}

func (FilePreference) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("file_id").NotEmpty().Immutable(),
		field.String("user_id").NotEmpty(),
		field.Bool("is_favorite").Default(false),
	}
}

func (FilePreference) Edges() []ent.Edge {
	return nil
}

func (FilePreference) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "user_id").Unique(),
	}
}
