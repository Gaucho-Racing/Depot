package service

import (
	"testing"
	"time"

	"github.com/gaucho-racing/depot/depot/pkg/sentinel"
)

func TestUniqueIdentityIDs(t *testing.T) {
	got := uniqueIdentityIDs([]string{" ent_one ", "", "ent_two", "ent_one"})
	if len(got) != 2 || got[0] != "ent_one" || got[1] != "ent_two" {
		t.Fatalf("unique IDs = %#v", got)
	}
}

func TestUniqueClientIDs(t *testing.T) {
	got := uniqueClientIDs([]string{" client_one ", "", "client_two", "client_one"})
	if len(got) != 2 || got[0] != "client_one" || got[1] != "client_two" {
		t.Fatalf("unique client IDs = %#v", got)
	}
}

func TestCachedIdentityResultsPreservesOrderAndReportsMissing(t *testing.T) {
	identitiesMu.Lock()
	original := cachedIdentities
	cachedIdentities = map[string]cachedIdentity{
		"ent_one": {
			summary:   sentinel.IdentitySummary{ID: "ent_one", Name: "One"},
			fetchedAt: time.Now(),
		},
		"ent_two": {
			summary:   sentinel.IdentitySummary{ID: "ent_two", Name: "Two"},
			fetchedAt: time.Now(),
		},
	}
	defer func() {
		cachedIdentities = original
		identitiesMu.Unlock()
	}()

	got, complete := cachedIdentityResults([]string{"ent_two", "ent_missing", "ent_one"})
	if complete {
		t.Fatal("expected incomplete cache result")
	}
	if len(got) != 2 || got[0].ID != "ent_two" || got[1].ID != "ent_one" {
		t.Fatalf("cached summaries = %#v", got)
	}
}
