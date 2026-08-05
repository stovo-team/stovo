package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// MediaQualitySetting holds the schema for media_quality_settings.
// Atlas SQL migrations own the true composite PK (family_id, media_type, extension);
// Ent uses first column as ID + unique index for client access.
type MediaQualitySetting struct {
	ent.Schema
}

func (MediaQualitySetting) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "media_quality_settings"},
	}
}

func (MediaQualitySetting) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").StorageKey("family_id").NotEmpty().Immutable(),
		field.String("media_type").NotEmpty(),
		field.String("extension").Default(""),
		field.Int("quality_percent"),
		field.String("updated_at").NotEmpty(),
	}
}

func (MediaQualitySetting) Edges() []ent.Edge {
	return nil
}

func (MediaQualitySetting) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("id", "media_type", "extension").Unique(),
	}
}
