package service

import (
	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	ulid "github.com/gaucho-racing/ulid-go"
)

// Actor is the resolved principal behind a request: which entity acted, which
// application's token they presented, and what kind of credential it was.
type Actor struct {
	EntityID string
	ClientID string
	Type     model.ActorType
}

func RecordAccess(file model.File, action model.AccessAction, actor Actor) {
	log := model.AccessLog{
		ID:         ulid.Make().Prefixed("acc"),
		FileID:     file.ID,
		FileName:   file.Name,
		BucketID:   file.BucketID,
		BucketName: file.BucketName,
		Action:     action,
		EntityID:   actor.EntityID,
		ClientID:   actor.ClientID,
		ActorType:  actor.Type,
		Public:     actor.Type == model.ActorTypeAnonymous,
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
