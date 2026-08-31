package sentinel

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gaucho-racing/depot/depot/config"
)

func TestResolveIdentities(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/entities/resolve" {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer service-token" {
			t.Fatalf("authorization = %q", got)
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(body.IDs, []string{"ent_one", "ent_two"}) {
			t.Fatalf("ids = %#v", body.IDs)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]IdentitySummary{{ID: "ent_one", Type: "USER", Name: "Alex Rivera"}})
	}))
	defer server.Close()

	originalURL := config.SentinelURL
	originalToken := config.SentinelSAToken
	config.SentinelURL = server.URL
	config.SentinelSAToken = "service-token"
	defer func() {
		config.SentinelURL = originalURL
		config.SentinelSAToken = originalToken
	}()

	summaries, err := ResolveIdentities(context.Background(), []string{"ent_one", "ent_two"})
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 || summaries[0].Name != "Alex Rivera" {
		t.Fatalf("summaries = %#v", summaries)
	}
}
