package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/sentinel"
	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Run() {
	api := InitializeRouter()
	InitializeRoutes(api)
	err := api.Run(":" + config.Port)
	if err != nil {
		logger.SugarLogger.Fatalf("Failed to start server: %v", err)
	}
}

func InitializeRouter() *gin.Engine {
	if config.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		MaxAge:           12 * time.Hour,
		AllowCredentials: false,
	}))
	r.Use(AuthChecker())
	r.Use(UnauthorizedPanicHandler())
	return r
}

func InitializeRoutes(router *gin.Engine) {
	router.GET("/ping", Ping)

	router.POST("/auth/login", LoginWithSentinel)
	router.GET("/auth/session", GetSession)
	router.POST("/auth/refresh", RefreshSession)
	router.POST("/auth/logout", Logout)
	router.GET("/users/@me", GetCurrentUser)

	router.GET("/groups", ListSentinelGroups)
	router.GET("/applications", ListSentinelApplications)

	router.GET("/stats", GetStats)
	router.GET("/stats/activity", GetActivityStats)
	router.GET("/files/search", SearchFiles)

	router.GET("/storage-backends", ListStorageBackends)
	router.GET("/storage-backends/providers", ListStorageProviders)
	router.POST("/storage-backends", CreateStorageBackend)
	router.PATCH("/storage-backends/:backendName", UpdateStorageBackend)
	router.DELETE("/storage-backends/:backendName", DeleteStorageBackend)

	router.GET("/buckets", ListBuckets)
	router.POST("/buckets", CreateBucket)
	router.GET("/buckets/:bucketName", GetBucket)
	router.PUT("/buckets/:bucketName", UpdateBucket)
	router.DELETE("/buckets/:bucketName", DeleteBucket)

	router.GET("/buckets/:bucketName/grants", ListBucketGrants)
	router.POST("/buckets/:bucketName/grants", CreateBucketGrant)
	router.PATCH("/buckets/:bucketName/grants/:clientID", UpdateBucketGrant)
	router.DELETE("/buckets/:bucketName/grants/:clientID", DeleteBucketGrant)

	// File routes an application reaches with its own token, resolved by the
	// bucket's grants.
	router.GET("/buckets/:bucketName/files", ListFiles)
	router.POST("/buckets/:bucketName/files", UploadFile)
	router.GET("/buckets/:bucketName/files/:id", GetFile)
	router.GET("/buckets/:bucketName/files/:id/content", GetFileContent)
	router.GET("/buckets/:bucketName/files/:id/access-logs", GetFileAccessLogs)
	router.POST("/buckets/:bucketName/files/:id/download-url", CreateDownloadURL)

	router.POST("/buckets/:bucketName/uploads", InitiateUpload)
	router.POST("/buckets/:bucketName/uploads/:id/complete", CompleteUpload)

	// The same file operations for Depot's own web app, gated on a token minted
	// for Depot's OAuth client whose entity is in DepotAdmins rather than on a
	// bucket grant. Privileged file operations the application API deliberately
	// does not expose — updating or deleting a file — belong here.
	internal := router.Group("/internal", RequireInternal())

	internal.POST("/buckets/:bucketName/files", UploadFile)
	internal.GET("/buckets/:bucketName/files/:id/content", GetFileContent)
	internal.POST("/buckets/:bucketName/files/:id/download-url", CreateDownloadURL)
}

func AuthChecker() gin.HandlerFunc {
	return func(c *gin.Context) {
		if authRouteSkipsTokenValidation(c.Request.URL.Path) {
			c.Next()
			return
		}

		token := ""
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
		if token != "" {
			claims, err := sentinel.ValidateToken(token)
			if err != nil {
				logger.SugarLogger.Errorln("Failed to validate token: " + err.Error())
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
				return
			}
			setAuthContext(c, token, claims)
		}
		c.Next()
	}
}

func authRouteSkipsTokenValidation(path string) bool {
	return path == "/auth/login" ||
		path == "/auth/refresh" ||
		path == "/auth/logout"
}

func UnauthorizedPanicHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				if err == "Unauthorized" {
					c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "you are not authorized to access this resource"})
					return
				}
				logger.SugarLogger.Errorf("Unexpected panic: %v", err)
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprint(err)})
			}
		}()
		c.Next()
	}
}

func Require(c *gin.Context, condition bool) {
	if !condition {
		panic("Unauthorized")
	}
}

func Any(conditions ...bool) bool {
	for _, condition := range conditions {
		if condition {
			return true
		}
	}
	return false
}

func All(conditions ...bool) bool {
	for _, condition := range conditions {
		if !condition {
			return false
		}
	}
	return true
}

func RequestTokenExists(c *gin.Context) bool {
	_, exists := c.Get("Auth-Token")
	return exists
}

func RequestTokenHasScope(c *gin.Context, scope string) bool {
	for _, tokenScope := range strings.Fields(GetRequestTokenScopes(c)) {
		if tokenScope == scope {
			return true
		}
	}
	return false
}

func RequestTokenHasGroupName(c *gin.Context, groupName string) bool {
	for _, tokenGroup := range GetRequestTokenGroupNames(c) {
		if tokenGroup == groupName {
			return true
		}
	}
	return false
}

// RequestTokenIsFirstParty reports whether the token was minted for Depot's
// own Sentinel application, i.e. a human signed in through the web UI. Every
// Sentinel token carries exactly one audience — the client_id of the
// application it was issued for — so the audience is what separates Depot's
// own control plane from a calling application's data plane.
func RequestTokenIsFirstParty(c *gin.Context) bool {
	if config.SentinelClientID == "" {
		return false
	}
	return GetRequestTokenClientID(c) == config.SentinelClientID
}

// AdminGroupName is the Sentinel group whose members administer Depot.
const AdminGroupName = "DepotAdmins"

// RequestTokenIsAdmin authorizes Depot's internal surface. Both halves matter:
// the token must have been minted for Depot's own OAuth client, and its entity
// must belong to the DepotAdmins group. An application token can never
// reshape Depot regardless of what its entity's group memberships say.
// sentinel:all remains as first-party break-glass for Sentinel's own tooling.
func RequestTokenIsAdmin(c *gin.Context) bool {
	if !RequestTokenExists(c) {
		return false
	}
	if RequestTokenHasScope(c, "sentinel:all") {
		return true
	}
	return RequestTokenIsFirstParty(c) && RequestTokenHasGroupName(c, AdminGroupName)
}

// RequireInternal gates the /internal surface: the file operations Depot's own
// web app performs, authorized by administrator identity rather than by a
// bucket grant. Handlers under it can treat the request as authorized.
func RequireInternal() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !RequestTokenExists(c) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication is required",
			})
			return
		}
		if !RequestTokenIsAdmin(c) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "this endpoint is restricted to Depot administrators",
			})
			return
		}
		c.Set("Depot-Internal", true)
		c.Next()
	}
}

// RequestIsInternal reports whether the request arrived through the /internal
// surface, meaning RequireInternal already authorized it.
func RequestIsInternal(c *gin.Context) bool {
	value, exists := c.Get("Depot-Internal")
	if !exists {
		return false
	}
	internal, _ := value.(bool)
	return internal
}

// RequestTokenCanReadBucket and RequestTokenCanUploadToBucket are the data
// plane. Depot admins reach every bucket; every other caller is an application
// and needs an explicit grant. There is deliberately no group tier here —
// Sentinel groups gate administering Depot, not the files inside a bucket.
func RequestTokenCanReadBucket(c *gin.Context, bucket model.Bucket) bool {
	if !RequestTokenExists(c) {
		return false
	}
	if RequestTokenIsAdmin(c) {
		return true
	}
	if bucket.AllowAuthenticatedRead {
		return true
	}
	if RequestTokenIsFirstParty(c) {
		return false
	}
	return service.ClientCanReadBucket(bucket.ID, GetRequestTokenClientID(c))
}

// RequestTokenCanUploadToBucket is the public write path, reserved for
// applications holding a WRITE grant. Depot's own admins upload through
// /internal instead, so there is deliberately no admin bypass here.
func RequestTokenCanUploadToBucket(c *gin.Context, bucket model.Bucket) bool {
	if !RequestTokenExists(c) {
		return false
	}
	if RequestIsInternal(c) {
		return true
	}
	if RequestTokenIsFirstParty(c) {
		return false
	}
	return service.ClientCanWriteBucket(bucket.ID, GetRequestTokenClientID(c))
}

func GetRequestToken(c *gin.Context) string {
	token, _ := c.Get("Auth-Token")
	return contextString(token)
}

func GetRequestTokenScopes(c *gin.Context) string {
	scopes, _ := c.Get("Auth-Scope")
	return contextString(scopes)
}

func GetRequestTokenAudience(c *gin.Context) string {
	audience, _ := c.Get("Auth-Audience")
	return contextString(audience)
}

// GetRequestTokenClientID is the audience under the name it actually carries:
// the Sentinel client_id of the application the token was issued for.
func GetRequestTokenClientID(c *gin.Context) string {
	return GetRequestTokenAudience(c)
}

// requestActor resolves the principal behind the current request for audit
// records: the entity, the application whose token was presented, and the
// credential kind.
func requestActor(c *gin.Context) service.Actor {
	return service.Actor{
		EntityID: GetRequestTokenEntityID(c),
		ClientID: GetRequestTokenClientID(c),
		Type:     GetRequestActorType(c),
	}
}

// GetRequestActorType classifies the caller from Sentinel's `type` claim,
// which is set to service_account on service-account tokens and absent on
// user tokens.
func GetRequestActorType(c *gin.Context) model.ActorType {
	if !RequestTokenExists(c) {
		return model.ActorTypeAnonymous
	}
	if claimString(GetRequestTokenClaims(c), "type") == "service_account" {
		return model.ActorTypeServiceAccount
	}
	return model.ActorTypeUser
}

func GetRequestTokenClaims(c *gin.Context) map[string]interface{} {
	claims, exists := c.Get("Auth-Claims")
	if !exists {
		return nil
	}
	value, ok := claims.(map[string]interface{})
	if !ok {
		return nil
	}
	return value
}

func GetRequestTokenEntityID(c *gin.Context) string {
	entityID, _ := c.Get("Auth-EntityID")
	return contextString(entityID)
}

func GetRequestTokenUserID(c *gin.Context) string {
	return claimString(GetRequestTokenClaims(c), "user_id")
}

func GetRequestTokenGroupNames(c *gin.Context) []string {
	return claimStringSlice(GetRequestTokenClaims(c), "groups")
}

func setAuthContext(c *gin.Context, token string, claims map[string]interface{}) {
	c.Set("Auth-Token", token)
	c.Set("Auth-Claims", claims)
	c.Set("Auth-EntityID", claimString(claims, "sub"))
	c.Set("Auth-Scope", claimString(claims, "scope"))
	c.Set("Auth-UserID", claimString(claims, "user_id"))
	audiences := claimStringSlice(claims, "aud")
	if len(audiences) > 0 {
		c.Set("Auth-Audience", audiences[0])
	}
}

func contextString(value interface{}) string {
	if value == nil {
		return ""
	}
	str, ok := value.(string)
	if !ok {
		return ""
	}
	return str
}

func claimString(claims map[string]interface{}, key string) string {
	if claims == nil {
		return ""
	}
	value, ok := claims[key].(string)
	if !ok {
		return ""
	}
	return value
}

func claimStringSlice(claims map[string]interface{}, key string) []string {
	if claims == nil {
		return []string{}
	}
	switch value := claims[key].(type) {
	case []string:
		return value
	case []interface{}:
		result := make([]string, 0, len(value))
		for _, item := range value {
			if str, ok := item.(string); ok && str != "" {
				result = append(result, str)
			}
		}
		return result
	case string:
		if value == "" {
			return []string{}
		}
		return []string{value}
	default:
		return []string{}
	}
}
