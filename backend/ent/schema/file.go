package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// File holds the schema definition for the files table.
type File struct {
	ent.Schema
}

func (File) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "files"},
	}
}

func (File) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("uploaded_by").NotEmpty(),
		field.String("chat_id").Optional().Nillable(),
		field.String("access_scope").NotEmpty(),
		field.String("storage_provider").NotEmpty(),
		field.String("object_key").NotEmpty(),
		// Lifecycle fields are intentionally separate from object_key so future
		// direct uploads remain invisible until validation promotes them to ready.
		field.String("lifecycle_state").Default("ready"),
		field.String("object_revision").Optional().Nillable(),
		field.String("object_etag").Optional().Nillable(),
		field.String("thumbnail_object_key").Optional().Nillable(),
		field.String("detected_mime_type").Optional().Nillable(),
		field.String("preview_revision").Optional().Nillable(),
		field.String("preview_status").Default("none"),
		field.String("validation_failure_code").Optional().Nillable(),
		field.String("validated_at").Optional().Nillable(),
		field.String("original_name").NotEmpty(),
		field.String("mime_type").NotEmpty(),
		field.Int("size_bytes"),
		field.String("checksum").Optional().Nillable(),
		field.String("created_at").NotEmpty(),
		field.String("deleted_at").Optional().Nillable(),
	}
}

func (File) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("family", Family.Type).
			Ref("files").
			Field("family_id").
			Unique().
			Required(),
		edge.From("uploader", User.Type).
			Ref("files_uploaded").
			Field("uploaded_by").
			Unique().
			Required(),
		edge.From("chat", Chat.Type).
			Ref("files").
			Field("chat_id").
			Unique(),
	}
}
