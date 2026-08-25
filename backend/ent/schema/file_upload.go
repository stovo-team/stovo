package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// FileUpload records the durable server-side state of a direct upload.
// It deliberately has no behaviour yet: the reservation/complete API will
// consume this foundation in the next media phase.
type FileUpload struct {
	ent.Schema
}

func (FileUpload) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Table: "file_uploads"}}
}

func (FileUpload) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.String("file_id").NotEmpty(),
		field.String("family_id").NotEmpty(),
		field.String("uploaded_by").NotEmpty(),
		field.String("chat_id").Optional().Nillable(),
		field.String("access_scope").NotEmpty(),
		field.String("idempotency_key").NotEmpty(),
		field.String("request_hash").NotEmpty(),
		field.String("upload_mode").NotEmpty(),
		field.String("multipart_upload_id").Optional().Nillable(),
		field.String("object_key").NotEmpty(),
		field.String("expected_mime_type").NotEmpty(),
		field.Int64("expected_size_bytes"),
		field.String("expected_checksum").Optional().Nillable(),
		field.String("state").Default("reserved"),
		field.String("failure_code").Optional().Nillable(),
		field.String("expires_at").NotEmpty(),
		field.String("completed_at").Optional().Nillable(),
		field.String("created_at").NotEmpty(),
		field.String("updated_at").NotEmpty(),
	}
}

func (FileUpload) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("file_id").Unique(),
		index.Fields("uploaded_by", "idempotency_key").Unique(),
		index.Fields("state", "expires_at"),
	}
}
