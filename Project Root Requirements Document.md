













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
Maps
Creators
CreatorFaviortes
DiscoverySnapshots
ConcurrentUsers
MapChangeLog
CreatorChangeLog
(From EcosystemAPI)
MapFavorites
MinutesPlayed
AverageMinutesPerPlayer
Recomendations
UniquePlayers
Plays
Retention
(In App Data)
User authentication
Favorites & watchlist
Notification Alerts
Saved creators
App usage logs

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

