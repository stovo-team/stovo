package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName                      string
	AppVersion                   string
	AppEnv                       string
	Host                         string
	Port                         int
	AppURL                       string
	APIURL                       string
	FrontendOrigin               string
	PublicTunnelOrigin           string
	PublicReachabilityCheckerURL string
	DatabaseURL                  string
	PostgresHost                 string
	PostgresPort                 int
	PostgresUser                 string
	PostgresPassword             string
	PostgresDB                   string
	RedisURL                     string
	RedisHost                    string
	RedisPort                    int
	RedisPassword                string
	JWTSecret                    string
	RefreshTokenSecret           string
	InviteTokenSecret            string
	RefreshCookieName            string
	AccessTokenTTL               time.Duration
	RefreshTokenTTL              time.Duration
	MaxUploadSizeBytes           int64
	LocalStoragePath             string
	LogFilePath                  string
	LogBufferMaxRecords          int
	TurnEnabled                  bool
	TurnHost                     string
	TurnPort                     int
	TurnUsername                 string
	TurnPassword                 string
	NtfyBaseURL                  string
	NtfyPublishToken             string
}

func Load() (Config, error) {
	accessTTL, err := ParseFlexibleDuration(getenv("JWT_ACCESS_EXPIRES_IN", "15m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_ACCESS_EXPIRES_IN: %w", err)
	}

	refreshTTL, err := ParseFlexibleDuration(getenv("JWT_REFRESH_EXPIRES_IN", "30d"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_REFRESH_EXPIRES_IN: %w", err)
	}

	port, err := atoi(getenv("PORT", "8000"))
	if err != nil {
		return Config{}, fmt.Errorf("parse PORT: %w", err)
	}

	postgresPort, err := atoi(getenv("POSTGRES_PORT", "5432"))
	if err != nil {
		return Config{}, fmt.Errorf("parse POSTGRES_PORT: %w", err)
	}

	redisPort, err := atoi(getenv("REDIS_PORT", "6379"))
	if err != nil {
		return Config{}, fmt.Errorf("parse REDIS_PORT: %w", err)
	}

	maxUploadMB, err := atoi(getenv("MAX_UPLOAD_SIZE_MB", "100"))
	if err != nil {
		return Config{}, fmt.Errorf("parse MAX_UPLOAD_SIZE_MB: %w", err)
	}

	bufferSize, err := atoi(getenv("LOG_BUFFER_MAX_RECORDS", "2000"))
	if err != nil {
		return Config{}, fmt.Errorf("parse LOG_BUFFER_MAX_RECORDS: %w", err)
	}

	storagePath := filepath.Clean(getenv("LOCAL_STORAGE_PATH", filepath.Join(".", "uploads")))
	logPath := filepath.Clean(getenv("LOG_FILE_PATH", filepath.Join(".", "logs", "backend.log")))

	cfg := Config{
		AppName:                      getenv("APP_NAME", "family-messenger-backend"),
		AppVersion:                   getenv("APP_VERSION", "0.1.0"),
		AppEnv:                       getenv("APP_ENV", "development"),
		Host:                         getenv("HOST", "0.0.0.0"),
		Port:                         port,
		AppURL:                       trimTrailingSlash(getenv("APP_URL", "http://localhost:8000")),
		APIURL:                       trimTrailingSlash(getenv("API_URL", "http://localhost:8000")),
		FrontendOrigin:               trimTrailingSlash(getenv("FRONTEND_ORIGIN", "http://frontend:5173")),
		PublicTunnelOrigin:           trimTrailingSlash(getenv("PUBLIC_TUNNEL_ORIGIN", "http://127.0.0.1:8000")),
		PublicReachabilityCheckerURL: strings.TrimSpace(os.Getenv("PUBLIC_REACHABILITY_CHECKER_URL")),
		DatabaseURL:                  strings.TrimSpace(os.Getenv("DATABASE_URL")),
		PostgresHost:                 getenv("POSTGRES_HOST", "localhost"),
		PostgresPort:                 postgresPort,
		PostgresUser:                 getenv("POSTGRES_USER", "family_user"),
		PostgresPassword:             getenv("POSTGRES_PASSWORD", "family_password"),
		PostgresDB:                   getenv("POSTGRES_DB", "family_messenger"),
		RedisURL:                     strings.TrimSpace(os.Getenv("REDIS_URL")),
		RedisHost:                    getenv("REDIS_HOST", "localhost"),
		RedisPort:                    redisPort,
		RedisPassword:                strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		JWTSecret:                    getenv("JWT_SECRET", "change_me"),
		RefreshTokenSecret:           getenv("REFRESH_TOKEN_SECRET", "change_me_too"),
		InviteTokenSecret:            getenv("INVITE_TOKEN_SECRET", "change_me_invites"),
		RefreshCookieName:            getenv("REFRESH_COOKIE_NAME", "family_refresh_token"),
		AccessTokenTTL:               accessTTL,
		RefreshTokenTTL:              refreshTTL,
		MaxUploadSizeBytes:           int64(maxUploadMB) * 1024 * 1024,
		LocalStoragePath:             storagePath,
		LogFilePath:                  logPath,
		LogBufferMaxRecords:          bufferSize,
		TurnEnabled:                  envBool("TURN_ENABLED", true),
		TurnHost:                     envString("TURN_HOST", ""),
		TurnPort:                     envInt("TURN_PORT", 3478),
		TurnUsername:                 envString("TURN_USERNAME", "family"),
		TurnPassword:                 envString("TURN_PASSWORD", "change_me"),
		NtfyBaseURL:                  envString("NTFY_BASE_URL", "http://ntfy:80"),
		NtfyPublishToken:             envString("NTFY_PUBLISH_TOKEN", ""),
	}

	return cfg, nil
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func (c Config) IsProduction() bool {
	return strings.EqualFold(c.AppEnv, "production")
}

func (c Config) EffectiveDatabaseURL() string {
	if strings.TrimSpace(c.DatabaseURL) != "" {
		return strings.TrimSpace(c.DatabaseURL)
	}

	user := url.QueryEscape(c.PostgresUser)
	password := url.QueryEscape(c.PostgresPassword)
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		user,
		password,
		c.PostgresHost,
		c.PostgresPort,
		url.QueryEscape(c.PostgresDB),
	)
}

func (c Config) EffectiveRedisURL() string {
	if strings.TrimSpace(c.RedisURL) != "" {
		return strings.TrimSpace(c.RedisURL)
	}
	if strings.TrimSpace(c.RedisPassword) != "" {
		return fmt.Sprintf("redis://:%s@%s:%d/0", url.QueryEscape(c.RedisPassword), c.RedisHost, c.RedisPort)
	}
	return fmt.Sprintf("redis://%s:%d/0", c.RedisHost, c.RedisPort)
}

func ParseFlexibleDuration(raw string) (time.Duration, error) {
	value := strings.TrimSpace(strings.ToLower(raw))
	if value == "" {
		return 0, fmt.Errorf("duration is empty")
	}

	suffix := value[len(value)-1]
	if suffix == 'd' {
		days, err := strconv.Atoi(strings.TrimSpace(value[:len(value)-1]))
		if err != nil {
			return 0, fmt.Errorf("invalid day duration %q", raw)
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}

	dur, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("invalid duration %q", raw)
	}
	return dur, nil
}

func trimTrailingSlash(value string) string {
	return strings.TrimRight(strings.TrimSpace(value), "/")
}

func getenv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func atoi(raw string) (int, error) {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return value, nil
}
