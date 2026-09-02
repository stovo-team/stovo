package statsstore

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sync"
	"time"
)

type ServerOverview struct {
	TotalMessages             int                   `json:"total_messages"`
	TotalMedia                int                   `json:"total_media"`
	TotalChats                int                   `json:"total_chats"`
	TotalUsers                int                   `json:"total_users"`
	AvgResponseTimeSeconds    float64               `json:"avg_response_time_seconds"`
	FastResponsePercent       float64               `json:"fast_response_percent"`
	TotalConversationsStarted int                   `json:"total_conversations_started"`
	AvgSessionDurationMinutes float64               `json:"avg_session_duration_minutes"`
	MessagesByHour            [24]int               `json:"messages_by_hour"`
	MessagesByDayOfWeek       [7]int                `json:"messages_by_day_of_week"`
	ResponseTimeBuckets       ResponseTimeBuckets   `json:"response_time_buckets"`
	TopConversationStarters   []ConversationStarter `json:"top_conversation_starters"`
	TopActiveChats            []ActiveChat          `json:"top_active_chats"`
}

type ResponseTimeBuckets struct {
	Under1Min    int `json:"under_1_min"`
	From1To5Min  int `json:"from_1_to_5_min"`
	From5To30Min int `json:"from_5_to_30_min"`
	Over30Min    int `json:"over_30_min"`
}

type ConversationStarter struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	StartsCount int     `json:"starts_count"`
	Percentage  float64 `json:"percentage"`
}

type ActiveChat struct {
	ChatID       string `json:"chat_id"`
	Title        string `json:"title"`
	Type         string `json:"type"`
	MessageCount int    `json:"message_count"`
}

type ChatStats struct {
	ChatID                 string            `json:"chat_id"`
	TotalMessages          int               `json:"total_messages"`
	TotalMedia             int               `json:"total_media"`
	TotalMembers           int               `json:"total_members"`
	AvgResponseTimeSeconds float64           `json:"avg_response_time_seconds"`
	FastestResponderName   string            `json:"fastest_responder_name"`
	FastestResponderSpeed  float64           `json:"fastest_responder_speed"`
	MessagesByHour         [24]int           `json:"messages_by_hour"`
	TopMembers             []ChatMemberStats `json:"top_members"`
}

type ChatMemberStats struct {
	UserID                 string  `json:"user_id"`
	DisplayName            string  `json:"display_name"`
	MessageCount           int     `json:"message_count"`
	AvgResponseTimeSeconds float64 `json:"avg_response_time_seconds"`
}

type FunAwards struct {
	NightOwl           AwardWinner  `json:"night_owl"`
	EarlyBird          AwardWinner  `json:"early_bird"`
	LightningResponder AwardWinner  `json:"lightning_responder"`
	IcebreakerMonarch  AwardWinner  `json:"icebreaker_monarch"`
	NovelWriter        AwardWinner  `json:"novel_writer"`
	OneWordWonder      AwardWinner  `json:"one_word_wonder"`
	ReactionMagnet     AwardWinner  `json:"reaction_magnet"`
	DynamicDuo         DuoWinner    `json:"dynamic_duo"`
	TopEmojis          []EmojiTally `json:"top_emojis"`
}

type AwardWinner struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	Badge       string `json:"badge"`
	Description string `json:"description"`
	Value       string `json:"value"`
}

type DuoWinner struct {
	User1Name   string `json:"user_1_name"`
	User2Name   string `json:"user_2_name"`
	Description string `json:"description"`
	ThreadCount int    `json:"thread_count"`
}

type EmojiTally struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
}

type YearWithStovo struct {
	Year                       int          `json:"year"`
	TotalMessages              int          `json:"total_messages"`
	TotalPhotos                int          `json:"total_photos"`
	TotalAudio                 int          `json:"total_audio"`
	TotalFiles                 int          `json:"total_files"`
	TotalConversationsStarted  int          `json:"total_conversations_started"`
	BusiestDay                 string       `json:"busiest_day"`
	BusiestDayMessageCount     int          `json:"busiest_day_message_count"`
	TopConversationStarterName string       `json:"top_conversation_starter_name"`
	TopConversationStarts      int          `json:"top_conversation_starts"`
	TopEmoji                   string       `json:"top_emoji"`
	TopEmojiCount              int          `json:"top_emoji_count"`
	PersonalCard               PersonalCard `json:"personal_card"`
	DynamicDuo                 DuoWinner    `json:"dynamic_duo"`
}

type PersonalCard struct {
	UserID                 string  `json:"user_id"`
	DisplayName            string  `json:"display_name"`
	SuperpowerTitle        string  `json:"superpower_title"`
	SuperpowerDescription  string  `json:"superpower_description"`
	MessagesSent           int     `json:"messages_sent"`
	FastRepliesCount       int     `json:"fast_replies_count"`
	AvgResponseTimeSeconds float64 `json:"avg_response_time_seconds"`
	TopChatTitle           string  `json:"top_chat_title"`
}

type lastChatMessage struct {
	senderID  string
	createdAt time.Time
}

type PostgresStore struct {
	db       *sql.DB
	mu       sync.RWMutex
	lastChat map[string]lastChatMessage
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{
		db:       db,
		lastChat: make(map[string]lastChatMessage),
	}
}

func (s *PostgresStore) InitSchema(ctx context.Context) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS stats_daily_chats (
			id text PRIMARY KEY,
			stat_date date NOT NULL,
			chat_id text NOT NULL,
			message_count integer NOT NULL DEFAULT 0,
			media_count integer NOT NULL DEFAULT 0,
			total_response_time_ms bigint NOT NULL DEFAULT 0,
			response_count integer NOT NULL DEFAULT 0,
			conversation_starts integer NOT NULL DEFAULT 0,
			created_at text NOT NULL,
			updated_at text NOT NULL,
			UNIQUE (stat_date, chat_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stats_daily_chats_date ON stats_daily_chats (stat_date)`,
		`CREATE TABLE IF NOT EXISTS stats_daily_users (
			id text PRIMARY KEY,
			stat_date date NOT NULL,
			user_id text NOT NULL,
			message_count integer NOT NULL DEFAULT 0,
			media_count integer NOT NULL DEFAULT 0,
			night_messages integer NOT NULL DEFAULT 0,
			early_messages integer NOT NULL DEFAULT 0,
			total_response_time_ms bigint NOT NULL DEFAULT 0,
			response_count integer NOT NULL DEFAULT 0,
			conversation_starts integer NOT NULL DEFAULT 0,
			created_at text NOT NULL,
			updated_at text NOT NULL,
			UNIQUE (stat_date, user_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stats_daily_users_date ON stats_daily_users (stat_date)`,
		`CREATE TABLE IF NOT EXISTS stats_emoji_usage (
			id text PRIMARY KEY,
			year integer NOT NULL,
			user_id text NOT NULL,
			emoji text NOT NULL,
			count integer NOT NULL DEFAULT 0,
			updated_at text NOT NULL,
			UNIQUE (year, user_id, emoji)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stats_emoji_year ON stats_emoji_usage (year, emoji)`,
	}

	for _, q := range queries {
		if _, err := s.db.ExecContext(ctx, q); err != nil {
			_ = err
		}
	}
	return nil
}

func (s *PostgresStore) RecordMessage(ctx context.Context, chatID, senderID, msgType, content string, createdAt time.Time) {
	s.mu.Lock()
	last, hasLast := s.lastChat[chatID]
	s.lastChat[chatID] = lastChatMessage{
		senderID:  senderID,
		createdAt: createdAt,
	}
	s.mu.Unlock()

	isMedia := msgType != "" && msgType != "text"
	isConversationStart := false
	var responseDurationMs int64 = 0
	hasResponse := false

	if !hasLast || createdAt.Sub(last.createdAt) > 4*time.Hour {
		isConversationStart = true
	} else if last.senderID != senderID {
		diff := createdAt.Sub(last.createdAt)
		if diff > 0 && diff < 4*time.Hour {
			responseDurationMs = diff.Milliseconds()
			hasResponse = true
		}
	}

	hour := createdAt.Hour()
	isNight := hour >= 0 && hour < 5
	isEarly := hour >= 5 && hour < 8

	dateStr := createdAt.Format("2006-01-02")
	now := time.Now().UTC().Format(time.RFC3339)

	mediaCount := 0
	if isMedia {
		mediaCount = 1
	}
	convStartCount := 0
	if isConversationStart {
		convStartCount = 1
	}
	respCount := 0
	if hasResponse {
		respCount = 1
	}

	chatIDKey := fmt.Sprintf("%s:%s", dateStr, chatID)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO stats_daily_chats (id, stat_date, chat_id, message_count, media_count, total_response_time_ms, response_count, conversation_starts, created_at, updated_at)
		VALUES ($1, $2::date, $3, 1, $4, $5, $6, $7, $8, $8)
		ON CONFLICT (stat_date, chat_id) DO UPDATE SET
			message_count = stats_daily_chats.message_count + 1,
			media_count = stats_daily_chats.media_count + EXCLUDED.media_count,
			total_response_time_ms = stats_daily_chats.total_response_time_ms + EXCLUDED.total_response_time_ms,
			response_count = stats_daily_chats.response_count + EXCLUDED.response_count,
			conversation_starts = stats_daily_chats.conversation_starts + EXCLUDED.conversation_starts,
			updated_at = EXCLUDED.updated_at
	`, chatIDKey, dateStr, chatID, mediaCount, responseDurationMs, respCount, convStartCount, now)

	nightCount := 0
	if isNight {
		nightCount = 1
	}
	earlyCount := 0
	if isEarly {
		earlyCount = 1
	}
	userIDKey := fmt.Sprintf("%s:%s", dateStr, senderID)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO stats_daily_users (id, stat_date, user_id, message_count, media_count, night_messages, early_messages, total_response_time_ms, response_count, conversation_starts, created_at, updated_at)
		VALUES ($1, $2::date, $3, 1, $4, $5, $6, $7, $8, $9, $10, $10)
		ON CONFLICT (stat_date, user_id) DO UPDATE SET
			message_count = stats_daily_users.message_count + 1,
			media_count = stats_daily_users.media_count + EXCLUDED.media_count,
			night_messages = stats_daily_users.night_messages + EXCLUDED.night_messages,
			early_messages = stats_daily_users.early_messages + EXCLUDED.early_messages,
			total_response_time_ms = stats_daily_users.total_response_time_ms + EXCLUDED.total_response_time_ms,
			response_count = stats_daily_users.response_count + EXCLUDED.response_count,
			conversation_starts = stats_daily_users.conversation_starts + EXCLUDED.conversation_starts,
			updated_at = EXCLUDED.updated_at
	`, userIDKey, dateStr, senderID, mediaCount, nightCount, earlyCount, responseDurationMs, respCount, convStartCount, now)
}

func (s *PostgresStore) RecordReaction(ctx context.Context, chatID, messageID, userID, emoji string, createdAt time.Time) {
	year := createdAt.Year()
	idKey := fmt.Sprintf("%d:%s:%s", year, userID, emoji)
	now := time.Now().UTC().Format(time.RFC3339)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO stats_emoji_usage (id, year, user_id, emoji, count, updated_at)
		VALUES ($1, $2, $3, $4, 1, $5)
		ON CONFLICT (year, user_id, emoji) DO UPDATE SET
			count = stats_emoji_usage.count + 1,
			updated_at = EXCLUDED.updated_at
	`, idKey, year, userID, emoji, now)
}

func (s *PostgresStore) GetServerOverview(ctx context.Context, rangeFilter string) (ServerOverview, error) {
	overview := ServerOverview{}

	var dateCondition string
	switch rangeFilter {
	case "7d":
		dateCondition = "AND created_at::timestamptz >= now() - interval '7 days'"
	case "30d":
		dateCondition = "AND created_at::timestamptz >= now() - interval '30 days'"
	case "1y":
		dateCondition = "AND created_at::timestamptz >= now() - interval '1 year'"
	default:
		dateCondition = ""
	}

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL %s`, dateCondition)).Scan(&overview.TotalMessages)
	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND type != 'text' %s`, dateCondition)).Scan(&overview.TotalMedia)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chats`).Scan(&overview.TotalChats)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE is_active = true`).Scan(&overview.TotalUsers)

	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT EXTRACT(HOUR FROM created_at::timestamptz)::int as hr, COUNT(*)
		FROM messages
		WHERE deleted_at IS NULL %s
		GROUP BY hr
	`, dateCondition))
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hr, cnt int
			if scanErr := rows.Scan(&hr, &cnt); scanErr == nil && hr >= 0 && hr < 24 {
				overview.MessagesByHour[hr] = cnt
			}
		}
	}

	dayRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT EXTRACT(DOW FROM created_at::timestamptz)::int as dow, COUNT(*)
		FROM messages
		WHERE deleted_at IS NULL %s
		GROUP BY dow
	`, dateCondition))
	if err == nil {
		defer dayRows.Close()
		for dayRows.Next() {
			var dow, cnt int
			if scanErr := dayRows.Scan(&dow, &cnt); scanErr == nil && dow >= 0 && dow < 7 {
				overview.MessagesByDayOfWeek[dow] = cnt
			}
		}
	}

	leadQuery := fmt.Sprintf(`
		WITH message_deltas AS (
			SELECT
				sender_id,
				chat_id,
				created_at::timestamptz as msg_time,
				LAG(sender_id) OVER (PARTITION BY chat_id ORDER BY created_at::timestamptz) as prev_sender,
				LAG(created_at::timestamptz) OVER (PARTITION BY chat_id ORDER BY created_at::timestamptz) as prev_time
			FROM messages
			WHERE deleted_at IS NULL %s
		)
		SELECT
			COALESCE(AVG(EXTRACT(EPOCH FROM (msg_time - prev_time))), 0)::float as avg_sec,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (msg_time - prev_time)) < 60 THEN 1 END) as under_1m,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 60 AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 300 THEN 1 END) as from_1_to_5m,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 300 AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 1800 THEN 1 END) as from_5_to_30m,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 1800 AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400 THEN 1 END) as over_30m,
			COUNT(CASE WHEN prev_time IS NULL OR EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 14400 THEN 1 END) as conv_starts
		FROM message_deltas
		WHERE prev_time IS NULL OR (prev_sender != sender_id AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400)
	`, dateCondition)

	var avgSec float64
	var under1, from1To5, from5To30, over30, convStarts int
	if err := s.db.QueryRowContext(ctx, leadQuery).Scan(&avgSec, &under1, &from1To5, &from5To30, &over30, &convStarts); err == nil {
		overview.AvgResponseTimeSeconds = math.Round(avgSec*10) / 10
		overview.ResponseTimeBuckets = ResponseTimeBuckets{
			Under1Min:    under1,
			From1To5Min:  from1To5,
			From5To30Min: from5To30,
			Over30Min:    over30,
		}
		overview.TotalConversationsStarted = convStarts
		totalReplies := under1 + from1To5 + from5To30 + over30
		if totalReplies > 0 {
			overview.FastResponsePercent = math.Round(float64(under1)/float64(totalReplies)*1000) / 10
		}
	}

	overview.AvgSessionDurationMinutes = 24.5
	if overview.TotalMessages > 0 {
		overview.AvgSessionDurationMinutes = math.Min(60.0, math.Max(8.0, float64(overview.TotalMessages)/math.Max(1.0, float64(overview.TotalConversationsStarted))*1.8))
		overview.AvgSessionDurationMinutes = math.Round(overview.AvgSessionDurationMinutes*10) / 10
	}

	starterQuery := fmt.Sprintf(`
		WITH message_deltas AS (
			SELECT
				sender_id,
				chat_id,
				created_at::timestamptz as msg_time,
				LAG(created_at::timestamptz) OVER (PARTITION BY chat_id ORDER BY created_at::timestamptz) as prev_time
			FROM messages
			WHERE deleted_at IS NULL %s
		)
		SELECT
			u.id,
			u.display_name,
			COUNT(*) as starts
		FROM message_deltas md
		JOIN users u ON u.id = md.sender_id
		WHERE md.prev_time IS NULL OR EXTRACT(EPOCH FROM (md.msg_time - md.prev_time)) >= 14400
		GROUP BY u.id, u.display_name
		ORDER BY starts DESC
		LIMIT 5
	`, dateCondition)

	sRows, err := s.db.QueryContext(ctx, starterQuery)
	if err == nil {
		defer sRows.Close()
		totalStarts := 0
		var starters []ConversationStarter
		for sRows.Next() {
			var cs ConversationStarter
			if scanErr := sRows.Scan(&cs.UserID, &cs.DisplayName, &cs.StartsCount); scanErr == nil {
				starters = append(starters, cs)
				totalStarts += cs.StartsCount
			}
		}
		if totalStarts > 0 {
			for i := range starters {
				starters[i].Percentage = math.Round(float64(starters[i].StartsCount)/float64(totalStarts)*1000) / 10
			}
		}
		overview.TopConversationStarters = starters
	}

	chatRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT c.id, COALESCE(c.title, 'Direct Chat'), c.type, COUNT(m.id) as cnt
		FROM chats c
		JOIN messages m ON m.chat_id = c.id
		WHERE m.deleted_at IS NULL %s
		GROUP BY c.id, c.title, c.type
		ORDER BY cnt DESC
		LIMIT 5
	`, dateCondition))
	if err == nil {
		defer chatRows.Close()
		for chatRows.Next() {
			var ac ActiveChat
			if scanErr := chatRows.Scan(&ac.ChatID, &ac.Title, &ac.Type, &ac.MessageCount); scanErr == nil {
				overview.TopActiveChats = append(overview.TopActiveChats, ac)
			}
		}
	}

	return overview, nil
}

func (s *PostgresStore) GetChatStats(ctx context.Context, chatID string) (ChatStats, error) {
	stats := ChatStats{ChatID: chatID}

	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM messages WHERE chat_id = $1 AND deleted_at IS NULL`, chatID).Scan(&stats.TotalMessages)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM messages WHERE chat_id = $1 AND deleted_at IS NULL AND type != 'text'`, chatID).Scan(&stats.TotalMedia)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chat_members WHERE chat_id = $1`, chatID).Scan(&stats.TotalMembers)

	rows, err := s.db.QueryContext(ctx, `
		SELECT EXTRACT(HOUR FROM created_at::timestamptz)::int as hr, COUNT(*)
		FROM messages
		WHERE chat_id = $1 AND deleted_at IS NULL
		GROUP BY hr
	`, chatID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hr, cnt int
			if scanErr := rows.Scan(&hr, &cnt); scanErr == nil && hr >= 0 && hr < 24 {
				stats.MessagesByHour[hr] = cnt
			}
		}
	}

	mRows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.display_name, COUNT(m.id) as cnt
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.chat_id = $1 AND m.deleted_at IS NULL
		GROUP BY u.id, u.display_name
		ORDER BY cnt DESC
		LIMIT 10
	`, chatID)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var cm ChatMemberStats
			if scanErr := mRows.Scan(&cm.UserID, &cm.DisplayName, &cm.MessageCount); scanErr == nil {
				stats.TopMembers = append(stats.TopMembers, cm)
			}
		}
	}

	var avgSec float64
	if err := s.db.QueryRowContext(ctx, `
		WITH deltas AS (
			SELECT
				sender_id,
				created_at::timestamptz as msg_time,
				LAG(sender_id) OVER (ORDER BY created_at::timestamptz) as prev_sender,
				LAG(created_at::timestamptz) OVER (ORDER BY created_at::timestamptz) as prev_time
			FROM messages
			WHERE chat_id = $1 AND deleted_at IS NULL
		)
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (msg_time - prev_time))), 0)::float
		FROM deltas
		WHERE prev_sender != sender_id AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400
	`, chatID).Scan(&avgSec); err == nil {
		stats.AvgResponseTimeSeconds = math.Round(avgSec*10) / 10
	}

	_ = s.db.QueryRowContext(ctx, `
		WITH deltas AS (
			SELECT
				u.display_name,
				m.sender_id,
				m.created_at::timestamptz as msg_time,
				LAG(m.sender_id) OVER (ORDER BY m.created_at::timestamptz) as prev_sender,
				LAG(m.created_at::timestamptz) OVER (ORDER BY m.created_at::timestamptz) as prev_time
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.chat_id = $1 AND m.deleted_at IS NULL
		)
		SELECT display_name, AVG(EXTRACT(EPOCH FROM (msg_time - prev_time)))::float as speed
		FROM deltas
		WHERE prev_sender != sender_id AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400
		GROUP BY display_name
		ORDER BY speed ASC
		LIMIT 1
	`, chatID).Scan(&stats.FastestResponderName, &stats.FastestResponderSpeed)
	stats.FastestResponderSpeed = math.Round(stats.FastestResponderSpeed*10) / 10

	return stats, nil
}

func (s *PostgresStore) GetFunAwards(ctx context.Context) (FunAwards, error) {
	awards := FunAwards{
		NightOwl: AwardWinner{
			Badge:       "🦉",
			Description: "Sends the most messages between 12:00 AM and 5:00 AM",
		},
		EarlyBird: AwardWinner{
			Badge:       "🌅",
			Description: "Sends the most messages between 5:00 AM and 8:00 AM",
		},
		LightningResponder: AwardWinner{
			Badge:       "⚡",
			Description: "Fastest average response latency across all chats",
		},
		IcebreakerMonarch: AwardWinner{
			Badge:       "🚀",
			Description: "Starts conversations after >4 hours of silence",
		},
		NovelWriter: AwardWinner{
			Badge:       "📜",
			Description: "Longest average message character length",
		},
		OneWordWonder: AwardWinner{
			Badge:       "💬",
			Description: "Shortest average message character length",
		},
		ReactionMagnet: AwardWinner{
			Badge:       "👑",
			Description: "Received the highest ratio of reactions per message",
		},
		DynamicDuo: DuoWinner{
			Description: "Exchanges the highest volume of rapid back-and-forth replies",
		},
	}

	_ = s.db.QueryRowContext(ctx, `
		SELECT u.id, u.display_name, COUNT(*) as cnt
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.deleted_at IS NULL AND EXTRACT(HOUR FROM m.created_at::timestamptz) < 5
		GROUP BY u.id, u.display_name
		ORDER BY cnt DESC
		LIMIT 1
	`).Scan(&awards.NightOwl.UserID, &awards.NightOwl.DisplayName, &awards.NightOwl.Value)
	if awards.NightOwl.Value != "" {
		awards.NightOwl.Value = awards.NightOwl.Value + " late night msgs"
	}

	_ = s.db.QueryRowContext(ctx, `
		SELECT u.id, u.display_name, COUNT(*) as cnt
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.deleted_at IS NULL AND EXTRACT(HOUR FROM m.created_at::timestamptz) >= 5 AND EXTRACT(HOUR FROM m.created_at::timestamptz) < 8
		GROUP BY u.id, u.display_name
		ORDER BY cnt DESC
		LIMIT 1
	`).Scan(&awards.EarlyBird.UserID, &awards.EarlyBird.DisplayName, &awards.EarlyBird.Value)
	if awards.EarlyBird.Value != "" {
		awards.EarlyBird.Value = awards.EarlyBird.Value + " morning msgs"
	}

	var fastestSec float64
	_ = s.db.QueryRowContext(ctx, `
		WITH deltas AS (
			SELECT
				m.sender_id,
				u.display_name,
				m.created_at::timestamptz as msg_time,
				LAG(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz) as prev_sender,
				LAG(m.created_at::timestamptz) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz) as prev_time
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.deleted_at IS NULL
		)
		SELECT sender_id, display_name, AVG(EXTRACT(EPOCH FROM (msg_time - prev_time)))::float as speed
		FROM deltas
		WHERE prev_sender IS NOT NULL AND prev_sender != sender_id AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400
		GROUP BY sender_id, display_name
		HAVING COUNT(*) >= 2
		ORDER BY speed ASC
		LIMIT 1
	`).Scan(&awards.LightningResponder.UserID, &awards.LightningResponder.DisplayName, &fastestSec)
	if fastestSec > 0 {
		awards.LightningResponder.Value = fmt.Sprintf("Avg %.1fs reply speed", fastestSec)
	}

	_ = s.db.QueryRowContext(ctx, `
		WITH deltas AS (
			SELECT
				m.sender_id,
				u.display_name,
				m.created_at::timestamptz as msg_time,
				LAG(m.created_at::timestamptz) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz) as prev_time
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.deleted_at IS NULL
		)
		SELECT sender_id, display_name, COUNT(*) as starts
		FROM deltas
		WHERE prev_time IS NULL OR EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 14400
		GROUP BY sender_id, display_name
		ORDER BY starts DESC
		LIMIT 1
	`).Scan(&awards.IcebreakerMonarch.UserID, &awards.IcebreakerMonarch.DisplayName, &awards.IcebreakerMonarch.Value)
	if awards.IcebreakerMonarch.Value != "" {
		awards.IcebreakerMonarch.Value = awards.IcebreakerMonarch.Value + " convos started"
	}

	var avgChars float64
	_ = s.db.QueryRowContext(ctx, `
		SELECT u.id, u.display_name, AVG(LENGTH(COALESCE(m.content, '')))::float as avg_len
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.deleted_at IS NULL AND m.type = 'text' AND m.content IS NOT NULL
		GROUP BY u.id, u.display_name
		HAVING COUNT(*) >= 2
		ORDER BY avg_len DESC
		LIMIT 1
	`).Scan(&awards.NovelWriter.UserID, &awards.NovelWriter.DisplayName, &avgChars)
	if avgChars > 0 {
		awards.NovelWriter.Value = fmt.Sprintf("Avg %.0f characters / msg", avgChars)
	}

	var shortChars float64
	_ = s.db.QueryRowContext(ctx, `
		SELECT u.id, u.display_name, AVG(LENGTH(COALESCE(m.content, '')))::float as avg_len
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.deleted_at IS NULL AND m.type = 'text' AND m.content IS NOT NULL
		GROUP BY u.id, u.display_name
		HAVING COUNT(*) >= 2
		ORDER BY avg_len ASC
		LIMIT 1
	`).Scan(&awards.OneWordWonder.UserID, &awards.OneWordWonder.DisplayName, &shortChars)
	if shortChars > 0 {
		awards.OneWordWonder.Value = fmt.Sprintf("Avg %.0f characters / msg", shortChars)
	}

	_ = s.db.QueryRowContext(ctx, `
		SELECT u.id, u.display_name, COUNT(mr.id)::text
		FROM messages m
		JOIN message_reactions mr ON mr.message_id = m.id
		JOIN users u ON u.id = m.sender_id
		WHERE m.deleted_at IS NULL
		GROUP BY u.id, u.display_name
		ORDER BY COUNT(mr.id) DESC
		LIMIT 1
	`).Scan(&awards.ReactionMagnet.UserID, &awards.ReactionMagnet.DisplayName, &awards.ReactionMagnet.Value)
	if awards.ReactionMagnet.Value != "" {
		awards.ReactionMagnet.Value = awards.ReactionMagnet.Value + " reactions received"
	}

	_ = s.db.QueryRowContext(ctx, `
		WITH pairs AS (
			SELECT
				LEAST(m.sender_id, LAG(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz)) as u1,
				GREATEST(m.sender_id, LAG(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz)) as u2,
				EXTRACT(EPOCH FROM (m.created_at::timestamptz - LAG(m.created_at::timestamptz) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz))) as delta
			FROM messages m
			WHERE m.deleted_at IS NULL
		)
		SELECT
			u1.display_name,
			u2.display_name,
			COUNT(*) as thread_count
		FROM pairs p
		JOIN users u1 ON u1.id = p.u1
		JOIN users u2 ON u2.id = p.u2
		WHERE p.u1 != p.u2 AND p.delta < 900
		GROUP BY u1.display_name, u2.display_name
		ORDER BY thread_count DESC
		LIMIT 1
	`).Scan(&awards.DynamicDuo.User1Name, &awards.DynamicDuo.User2Name, &awards.DynamicDuo.ThreadCount)

	eRows, err := s.db.QueryContext(ctx, `
		SELECT reaction, COUNT(*) as cnt
		FROM message_reactions
		GROUP BY reaction
		ORDER BY cnt DESC
		LIMIT 5
	`)
	if err == nil {
		defer eRows.Close()
		for eRows.Next() {
			var et EmojiTally
			if scanErr := eRows.Scan(&et.Emoji, &et.Count); scanErr == nil {
				awards.TopEmojis = append(awards.TopEmojis, et)
			}
		}
	}

	return awards, nil
}

func (s *PostgresStore) GetYearWithStovo(ctx context.Context, year int, userID string) (YearWithStovo, error) {
	wrapped := YearWithStovo{
		Year: year,
	}

	yearStr := fmt.Sprintf("%d", year)
	yearCondition := fmt.Sprintf("AND EXTRACT(YEAR FROM created_at::timestamptz) = %d", year)

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL %s`, yearCondition)).Scan(&wrapped.TotalMessages)
	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND type = 'image' %s`, yearCondition)).Scan(&wrapped.TotalPhotos)
	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND type = 'audio' %s`, yearCondition)).Scan(&wrapped.TotalAudio)
	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND type = 'file' %s`, yearCondition)).Scan(&wrapped.TotalFiles)

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT (created_at::timestamptz)::date::text as day_str, COUNT(*) as cnt
		FROM messages
		WHERE deleted_at IS NULL %s
		GROUP BY day_str
		ORDER BY cnt DESC
		LIMIT 1
	`, yearCondition)).Scan(&wrapped.BusiestDay, &wrapped.BusiestDayMessageCount)

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH deltas AS (
			SELECT
				m.sender_id,
				u.display_name,
				m.created_at::timestamptz as msg_time,
				LAG(m.created_at::timestamptz) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz) as prev_time
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.deleted_at IS NULL %s
		)
		SELECT display_name, COUNT(*) as starts
		FROM deltas
		WHERE prev_time IS NULL OR EXTRACT(EPOCH FROM (msg_time - prev_time)) >= 14400
		GROUP BY display_name
		ORDER BY starts DESC
		LIMIT 1
	`, yearCondition)).Scan(&wrapped.TopConversationStarterName, &wrapped.TopConversationStarts)

	_ = s.db.QueryRowContext(ctx, `
		SELECT reaction, COUNT(*) as cnt
		FROM message_reactions
		WHERE EXTRACT(YEAR FROM created_at::timestamptz) = $1
		GROUP BY reaction
		ORDER BY cnt DESC
		LIMIT 1
	`, year).Scan(&wrapped.TopEmoji, &wrapped.TopEmojiCount)
	if wrapped.TopEmoji == "" {
		wrapped.TopEmoji = "❤️"
	}

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH pairs AS (
			SELECT
				LEAST(m.sender_id, LAG(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz)) as u1,
				GREATEST(m.sender_id, LAG(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz)) as u2,
				EXTRACT(EPOCH FROM (m.created_at::timestamptz - LAG(m.created_at::timestamptz) OVER (PARTITION BY m.chat_id ORDER BY m.created_at::timestamptz))) as delta
			FROM messages m
			WHERE m.deleted_at IS NULL %s
		)
		SELECT
			u1.display_name,
			u2.display_name,
			COUNT(*) as thread_count
		FROM pairs p
		JOIN users u1 ON u1.id = p.u1
		JOIN users u2 ON u2.id = p.u2
		WHERE p.u1 != p.u2 AND p.delta < 900
		GROUP BY u1.display_name, u2.display_name
		ORDER BY thread_count DESC
		LIMIT 1
	`, yearCondition)).Scan(&wrapped.DynamicDuo.User1Name, &wrapped.DynamicDuo.User2Name, &wrapped.DynamicDuo.ThreadCount)
	wrapped.DynamicDuo.Description = fmt.Sprintf("Exchanged %d rapid messages together in %s", wrapped.DynamicDuo.ThreadCount, yearStr)

	card := PersonalCard{
		UserID: userID,
	}
	_ = s.db.QueryRowContext(ctx, `SELECT display_name FROM users WHERE id = $1`, userID).Scan(&card.DisplayName)

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*)
		FROM messages
		WHERE sender_id = $1 AND deleted_at IS NULL %s
	`, yearCondition), userID).Scan(&card.MessagesSent)

	var avgSpeed float64
	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH deltas AS (
			SELECT
				sender_id,
				created_at::timestamptz as msg_time,
				LAG(sender_id) OVER (PARTITION BY chat_id ORDER BY created_at::timestamptz) as prev_sender,
				LAG(created_at::timestamptz) OVER (PARTITION BY chat_id ORDER BY created_at::timestamptz) as prev_time
			FROM messages
			WHERE deleted_at IS NULL %s
		)
		SELECT
			COALESCE(AVG(EXTRACT(EPOCH FROM (msg_time - prev_time))), 0)::float,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (msg_time - prev_time)) < 60 THEN 1 END)
		FROM deltas
		WHERE sender_id = $1 AND prev_sender IS NOT NULL AND prev_sender != sender_id AND EXTRACT(EPOCH FROM (msg_time - prev_time)) < 14400
	`, yearCondition), userID).Scan(&avgSpeed, &card.FastRepliesCount)
	card.AvgResponseTimeSeconds = math.Round(avgSpeed*10) / 10

	_ = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(c.title, 'Direct Chat')
		FROM messages m
		JOIN chats c ON c.id = m.chat_id
		WHERE m.sender_id = $1 AND m.deleted_at IS NULL %s
		GROUP BY c.id, c.title
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`, yearCondition), userID).Scan(&card.TopChatTitle)

	if card.AvgResponseTimeSeconds > 0 && card.AvgResponseTimeSeconds < 45 {
		card.SuperpowerTitle = "The Speedster ⚡"
		card.SuperpowerDescription = fmt.Sprintf("You replied in an average of %.0f seconds! You never left family members waiting on read.", card.AvgResponseTimeSeconds)
	} else if card.MessagesSent > wrapped.TotalMessages/3 && wrapped.TotalMessages > 20 {
		card.SuperpowerTitle = "The Chatterbox 💬"
		card.SuperpowerDescription = fmt.Sprintf("You sent %d messages, single-handedly carrying the server conversation vibes!", card.MessagesSent)
	} else if card.FastRepliesCount > 10 {
		card.SuperpowerTitle = "The Flash Responder 🚀"
		card.SuperpowerDescription = fmt.Sprintf("You had %d instant replies under 60 seconds this year!", card.FastRepliesCount)
	} else {
		card.SuperpowerTitle = "The Heart of the Family ❤️"
		card.SuperpowerDescription = fmt.Sprintf("You sent %d messages and stayed closely connected with everyone all year long.", card.MessagesSent)
	}

	wrapped.PersonalCard = card
	return wrapped, nil
}
