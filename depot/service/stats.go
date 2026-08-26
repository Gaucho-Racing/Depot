package service

import (
	"fmt"
	"time"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
)

type BucketStats struct {
	BucketID   string `json:"bucket_id"`
	BucketName string `json:"bucket_name"`
	FileCount  int64  `json:"file_count"`
	TotalBytes int64  `json:"total_bytes"`
}

type EntityStats struct {
	EntityID   string `json:"entity_id"`
	FileCount  int64  `json:"file_count"`
	TotalBytes int64  `json:"total_bytes"`
}

type ApplicationStats struct {
	ClientID   string `json:"client_id"`
	FileCount  int64  `json:"file_count"`
	TotalBytes int64  `json:"total_bytes"`
}

type Stats struct {
	TotalFiles      int64              `json:"total_files"`
	TotalBytes      int64              `json:"total_bytes"`
	TotalBuckets    int64              `json:"total_buckets"`
	Buckets         []BucketStats      `json:"buckets"`
	TopUploaders    []EntityStats      `json:"top_uploaders"`
	TopApplications []ApplicationStats `json:"top_applications"`
}

type ActivityPoint struct {
	Date      string `json:"date"`
	Uploads   int64  `json:"uploads"`
	Downloads int64  `json:"downloads"`
	Deletes   int64  `json:"deletes"`
}

func GetStats(bucketIDs []string) (Stats, error) {
	stats := Stats{
		Buckets:         []BucketStats{},
		TopUploaders:    []EntityStats{},
		TopApplications: []ApplicationStats{},
	}
	if len(bucketIDs) == 0 {
		return stats, nil
	}

	if err := database.DB.Model(&model.File{}).
		Where("status = ? AND bucket_id IN ?", model.FileStatusActive, bucketIDs).
		Select("count(*), coalesce(sum(size_bytes), 0)").
		Row().Scan(&stats.TotalFiles, &stats.TotalBytes); err != nil {
		return Stats{}, fmt.Errorf("failed to compute totals: %w", err)
	}

	stats.TotalBuckets = int64(len(bucketIDs))

	if err := database.DB.Model(&model.File{}).
		Where("status = ? AND bucket_id IN ?", model.FileStatusActive, bucketIDs).
		Select("bucket_id, bucket_name, count(*) as file_count, coalesce(sum(size_bytes), 0) as total_bytes").
		Group("bucket_id, bucket_name").
		Order("total_bytes desc").
		Scan(&stats.Buckets).Error; err != nil {
		return Stats{}, fmt.Errorf("failed to compute bucket stats: %w", err)
	}

	if err := database.DB.Model(&model.File{}).
		Where("status = ? AND bucket_id IN ?", model.FileStatusActive, bucketIDs).
		Select("created_by_entity_id as entity_id, count(*) as file_count, coalesce(sum(size_bytes), 0) as total_bytes").
		Group("created_by_entity_id").
		Order("file_count desc").
		Limit(10).
		Scan(&stats.TopUploaders).Error; err != nil {
		return Stats{}, fmt.Errorf("failed to compute top uploaders: %w", err)
	}

	if err := database.DB.Model(&model.File{}).
		Where("status = ? AND bucket_id IN ? AND created_by_client_id != ''", model.FileStatusActive, bucketIDs).
		Select("created_by_client_id as client_id, count(*) as file_count, coalesce(sum(size_bytes), 0) as total_bytes").
		Group("created_by_client_id").
		Order("file_count desc").
		Limit(10).
		Scan(&stats.TopApplications).Error; err != nil {
		return Stats{}, fmt.Errorf("failed to compute top applications: %w", err)
	}

	return stats, nil
}

func GetActivityStats(bucketIDs []string, days int) ([]ActivityPoint, error) {
	points := []ActivityPoint{}
	if len(bucketIDs) == 0 {
		return points, nil
	}

	since := time.Now().AddDate(0, 0, -days).Truncate(24 * time.Hour)
	rows := []struct {
		Day    time.Time
		Action model.AccessAction
		Count  int64
	}{}
	if err := database.DB.Model(&model.AccessLog{}).
		Where("bucket_id IN ? AND created_at >= ?", bucketIDs, since).
		Select("date_trunc('day', created_at) as day, action, count(*) as count").
		Group("day, action").
		Order("day asc").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to compute activity stats: %w", err)
	}

	indexByDay := map[string]int{}
	for i := 0; i <= days; i++ {
		date := since.AddDate(0, 0, i)
		if date.After(time.Now()) {
			break
		}
		key := date.Format("2006-01-02")
		indexByDay[key] = len(points)
		points = append(points, ActivityPoint{Date: key})
	}
	for _, row := range rows {
		i, ok := indexByDay[row.Day.Format("2006-01-02")]
		if !ok {
			continue
		}
		switch row.Action {
		case model.AccessActionUpload, model.AccessActionPresignUpload:
			points[i].Uploads += row.Count
		case model.AccessActionDownload, model.AccessActionPresignDownload:
			points[i].Downloads += row.Count
		case model.AccessActionDelete:
			points[i].Deletes += row.Count
		}
	}
	return points, nil
}
