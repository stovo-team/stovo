package chattransfer

import (
	"encoding/json"
	"testing"
)

func FuzzValidateArchive(f *testing.F) {
	f.Add([]byte("{\"schemaVersion\":1,\"source\":{\"providerId\":\"telegram\",\"profileId\":\"telegram-desktop-json\"},\"conversation\":{\"sourceId\":\"chat-1\",\"title\":\"Planning\"},\"participants\":[],\"messages\":[],\"attachments\":[]}"))
	f.Add([]byte("{\"schemaVersion\":99}"))
	f.Add([]byte("not-json"))

	f.Fuzz(func(t *testing.T, data []byte) {
		var archive Archive
		if err := json.Unmarshal(data, &archive); err != nil {
			return
		}
		_ = ValidateArchive(archive)
	})
}
