-- APIShield Atomic Sliding-Window Rate Limiter
-- KEYS[1]: Rate limit key (e.g. ratelimit:{apiId}:{apiKeyId})
-- ARGV[1]: Limit (integer, e.g. 60)
-- ARGV[2]: Window in seconds (integer, e.g. 60)
-- ARGV[3]: Unique request member suffix (e.g. req_uuid)

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local member_suffix = tostring(ARGV[3])

-- 1. Obtain authoritative Redis server time
local time_arr = redis.call('TIME')
local now_sec = tonumber(time_arr[1])
local now_usec = tonumber(time_arr[2])
local now_ms = (now_sec * 1000) + math.floor(now_usec / 1000)

local window_ms = window_seconds * 1000
local window_start_ms = now_ms - window_ms

-- 2. Prune expired entries outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start_ms)

-- 3. Count current active requests in window
local current_count = redis.call('ZCARD', key)

-- 4. Evaluate limit
if current_count < limit then
    -- Request Allowed
    local member = tostring(now_ms) .. ':' .. member_suffix
    redis.call('ZADD', key, now_ms, member)
    redis.call('EXPIRE', key, window_seconds + 60)

    local remaining = limit - current_count - 1
    if remaining < 0 then
        remaining = 0
    end

    local reset_at_sec = math.ceil((now_ms + window_ms) / 1000)

    -- Return: [allowed (1), limit, remaining, reset_at_sec, retry_after_sec (0)]
    return {1, limit, remaining, reset_at_sec, 0}
else
    -- Request Blocked (429 Rate Limit Exceeded)
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest_ts = now_ms
    if oldest and #oldest >= 2 then
        oldest_ts = tonumber(oldest[2])
    end

    local reset_at_ms = oldest_ts + window_ms
    local retry_after_sec = math.max(1, math.ceil((reset_at_ms - now_ms) / 1000))
    local reset_at_sec = math.ceil(reset_at_ms / 1000)

    -- Return: [allowed (0), limit, remaining (0), reset_at_sec, retry_after_sec]
    return {0, limit, 0, reset_at_sec, retry_after_sec}
end
