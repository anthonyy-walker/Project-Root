# Epic Games API Rate Limits

This document details the rate limits for all Epic Games APIs used in this project.

## Summary Table

| API | Endpoint | Rate Limit | Used By | Notes |
|-----|----------|-----------|---------|-------|
| Links Service | `/links/api/fn/mnemonic` | **10 requests/minute** | map-ingestion.js | Bulk endpoint: 100 maps per request |
| POPS API | `/content/api/pages/fortnite-game/creative/v1/{creatorId}` | **30 requests/minute** | creator-ingestion.js | Creator profiles only |
| Creator Page API | `/links/api/fn/creator/page/{creatorId}` | **No limit** | creator-ingestion.js, creator-maps-discovery.js | Fast, no throttling needed |
| Discovery Surface | `/discovery/surface/{surfaceName}` | **No limit** | discovery-monitor.js | Multiple parallel requests work fine |
| Discovery Page | `/discovery/surface/{surfaceName}/page` | **No limit** | discovery-monitor.js | Multiple parallel requests work fine |

## Detailed Information

### 1. Links Service API - Map Metadata

**Endpoint**: `https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic`

**Rate Limit**: **10 requests per minute**

**Implementation**:
```javascript
// File: workers/ingestion/map-ingestion.js
const REQUESTS_PER_MINUTE = 10;
const BATCH_DELAY = (60 / REQUESTS_PER_MINUTE) * 1000; // 6 seconds
```

**Request Details**:
- Method: POST (bulk)
- Max maps per request: 100
- Effective throughput: 1000 maps/minute
- Authentication: Bearer token required

**Worker Implementation**:
- Processes maps in batches of 100
- 6-second delay between requests
- Sequential processing to respect rate limit

**Example Request**:
```javascript
const response = await axios.post(
  'https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic?ignoreFailures=true',
  [
    { mnemonic: '1111-1111-1111', linkType: '', filter: false, v: '' },
    { mnemonic: '2222-2222-2222', linkType: '', filter: false, v: '' },
    // ... up to 100 maps
  ],
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
);
```

**Error Responses**:
- `429 Too Many Requests`: Rate limit exceeded
- Implement exponential backoff if encountered

---

### 2. POPS API - Creator Profiles

**Endpoint**: `https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/content/api/pages/fortnite-game/creative/v1/{creatorId}`

**Rate Limit**: **30 requests per minute**

**Implementation**:
```javascript
// File: workers/ingestion/creator-ingestion.js
const BATCH_SIZE = 24; // Process 24 creators in parallel
const BATCH_DELAY = 60000; // 60 seconds between batches
// Stagger requests by 2.5 seconds each within batch
```

**Request Details**:
- Method: GET
- Returns: Profile data, follower count, images, socials
- Authentication: Bearer token + playerId query param required

**Worker Implementation**:
- Processes 24 creators in parallel
- Each request staggered by 2.5 seconds (24 × 2.5s = 60s)
- Effective rate: ~24 requests/minute (safe margin)

**Example Request**:
```javascript
const response = await axios.get(
  'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/content/api/pages/fortnite-game/creative/v1/${creatorId}?playerId=${playerId}',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
);
```

**Response Data**:
```json
{
  "displayName": "Creator Name",
  "bio": "Creator bio text",
  "followerCount": 12345,
  "images": {
    "avatar": "https://...",
    "banner": "https://..."
  },
  "social": {
    "youtube": "channel_id",
    "twitter": "handle",
    "twitch": "username"
  }
}
```

---

### 3. Creator Page API - Creator's Maps

**Endpoint**: `https://links-public-service-live.ol.epicgames.com/links/api/fn/creator/page/{creatorId}`

**Rate Limit**: **None observed**

**Implementation**:
```javascript
// File: workers/ingestion/creator-maps-discovery.js
const BATCH_SIZE = 100; // Process 100 creators in parallel
// No delay needed - no rate limiting
```

**Request Details**:
- Method: GET
- Returns: List of maps with CCU data
- Pagination: Use `olderThan` parameter
- Authentication: Bearer token + playerId query param required

**Worker Implementation**:
- Processes 100 creators in parallel batches
- No rate limiting needed
- Full scan of 162K creators: ~15 minutes

**Example Request**:
```javascript
const response = await axios.get(
  'https://links-public-service-live.ol.epicgames.com/links/api/fn/creator/page/${creatorId}?playerId=${accountId}&limit=100',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
);
```

**Response Data**:
```json
{
  "creatorId": "account_id",
  "links": [
    {
      "linkCode": "1111-1111-1111",
      "mnemonic": "map-name",
      "globalCCU": 150,
      "lastActivatedDate": "2024-01-15T10:30:00Z"
    }
  ],
  "hasMore": true
}
```

**Pagination**:
```javascript
// For next page:
const nextPage = await getCreatorMaps(
  creatorId,
  accessToken,
  accountId,
  100,
  lastMap.lastActivatedDate // olderThan parameter
);
```

---

### 4. Discovery Surface API - Panel List

**Endpoint**: `https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/discovery/surface/{surfaceName}`

**Rate Limit**: **None observed**

**Implementation**:
```javascript
// File: workers/monitoring/discovery-monitor.js
// Multiple surfaces fetched in parallel
// No rate limiting needed
```

**Request Details**:
- Method: POST
- Returns: List of panels for a surface
- Authentication: Bearer token + X-Epic-Access-Token header required

**Example Request**:
```javascript
const response = await axios.post(
  'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/discovery/surface/CreativeDiscoverySurface_Frontend?appId=Fortnite&stream=${branch}',
  {},
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Epic-Access-Token': xAccessToken,
      'Content-Type': 'application/json'
    }
  }
);
```

---

### 5. Discovery Page API - Panel Contents

**Endpoint**: `https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/discovery/surface/{surfaceName}/page`

**Rate Limit**: **None observed**

**Implementation**:
```javascript
// File: workers/monitoring/discovery-monitor.js
// All regions processed in parallel
// Multiple panels fetched simultaneously
// No rate limiting needed
```

**Request Details**:
- Method: POST
- Returns: Maps in a panel with pagination
- Pagination: Use `page` parameter
- Authentication: Bearer token + X-Epic-Access-Token header required

**Example Request**:
```javascript
const response = await axios.post(
  'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/public/discovery/surface/CreativeDiscoverySurface_Frontend/page?appId=Fortnite&stream=${branch}',
  {
    testVariantName: "variant",
    surfaceName: "CreativeDiscoverySurface_Frontend",
    panelName: "Recently Popular",
    region: "NAE",
    page: 0,
    resultsPerPage: 50,
    playerId: accountId
  },
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Epic-Access-Token': xAccessToken,
      'Content-Type': 'application/json'
    }
  }
);
```

**Response Data**:
```json
{
  "results": [
    {
      "linkCode": "1111-1111-1111",
      "title": "Map Title",
      "imageUrl": "https://...",
      "creatorName": "Creator Name"
    }
  ],
  "hasMore": true
}
```

---

## Best Practices

### 1. Respect Rate Limits
- Always implement delays between requests
- Use exponential backoff for errors
- Monitor for 429 responses

### 2. Batch When Possible
- Links Service supports 100 maps per request - use it!
- Process multiple creators in parallel for non-limited APIs

### 3. Error Handling
```javascript
try {
  const response = await apiCall();
} catch (error) {
  if (error.response?.status === 429) {
    // Rate limit exceeded - wait longer
    await sleep(60000); // Wait 1 minute
    return retry();
  }
  throw error;
}
```

### 4. Token Management
- Tokens expire after ~4 hours
- Auto-refresh 5 minutes before expiration
- Refresh tokens valid for 8 hours
- Always check token validity before API calls

### 5. Monitoring
- Log all rate limit errors
- Track API call counts
- Monitor response times
- Alert on sustained errors

## Testing Rate Limits

To test rate limits safely:

```bash
# Test Links Service (10/min limit)
node -e "
const axios = require('axios');
for(let i=0; i<15; i++) {
  axios.post('endpoint', data).then(() => console.log(\`\${i+1} OK\`));
}
"
```

**Expected behavior**:
- First 10 requests: Success
- Requests 11+: 429 Too Many Requests

## Updates

Rate limits may change. Last verified: December 2024

If you encounter new rate limits:
1. Document the endpoint and limit
2. Update worker implementation
3. Update this document
4. Test thoroughly before deploying
