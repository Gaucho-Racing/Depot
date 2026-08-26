package service

import (
	"sync"
	"time"

	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/sentinel"
)

const applicationCacheTTL = 5 * time.Minute

var (
	applicationsMu      sync.Mutex
	cachedApplications  []sentinel.Application
	applicationsFetched time.Time
)

// ListApplications returns Sentinel's application list, cached in process.
// Every caller gets the same answer — the response is authorized by Depot, not
// per user — so one fetch serves everyone. A refresh failure falls back to the
// last known good list rather than breaking the grant pickers over a blip in
// Sentinel.
func ListApplications() ([]sentinel.Application, error) {
	applicationsMu.Lock()
	defer applicationsMu.Unlock()

	if cachedApplications != nil && time.Since(applicationsFetched) < applicationCacheTTL {
		return cachedApplications, nil
	}

	applications, err := sentinel.GetApplications()
	if err != nil {
		if cachedApplications != nil {
			logger.SugarLogger.Warnf("serving stale application list, refresh failed: %v", err)
			return cachedApplications, nil
		}
		return nil, err
	}
	cachedApplications = applications
	applicationsFetched = time.Now()
	return applications, nil
}
