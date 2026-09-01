package service

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"unicode"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/sentinel"
)

type SearchResult struct {
	Type     string  `json:"type"`
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Subtitle string  `json:"subtitle"`
	Href     string  `json:"href"`
	IconURL  string  `json:"icon_url,omitempty"`
	Score    float64 `json:"-"`
}

type OmniSearchOptions struct {
	Query                 string
	BucketIDs             []string
	IncludeAdminResources bool
	Limit                 int
}

type searchRow struct {
	Type       string
	ID         string
	Title      string
	Subtitle   string
	BucketName string
	FileID     string
	ClientID   string
	EntityID   string
	IconURL    string
	Score      float64
}

func OmniSearch(ctx context.Context, options OmniSearchOptions) ([]SearchResult, error) {
	query := strings.ToLower(strings.TrimSpace(options.Query))
	pattern := "%" + escapeLike(query) + "%"
	rows := []searchRow{}

	if len(options.BucketIDs) > 0 {
		bucketRows, err := searchBucketResources(query, pattern, options.BucketIDs, options.Limit)
		if err != nil {
			return nil, err
		}
		rows = append(rows, bucketRows...)
	}
	if options.IncludeAdminResources {
		adminRows, err := searchAdminResources(query, pattern, options.Limit)
		if err != nil {
			return nil, err
		}
		rows = append(rows, adminRows...)
	}

	applications := resolveSearchApplications(options.BucketIDs, options.IncludeAdminResources)
	identities := resolveSearchIdentities(ctx, options.BucketIDs, options.IncludeAdminResources)
	rows = enrichSearchRows(rows, applications, identities)
	rows = append(rows, searchAttribution(query, applications, identities)...)

	results := make([]SearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, resultFromRow(row))
	}
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Score == results[j].Score {
			return results[i].Title < results[j].Title
		}
		return results[i].Score > results[j].Score
	})
	if len(results) > options.Limit {
		results = results[:options.Limit]
	}
	if results == nil {
		results = []SearchResult{}
	}
	return results, nil
}

func searchBucketResources(query string, pattern string, bucketIDs []string, limit int) ([]searchRow, error) {
	rows := []searchRow{}
	sql := `
WITH results AS (
  SELECT 'bucket' AS type, id, name AS title, description AS subtitle, name AS bucket_name,
    '' AS file_id, '' AS client_id, '' AS entity_id,
    lower(coalesce(id, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, '')) AS search_text,
    '' AS extra_text
  FROM depot_bucket WHERE id IN ?
  UNION ALL
  SELECT 'file', id, coalesce(nullif(original_name, ''), id),
    concat_ws(' · ', bucket_name, nullif(path, ''), nullif(content_type, '')), bucket_name,
    id, created_by_client_id, created_by_entity_id,
    lower(coalesce(id, '') || ' ' || coalesce(bucket_name, '') || ' ' || coalesce(original_name, '') || ' ' || coalesce(path, '') || ' ' || coalesce(content_type, '') || ' ' || coalesce(storage_backend, '') || ' ' || coalesce(created_by_entity_id, '') || ' ' || coalesce(created_by_client_id, '')),
    lower(coalesce(tags::text, ''))
  FROM depot_file WHERE bucket_id IN ?
)
SELECT type, id, title, subtitle, bucket_name, file_id, client_id, entity_id,
  CASE WHEN lower(id) = ? OR lower(title) = ? THEN 2 ELSE 0 END +
  CASE WHEN lower(title) LIKE ? ESCAPE '\' THEN 0.5 ELSE 0 END +
  greatest(similarity(search_text, ?), word_similarity(?, search_text), similarity(extra_text, ?), word_similarity(?, extra_text)) AS score
FROM results
WHERE search_text ILIKE ? ESCAPE '\' OR search_text % ? OR ? <% search_text
  OR extra_text ILIKE ? ESCAPE '\' OR extra_text % ? OR ? <% extra_text
ORDER BY score DESC
LIMIT ?`
	if err := database.DB.Raw(sql, bucketIDs, bucketIDs, query, query, pattern, query, query, query, query, pattern, query, query, pattern, query, query, limit).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("search bucket resources: %w", err)
	}
	return rows, nil
}

func searchAdminResources(query string, pattern string, limit int) ([]searchRow, error) {
	rows := []searchRow{}
	sql := `
WITH results AS (
  SELECT 'storage_backend' AS type, id, name AS title,
    concat_ws(' · ', provider::text, nullif(region, ''), nullif(bucket, '')) AS subtitle,
    '' AS bucket_name, '' AS file_id, '' AS client_id, '' AS entity_id,
    lower(coalesce(id, '') || ' ' || coalesce(name, '') || ' ' || coalesce(region, '') || ' ' || coalesce(bucket, '') || ' ' || coalesce(endpoint, '')) AS search_text,
    lower(coalesce(provider::text, '')) AS extra_text
  FROM depot_storage_backend
  UNION ALL
  SELECT 'bucket_grant', id, client_id,
    concat_ws(' · ', access::text || ' access', bucket_name, nullif(description, '')), bucket_name,
    '', client_id, '',
    lower(coalesce(id, '') || ' ' || coalesce(bucket_name, '') || ' ' || coalesce(client_id, '') || ' ' || coalesce(description, '')),
    lower(coalesce(access::text, ''))
  FROM depot_bucket_grant
  UNION ALL
  SELECT 'file_replica', replica.id, replica.id,
    concat_ws(' · ', replica.status::text, replica.storage_backend, file.original_name), file.bucket_name,
    replica.file_id, '', '',
    lower(coalesce(replica.id, '') || ' ' || coalesce(replica.file_id, '') || ' ' || coalesce(replica.storage_backend, '') || ' ' || coalesce(replica.error, '')),
    lower(coalesce(replica.status::text, '') || ' ' || coalesce(file.original_name, '') || ' ' || coalesce(file.bucket_name, ''))
  FROM depot_file_replica replica JOIN depot_file file ON file.id = replica.file_id
  UNION ALL
  SELECT 'access_log', log.id, coalesce(nullif(log.file_name, ''), log.file_id),
    concat_ws(' · ', log.action::text, log.bucket_name, nullif(log.entity_id, ''), nullif(log.client_id, '')), log.bucket_name,
    log.file_id, log.client_id, log.entity_id,
    lower(coalesce(log.id, '') || ' ' || coalesce(log.file_id, '') || ' ' || coalesce(log.file_name, '') || ' ' || coalesce(log.bucket_name, '') || ' ' || coalesce(log.entity_id, '') || ' ' || coalesce(log.client_id, '')),
    lower(coalesce(log.action::text, '') || ' ' || coalesce(log.actor_type::text, ''))
  FROM depot_access_log log
)
SELECT type, id, title, subtitle, bucket_name, file_id, client_id, entity_id,
  CASE WHEN lower(id) = ? OR lower(title) = ? THEN 2 ELSE 0 END +
  CASE WHEN lower(title) LIKE ? ESCAPE '\' THEN 0.5 ELSE 0 END +
  greatest(similarity(search_text, ?), word_similarity(?, search_text), similarity(extra_text, ?), word_similarity(?, extra_text)) AS score
FROM results
WHERE search_text ILIKE ? ESCAPE '\' OR search_text % ? OR ? <% search_text
  OR extra_text ILIKE ? ESCAPE '\' OR extra_text % ? OR ? <% extra_text
ORDER BY score DESC
LIMIT ?`
	if err := database.DB.Raw(sql, query, query, pattern, query, query, query, query, pattern, query, query, pattern, query, query, limit).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("search admin resources: %w", err)
	}
	return rows, nil
}

func resolveSearchApplications(bucketIDs []string, includeAdminResources bool) map[string]sentinel.Application {
	clientIDs := []string{}
	if len(bucketIDs) > 0 {
		if err := database.DB.Model(&model.File{}).Where("bucket_id IN ? AND created_by_client_id <> ''", bucketIDs).Distinct().Pluck("created_by_client_id", &clientIDs).Error; err != nil {
			logger.SugarLogger.Warnf("search application IDs unavailable: %v", err)
			return map[string]sentinel.Application{}
		}
	}
	if includeAdminResources {
		grantClientIDs := []string{}
		if err := database.DB.Model(&model.BucketGrant{}).Where("client_id <> ''").Distinct().Pluck("client_id", &grantClientIDs).Error; err != nil {
			logger.SugarLogger.Warnf("search grant application IDs unavailable: %v", err)
		} else {
			clientIDs = append(clientIDs, grantClientIDs...)
		}
		logClientIDs := []string{}
		if err := database.DB.Model(&model.AccessLog{}).Where("client_id <> ''").Distinct().Pluck("client_id", &logClientIDs).Error; err != nil {
			logger.SugarLogger.Warnf("search access log application IDs unavailable: %v", err)
		} else {
			clientIDs = append(clientIDs, logClientIDs...)
		}
	}
	applications, err := ResolveApplications(clientIDs)
	if err != nil {
		logger.SugarLogger.Warnf("search application summaries unavailable: %v", err)
		return map[string]sentinel.Application{}
	}
	byClientID := make(map[string]sentinel.Application, len(applications))
	for _, application := range applications {
		byClientID[application.ClientID] = application
	}
	return byClientID
}

func resolveSearchIdentities(ctx context.Context, bucketIDs []string, includeAdminResources bool) map[string]sentinel.IdentitySummary {
	entityIDs := []string{}
	if len(bucketIDs) > 0 {
		if err := database.DB.Model(&model.File{}).Where("bucket_id IN ? AND created_by_entity_id <> ''", bucketIDs).Distinct().Pluck("created_by_entity_id", &entityIDs).Error; err != nil {
			logger.SugarLogger.Warnf("search identity IDs unavailable: %v", err)
			return map[string]sentinel.IdentitySummary{}
		}
	}
	if includeAdminResources {
		logEntityIDs := []string{}
		if err := database.DB.Model(&model.AccessLog{}).Where("entity_id <> ''").Distinct().Pluck("entity_id", &logEntityIDs).Error; err != nil {
			logger.SugarLogger.Warnf("search access log identity IDs unavailable: %v", err)
		} else {
			entityIDs = append(entityIDs, logEntityIDs...)
		}
	}
	identities, err := ResolveIdentities(ctx, entityIDs)
	if err != nil {
		logger.SugarLogger.Warnf("search identity summaries unavailable: %v", err)
		return map[string]sentinel.IdentitySummary{}
	}
	byID := make(map[string]sentinel.IdentitySummary, len(identities))
	for _, identity := range identities {
		byID[identity.ID] = identity
	}
	return byID
}

func enrichSearchRows(rows []searchRow, applications map[string]sentinel.Application, identities map[string]sentinel.IdentitySummary) []searchRow {
	for i := range rows {
		if rows[i].Type == "bucket_grant" {
			if application, exists := applications[rows[i].ClientID]; exists {
				rows[i].Title = application.Name
				rows[i].Subtitle = application.ClientID + " · " + rows[i].Subtitle
				rows[i].IconURL = application.IconURL
			}
		}
		if rows[i].Type == "access_log" {
			actorName := ""
			if identity, exists := identities[rows[i].EntityID]; exists {
				actorName = identity.Name
				rows[i].IconURL = identity.AvatarURL
			} else if application, exists := applications[rows[i].ClientID]; exists {
				actorName = application.Name
				rows[i].IconURL = application.IconURL
			}
			if actorName != "" {
				rows[i].Subtitle += " · " + actorName
			}
		}
	}
	return rows
}

func searchAttribution(query string, applications map[string]sentinel.Application, identities map[string]sentinel.IdentitySummary) []searchRow {
	rows := make([]searchRow, 0, len(applications)+len(identities))
	for _, application := range applications {
		text := strings.Join([]string{application.Name, application.ClientID, application.Description}, " ")
		if score := fuzzyScore(query, text); score > 0 {
			rows = append(rows, searchRow{Type: "application", ID: application.ClientID, Title: application.Name, Subtitle: application.ClientID, ClientID: application.ClientID, IconURL: application.IconURL, Score: score})
		}
	}
	for _, identity := range identities {
		text := strings.Join([]string{identity.Name, identity.Username, identity.ID}, " ")
		if score := fuzzyScore(query, text); score > 0 {
			iconURL := identity.AvatarURL
			if iconURL == "" && identity.Application != nil {
				iconURL = identity.Application.IconURL
			}
			rows = append(rows, searchRow{Type: "uploader", ID: identity.ID, Title: identity.Name, Subtitle: identitySubtitle(identity), EntityID: identity.ID, IconURL: iconURL, Score: score})
		}
	}
	return rows
}

func resultFromRow(row searchRow) SearchResult {
	result := SearchResult{Type: row.Type, ID: row.ID, Title: row.Title, Subtitle: row.Subtitle, IconURL: row.IconURL, Score: row.Score}
	switch row.Type {
	case "bucket":
		result.Href = "/buckets/" + url.PathEscape(row.BucketName)
	case "file", "file_replica", "access_log":
		result.Href = "/buckets/" + url.PathEscape(row.BucketName) + "?file=" + url.QueryEscape(row.FileID)
	case "storage_backend":
		result.Href = "/storage-backends"
	case "bucket_grant":
		result.Href = "/buckets/" + url.PathEscape(row.BucketName) + "/edit"
	case "application":
		result.Href = "/applications/" + url.PathEscape(row.ClientID)
	case "uploader":
		result.Href = "/uploaders/" + url.PathEscape(row.EntityID)
	}
	return result
}

func identitySubtitle(identity sentinel.IdentitySummary) string {
	if identity.Username != "" {
		return "@" + identity.Username
	}
	if identity.Type == "SERVICE_ACCOUNT" && identity.Application != nil {
		return "Service account · " + identity.Application.Name
	}
	return identity.Type
}

func fuzzyScore(query string, value string) float64 {
	query = normalizeSearchText(query)
	value = normalizeSearchText(value)
	if query == "" || value == "" {
		return 0
	}
	if query == value {
		return 2.5
	}
	bonus := 0.0
	if strings.Contains(value, query) {
		bonus = 0.5
	}
	queryTrigrams := trigrams(query)
	valueTrigrams := trigrams(value)
	intersection := 0
	for trigram := range queryTrigrams {
		if _, exists := valueTrigrams[trigram]; exists {
			intersection++
		}
	}
	if intersection == 0 {
		return bonus
	}
	return bonus + (2 * float64(intersection) / float64(len(queryTrigrams)+len(valueTrigrams)))
}

func normalizeSearchText(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return ' '
	}, value)
}

func trigrams(value string) map[string]struct{} {
	runes := []rune("  " + value + "  ")
	grams := make(map[string]struct{}, int(math.Max(1, float64(len(runes)-2))))
	for i := 0; i+2 < len(runes); i++ {
		grams[string(runes[i:i+3])] = struct{}{}
	}
	return grams
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}
