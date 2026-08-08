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

	// Renames from the terminal → storage backend nomenclature change;
	// AutoMigrate can't rename, so handle existing dev databases explicitly.
	if db.Migrator().HasTable("depot_terminal") && !db.Migrator().HasTable("depot_storage_backend") {
		if err := db.Migrator().RenameTable("depot_terminal", "depot_storage_backend"); err != nil {
			logger.SugarLogger.Fatalf("failed to rename depot_terminal: %v", err)
		}
	}
	if db.Migrator().HasTable("depot_file_replica") && db.Migrator().HasColumn(&model.FileReplica{}, "terminal") {
		if err := db.Migrator().RenameColumn(&model.FileReplica{}, "terminal", "storage_backend"); err != nil {
			logger.SugarLogger.Fatalf("failed to rename depot_file_replica.terminal: %v", err)
		}
	}
	if db.Migrator().HasIndex(&model.FileReplica{}, "idx_depot_file_replica_terminal") {
		if err := db.Migrator().DropIndex(&model.FileReplica{}, "idx_depot_file_replica_terminal"); err != nil {
			logger.SugarLogger.Errorf("failed to drop stale replica index: %v", err)
		}
	}

	if err := db.AutoMigrate(
		&model.Bucket{},
		&model.File{},
		&model.AccessLog{},
		&model.StorageBackend{},
		&model.FileReplica{},
	); err != nil {
		logger.SugarLogger.Fatalf("failed to run database migrations: %v", err)
		return
	}
	logger.SugarLogger.Infoln("AutoMigration complete")
	DB = db
}
