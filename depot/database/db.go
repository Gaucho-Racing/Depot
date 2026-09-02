package database

import (
	"fmt"
	"time"

	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

var dbRetries = 0

func Init() {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=UTC",
		config.DatabaseHost, config.DatabaseUser, config.DatabasePassword, config.DatabaseName, config.DatabasePort)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		if dbRetries < 5 {
			dbRetries++
			logger.SugarLogger.Errorln("failed to connect database, retrying in 5s... ")
			time.Sleep(time.Second * 5)
			Init()
			return
		}
		logger.SugarLogger.Fatalf("failed to connect database after 5 attempts")
		return
	}

	logger.SugarLogger.Infoln("Connected to database")
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm").Error; err != nil {
		logger.SugarLogger.Fatalf("failed to enable pg_trgm: %v", err)
		return
	}

	// Renames from the terminal → storage backend nomenclature change;
	// AutoMigrate can't rename, so handle existing dev databases explicitly.
	if db.Migrator().HasTable("depot_terminal") && !db.Migrator().HasTable("depot_storage_backend") {
		if err := db.Migrator().RenameTable("depot_terminal", "depot_storage_backend"); err != nil {
			logger.SugarLogger.Fatalf("failed to rename depot_terminal: %v", err)
		}
	}
	if db.Migrator().HasTable("depot_file_replica") {
		if err := db.Migrator().DropTable("depot_file_replica"); err != nil {
			logger.SugarLogger.Fatalf("failed to drop depot_file_replica: %v", err)
		}
	}

	if err := db.AutoMigrate(
		&model.Bucket{},
		&model.File{},
		&model.AccessLog{},
		&model.StorageBackend{},
		&model.BucketGrant{},
	); err != nil {
		logger.SugarLogger.Fatalf("failed to run database migrations: %v", err)
		return
	}
	searchIndexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_depot_bucket_search ON depot_bucket USING GIN ((lower(coalesce(id, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, ''))) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_depot_file_search ON depot_file USING GIN ((lower(coalesce(id, '') || ' ' || coalesce(bucket_name, '') || ' ' || coalesce(original_name, '') || ' ' || coalesce(path, '') || ' ' || coalesce(content_type, '') || ' ' || coalesce(storage_backend, '') || ' ' || coalesce(created_by_entity_id, '') || ' ' || coalesce(created_by_client_id, ''))) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_depot_storage_backend_search ON depot_storage_backend USING GIN ((lower(coalesce(id, '') || ' ' || coalesce(name, '') || ' ' || coalesce(region, '') || ' ' || coalesce(bucket, '') || ' ' || coalesce(endpoint, ''))) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_depot_bucket_grant_search ON depot_bucket_grant USING GIN ((lower(coalesce(id, '') || ' ' || coalesce(bucket_name, '') || ' ' || coalesce(client_id, '') || ' ' || coalesce(description, ''))) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_depot_access_log_search ON depot_access_log USING GIN ((lower(coalesce(id, '') || ' ' || coalesce(file_id, '') || ' ' || coalesce(file_name, '') || ' ' || coalesce(bucket_name, '') || ' ' || coalesce(entity_id, '') || ' ' || coalesce(client_id, ''))) gin_trgm_ops)`,
	}
	for _, statement := range searchIndexes {
		if err := db.Exec(statement).Error; err != nil {
			logger.SugarLogger.Fatalf("failed to create search index: %v", err)
			return
		}
	}
	logger.SugarLogger.Infoln("AutoMigration complete")
	DB = db
}
