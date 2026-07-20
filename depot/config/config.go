package config

import "os"

const Name = "depot"
const Version = "0.1.0"

var Env = os.Getenv("ENV")
var Port = os.Getenv("PORT")

var DatabaseHost = os.Getenv("DATABASE_HOST")
var DatabasePort = os.Getenv("DATABASE_PORT")
var DatabaseUser = os.Getenv("DATABASE_USER")
var DatabasePassword = os.Getenv("DATABASE_PASSWORD")
var DatabaseName = os.Getenv("DATABASE_NAME")

var SentinelURL = os.Getenv("SENTINEL_URL")
var SentinelClientID = os.Getenv("SENTINEL_CLIENT_ID")
var SentinelClientSecret = os.Getenv("SENTINEL_CLIENT_SECRET")
var SentinelRedirectURI = os.Getenv("SENTINEL_REDIRECT_URI")

var StorageBackend = os.Getenv("STORAGE_BACKEND")

var S3Bucket = os.Getenv("S3_BUCKET")
var S3Region = os.Getenv("S3_REGION")
var S3Endpoint = os.Getenv("S3_ENDPOINT")
var S3AccessKeyID = os.Getenv("S3_ACCESS_KEY_ID")
var S3SecretAccessKey = os.Getenv("S3_SECRET_ACCESS_KEY")
var S3ForcePathStyle = os.Getenv("S3_FORCE_PATH_STYLE")

var PresignExpiry = os.Getenv("PRESIGN_EXPIRY")
var MaxProxyUploadBytes = os.Getenv("MAX_PROXY_UPLOAD_BYTES")

func IsProduction() bool {
	return Env == "PROD"
}

func FormattedNameWithVersion() string {
	return Name + " v" + Version
}
