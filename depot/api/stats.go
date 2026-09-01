package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
)

func accessibleBucketIDs(c *gin.Context) ([]string, error) {
	buckets, err := service.GetAllBuckets()
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, bucket := range buckets {
		if RequestTokenCanReadBucket(c, bucket) {
			ids = append(ids, bucket.ID)
		}
	}
	return ids, nil
}

func GetStats(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	bucketIDs, err := accessibleBucketIDs(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	stats, err := service.GetStats(bucketIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func GetActivityStats(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	days, err := strconv.Atoi(c.DefaultQuery("days", "30"))
	if err != nil || days < 1 || days > 365 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "days must be an integer between 1 and 365"})
		return
	}
	bucketIDs, err := accessibleBucketIDs(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	points, err := service.GetActivityStats(bucketIDs, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, points)
}

func GetUploaderStats(c *gin.Context) {
	getAttributionStats(c, service.AttributionFilter{EntityID: strings.TrimSpace(c.Param("entityID"))})
}

func GetApplicationStats(c *gin.Context) {
	getAttributionStats(c, service.AttributionFilter{ClientID: strings.TrimSpace(c.Param("clientID"))})
}

func getAttributionStats(c *gin.Context, filter service.AttributionFilter) {
	Require(c, RequestTokenExists(c))
	if filter.EntityID == "" && filter.ClientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "attribution identifier is required"})
		return
	}

	bucketIDs, err := accessibleBucketIDs(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	stats, err := service.GetAttributionStats(bucketIDs, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}
