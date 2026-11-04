package app

import (
	"context"
	"net/http"
	"sync"
	"testing"

	"stovo-messenger/backend/internal/repository"
)

func TestListChatsWithDuplicatePersonalArchives(t *testing.T) {
	server, httpServer, client := newTestServer(t)
	owner := setupOwner(t, client, httpServer.URL, "archive-owner", "Archive family")
	first, err := server.ensureMessageArchive(owner.User)
	if err != nil {
		t.Fatalf("create first archive: %v", err)
	}
	const duplicateID = "duplicate-archive"
	title := "Message Archive"
	err = testPersistenceStore(t, server).CreateChatWithMembers(context.Background(), repository.CreateChatParams{
		ID: duplicateID, FamilyID: owner.User.FamilyID, Type: "archive", Title: &title,
		CreatedBy: owner.User.ID, MediaVisibility: "members", EncryptionProtocol: "server_at_rest",
		CreatedAt: nowString(), MemberIDs: []string{owner.User.ID},
	})
	if err != nil {
		t.Fatalf("create duplicate archive: %v", err)
	}
	response := jsonRequest(t, client, http.MethodGet, httpServer.URL+"/api/chats", owner.AccessToken, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("list chats status = %d, want 200: %s", response.StatusCode, readBody(t, response))
	}
	chats := decodeJSON[[]chatPublic](t, response)
	seen := map[string]bool{}
	for _, chat := range chats {
		seen[chat.ID] = true
	}
	if !seen[first.ID] || !seen[duplicateID] {
		t.Fatalf("archive chats were lost: %#v", seen)
	}
}

func TestConcurrentPersonalArchiveCreation(t *testing.T) {
	server, httpServer, client := newTestServer(t)
	owner := setupOwner(t, client, httpServer.URL, "archive-race-owner", "Archive race family")
	// Delay each insert so concurrent requests reliably complete their lookup
	// before an unprotected creator commits its archive.
	_, err := server.sqlDB.Exec(`CREATE FUNCTION delay_archive_insert() RETURNS trigger AS $$
		BEGIN IF NEW.type = 'archive' THEN PERFORM pg_sleep(0.2); END IF; RETURN NEW; END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER delay_archive BEFORE INSERT ON chats FOR EACH ROW EXECUTE FUNCTION delay_archive_insert()`)
	if err != nil {
		t.Fatalf("install archive insert delay: %v", err)
	}
	const n = 2
	start := make(chan struct{})
	ids := make(chan string, n)
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			archive, err := server.ensureMessageArchive(owner.User)
			if err != nil {
				errs <- err
				return
			}
			ids <- archive.ID
		}()
	}
	close(start)
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		t.Errorf("ensure archive: %v", err)
	}
	seen := map[string]bool{}
	for id := range ids {
		seen[id] = true
	}
	if len(seen) != 1 {
		t.Fatalf("concurrent requests created %d archives, want 1: %v", len(seen), seen)
	}
}
