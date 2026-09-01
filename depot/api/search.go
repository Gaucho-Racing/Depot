package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
)

func OmniSearch(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	query := strings.TrimSpace(c.Query("q"))
	if len([]rune(query)) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q must contain at least 2 characters"})
		return
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if err != nil || limit < 1 || limit > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be an integer between 1 and 50"})
		return
	}
	bucketIDs, err := accessibleBucketIDs(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	results, err := service.OmniSearch(c.Request.Context(), service.OmniSearchOptions{
		Query:                 query,
		BucketIDs:             bucketIDs,
		IncludeAdminResources: RequestTokenIsAdmin(c),
		Limit:                 limit,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"query": query, "results": results})
}
