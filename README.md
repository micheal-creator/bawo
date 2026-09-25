# bawo

Real-time messaging MVP: a Node.js + TypeScript + Socket.IO backend, PostgreSQL for users/conversations/messages, Redis for presence and OTP, and an Expo React Native client.

Features: 1:1 chat, voice and video calls (WebRTC), 24-hour status updates, communities with a post feed, a classifieds shop, and phone numbers that are stored as E.164 while being shown in the local format the user typed.

## Layout

```
bawo/
  server/   Node.js + TypeScript API and Socket.IO realtime server
  mobile/   Expo React Native client (Expo Router)
  docker-compose.yml   Postgres + Redis for local development
```

## Requirements

- Node.js 22.13+ (required by React Native 0.86)
- Docker (for local Postgres and Redis), or your own Postgres/Redis instances
- Expo Go app, or an Android emulator / iOS simulator, for the mobile client

## Getting started

```bash
npm install
cp server/.env.example server/.env
npm run db:up          # starts Postgres on 5432 and Redis on 6379
npm run dev:server     # http://localhost:4000
npm run dev:mobile     # Expo dev server
```

The server creates its tables on boot (`server/src/schema.ts`).

`OTP_MODE=dev` (the default) accepts `123456` for any phone number, and `/auth/request-otp` returns that code in the response so the app can prefill it.

## Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | server | Postgres connection string |
| `REDIS_URL` | server | Optional; omit to use the in-memory presence/OTP store |
| `JWT_SECRET` | server | Sign auth tokens |
| `OTP_MODE` | server | `dev` or `sms` |
| `CLIENT_ORIGIN` | server | Comma-separated allowlist, or `*` |
| `STATUS_TTL_HOURS` | server | How long a status stays visible, default 24 |
| `UPLOAD_DIR` | server | Where uploaded media is written |
| `UPLOAD_MAX_BYTES` | server | Per-file upload cap, default 5 MB |
| `STUN_URLS` | server | Comma-separated STUN URLs handed to callers |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | server | Optional TURN relay for calls across strict NAT |
| `EXPO_PUBLIC_API_URL` | mobile | Backend base URL baked into the app |

Android emulators cannot reach `localhost`; the client falls back to `http://10.0.2.2:4000` on Android. Set `EXPO_PUBLIC_API_URL` to your machine's LAN IP when testing on a physical device.

## Phone numbers

Numbers are normalised on the server, never on trust from the client:

- Identity is always E.164 (`+2349016625779`), which is what `users.phone` and `contacts.contact_id` matching use.
- `users.national_phone` and `contacts.national_phone` keep the digits the user actually typed, including a trunk `0`, and that is what the UI shows.
- Input that already starts with `+` is parsed with longest-known-dial matching, so `+971…` is not mistaken for `+97`. Derived (E.164) input never overwrites a saved local form.
- The client picks its default country from GPS reverse geocoding where available, then the device timezone, then the locale, so a Nigerian tester can type `09016625779` and have the backend store `+2349016625779` while still seeing `09016625779`.

## HTTP API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | no | DB, cache, and OTP mode status |
| POST | `/auth/request-otp` | no | Issue an OTP for a phone number |
| POST | `/auth/verify-otp` | no | Exchange OTP for a JWT |
| GET | `/me` | yes | Current profile |
| PATCH | `/me` | yes | Update display name, about, avatar |
| GET | `/contacts` | yes | Saved contacts |
| POST | `/contacts` | yes | Add a contact by phone |
| POST | `/contacts/sync` | yes | Match a phone list against registered users |
| GET | `/conversations` | yes | Conversations with last message and unread count |
| POST | `/conversations/direct` | yes | Open or create a 1:1 conversation |
| POST | `/conversations/group` | yes | Create a group |
| GET | `/conversations/:id/messages` | yes | Paginated history (`limit`, `before`) |
| GET | `/presence` | yes | Online/last-seen for user ids |
| POST | `/media` | yes | Upload a base64 data URL, returns `/media/<file>` |
| POST/GET | `/status` | yes | Publish a 24h status, read the feed |
| POST | `/status/:id/view` | yes | Mark a status seen |
| GET | `/status/:id/viewers` | yes | Who saw your status (owner only) |
| DELETE | `/status/:id` | yes | Remove your own status |
| GET/POST | `/communities` | yes | List or create communities (`?mine=true`) |
| GET | `/communities/:id` | yes | Community detail |
| POST | `/communities/:id/join`, `/leave` | yes | Membership |
| GET/POST | `/communities/:id/posts` | yes | Post feed; announcements are admin-only |
| GET/POST | `/shop/listings` | yes | Browse or create listings (`?mine=true`) |
| GET/PATCH/DELETE | `/shop/listings/:id` | yes | Detail, status change, removal (owner only) |
| POST | `/shop/listings/:id/contact` | yes | Opens a chat with the seller |
| GET | `/calls/config` | yes | ICE servers for WebRTC |
| GET | `/calls` | yes | Call history |
| POST | `/devices` | yes | Register a push token |
| DELETE | `/devices` | yes | Remove a push token |

## Realtime protocol

Socket.IO, authenticated with the JWT in the handshake (`auth.token`).

Client to server: `conversation:join`, `conversation:leave`, `message:send`, `message:delivered`, `message:read`, `typing`, `device:register`, `call:start`, `call:accept`, `call:decline`, `call:end`, `call:signal`.

Server to client: `message:new`, `message:delivered`, `message:read`, `presence`, `typing`, `error`, `call:incoming`, `call:accepted`, `call:declined`, `call:ended`, `call:signal`.

## Status visibility

Visibility is poster-driven: a status is visible to the poster's saved contacts and to anyone the poster has a direct conversation with, plus the poster. Unconnected users cannot see it or mark it viewed, and only the owner can read the viewer list.

## Calls

Signalling rides the existing Socket.IO connection; media is peer-to-peer WebRTC.

- `call:signal` relays SDP offers/answers and ICE candidates between the two parties.
- A callee is rejected with `user_busy` if they are already in a ringing or connected call.
- Disconnecting mid-call ends it and marks a still-ringing call as `missed`.
- The client engine is split by platform: `mobile/src/lib/call-engine-impl.web.ts` uses the browser `RTCPeerConnection`, `call-engine-impl.native.ts` uses `react-native-webrtc`.
- STUN alone works on most networks. Set `TURN_URL` for peers behind symmetric NAT or restrictive firewalls; without it those calls fail or degrade.
- Calls need a native build. Expo Go cannot load `react-native-webrtc`; the web client can.

## Testers

A plain-language handout for anyone trying the app is in [TESTERS.md](TESTERS.md). The live endpoints are documented in [DEPLOY.md](DEPLOY.md).

## Deploying

See [DEPLOY.md](DEPLOY.md) for the Render (backend, Frankfurt), Vercel (web client for testers), and EAS (Android APK) steps.

## Not built yet

- Push notifications: `device_tokens` and the socket `device:register` event exist, but nothing sends through FCM/APNs yet.
- Payments: the shop lists items and opens a chat; no money moves in the app.
- Uploads are written to local disk. On Render's free plan that disk is ephemeral, so media is lost on redeploy; move to object storage for anything durable.
- End-to-end encryption, message queues (Kafka), and a dedicated message store (Cassandra/ScyllaDB). Postgres handles the current scale.
