package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// collectionPublic is deliberately transport-shaped: collections are a small
// storage surface and do not require Ent code generation to evolve safely.
type collectionPublic struct {
	ID          string  `json:"id"`
	FamilyID    string  `json:"familyId"`
	OwnerID     string  `json:"ownerId"`
	Title       string  `json:"title"`
	DisplayKind string  `json:"displayKind"`
	ContentType string  `json:"contentType"`
	CoverFileID *string `json:"coverFileId"`
	ItemCount   int     `json:"itemCount"`
	AccessLevel string  `json:"accessLevel"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type collectionGrantPublic struct {
	PrincipalType string `json:"principalType"`
	PrincipalID   string `json:"principalId"`
	AccessLevel   string `json:"accessLevel"`
}

func (s *Server) collectionDB() (*sql.DB, bool) {
	db, ok := s.database.(*sql.DB)
	return db, ok && db != nil
}

func validCollectionKind(value string) bool { return value == "folder" || value == "album" }
func validCollectionContent(value string) bool {
	return value == "mixed" || value == "media" || value == "audio" || value == "documents"
}
func validCollectionLevel(value string) bool { return value == "viewer" || value == "editor" }

func collectionContentAllows(contentType, mimeType string) bool {
	switch contentType {
	case "mixed":
		return true
	case "media":
		return strings.HasPrefix(mimeType, "image/") || strings.HasPrefix(mimeType, "video/")
	case "audio":
		return strings.HasPrefix(mimeType, "audio/")
	case "documents":
		return !strings.HasPrefix(mimeType, "image/") && !strings.HasPrefix(mimeType, "video/") && !strings.HasPrefix(mimeType, "audio/")
	default:
		return false
	}
}

func (s *Server) collectionAccess(ctx context.Context, collectionID string, user userPublic) (collectionPublic, string, error) {
	db, ok := s.collectionDB()
	if !ok {
		return collectionPublic{}, "", errNotFound
	}
	var c collectionPublic
	var cover sql.NullString
	err := db.QueryRowContext(ctx, `SELECT c.id,c.family_id,c.owner_id,c.title,c.display_kind,c.content_type,c.cover_file_id,c.created_at,c.updated_at,
		(SELECT count(*) FROM storage_collection_items i WHERE i.collection_id=c.id)
		FROM storage_collections c WHERE c.id=$1 AND c.deleted_at IS NULL`, collectionID).
		Scan(&c.ID, &c.FamilyID, &c.OwnerID, &c.Title, &c.DisplayKind, &c.ContentType, &cover, &c.CreatedAt, &c.UpdatedAt, &c.ItemCount)
	if err != nil || c.FamilyID != user.FamilyID {
		return collectionPublic{}, "", errNotFound
	}
	if cover.Valid {
		c.CoverFileID = &cover.String
	}
	if c.OwnerID == user.ID || hasPermission(user, permissionManageFiles) {
		c.AccessLevel = "editor"
		return c, "editor", nil
	}
	var level string
	err = db.QueryRowContext(ctx, `SELECT access_level FROM storage_collection_grants
		WHERE collection_id=$1 AND ((principal_type='user' AND principal_id=$2) OR (principal_type='role' AND principal_id=$3))
		ORDER BY CASE access_level WHEN 'editor' THEN 0 ELSE 1 END LIMIT 1`, collectionID, user.ID, user.RoleID).Scan(&level)
	if err != nil {
		return collectionPublic{}, "", errNotFound
	}
	c.AccessLevel = level
	return c, level, nil
}

func (s *Server) collectionFileVisible(ctx context.Context, fileID string, user userPublic) bool {
	db, ok := s.collectionDB()
	if !ok {
		return false
	}
	var found bool
	err := db.QueryRowContext(ctx, `SELECT EXISTS(
		SELECT 1 FROM storage_collection_items i JOIN storage_collections c ON c.id=i.collection_id
		WHERE i.file_id=$1 AND c.family_id=$2 AND c.deleted_at IS NULL AND (
			c.owner_id=$3 OR EXISTS(SELECT 1 FROM storage_collection_grants g WHERE g.collection_id=c.id
			AND ((g.principal_type='user' AND g.principal_id=$3) OR (g.principal_type='role' AND g.principal_id=$4)))
		))`, fileID, user.FamilyID, user.ID, user.RoleID).Scan(&found)
	return err == nil && found
}

func (s *Server) removeDeletedFileFromCollections(ctx context.Context, fileID string) {
	db, ok := s.collectionDB()
	if !ok {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = db.ExecContext(ctx, `DELETE FROM storage_collection_items WHERE file_id=$1`, fileID)
	_, _ = db.ExecContext(ctx, `UPDATE storage_collections SET cover_file_id=NULL,updated_at=$2 WHERE cover_file_id=$1 AND deleted_at IS NULL`, fileID, now)
}

// shareCollectionWithChat takes a snapshot of current chat members. The
// grants intentionally remain direct grants if people later leave the chat;
// editors retain explicit control over revocation in the collection UI.
func (s *Server) shareCollectionWithChat(ctx context.Context, collectionID string, chat chatPublic, user userPublic) (collectionCardPublic, error) {
	c, level, err := s.collectionAccess(ctx, collectionID, user)
	if err != nil || level != "editor" {
		return collectionCardPublic{}, errNotFound
	}
	db, ok := s.collectionDB()
	if !ok {
		return collectionCardPublic{}, newStatusError(http.StatusServiceUnavailable, "Collections are unavailable")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, member := range chat.Members {
		if _, err := db.ExecContext(ctx, `INSERT INTO storage_collection_grants (collection_id,principal_type,principal_id,access_level,created_at,updated_at) VALUES ($1,'user',$2,'viewer',$3,$3) ON CONFLICT (collection_id,principal_type,principal_id) DO NOTHING`, c.ID, member.ID, now); err != nil {
			return collectionCardPublic{}, err
		}
	}
	return collectionCardPublic{ID: c.ID, Title: c.Title, DisplayKind: c.DisplayKind, ContentType: c.ContentType, ItemCount: c.ItemCount, Available: true}, nil
}

func (s *Server) recordMessageCollectionCard(ctx context.Context, messageID, collectionID string) error {
	db, ok := s.collectionDB()
	if !ok {
		return newStatusError(http.StatusServiceUnavailable, "Collections are unavailable")
	}
	_, err := db.ExecContext(ctx, `INSERT INTO message_collection_cards (message_id,collection_id) VALUES ($1,$2) ON CONFLICT (message_id) DO UPDATE SET collection_id=EXCLUDED.collection_id`, messageID, collectionID)
	return err
}

func (s *Server) collectionCardForMessage(ctx context.Context, messageID, viewerID string) *collectionCardPublic {
	db, ok := s.collectionDB()
	if !ok {
		return nil
	}
	var collectionID string
	if db.QueryRowContext(ctx, `SELECT collection_id FROM message_collection_cards WHERE message_id=$1`, messageID).Scan(&collectionID) != nil {
		return nil
	}
	viewer, err := s.getUserByID(viewerID)
	if err != nil {
		return &collectionCardPublic{Available: false}
	}
	c, _, err := s.collectionAccess(ctx, collectionID, viewer)
	if err != nil {
		return &collectionCardPublic{Available: false}
	}
	return &collectionCardPublic{ID: c.ID, Title: c.Title, DisplayKind: c.DisplayKind, ContentType: c.ContentType, ItemCount: c.ItemCount, Available: true}
}

func (s *Server) collectionRoutes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.listCollections(w, r, user) }))
	r.Post("/", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.createCollection(w, r, user) }))
	r.Get("/{collectionId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.getCollection(w, r, user) }))
	r.Patch("/{collectionId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.updateCollection(w, r, user) }))
	r.Delete("/{collectionId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.deleteCollection(w, r, user) }))
	r.Get("/{collectionId}/items", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.listCollectionItems(w, r, user) }))
	r.Post("/{collectionId}/items", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.addCollectionItem(w, r, user) }))
	r.Delete("/{collectionId}/items/{fileId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.removeCollectionItem(w, r, user) }))
	r.Get("/{collectionId}/grants", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.listCollectionGrants(w, r, user) }))
	r.Put("/{collectionId}/grants", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.upsertCollectionGrant(w, r, user) }))
	r.Delete("/{collectionId}/grants/{principalType}/{principalId}", s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) { s.deleteCollectionGrant(w, r, user) }))
	return r
}

func collectionJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func collectionError(w http.ResponseWriter, status int, detail string) {
	collectionJSON(w, status, map[string]string{"detail": detail})
}
func collectionID(r *http.Request) string { return strings.TrimSpace(chi.URLParam(r, "collectionId")) }

func (s *Server) listCollections(w http.ResponseWriter, r *http.Request, user userPublic) {
	db, ok := s.collectionDB()
	if !ok {
		collectionError(w, 503, "Collections are unavailable")
		return
	}
	rows, err := db.QueryContext(r.Context(), `SELECT c.id FROM storage_collections c WHERE c.family_id=$1 AND c.deleted_at IS NULL
		AND (c.owner_id=$2 OR $3 OR EXISTS(SELECT 1 FROM storage_collection_grants g WHERE g.collection_id=c.id AND ((g.principal_type='user' AND g.principal_id=$2) OR (g.principal_type='role' AND g.principal_id=$4)))) ORDER BY c.updated_at DESC`, user.FamilyID, user.ID, hasPermission(user, permissionManageFiles), user.RoleID)
	if err != nil {
		collectionError(w, 500, "Could not load collections")
		return
	}
	defer rows.Close()
	items := make([]collectionPublic, 0)
	for rows.Next() {
		var id string
		if rows.Scan(&id) != nil {
			continue
		}
		c, _, err := s.collectionAccess(r.Context(), id, user)
		if err == nil {
			items = append(items, c)
		}
	}
	collectionJSON(w, 200, items)
}

func (s *Server) createCollection(w http.ResponseWriter, r *http.Request, user userPublic) {
	var p struct {
		Title       string  `json:"title"`
		DisplayKind string  `json:"displayKind"`
		ContentType string  `json:"contentType"`
		CoverFileID *string `json:"coverFileId"`
	}
	if json.NewDecoder(r.Body).Decode(&p) != nil {
		collectionError(w, 422, "Invalid request body")
		return
	}
	p.Title = strings.TrimSpace(p.Title)
	p.DisplayKind = strings.TrimSpace(p.DisplayKind)
	p.ContentType = strings.TrimSpace(p.ContentType)
	if p.Title == "" || len([]rune(p.Title)) > 120 || !validCollectionKind(p.DisplayKind) || !validCollectionContent(p.ContentType) {
		collectionError(w, 422, "Invalid collection details")
		return
	}
	db, ok := s.collectionDB()
	if !ok {
		collectionError(w, 503, "Collections are unavailable")
		return
	}
	if p.CoverFileID != nil && *p.CoverFileID != "" {
		f, err := s.buildFilePublic(*p.CoverFileID, user.ID)
		if err != nil || !s.fileVisibleToUser(r.Context(), f, user) {
			collectionError(w, 404, "Cover file not found")
			return
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := uuid.NewString()
	_, err := db.ExecContext(r.Context(), `INSERT INTO storage_collections (id,family_id,owner_id,title,display_kind,content_type,cover_file_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`, id, user.FamilyID, user.ID, p.Title, p.DisplayKind, p.ContentType, p.CoverFileID, now)
	if err != nil {
		collectionError(w, 500, "Could not create collection")
		return
	}
	c, _, _ := s.collectionAccess(r.Context(), id, user)
	collectionJSON(w, 201, c)
}

func (s *Server) getCollection(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, _, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil {
		collectionError(w, 404, "Collection not found")
		return
	}
	collectionJSON(w, 200, c)
}
func (s *Server) updateCollection(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	var p struct {
		Title       *string         `json:"title"`
		DisplayKind *string         `json:"displayKind"`
		ContentType *string         `json:"contentType"`
		CoverFileID json.RawMessage `json:"coverFileId"`
	}
	if json.NewDecoder(r.Body).Decode(&p) != nil {
		collectionError(w, 422, "Invalid request body")
		return
	}
	if p.Title != nil {
		v := strings.TrimSpace(*p.Title)
		if v == "" || len([]rune(v)) > 120 {
			collectionError(w, 422, "Invalid title")
			return
		}
		c.Title = v
	}
	if p.DisplayKind != nil {
		if !validCollectionKind(*p.DisplayKind) {
			collectionError(w, 422, "Invalid display kind")
			return
		}
		c.DisplayKind = *p.DisplayKind
	}
	if p.ContentType != nil {
		if !validCollectionContent(*p.ContentType) {
			collectionError(w, 422, "Invalid content type")
			return
		}
		c.ContentType = *p.ContentType
	}
	if p.CoverFileID != nil {
		if string(p.CoverFileID) == "null" {
			c.CoverFileID = nil
		} else {
			var coverFileID string
			if json.Unmarshal(p.CoverFileID, &coverFileID) != nil || strings.TrimSpace(coverFileID) == "" {
				collectionError(w, 422, "Invalid cover file")
				return
			}
			f, fileErr := s.buildFilePublic(coverFileID, user.ID)
			if fileErr != nil || !s.fileVisibleToUser(r.Context(), f, user) {
				collectionError(w, 404, "Cover file not found")
				return
			}
			c.CoverFileID = &coverFileID
		}
	}
	db, _ := s.collectionDB()
	_, err = db.ExecContext(r.Context(), `UPDATE storage_collections SET title=$2,display_kind=$3,content_type=$4,cover_file_id=$5,updated_at=$6 WHERE id=$1`, c.ID, c.Title, c.DisplayKind, c.ContentType, c.CoverFileID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		collectionError(w, 500, "Could not update collection")
		return
	}
	c, _, _ = s.collectionAccess(r.Context(), c.ID, user)
	collectionJSON(w, 200, c)
}
func (s *Server) deleteCollection(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	db, _ := s.collectionDB()
	_, err = db.ExecContext(r.Context(), `UPDATE storage_collections SET deleted_at=$2,updated_at=$2 WHERE id=$1`, c.ID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		collectionError(w, 500, "Could not delete collection")
		return
	}
	w.WriteHeader(204)
}
func (s *Server) listCollectionItems(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, _, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil {
		collectionError(w, 404, "Collection not found")
		return
	}
	db, _ := s.collectionDB()
	rows, err := db.QueryContext(r.Context(), `SELECT file_id FROM storage_collection_items WHERE collection_id=$1 ORDER BY created_at DESC`, c.ID)
	if err != nil {
		collectionError(w, 500, "Could not load collection files")
		return
	}
	defer rows.Close()
	files := make([]filePublic, 0)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			if f, err := s.buildFilePublic(id, user.ID); err == nil && f.DeletedAt == nil {
				files = append(files, f)
			}
		}
	}
	collectionJSON(w, 200, files)
}
func (s *Server) addCollectionItem(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	var p struct {
		FileID      string `json:"fileId"`
		MakePrivate bool   `json:"makePrivate"`
	}
	if json.NewDecoder(r.Body).Decode(&p) != nil || strings.TrimSpace(p.FileID) == "" {
		collectionError(w, 422, "fileId is required")
		return
	}
	f, err := s.buildFilePublic(p.FileID, user.ID)
	if err != nil || f.FamilyID != user.FamilyID || !s.fileVisibleToUser(r.Context(), f, user) {
		collectionError(w, 404, "File not found")
		return
	}
	if !collectionContentAllows(c.ContentType, f.MimeType) {
		collectionError(w, 422, "File type does not match this collection")
		return
	}
	db, _ := s.collectionDB()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = db.ExecContext(r.Context(), `INSERT INTO storage_collection_items (collection_id,file_id,added_by,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, c.ID, f.ID, user.ID, now)
	if err == nil && p.MakePrivate {
		_, err = db.ExecContext(r.Context(), `UPDATE files SET access_scope='private' WHERE id=$1 AND family_id=$2 AND uploaded_by=$3 AND chat_id IS NULL`, f.ID, user.FamilyID, user.ID)
	}
	if err == nil {
		_, err = db.ExecContext(r.Context(), `UPDATE storage_collections SET updated_at=$2 WHERE id=$1`, c.ID, now)
	}
	if err != nil {
		collectionError(w, 500, "Could not add file")
		return
	}
	collectionJSON(w, 201, f)
}
func (s *Server) removeCollectionItem(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	db, _ := s.collectionDB()
	fileID := strings.TrimSpace(chi.URLParam(r, "fileId"))
	_, err = db.ExecContext(r.Context(), `DELETE FROM storage_collection_items WHERE collection_id=$1 AND file_id=$2`, c.ID, fileID)
	if err != nil {
		collectionError(w, 500, "Could not remove file")
		return
	}
	_, _ = db.ExecContext(r.Context(), `UPDATE storage_collections SET cover_file_id=NULL,updated_at=$2 WHERE id=$1 AND cover_file_id=$3`, c.ID, time.Now().UTC().Format(time.RFC3339Nano), fileID)
	w.WriteHeader(204)
}
func (s *Server) listCollectionGrants(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	db, _ := s.collectionDB()
	rows, err := db.QueryContext(r.Context(), `SELECT principal_type,principal_id,access_level FROM storage_collection_grants WHERE collection_id=$1 ORDER BY principal_type,principal_id`, c.ID)
	if err != nil {
		collectionError(w, 500, "Could not load collection access")
		return
	}
	defer rows.Close()
	grants := make([]collectionGrantPublic, 0)
	for rows.Next() {
		var g collectionGrantPublic
		if rows.Scan(&g.PrincipalType, &g.PrincipalID, &g.AccessLevel) == nil {
			grants = append(grants, g)
		}
	}
	collectionJSON(w, 200, grants)
}
func (s *Server) upsertCollectionGrant(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	var p collectionGrantPublic
	if json.NewDecoder(r.Body).Decode(&p) != nil || !(p.PrincipalType == "user" || p.PrincipalType == "role") || !validCollectionLevel(p.AccessLevel) || strings.TrimSpace(p.PrincipalID) == "" {
		collectionError(w, 422, "Invalid access grant")
		return
	}
	if p.PrincipalType == "user" {
		target, e := s.getUserByID(p.PrincipalID)
		if e != nil || target.FamilyID != user.FamilyID {
			collectionError(w, 422, "Invalid member")
			return
		}
	} else if _, e := s.roles.Get(r.Context(), user.FamilyID, p.PrincipalID); e != nil {
		collectionError(w, 422, "Invalid role")
		return
	}
	db, _ := s.collectionDB()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = db.ExecContext(r.Context(), `INSERT INTO storage_collection_grants (collection_id,principal_type,principal_id,access_level,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (collection_id,principal_type,principal_id) DO UPDATE SET access_level=EXCLUDED.access_level,updated_at=EXCLUDED.updated_at`, c.ID, p.PrincipalType, p.PrincipalID, p.AccessLevel, now)
	if err != nil {
		collectionError(w, 500, "Could not update collection access")
		return
	}
	collectionJSON(w, 200, p)
}
func (s *Server) deleteCollectionGrant(w http.ResponseWriter, r *http.Request, user userPublic) {
	c, level, err := s.collectionAccess(r.Context(), collectionID(r), user)
	if err != nil || level != "editor" {
		collectionError(w, 404, "Collection not found")
		return
	}
	kind := strings.TrimSpace(chi.URLParam(r, "principalType"))
	id := strings.TrimSpace(chi.URLParam(r, "principalId"))
	if !(kind == "user" || kind == "role") || id == "" {
		collectionError(w, 422, "Invalid access grant")
		return
	}
	db, _ := s.collectionDB()
	_, err = db.ExecContext(r.Context(), `DELETE FROM storage_collection_grants WHERE collection_id=$1 AND principal_type=$2 AND principal_id=$3`, c.ID, kind, id)
	if err != nil {
		collectionError(w, 500, "Could not remove collection access")
		return
	}
	w.WriteHeader(204)
}
