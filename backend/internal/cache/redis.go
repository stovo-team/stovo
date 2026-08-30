package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
}

func NewRedisCache(client *redis.Client) *RedisCache {
	return &RedisCache{client: client}
}

func (c *RedisCache) Health(ctx context.Context) error { return c.client.Ping(ctx).Err() }

func (c *RedisCache) Get(ctx context.Context, key string) (any, error) {
	rawValue, err := c.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var payload any
	if err := json.Unmarshal([]byte(rawValue), &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (c *RedisCache) Set(ctx context.Context, key string, value any, ttlSeconds int) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	ttl := time.Duration(0)
	if ttlSeconds > 0 {
		ttl = time.Duration(ttlSeconds) * time.Second
	}
	return c.client.Set(ctx, key, payload, ttl).Err()
}

func (c *RedisCache) Delete(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

func (c *RedisCache) Exists(ctx context.Context, key string) (bool, error) {
	result, err := c.client.Exists(ctx, key).Result()
	return result > 0, err
}

func (c *RedisCache) Increment(ctx context.Context, key string, ttlSeconds int) (int64, error) {
	pipe := c.client.TxPipeline()
	count := pipe.Incr(ctx, key)
	if ttlSeconds > 0 {
		pipe.ExpireNX(ctx, key, time.Duration(ttlSeconds)*time.Second)
	}
	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return count.Val(), nil
}
