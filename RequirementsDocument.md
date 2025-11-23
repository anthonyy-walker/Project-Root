













Project Root Requirements Document
Derived from Project Harvest
Version 1.0
Owner: Anthony Walker
Last Updated: Nov 23, 2025






















1. Overview
Project Root is a continuation of Project Harvest. Project Root is a real-time Fortnite Creative analytics platform that collects, processes, stores, and serves insights about:

Maps
Creators
Discovery Trends
CCU trends
Engagement & retention
Creator growth signals

The system powers:
A mobile app (iOS & Android)
A web that redirects to the APP store for download
The Unreal Hub public Discord bot

Root 1.0 is a full rebuild of Harvest focusing on standardization, speed, reliability, and clear data architecture.

2. Goals
Primary Goals
Create a unified, standardized data ingestion pipeline for Fortnite Creative data.
Enable instant (<50ms) API response times for mobile + web clients.
Provide daily, hourly, and real-time analytics for maps, creators, and Discovery in app

Secondary Goals
Build an app-store ready iOS/Android experience.
Create a scalable backend that supports 10k+ users.
Maintain clean separation between ingestion, analytics, storage, and API layers.


3. Functional Requirements
3.1 Data Ingestion
System must ingest the following data from Epic’s public APIs:

3.1.1 Creator Data
Search creators by display name
Pull creator page (maps, global CCU, metadata)
Fetch POPS creator details (bio, socials, images, follower count)

3.1.2 Map Data
Fetch mnemonic info (metadata, categories, activation history ect…)
Pull map performance metrics
Pull historical CCU snapshots (periodic)
Track top performers by tag

3.1.3 Discovery Data
Fetch Discovery surfaces
Fetch panel list per surface
Fetch all panel pages (with correct positions)
Track movement over time
Track “top performers” by surface & category

3.1.4 Scheduling
Must support:
10 minute ingestion
Daily data aggregation
On-demand pullers (API-triggered)








3.2 Data Storage

The system must store data in 2 layers:

3.2.1 Elasticsearch (Primary Analytics Store)

**Core Entities:**
- Maps (metadata, images, tags, player counts)
- Creators (profiles, socials, follower counts)
- CreatorFavorites
- ConcurrentUsers (CCU tracking)
- MapChangeLog
- CreatorChangeLog

**Discovery Data (Event-Based Storage - 99.5% more efficient):**
- DiscoverySnapshots → Replaced with 3 indexes:
  - `discovery-current` - Real-time state (2.4MB constant)
  - `discovery-events` - Change log (ADDED/REMOVED/MOVED events, ~10MB/month)
  - `discovery-daily` - Daily aggregates (~27MB/month)
- **Storage Savings**: 10MB/month vs 2GB/month with full snapshots
- **Retention**: Events for 90 days, daily summaries forever

**Ecosystem API Metrics (From Epic):**
- MapFavorites (daily)
- MinutesPlayed (daily)
- AverageMinutesPerPlayer (daily)
- Recommendations (daily)
- UniquePlayers (daily)
- Plays/Sessions (daily)
- Retention (D1/D7, daily)

**In-App Data:**
- User authentication
- Favorites & watchlist
- Notification Alerts
- Saved creators
- App usage logs

**Total Storage Estimate:**
- Year 1: ~500MB (discovery) + 50GB (CCU) + 2GB (metrics) = ~53GB
- After aggregation: ~5GB/year ongoing

3.2.2 Redis (Realtime Cache)
For everything refreshed every 10 minutes












6. Mobile App Requirements (React Native)
6.1 Features
Map search

Creator search

Trending maps list

Personalized recommendations (AI)

Discovery rankings

Creator analytics pages

Map analytics pages

Save/favorite maps

Push notifications for changes

6.2 Performance

Instant loading using Redis

Offline caching for recent pages

Smooth 60fps UI animations


---


## 7. Implementation Plan of Action

### Phase 1: Foundation & Infrastructure Setup (Week 1-2)

#### 1.1 Project Architecture Setup
- **Initialize Node.js Backend Project**
  - Set up Express.js server
  - Configure TypeScript (optional but recommended)
  - Set up project structure:
    ```
    /backend
      /src
        /api          # API routes/controllers
        /services     # Business logic layer
        /repositories # Data access layer
        /ingestion    # Data collection services
        /utils        # Helper functions
        /middleware   # Express middleware
        /config       # Configuration files
      /tests          # Unit & integration tests
    ```
  - Configure environment variables (.env)
  - Set up logging (Winston/Pino)
  - Configure ESLint & Prettier

#### 1.2 Database Setup
- **Elasticsearch Configuration**
  - Install and configure Elasticsearch cluster
  - Define index mappings for:
    - `maps` - Map metadata, stats, and historical data
    - `creators` - Creator profiles and aggregated stats
    - `creator_favorites` - User favorites tracking
    - `discovery_snapshots` - Time-series discovery data
    - `concurrent_users` - CCU time-series data
    - `map_changelog` - Historical map changes
    - `creator_changelog` - Historical creator changes
  - Set up index lifecycle management (ILM) policies For CCU
  - Configure backup & recovery
  
- **Redis Configuration**
  - Install and configure Redis cluster
  - Define cache key patterns:
    - `map:{mnemonic}` - Map details (TTL: 10 min)
    - `creator:{accountId}` - Creator details (TTL: 10 min)
    - `discovery:{surface}:{date}` - Discovery snapshots (TTL: 10 min)
    - `ccu:total` - Total CCU (TTL: 5 min)
    - `ccu:map:{mnemonic}` - Map-specific CCU (TTL: 5 min)
  - Configure Redis persistence (AOF/RDB)
  - Set up Redis Pub/Sub for real-time updates

#### 1.3 Epic Games API Integration
- **Authentication Service**
  - Port existing `auth.js` to service layer
  - Implement token refresh mechanism
  - Store tokens securely (encrypted at rest)
  - Add token validation middleware
  
- **API Client Services** (Port from HowToAccessEpicGames)
  - `MapService` - mnemonicInfoAPI.js integration
  - `CreatorService` - creatorPageAPI.js + popsAPI.js integration
  - `DiscoveryService` - discoveryClient.js integration
  - Implement rate limiting (respect Epic's limits)
  - Add retry logic with exponential backoff
  - Error handling & logging

### Phase 2: Data Ingestion Pipeline (Week 3-4)

#### 2.1 Scheduled Ingestion Workers
- **10-Minute Real-Time Ingestion**
  - Create cron job/scheduler (node-cron or Bull)
  - Fetch Discovery snapshots (all surfaces, ~24 seconds)
  - **NEW: Event-Based Discovery Processing**
    - Compare with previous snapshot
    - Detect changes (ADDED/REMOVED/MOVED events only)
    - Insert ~100-500 events per cycle (not 2,436 full records!)
    - Update `discovery-current` table (upsert)
    - Insert events into `discovery-events` table
    - 99.5% storage reduction vs full snapshots
  - Fetch CCU for top 500 maps
  - Update Redis cache
  - Stream updates to Elasticsearch
  
- **Hourly Aggregation**
  - Aggregate CCU trends:
    - 1 day = every 10 minutes
    - 1 week = every 30 minutes
    - 1 month = twice a day
    - 1 year = once a day
  - Calculate hourly metrics
  - Update map rankings
  - Detect trending maps
  
- **Daily Aggregation (00:00 UTC)**
  - Full creator page scans
  - **NEW: Discovery Daily Rollup**
    - Aggregate yesterday's discovery events
    - Calculate avgPosition, appearances per map
    - Store in `discovery-daily` table
    - ~27MB/month storage for historical analytics
  - Historical data aggregation
  - Calculate daily/weekly growth metrics
  - Clean up old cache entries (discovery events > 90 days)

#### 2.2 On-Demand Pullers
- **Map Detail Puller**
  - Endpoint: `/ingestion/map/{mnemonic}`
  - Fetch mnemonic info from Epic
  - Fetch creator details
  - Store in Elasticsearch
  - Cache in Redis
  
- **Creator Detail Puller**
  - Endpoint: `/ingestion/creator/{accountId}`
  - Fetch creator page (all maps)
  - Fetch POPS details
  - Store in Elasticsearch
  - Cache in Redis

#### 2.3 Data Transformation Layer
- **Map Data Transformer**
  - Transform Epic API response to match fn360 schema
  - Calculate derived fields (state, discovery_intent)
  - Validate and sanitize data
  
- **Creator Data Transformer**
  - Merge creator page + POPS data
  - Calculate follower growth
  - Aggregate map statistics
  
- **Discovery Data Transformer (Event-Based)**
  - **Change Detection Logic**:
    ```javascript
    // Compare current vs previous snapshot
    detectChanges(prev, current) {
      const changes = [];
      
      // ADDED: New map in panel
      current.forEach(item => {
        if (!prev.has(item.mapCode)) {
          changes.push({ type: 'ADDED', ...item });
        }
      });
      
      // MOVED: Position changed
      current.forEach(item => {
        const prevItem = prev.get(item.mapCode);
        if (prevItem && prevItem.position !== item.position) {
          changes.push({ 
            type: 'MOVED', 
            previousPosition: prevItem.position,
            ...item 
          });
        }
      });
      
      // REMOVED: Map no longer in panel
      prev.forEach(item => {
        if (!current.has(item.mapCode)) {
          changes.push({ type: 'REMOVED', mapCode: item.mapCode });
        }
      });
      
      return changes; // Typically 100-500, not 2,436!
    }
    ```
  - Store events only, not full snapshots every 10 min
  - Track position changes over time
  - Calculate rankings from current state table

### Phase 3: API Layer (Week 5-6)

#### 3.1 REST API Endpoints (Match fn360 schema exactly)

**Map Endpoints:**
- `GET /api/maps` - List all maps with pagination
- `GET /api/maps/:mnemonic` - Get map details
- `GET /api/maps/:mnemonic/changelog` - Get map change history
- `GET /api/maps/:mnemonic/discovery` - Get discovery positions
- `POST /api/maps/:mnemonic/v2/stats` - Get time-series CCU data
- `GET /api/maps/total/stats/latest` - Get total Fortnite Creative CCU

**Creator Endpoints:**
- `GET /api/creators` - List all creators with pagination
- `GET /api/creators/:accountId` - Get creator details
- `GET /api/creators/:accountId/maps` - Get creator's maps
- `GET /api/creators/:accountId/changelog` - Get creator change history

**Discovery Endpoints:**
- `GET /api/discovery/surface` - Get all discovery surfaces
- `GET /api/discovery/surface?surface={name}` - Get specific surface
- `GET /api/discovery/top?panel={name}` - Get top maps by panel

**External Data:**
- `GET /api/external/server_status` - Fortnite server status

#### 3.2 API Response Format
- Match fn360 schema exactly:
  ```json
  {
    "success": true|false,
    "data": {...},
    "timestamp": "ISO8601",
    "error": "error.code" (if success=false)
  }
  ```


### Phase 4: Mobile App Foundation (Week 7-8)

#### 4.1 React Native Setup
- Initialize React Native project (Expo or bare)
- Set up navigation (React Navigation)
- Configure state management (Redux Toolkit / Zustand)
- Set up API client (Axios/React Query)
- Configure environment variables

#### 4.2 Authentication System
- User registration/login
- JWT token management
- Biometric authentication
- Password reset flow

#### 4.3 Core Screens (MVP)
- Home/Dashboard
- Map Search & Details
- Creator Search & Details
- Discovery Rankings
- Favorites/Watchlist
- User Profile

#### 4.4 Data Layer
- API service integration
- Offline caching (AsyncStorage/MMKV)
- Real-time updates (WebSocket/SSE)
- Image caching (FastImage)

### Phase 5: Advanced Features (Week 9-10)

#### 5.1 Real-Time Features
- WebSocket server for live CCU updates
- Push notifications (FCM/APNs)
- Real-time alerts (map trending, creator milestones)

#### 5.2 Analytics & Insights
- Trending algorithm
- Recommendation engine (AI/ML)
- Growth signals detection
- Retention analysis

#### 5.3 User Features
- Favorites management
- Custom watchlists
- Notification preferences
- Search history

### Phase 6: Testing & Optimization (Week 11-12)

#### 6.1 Backend Testing
- Unit tests (Jest)
- Integration tests
- Load testing (k6/Artillery)
- API contract testing

#### 6.2 Mobile Testing
- Unit tests (Jest)
- Component tests (React Testing Library)
- E2E tests (Detox)
- Performance profiling

#### 6.3 Performance Optimization
- Database query optimization
- Redis cache hit rate analysis
- API response time optimization (<50ms target)
- Mobile app bundle size optimization

### Phase 7: Deployment & Launch (Week 13-14)

#### 7.1 Backend Deployment
- Containerize services (Docker)
- Set up CI/CD pipeline (GitHub Actions)
- Deploy to cloud (AWS/GCP/Azure)
- Configure monitoring (Grafana/Datadog)
- Set up alerting

#### 7.2 Mobile App Deployment
- iOS App Store submission
- Android Play Store submission
- Beta testing (TestFlight/Firebase)
- App Store Optimization (ASO)

#### 7.3 Discord Bot Integration
- Port existing Unreal Hub bot
- Integrate with new API
- Deploy bot infrastructure

---

## 8. Technical Stack Recommendations

### Backend
- **Runtime:** Node.js 20+ (LTS)
- **Framework:** Express.js / Fastify
- **Language:** TypeScript (strongly recommended)
- **Database:** Elasticsearch 8.x
- **Cache:** Redis 7.x
- **Job Queue:** Bull / BullMQ
- **Testing:** Jest, Supertest
- **Monitoring:** Prometheus + Grafana
- **Logging:** Winston / Pino

### Mobile
- **Framework:** React Native 0.73+
- **State:** Redux Toolkit / Zustand
- **Navigation:** React Navigation
- **API Client:** Axios + React Query
- **Styling:** Styled Components / NativeWind
- **Testing:** Jest + Detox
- **Analytics:** Firebase Analytics

### DevOps
- **Version Control:** Git + GitHub
- **CI/CD:** GitHub Actions
- **Containerization:** Docker + Docker Compose
- **Orchestration:** Kubernetes (optional)
- **Cloud:** AWS / GCP / Azure
- **CDN:** CloudFlare

---

## 9. Key Design Decisions

### 9.1 Data Flow Architecture
```
Epic Games API → Ingestion Workers → Elasticsearch (source of truth)
                                   ↓
                                  Redis (cache layer)
                                   ↓
                                REST API
                                   ↓
                          Mobile App / Web / Bot
```

### 9.2 Caching Strategy
- **Hot Data (Redis):** Frequently accessed, 5-10 min TTL
- **Warm Data (Elasticsearch):** Historical, always available
- **Cold Data:** Archive old data (>6 months) to S3/BigQuery

### 9.3 Rate Limiting
- **Epic API:** Respect their limits, implement backoff
- **Public API:** 100 req/min per IP, 1000 req/min per user
- **Internal API:** Unlimited for ingestion services

### 9.4 Scalability Considerations
- Horizontal scaling for API servers (stateless)
- Elasticsearch sharding by time (monthly indices)
- Redis clustering for high availability
- Message queue for async processing

---

## 10. Success Metrics

### Technical Metrics
- API response time: <50ms (p95)
- API uptime: 99.9%
- Cache hit rate: >80%
- Data freshness: <10 minutes

### Product Metrics
- Daily active users: 1,000+ (Month 1)
- User retention: 40%+ (Day 7)
- App store rating: 4.5+
- Crash-free rate: 99.5%

---

## 11. Risk Mitigation

### Technical Risks
- **Epic API changes:** Monitor API, maintain flexibility
- **Rate limiting:** Implement smart caching, reduce calls
- **Data consistency:** Use transactions, validation layers
- **Scaling issues:** Plan for 10x growth from day 1

### Product Risks
- **User acquisition:** Launch with strong content, community engagement
- **Retention:** Continuous feature updates, notification strategy
- **Competition:** Differentiate with real-time data, better UX

---

## 12. Next Immediate Steps

1. **Set up development environment**
   - Install Node.js, Docker, Elasticsearch, Redis
   - Initialize backend project structure
   - Port Epic Games API clients

2. **Define Elasticsearch schemas**
   - Map exact fn360 response format to ES indices
   - Create index templates
   - Set up development cluster

3. **Build MVP ingestion pipeline**
   - Start with single map ingestion
   - Test Epic API integration
   - Validate data transformation

4. **Create first API endpoints**
   - GET /api/maps/:mnemonic
   - Match fn360 response format exactly
   - Test with real data

5. **Set up monitoring & logging**
   - CloudWatch/Datadog integration
   - Error tracking (Sentry)
   - Performance monitoring

