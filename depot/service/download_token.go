package service

import (
	"time"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	ulid "github.com/gaucho-racing/ulid-go"
)

const DownloadTokenTTL = time.Hour

func CreateDownloadToken(file model.File, actor Actor) (model.DownloadToken, error) {
	now := time.Now()
	if err := database.DB.Where("expires_at <= ?", now).Delete(&model.DownloadToken{}).Error; err != nil {
		logger.SugarLogger.Warnf("failed to remove expired download tokens: %v", err)
	}

	token := model.DownloadToken{
		ID:        ulid.Make().Prefixed("dlt"),
		FileID:    file.ID,
		EntityID:  actor.EntityID,
		ClientID:  actor.ClientID,
		ActorType: actor.Type,
		ExpiresAt: now.Add(DownloadTokenTTL),
	}
	if err := database.DB.Create(&token).Error; err != nil {
		return model.DownloadToken{}, err
	}
	return token, nil
}

func ResolveDownloadToken(tokenID string) (model.DownloadToken, model.File, error) {
	var token model.DownloadToken
	if err := database.DB.Where("id = ? AND expires_at > ?", tokenID, time.Now()).First(&token).Error; err != nil {
		return model.DownloadToken{}, model.File{}, err
	}

	file, err := GetFileByID(token.FileID)
	if err != nil {
		return model.DownloadToken{}, model.File{}, err
	}
	return token, file, nil
}
