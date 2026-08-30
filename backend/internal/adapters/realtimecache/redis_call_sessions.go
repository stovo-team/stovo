package realtimecache

import (
	"context"
	"time"

	workruntime "stovo-messenger/backend/internal/runtime"

	"github.com/redis/go-redis/v9"
)

type RedisCallSessionCache struct{ client *redis.Client }

func NewRedisCallSessionCache(client *redis.Client) *RedisCallSessionCache {
	return &RedisCallSessionCache{client: client}
}

func (c *RedisCallSessionCache) Save(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *RedisCallSessionCache) Load(ctx context.Context, key string) ([]byte, bool, error) {
	value, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	return value, err == nil, err
}

func (c *RedisCallSessionCache) Delete(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

var _ workruntime.CallSessionCache = (*RedisCallSessionCache)(nil)
