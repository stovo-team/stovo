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
	AppName    string
	AppVersion string
	AppEnv     string
	Host       string
	Port       int
	ServerID   string
	AppURL     string
	// CORSAllowedOrigins contains additional exact browser origins, for
	// example the Capacitor WebView origin. AppURL is always allowed too.
	CORSAllowedOrigins []string
	// TrustedProxyCIDRs limits which TCP peers may supply X-Forwarded-For.
	TrustedProxyCIDRs []string
	// NativeClientOrigins controls the exceptional clients that receive a raw
	// refresh token response. Browser origins always receive only an HttpOnly
	// refresh cookie.
	NativeClientOrigins          []string
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
	DatabaseMaxOpenConns         int
	DatabaseMaxIdleConns         int
	RedisURL                     string
	// RedisJobsURL is deliberately separate from RedisURL in production so a
	// backlogged stream cannot evict cache, presence, or socket Pub/Sub state.
	// Empty keeps small/local installations on the existing Redis instance.
	RedisJobsURL          string
	RedisHost             string
	RedisPort             int
	RedisPassword         string
	JWTSecret             string
	RefreshTokenSecret    string
	InviteTokenSecret     string
	RefreshCookieName     string
	AccessTokenTTL        time.Duration
	RefreshTokenTTL       time.Duration
	MediaPlaybackTokenTTL time.Duration
	MaxUploadSizeBytes    int64
	StorageProvider       string
	LocalStoragePath      string
	MinIOEndpoint         string
	MinIOAccessKey        string
	MinIOSecretKey        string
	MinIOSecure           bool
	// MinIOPublicEndpoint is used only for generated presigned URLs. It must
	// be externally resolvable (for example media.example.com), unlike the
	// internal MinIOEndpoint used by backend reads and writes.
	MinIOPublicEndpoint        string
	MinIOPublicSecure          bool
	MinIOFilesBucket           string
	MinIOLogsBucket            string
	LogFilePath                string
	LogBufferMaxRecords        int
	TurnEnabled                bool
	TurnHost                   string
	TurnPort                   int
	TurnUsername               string
	TurnPassword               string
	NtfyBaseURL                string
	NtfyPublishToken           string
	FirebaseCredentialsFile    string
	FirebaseCredentialsJSON    string
	LiveKitURL                 string
	LiveKitAPIKey              string
	LiveKitAPISecret           string
	GuestMeetingsEnabled       bool
	GuestMeetingURL            string
	GroqAPIKey                 string
	GroqBaseURL                string
	GroqSTTModel               string
	GroqChatModel              string
	GroqSTTCostPerHourUSD      float64
	AICallTranscriptionEnabled bool
	AICallMaxDurationMinutes   int
	// IntelligenceSourceEnabled is the process-wide kill switch for the
	// Messenger source API. Installation and connection gates are additional
	// requirements resolved by the source credential store.
	IntelligenceSourceEnabled bool
	// IntelligenceSourceV2RestoreEpoch is deployment state kept outside the
	// database backup. Rotating it before a restore keeps stale snapshots closed
	// until the tombstone replay is completed.
	IntelligenceSourceV2RestoreEpoch string
	// IntelligenceOIDCEnabled is a separate default-off gate for the registered
	// Intelligence relying party. It does not enable source data access.
	IntelligenceOIDCEnabled              bool
	IntelligenceOIDCIssuer               string
	IntelligenceOIDCClientID             string
	IntelligenceOIDCClientSecret         string
	IntelligenceOIDCRedirectURIs         []string
	IntelligenceOIDCSigningKeyID         string
	IntelligenceOIDCSigningPrivateKeyPEM string
	IntelligenceOIDCPreviousSigningKeys  []IntelligenceOIDCSigningPublicKey
	MinIOCallsBucket                     string
	SolutionProfile                      SolutionProfile
	FeatureMatrix                        FeatureMatrix
}

func Load() (Config, error) {
	_ = LoadEnv()

	accessTTL, err := ParseFlexibleDuration(getenv("JWT_ACCESS_EXPIRES_IN", "15m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_ACCESS_EXPIRES_IN: %w", err)
	}

	refreshTTL, err := ParseFlexibleDuration(getenv("JWT_REFRESH_EXPIRES_IN", "30d"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_REFRESH_EXPIRES_IN: %w", err)
	}

	mediaPlaybackTTL, err := ParseFlexibleDuration(getenv("MEDIA_PLAYBACK_TOKEN_TTL", "12h"))
	if err != nil {
		return Config{}, fmt.Errorf("parse MEDIA_PLAYBACK_TOKEN_TTL: %w", err)
	}
	if mediaPlaybackTTL <= 0 {
		return Config{}, fmt.Errorf("parse MEDIA_PLAYBACK_TOKEN_TTL: duration must be positive")
	}

	port, err := atoi(getenv("PORT", "8000"))
	if err != nil {
		return Config{}, fmt.Errorf("parse PORT: %w", err)
	}

	postgresPort, err := atoi(getenv("POSTGRES_PORT", "5432"))
	if err != nil {
		return Config{}, fmt.Errorf("parse POSTGRES_PORT: %w", err)
	}

	databaseMaxOpenConns, err := atoi(getenv("DATABASE_MAX_OPEN_CONNS", "10"))
	if err != nil || databaseMaxOpenConns < 1 {
		return Config{}, fmt.Errorf("parse DATABASE_MAX_OPEN_CONNS: must be a positive integer")
	}
	databaseMaxIdleConns, err := atoi(getenv("DATABASE_MAX_IDLE_CONNS", "10"))
	if err != nil || databaseMaxIdleConns < 0 || databaseMaxIdleConns > databaseMaxOpenConns {
		return Config{}, fmt.Errorf("parse DATABASE_MAX_IDLE_CONNS: must be between 0 and DATABASE_MAX_OPEN_CONNS")
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
		ServerID:                     strings.TrimSpace(os.Getenv("SERVER_ID")),
		AppURL:                       trimTrailingSlash(getenv("APP_URL", "http://localhost:8000")),
		CORSAllowedOrigins:           splitCSV(getenv("CORS_ALLOWED_ORIGINS", "https://localhost,capacitor://localhost")),
		TrustedProxyCIDRs:            splitCSV(getenv("TRUSTED_PROXY_CIDRS", "172.30.0.2/32")),
		NativeClientOrigins:          splitCSV(getenv("NATIVE_CLIENT_ORIGINS", "https://localhost,capacitor://localhost")),
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
		DatabaseMaxOpenConns:         databaseMaxOpenConns,
		DatabaseMaxIdleConns:         databaseMaxIdleConns,
		RedisURL:                     strings.TrimSpace(os.Getenv("REDIS_URL")),
		RedisJobsURL:                 strings.TrimSpace(os.Getenv("REDIS_JOBS_URL")),
		RedisHost:                    getenv("REDIS_HOST", "localhost"),
		RedisPort:                    redisPort,
		RedisPassword:                strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		JWTSecret:                    getenv("JWT_SECRET", "change_me"),
		RefreshTokenSecret:           getenv("REFRESH_TOKEN_SECRET", "change_me_too"),
		InviteTokenSecret:            getenv("INVITE_TOKEN_SECRET", "change_me_invites"),
		RefreshCookieName:            getenv("REFRESH_COOKIE_NAME", "family_refresh_token"),
		AccessTokenTTL:               accessTTL,
		RefreshTokenTTL:              refreshTTL,
		MediaPlaybackTokenTTL:        mediaPlaybackTTL,
		MaxUploadSizeBytes:           int64(maxUploadMB) * 1024 * 1024,
		StorageProvider: strings.ToLower(getenv("STORAGE_PROVIDER", func() string {
			if strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY")) != "" {
				return "minio"
			}
			return "local"
		}())),
		LocalStoragePath:           storagePath,
		MinIOEndpoint:              getenv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey:             strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY")),
		MinIOSecretKey:             strings.TrimSpace(os.Getenv("MINIO_SECRET_KEY")),
		MinIOSecure:                envBool("MINIO_SECURE", false),
		MinIOPublicEndpoint:        strings.TrimSpace(os.Getenv("MINIO_PUBLIC_ENDPOINT")),
		MinIOPublicSecure:          envBool("MINIO_PUBLIC_SECURE", true),
		MinIOFilesBucket:           getenv("MINIO_FILES_BUCKET", "stovo-files"),
		MinIOLogsBucket:            getenv("MINIO_LOGS_BUCKET", "stovo-logs"),
		LogFilePath:                logPath,
		LogBufferMaxRecords:        bufferSize,
		TurnEnabled:                envBool("TURN_ENABLED", true),
		TurnHost:                   envString("TURN_HOST", ""),
		TurnPort:                   envInt("TURN_PORT", 3478),
		TurnUsername:               envString("TURN_USERNAME", "family"),
		TurnPassword:               envString("TURN_PASSWORD", "change_me"),
		NtfyBaseURL:                envString("NTFY_BASE_URL", "http://ntfy:80"),
		NtfyPublishToken:           envString("NTFY_PUBLISH_TOKEN", ""),
		FirebaseCredentialsFile:    envString("FIREBASE_CREDENTIALS_FILE", ""),
		FirebaseCredentialsJSON:    envString("FIREBASE_CREDENTIALS_JSON", ""),
		LiveKitURL:                 envString("LIVEKIT_URL", ""),
		LiveKitAPIKey:              envString("LIVEKIT_API_KEY", ""),
		LiveKitAPISecret:           envString("LIVEKIT_API_SECRET", ""),
		GuestMeetingsEnabled:       envBool("GUEST_MEETINGS_ENABLED", true),
		GuestMeetingURL:            trimTrailingSlash(envString("GUEST_MEETING_URL", getenv("APP_URL", "http://localhost:8000"))),
		GroqAPIKey:                 envAny("GROQ_API_KEY", "groq_api_key", "GROQ_KEY", "groq_key", "GROQ_API_TOKEN", "groq_api_token", "GROQ_TOKEN"),
		GroqBaseURL:                envString("GROQ_BASE_URL", envString("GROQ_API_BASE", "")),
		GroqSTTModel:               getenv("GROQ_STT_MODEL", "qwen3-asr-flash-2025-09-08"),
		GroqChatModel:              getenv("GROQ_CHAT_MODEL", ""),
		GroqSTTCostPerHourUSD:      envFloat64("GROQ_STT_COST_PER_AUDIO_HOUR_USD", 0.04),
		AICallTranscriptionEnabled: envBool("AI_CALL_TRANSCRIPTION_ENABLED", true),
		AICallMaxDurationMinutes:   envInt("AI_CALL_MAX_DURATION_MINUTES", 180),
		IntelligenceSourceEnabled:  envBool("INTELLIGENCE_SOURCE_ENABLED", false),
		MinIOCallsBucket:           getenv("MINIO_CALLS_BUCKET", "stovo-calls"),
		SolutionProfile:            ParseSolutionProfile(getenv("SOLUTION_PROFILE", "family")),
		FeatureMatrix:              GetPresetMatrix(ParseSolutionProfile(getenv("SOLUTION_PROFILE", "family"))),
	}

	if err := cfg.loadIntelligenceOIDCFromEnvironment(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func splitCSV(value string) []string {
	var result []string
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func envAny(keys ...string) string {
	for _, k := range keys {
		val := strings.TrimSpace(os.Getenv(k))
		if val != "" && !IsPlaceholderKey(val) {
			return val
		}
	}
	return ""
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

func envFloat64(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
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
	return c.LocalDatabaseURL()
}

func (c Config) LocalDatabaseURL() string {
	host := c.PostgresHost
	if host == "localhost" || host == "127.0.0.1" || host == "" {
		if isRunningInDocker() {
			host = "postgres"
		} else if host == "" {
			host = "localhost"
		}
	}
	dbName := c.PostgresDB
	if dbName == "" {
		if c.ServerID != "" {
			dbName = fmt.Sprintf("stovo_db_%s", c.ServerID)
		} else {
			dbName = "family_messenger"
		}
	}
	user := url.QueryEscape(c.PostgresUser)
	password := url.QueryEscape(c.PostgresPassword)
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		user,
		password,
		host,
		c.PostgresPort,
		url.QueryEscape(dbName),
	)
}

func (c Config) LocalFallbackCandidates() []string {
	seen := make(map[string]bool)
	var candidates []string

	add := func(raw string) {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			candidates = append(candidates, trimmed)
		}
	}

	add(c.LocalDatabaseURL())

	if c.ServerID != "" {
		user := url.QueryEscape(c.PostgresUser)
		pass := url.QueryEscape(c.PostgresPassword)
		add(fmt.Sprintf("postgres://%s:%s@postgres:%d/stovo_db_%s?sslmode=disable", user, pass, c.PostgresPort, c.ServerID))
		add(fmt.Sprintf("postgres://postgres:postgres@postgres:%d/stovo_db_%s?sslmode=disable", c.PostgresPort, c.ServerID))
	}

	user := url.QueryEscape(c.PostgresUser)
	pass := url.QueryEscape(c.PostgresPassword)
	dbName := url.QueryEscape(c.PostgresDB)
	add(fmt.Sprintf("postgres://%s:%s@postgres:%d/%s?sslmode=disable", user, pass, c.PostgresPort, dbName))
	add(fmt.Sprintf("postgres://family_user:family_password@postgres:%d/family_messenger?sslmode=disable", c.PostgresPort))
	add(fmt.Sprintf("postgres://postgres:postgres@postgres:%d/stovo_master_db?sslmode=disable", c.PostgresPort))

	return candidates
}

func isRunningInDocker() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	return os.Getenv("SERVER_ID") != "" || os.Getenv("DOCKER_NETWORK_NAME") != ""
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

func (c Config) EffectiveRedisJobsURL() string {
	if strings.TrimSpace(c.RedisJobsURL) != "" {
		return strings.TrimSpace(c.RedisJobsURL)
	}
	return c.EffectiveRedisURL()
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
