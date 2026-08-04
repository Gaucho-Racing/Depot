package service

import (
	"context"
	"fmt"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/storage"
	ulid "github.com/gaucho-racing/ulid-go"
)

func ListTerminals() ([]model.Terminal, error) {
	terminals := []model.Terminal{}
	if err := database.DB.Order("created_at asc").Find(&terminals).Error; err != nil {
		return nil, err
	}
	return terminals, nil
}

func GetTerminalByName(name string) (model.Terminal, error) {
	var terminal model.Terminal
	if err := database.DB.Where("name = ?", name).First(&terminal).Error; err != nil {
		return model.Terminal{}, err
	}
	return terminal, nil
}

func DefaultTerminal() (model.Terminal, error) {
	var terminal model.Terminal
	if err := database.DB.Where("\"default\" = true AND enabled = true").First(&terminal).Error; err == nil {
		return terminal, nil
	}
	if err := database.DB.Where("enabled = true").Order("created_at asc").First(&terminal).Error; err != nil {
		return model.Terminal{}, fmt.Errorf("no enabled storage terminal is configured")
	}
	return terminal, nil
}

func CreateTerminal(terminal model.Terminal) (model.Terminal, error) {
	terminal.ID = ulid.Make().Prefixed("term")
	if terminal.Default {
		if err := database.DB.Model(&model.Terminal{}).Where("\"default\" = true").Update("default", false).Error; err != nil {
			return model.Terminal{}, err
		}
	}
	if err := database.DB.Create(&terminal).Error; err != nil {
		return model.Terminal{}, err
	}
	if err := RebuildStorageBackends(); err != nil {
		return model.Terminal{}, err
	}
	return terminal, nil
}

func UpdateTerminal(terminal model.Terminal) (model.Terminal, error) {
	if terminal.Default {
		if err := database.DB.Model(&model.Terminal{}).Where("\"default\" = true AND id != ?", terminal.ID).Update("default", false).Error; err != nil {
			return model.Terminal{}, err
		}
	}
	if err := database.DB.Save(&terminal).Error; err != nil {
		return model.Terminal{}, err
	}
	if err := RebuildStorageBackends(); err != nil {
		return model.Terminal{}, err
	}
	return terminal, nil
}

func DeleteTerminal(terminal model.Terminal) error {
	var fileCount int64
	if err := database.DB.Model(&model.File{}).Where("storage_backend = ?", terminal.Name).Count(&fileCount).Error; err != nil {
		return err
	}
	var replicaCount int64
	if err := database.DB.Model(&model.FileReplica{}).Where("terminal = ?", terminal.Name).Count(&replicaCount).Error; err != nil {
		return err
	}
	if fileCount > 0 || replicaCount > 0 {
		return fmt.Errorf("terminal %s still holds %d files and %d replicas", terminal.Name, fileCount, replicaCount)
	}
	if err := database.DB.Delete(&terminal).Error; err != nil {
		return err
	}
	return RebuildStorageBackends()
}

func BuildTerminalBackend(ctx context.Context, terminal model.Terminal) (storage.Backend, error) {
	switch terminal.Provider {
	case model.TerminalProviderAWSS3, model.TerminalProviderS3Compatible:
		return storage.NewS3Backend(ctx, storage.S3Config{
			Name:            terminal.Name,
			Bucket:          terminal.Bucket,
			Region:          terminal.Region,
			Endpoint:        terminal.Endpoint,
			AccessKeyID:     terminal.AccessKeyID,
			SecretAccessKey: terminal.SecretAccessKey,
			ForcePathStyle:  terminal.ForcePathStyle,
		})
	default:
		return nil, fmt.Errorf("unsupported terminal provider: %s", terminal.Provider)
	}
}

func RebuildStorageBackends() error {
	terminals, err := ListTerminals()
	if err != nil {
		return err
	}
	next := map[string]storage.Backend{}
	for _, terminal := range terminals {
		if !terminal.Enabled {
			continue
		}
		backend, err := BuildTerminalBackend(context.Background(), terminal)
		if err != nil {
			return fmt.Errorf("failed to build backend for terminal %s: %w", terminal.Name, err)
		}
		next[terminal.Name] = backend
	}
	storage.ReplaceAll(next)
	return nil
}
