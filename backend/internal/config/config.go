package config

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
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

// IntelligenceOIDCSigningPublicKey is a retired public key retained in JWKS
// during the rotation overlap window. It never contains private key material.
type IntelligenceOIDCSigningPublicKey struct {
	KeyID        string `json:"kid"`
	PublicKeyPEM string `json:"public_key_pem"`
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
		CORSAllowedOrigins:           splitCSV(os.Getenv("CORS_ALLOWED_ORIGINS")),
		TrustedProxyCIDRs:            splitCSV(getenv("TRUSTED_PROXY_CIDRS", "172.30.0.2/32")),
		NativeClientOrigins:          splitCSV(getenv("NATIVE_CLIENT_ORIGINS", "capacitor://localhost")),
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
		LocalStoragePath:                     storagePath,
		MinIOEndpoint:                        getenv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey:                       strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY")),
		MinIOSecretKey:                       strings.TrimSpace(os.Getenv("MINIO_SECRET_KEY")),
		MinIOSecure:                          envBool("MINIO_SECURE", false),
		MinIOPublicEndpoint:                  strings.TrimSpace(os.Getenv("MINIO_PUBLIC_ENDPOINT")),
		MinIOPublicSecure:                    envBool("MINIO_PUBLIC_SECURE", true),
		MinIOFilesBucket:                     getenv("MINIO_FILES_BUCKET", "stovo-files"),
		MinIOLogsBucket:                      getenv("MINIO_LOGS_BUCKET", "stovo-logs"),
		LogFilePath:                          logPath,
		LogBufferMaxRecords:                  bufferSize,
		TurnEnabled:                          envBool("TURN_ENABLED", true),
		TurnHost:                             envString("TURN_HOST", ""),
		TurnPort:                             envInt("TURN_PORT", 3478),
		TurnUsername:                         envString("TURN_USERNAME", "family"),
		TurnPassword:                         envString("TURN_PASSWORD", "change_me"),
		NtfyBaseURL:                          envString("NTFY_BASE_URL", "http://ntfy:80"),
		NtfyPublishToken:                     envString("NTFY_PUBLISH_TOKEN", ""),
		FirebaseCredentialsFile:              envString("FIREBASE_CREDENTIALS_FILE", ""),
		FirebaseCredentialsJSON:              envString("FIREBASE_CREDENTIALS_JSON", ""),
		LiveKitURL:                           envString("LIVEKIT_URL", ""),
		LiveKitAPIKey:                        envString("LIVEKIT_API_KEY", ""),
		LiveKitAPISecret:                     envString("LIVEKIT_API_SECRET", ""),
		GuestMeetingsEnabled:                 envBool("GUEST_MEETINGS_ENABLED", true),
		GuestMeetingURL:                      trimTrailingSlash(envString("GUEST_MEETING_URL", getenv("APP_URL", "http://localhost:8000"))),
		GroqAPIKey:                           envAny("GROQ_API_KEY", "groq_api_key", "GROQ_KEY", "groq_key", "GROQ_API_TOKEN", "groq_api_token", "GROQ_TOKEN"),
		GroqBaseURL:                          envString("GROQ_BASE_URL", envString("GROQ_API_BASE", "")),
		GroqSTTModel:                         getenv("GROQ_STT_MODEL", "qwen3-asr-flash-2025-09-08"),
		GroqChatModel:                        getenv("GROQ_CHAT_MODEL", ""),
		GroqSTTCostPerHourUSD:                envFloat64("GROQ_STT_COST_PER_AUDIO_HOUR_USD", 0.04),
		AICallTranscriptionEnabled:           envBool("AI_CALL_TRANSCRIPTION_ENABLED", true),
		AICallMaxDurationMinutes:             envInt("AI_CALL_MAX_DURATION_MINUTES", 180),
		IntelligenceSourceEnabled:            envBool("INTELLIGENCE_SOURCE_ENABLED", false),
		IntelligenceOIDCEnabled:              envBool("INTELLIGENCE_OIDC_ENABLED", false),
		IntelligenceOIDCIssuer:               strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_ISSUER")),
		IntelligenceOIDCClientID:             strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_CLIENT_ID")),
		IntelligenceOIDCClientSecret:         strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_CLIENT_SECRET")),
		IntelligenceOIDCRedirectURIs:         splitCSV(os.Getenv("INTELLIGENCE_OIDC_REDIRECT_URIS")),
		IntelligenceOIDCSigningKeyID:         strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_SIGNING_KEY_ID")),
		IntelligenceOIDCSigningPrivateKeyPEM: strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM")),
		MinIOCallsBucket:                     getenv("MINIO_CALLS_BUCKET", "stovo-calls"),
		SolutionProfile:                      ParseSolutionProfile(getenv("SOLUTION_PROFILE", "family")),
		FeatureMatrix:                        GetPresetMatrix(ParseSolutionProfile(getenv("SOLUTION_PROFILE", "family"))),
	}

	if cfg.IntelligenceOIDCEnabled {
		previousKeysJSON := strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_PREVIOUS_SIGNING_KEYS_JSON"))
		if previousKeysJSON != "" {
			decoder := json.NewDecoder(strings.NewReader(previousKeysJSON))
			decoder.DisallowUnknownFields()
			if previousKeysJSON[0] != '[' || decoder.Decode(&cfg.IntelligenceOIDCPreviousSigningKeys) != nil {
				return Config{}, fmt.Errorf("invalid Intelligence OIDC config: previous signing keys must be a JSON array")
			}
			var trailing any
			if err := decoder.Decode(&trailing); err != io.EOF {
				return Config{}, fmt.Errorf("invalid Intelligence OIDC config: previous signing keys must be a JSON array")
			}
		}
	}
	if err := cfg.validateIntelligenceOIDC(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) validateIntelligenceOIDC() error {
	if !c.IntelligenceOIDCEnabled {
		return nil
	}
	if !canonicalHTTPSIssuer(c.IntelligenceOIDCIssuer) {
		return fmt.Errorf("invalid Intelligence OIDC config: issuer must be a canonical HTTPS URL")
	}
	if c.IntelligenceOIDCClientID == "" || c.IntelligenceOIDCClientSecret == "" || !validOIDCKeyID(c.IntelligenceOIDCSigningKeyID) {
		return fmt.Errorf("invalid Intelligence OIDC config: client and signing key identifiers are required")
	}
	if len(c.IntelligenceOIDCRedirectURIs) == 0 {
		return fmt.Errorf("invalid Intelligence OIDC config: at least one exact HTTPS callback is required")
	}
	seenRedirectURIs := make(map[string]struct{}, len(c.IntelligenceOIDCRedirectURIs))
	for _, redirectURI := range c.IntelligenceOIDCRedirectURIs {
		parsed, err := url.ParseRequestURI(redirectURI)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" || parsed.ForceQuery || parsed.Opaque != "" || parsed.String() != redirectURI {
			return fmt.Errorf("invalid Intelligence OIDC config: callback URIs must be exact HTTPS URLs without fragments")
		}
		if _, exists := seenRedirectURIs[redirectURI]; exists {
			return fmt.Errorf("invalid Intelligence OIDC config: callback URIs must be unique")
		}
		seenRedirectURIs[redirectURI] = struct{}{}
	}
	if !validOIDCSigningPrivateKey(c.IntelligenceOIDCSigningPrivateKeyPEM) {
		return fmt.Errorf("invalid Intelligence OIDC config: signing key must be an RSA PKCS#8 or PKCS#1 PEM key of at least 2048 bits")
	}
	if len(c.IntelligenceOIDCPreviousSigningKeys) > 8 {
		return fmt.Errorf("invalid Intelligence OIDC config: at most eight previous signing keys are allowed")
	}
	seenKeyIDs := map[string]struct{}{c.IntelligenceOIDCSigningKeyID: {}}
	for _, key := range c.IntelligenceOIDCPreviousSigningKeys {
		if !validOIDCKeyID(key.KeyID) || !validOIDCSigningPublicKey(key.PublicKeyPEM) {
			return fmt.Errorf("invalid Intelligence OIDC config: previous signing keys require a key ID and an RSA public key of at least 2048 bits")
		}
		if _, exists := seenKeyIDs[key.KeyID]; exists {
			return fmt.Errorf("invalid Intelligence OIDC config: signing key IDs must be unique")
		}
		seenKeyIDs[key.KeyID] = struct{}{}
	}
	return nil
}

func canonicalHTTPSIssuer(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.Opaque != "" {
		return false
	}
	if strings.ToLower(parsed.Host) != parsed.Host || parsed.Port() == "443" || parsed.RawPath != "" || parsed.Path != "" {
		return false
	}
	return parsed.String() == raw
}

func validOIDCKeyID(value string) bool {
	if value == "" || len(value) > 128 || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char > 0x7e {
			return false
		}
	}
	return true
}

func validOIDCSigningPrivateKey(raw string) bool {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return false
	}
	var parsed any
	var err error
	switch block.Type {
	case "PRIVATE KEY":
		parsed, err = x509.ParsePKCS8PrivateKey(block.Bytes)
	case "RSA PRIVATE KEY":
		parsed, err = x509.ParsePKCS1PrivateKey(block.Bytes)
	default:
		return false
	}
	if err != nil {
		return false
	}
	key, ok := parsed.(*rsa.PrivateKey)
	return ok && key.N.BitLen() >= 2048 && key.Validate() == nil
}

func validOIDCSigningPublicKey(raw string) bool {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return false
	}
	var parsed any
	var err error
	switch block.Type {
	case "PUBLIC KEY":
		parsed, err = x509.ParsePKIXPublicKey(block.Bytes)
	case "RSA PUBLIC KEY":
		parsed, err = x509.ParsePKCS1PublicKey(block.Bytes)
	default:
		return false
	}
	if err != nil {
		return false
	}
	key, ok := parsed.(*rsa.PublicKey)
	return ok && key.N.BitLen() >= 2048 && key.E >= 3 && key.E%2 == 1
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
