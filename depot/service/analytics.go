package service

import (
	"fmt"
	"sort"
	"time"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
)

const (
	awsS3StandardFirstTierGB       = 51_200.0
	awsS3StandardSecondTierGB      = 512_000.0
	awsS3StandardFirstTierRate     = 0.023
	awsS3StandardSecondTierRate    = 0.022
	awsS3StandardRemainingTierRate = 0.021
	awsS3PutRequestRate            = 0.000005
	awsS3GetRequestRate            = 0.0000004
	bytesPerBillingGB              = 1_000_000_000.0
)

type TransferPoint struct {
	Date             string `json:"date"`
	Uploads          int64  `json:"uploads"`
	Downloads        int64  `json:"downloads"`
	DownloadFailures int64  `json:"download_failures"`
	UploadBytes      int64  `json:"upload_bytes"`
	DownloadBytes    int64  `json:"download_bytes"`
}

type TransferTotals struct {
	Uploads          int64 `json:"uploads"`
	Downloads        int64 `json:"downloads"`
	DownloadFailures int64 `json:"download_failures"`
	UploadBytes      int64 `json:"upload_bytes"`
	DownloadBytes    int64 `json:"download_bytes"`
}

type BackendCostEstimate struct {
	StorageBackend           string                `json:"storage_backend"`
	Provider                 model.StorageProvider `json:"provider"`
	Region                   string                `json:"region"`
	FileCount                int64                 `json:"file_count"`
	StoredBytes              int64                 `json:"stored_bytes"`
	Uploads                  int64                 `json:"uploads"`
	Downloads                int64                 `json:"downloads"`
	UploadBytes              int64                 `json:"upload_bytes"`
	DownloadBytes            int64                 `json:"download_bytes"`
	MonthlyStorageUSD        float64               `json:"monthly_storage_usd"`
	PeriodRequestUSD         float64               `json:"period_request_usd"`
	MonthlyRequestRunRateUSD float64               `json:"monthly_request_run_rate_usd"`
	EstimatedMonthlyUSD      float64               `json:"estimated_monthly_usd"`
	Priced                   bool                  `json:"priced"`
}

type CostEstimate struct {
	Currency                 string                `json:"currency"`
	PricingAsOf              string                `json:"pricing_as_of"`
	PricingSource            string                `json:"pricing_source"`
	MonthlyStorageUSD        float64               `json:"monthly_storage_usd"`
	PeriodRequestUSD         float64               `json:"period_request_usd"`
	MonthlyRequestRunRateUSD float64               `json:"monthly_request_run_rate_usd"`
	EstimatedMonthlyUSD      float64               `json:"estimated_monthly_usd"`
	PricedBackendCount       int                   `json:"priced_backend_count"`
	UnpricedBackendCount     int                   `json:"unpriced_backend_count"`
	NetworkTransferIncluded  bool                  `json:"network_transfer_included"`
	Backends                 []BackendCostEstimate `json:"backends"`
}

type TransferAnalytics struct {
	Days              int             `json:"days"`
	From              string          `json:"from"`
	Through           string          `json:"through"`
	TrackingStartedAt *time.Time      `json:"tracking_started_at,omitempty"`
	Totals            TransferTotals  `json:"totals"`
	Daily             []TransferPoint `json:"daily"`
	CostEstimate      CostEstimate    `json:"cost_estimate"`
}

type transferAggregateRow struct {
	Day    time.Time
	Action model.AccessAction
	Count  int64
	Bytes  int64
}

type backendUsageRow struct {
	StorageBackend string
	FileCount      int64
	StoredBytes    int64
}

type backendTransferRow struct {
	StorageBackend string
	Action         model.AccessAction
	Count          int64
	Bytes          int64
}

func GetTransferAnalytics(bucketIDs []string, days int) (TransferAnalytics, error) {
	now := time.Now().UTC()
	through := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	from := through.AddDate(0, 0, -(days - 1))
	analytics := TransferAnalytics{
		Days:    days,
		From:    from.Format("2006-01-02"),
		Through: through.Format("2006-01-02"),
		Daily:   make([]TransferPoint, 0, days),
		CostEstimate: CostEstimate{
			Currency:                "USD",
			PricingAsOf:             "2026-08-31",
			PricingSource:           "https://aws.amazon.com/s3/pricing/",
			NetworkTransferIncluded: false,
			Backends:                []BackendCostEstimate{},
		},
	}

	indexByDay := make(map[string]int, days)
	for i := 0; i < days; i++ {
		date := from.AddDate(0, 0, i).Format("2006-01-02")
		indexByDay[date] = len(analytics.Daily)
		analytics.Daily = append(analytics.Daily, TransferPoint{Date: date})
	}
	if len(bucketIDs) == 0 {
		return analytics, nil
	}

	transferActions := []model.AccessAction{
		model.AccessActionUpload,
		model.AccessActionPresignUpload,
		model.AccessActionDownload,
		model.AccessActionDownloadFailed,
	}
	trackedLogs := database.DB.Model(&model.AccessLog{}).
		Where("bucket_id IN ? AND storage_backend != '' AND action IN ?", bucketIDs, transferActions)

	var tracking struct {
		StartedAt *time.Time
	}
	if err := trackedLogs.Select("min(created_at) AS started_at").Scan(&tracking).Error; err != nil {
		return TransferAnalytics{}, fmt.Errorf("failed to find transfer tracking start: %w", err)
	}
	analytics.TrackingStartedAt = tracking.StartedAt

	rows := []transferAggregateRow{}
	if err := trackedLogs.
		Where("created_at >= ? AND created_at < ?", from, through.AddDate(0, 0, 1)).
		Select("date_trunc('day', created_at) AS day, action, count(*) AS count, coalesce(sum(bytes_transferred), 0) AS bytes").
		Group("day, action").
		Order("day ASC").
		Scan(&rows).Error; err != nil {
		return TransferAnalytics{}, fmt.Errorf("failed to compute transfer analytics: %w", err)
	}
	for _, row := range rows {
		index, ok := indexByDay[row.Day.UTC().Format("2006-01-02")]
		if !ok {
			continue
		}
		point := &analytics.Daily[index]
		switch row.Action {
		case model.AccessActionUpload, model.AccessActionPresignUpload:
			point.Uploads += row.Count
			point.UploadBytes += row.Bytes
			analytics.Totals.Uploads += row.Count
			analytics.Totals.UploadBytes += row.Bytes
		case model.AccessActionDownload:
			point.Downloads += row.Count
			point.DownloadBytes += row.Bytes
			analytics.Totals.Downloads += row.Count
			analytics.Totals.DownloadBytes += row.Bytes
		case model.AccessActionDownloadFailed:
			point.DownloadFailures += row.Count
			analytics.Totals.DownloadFailures += row.Count
		}
	}

	costEstimate, err := getCostEstimate(bucketIDs, from, through.AddDate(0, 0, 1), days)
	if err != nil {
		return TransferAnalytics{}, err
	}
	analytics.CostEstimate = costEstimate
	return analytics, nil
}

func getCostEstimate(bucketIDs []string, from time.Time, until time.Time, days int) (CostEstimate, error) {
	estimate := CostEstimate{
		Currency:                "USD",
		PricingAsOf:             "2026-08-31",
		PricingSource:           "https://aws.amazon.com/s3/pricing/",
		NetworkTransferIncluded: false,
		Backends:                []BackendCostEstimate{},
	}

	usageRows := []backendUsageRow{}
	if err := database.DB.Model(&model.File{}).
		Where("status = ? AND bucket_id IN ? AND storage_backend != ''", model.FileStatusActive, bucketIDs).
		Select("storage_backend, count(*) AS file_count, coalesce(sum(size_bytes), 0) AS stored_bytes").
		Group("storage_backend").
		Scan(&usageRows).Error; err != nil {
		return CostEstimate{}, fmt.Errorf("failed to compute backend storage usage: %w", err)
	}

	transferRows := []backendTransferRow{}
	if err := database.DB.Model(&model.AccessLog{}).
		Where("bucket_id IN ? AND storage_backend != '' AND created_at >= ? AND created_at < ? AND action IN ?", bucketIDs, from, until, []model.AccessAction{
			model.AccessActionUpload,
			model.AccessActionPresignUpload,
			model.AccessActionDownload,
		}).
		Select("storage_backend, action, count(*) AS count, coalesce(sum(bytes_transferred), 0) AS bytes").
		Group("storage_backend, action").
		Scan(&transferRows).Error; err != nil {
		return CostEstimate{}, fmt.Errorf("failed to compute backend transfer usage: %w", err)
	}

	backends, err := ListStorageBackends()
	if err != nil {
		return CostEstimate{}, fmt.Errorf("failed to list storage backends for cost estimate: %w", err)
	}
	metadataByName := make(map[string]model.StorageBackend, len(backends))
	for _, backend := range backends {
		metadataByName[backend.Name] = backend
	}

	estimatesByName := map[string]*BackendCostEstimate{}
	for _, row := range usageRows {
		estimatesByName[row.StorageBackend] = &BackendCostEstimate{
			StorageBackend: row.StorageBackend,
			FileCount:      row.FileCount,
			StoredBytes:    row.StoredBytes,
		}
	}
	for _, row := range transferRows {
		backendEstimate, ok := estimatesByName[row.StorageBackend]
		if !ok {
			backendEstimate = &BackendCostEstimate{StorageBackend: row.StorageBackend}
			estimatesByName[row.StorageBackend] = backendEstimate
		}
		switch row.Action {
		case model.AccessActionUpload, model.AccessActionPresignUpload:
			backendEstimate.Uploads += row.Count
			backendEstimate.UploadBytes += row.Bytes
		case model.AccessActionDownload:
			backendEstimate.Downloads += row.Count
			backendEstimate.DownloadBytes += row.Bytes
		}
	}

	names := make([]string, 0, len(estimatesByName))
	for name := range estimatesByName {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		backendEstimate := estimatesByName[name]
		if backend, ok := metadataByName[name]; ok {
			backendEstimate.Provider = backend.Provider
			backendEstimate.Region = backend.Region
		}
		backendEstimate.Priced = supportsAWSS3StandardPricing(backendEstimate.Provider, backendEstimate.Region)
		if backendEstimate.Priced {
			backendEstimate.MonthlyStorageUSD = awsS3StandardStorageCost(backendEstimate.StoredBytes)
			backendEstimate.PeriodRequestUSD = float64(backendEstimate.Uploads)*awsS3PutRequestRate + float64(backendEstimate.Downloads)*awsS3GetRequestRate
			backendEstimate.MonthlyRequestRunRateUSD = backendEstimate.PeriodRequestUSD * 30 / float64(days)
			backendEstimate.EstimatedMonthlyUSD = backendEstimate.MonthlyStorageUSD + backendEstimate.MonthlyRequestRunRateUSD
			estimate.MonthlyStorageUSD += backendEstimate.MonthlyStorageUSD
			estimate.PeriodRequestUSD += backendEstimate.PeriodRequestUSD
			estimate.MonthlyRequestRunRateUSD += backendEstimate.MonthlyRequestRunRateUSD
			estimate.EstimatedMonthlyUSD += backendEstimate.EstimatedMonthlyUSD
			estimate.PricedBackendCount++
		} else {
			estimate.UnpricedBackendCount++
		}
		estimate.Backends = append(estimate.Backends, *backendEstimate)
	}
	return estimate, nil
}

func supportsAWSS3StandardPricing(provider model.StorageProvider, region string) bool {
	return provider == model.StorageProviderAWSS3 && (region == "us-east-1" || region == "us-west-2")
}

func awsS3StandardStorageCost(bytes int64) float64 {
	remainingGB := float64(bytes) / bytesPerBillingGB
	firstTierGB := min(remainingGB, awsS3StandardFirstTierGB)
	cost := firstTierGB * awsS3StandardFirstTierRate
	remainingGB -= firstTierGB
	if remainingGB <= 0 {
		return cost
	}
	secondTierGB := min(remainingGB, awsS3StandardSecondTierGB-awsS3StandardFirstTierGB)
	cost += secondTierGB * awsS3StandardSecondTierRate
	remainingGB -= secondTierGB
	if remainingGB > 0 {
		cost += remainingGB * awsS3StandardRemainingTierRate
	}
	return cost
}
