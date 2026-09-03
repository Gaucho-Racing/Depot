package storage

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3Backend struct {
	name     string
	client   *s3.Client
	presign  *s3.PresignClient
	uploader *manager.Uploader
	bucket   string
}

type S3Config struct {
	Name            string
	Bucket          string
	Region          string
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool
}

func NewS3Backend(ctx context.Context, cfg S3Config) (*S3Backend, error) {
	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.Region),
	}
	if cfg.AccessKeyID != "" && cfg.SecretAccessKey != "" {
		loadOptions = append(loadOptions, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		))
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
		o.UsePathStyle = cfg.ForcePathStyle
	})

	name := cfg.Name
	if name == "" {
		name = "s3"
	}
	return &S3Backend{
		name:     name,
		client:   client,
		presign:  s3.NewPresignClient(client),
		uploader: manager.NewUploader(client),
		bucket:   cfg.Bucket,
	}, nil
}

func (b *S3Backend) Name() string {
	return b.name
}

func (b *S3Backend) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	input := &s3.PutObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
		Body:   body,
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	_, err := b.uploader.Upload(ctx, input)
	return err
}

func (b *S3Backend) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	output, err := b.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var noSuchKey *types.NoSuchKey
		if errors.As(err, &noSuchKey) {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}
	return output.Body, nil
}

func (b *S3Backend) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	output, err := b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return ObjectInfo{}, ErrObjectNotFound
		}
		return ObjectInfo{}, err
	}
	info := ObjectInfo{
		SizeBytes:   aws.ToInt64(output.ContentLength),
		ContentType: aws.ToString(output.ContentType),
	}
	return info, nil
}

func (b *S3Backend) Delete(ctx context.Context, key string) error {
	_, err := b.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (b *S3Backend) PresignPut(ctx context.Context, key string, contentType string, expiry time.Duration) (PresignedRequest, error) {
	input := &s3.PutObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	request, err := b.presign.PresignPutObject(ctx, input, func(o *s3.PresignOptions) {
		o.Expires = expiry
	})
	if err != nil {
		return PresignedRequest{}, err
	}
	return PresignedRequest{
		URL:       request.URL,
		Method:    request.Method,
		ExpiresAt: time.Now().Add(expiry),
	}, nil
}
