package config

import (
	"strconv"
	"time"

	"github.com/gaucho-racing/depot/depot/pkg/logger"
)

var PresignExpiryDuration time.Duration
var MaxProxyUploadBytesLimit int64

func Verify() {
	if Env == "" {
		Env = "PROD"
		logger.SugarLogger.Infof("ENV is not set, defaulting to %s", Env)
	}
	if Port == "" {
		Port = "9999"
		logger.SugarLogger.Infof("PORT is not set, defaulting to %s", Port)
	}
	if DatabaseHost == "" {
		DatabaseHost = "localhost"
		logger.SugarLogger.Infof("DATABASE_HOST is not set, defaulting to %s", DatabaseHost)
	}
	if DatabasePort == "" {
		DatabasePort = "5432"
		logger.SugarLogger.Infof("DATABASE_PORT is not set, defaulting to %s", DatabasePort)
	}
	if DatabaseUser == "" {
		DatabaseUser = "postgres"
		logger.SugarLogger.Infof("DATABASE_USER is not set, defaulting to %s", DatabaseUser)
	}
	if DatabasePassword == "" {
		DatabasePassword = "password"
		logger.SugarLogger.Infof("DATABASE_PASSWORD is not set, defaulting to %s", DatabasePassword)
	}
	if DatabaseName == "" {
		DatabaseName = "depot"
		logger.SugarLogger.Infof("DATABASE_NAME is not set, defaulting to %s", DatabaseName)
	}
	if SentinelURL == "" {
		logger.SugarLogger.Fatal("SENTINEL_URL is required")
	}
	if SentinelClientID == "" || SentinelClientSecret == "" {
		logger.SugarLogger.Warnf("SENTINEL_CLIENT_ID / SENTINEL_CLIENT_SECRET are not set, web login will be unavailable and no token will resolve as first-party (admin access unreachable)")
	}
	if SentinelSAToken == "" {
		logger.SugarLogger.Warnf("SENTINEL_SA_TOKEN is not set, the Sentinel application list will be unavailable")
	}
	if StorageBackend == "" {
		StorageBackend = "s3"
		logger.SugarLogger.Infof("STORAGE_BACKEND is not set, defaulting to %s", StorageBackend)
	}
	if StorageBackend == "s3" && S3Bucket != "" {
		if S3Region == "" {
			S3Region = "us-west-2"
			logger.SugarLogger.Infof("S3_REGION is not set, defaulting to %s", S3Region)
		}
	}
	if PresignExpiry == "" {
		PresignExpiry = "15m"
		logger.SugarLogger.Infof("PRESIGN_EXPIRY is not set, defaulting to %s", PresignExpiry)
	}
	duration, err := time.ParseDuration(PresignExpiry)
	if err != nil {
		logger.SugarLogger.Fatalf("PRESIGN_EXPIRY is not a valid duration: %v", err)
	}
	PresignExpiryDuration = duration
	if MaxProxyUploadBytes == "" {
		MaxProxyUploadBytes = "104857600"
		logger.SugarLogger.Infof("MAX_PROXY_UPLOAD_BYTES is not set, defaulting to %s (100MB)", MaxProxyUploadBytes)
	}
	limit, err := strconv.ParseInt(MaxProxyUploadBytes, 10, 64)
	if err != nil || limit <= 0 {
		logger.SugarLogger.Fatalf("MAX_PROXY_UPLOAD_BYTES is not a valid positive integer")
	}
	MaxProxyUploadBytesLimit = limit
}
