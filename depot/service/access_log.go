package service

import (
	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	ulid "github.com/gaucho-racing/ulid-go"
)

func RecordAccess(file model.File, action model.AccessAction, entityID string, public bool) {
	log := model.AccessLog{
		ID:         ulid.Make().Prefixed("acc"),
		FileID:     file.ID,
		FileName:   file.Name,
		BucketID:   file.BucketID,
		BucketName: file.BucketName,
		Action:     action,
		EntityID:   entityID,
		Public:     public,
	}
	go func() {
		if err := database.DB.Create(&log).Error; err != nil {
			logger.SugarLogger.Errorf("failed to record access log for %s: %v", file.ID, err)
		}
	}()
}

func ListFileAccessLogs(fileID string, limit int) ([]model.AccessLog, error) {
	logs := []model.AccessLog{}
	if err := database.DB.Where("file_id = ?", fileID).Order("created_at desc").Limit(limit).Find(&logs).Error; err != nil {
		return nil, err
	}
	return logs, nil
}
