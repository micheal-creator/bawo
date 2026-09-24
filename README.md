# bawo

Real-time messaging MVP: a Node.js + TypeScript + Socket.IO backend, PostgreSQL for users/conversations/messages, Redis for presence and OTP, and an Expo React Native client.

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
| `EXPO_PUBLIC_API_URL` | mobile | Backend base URL baked into the app |

Android emulators cannot reach `localhost`; the client falls back to `http://10.0.2.2:4000` on Android. Set `EXPO_PUBLIC_API_URL` to your machine's LAN IP when testing on a physical device.

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
| POST | `/devices` | yes | Register a push token |
| DELETE | `/devices` | yes | Remove a push token |

## Realtime protocol

Socket.IO, authenticated with the JWT in the handshake (`auth.token`).

Client to server: `conversation:join`, `conversation:leave`, `message:send`, `message:delivered`, `message:read`, `typing`, `device:register`.

Server to client: `message:new`, `message:delivered`, `message:read`, `presence`, `typing`, `error`.

## Deploying

See [DEPLOY.md](DEPLOY.md) for the Render (backend, Frankfurt), Vercel (web client for testers), and EAS (Android APK) steps.

## Not built yet

- Push notifications: `device_tokens` and the socket `device:register` event exist, but nothing sends through FCM/APNs yet.
- Media upload: `messages.media_url` exists, no upload endpoint or object storage.
- End-to-end encryption, message queues (Kafka), and a dedicated message store (Cassandra/ScyllaDB). Postgres handles the current scale.
