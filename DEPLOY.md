# Deploying bawo for testers

Three things get deployed:

| Piece | Host | URL |
| --- | --- | --- |
| API + Socket.IO server + Postgres | Render (Frankfurt) | `https://bawo-api.onrender.com` |
| Client for testers (web, no install) | Vercel | `https://bawo-ivory.vercel.app` |
| Android app for testers (APK) | EAS Build | https://expo.dev/artifacts/eas/cZDXJ6P9ei5ULqU48zxIHFGz53jOD4a4N49D0OorY3c.apk |

`OTP_MODE=dev` is on, so testers sign in with any phone number and code `123456`.

## 1. Log in to the CLIs

```bash
vercel login
npx eas-cli@latest login
```

Both open a browser. The Render step below is dashboard-only.

## 2. Render: create the backend

`render.yaml` is a Blueprint, so Render reads the repo instead of you typing settings.

1. Go to https://dashboard.render.com/blueprints and click **New Blueprint Instance**.
2. Connect the `micheal-creator/bawo` repository.
3. Keep the branch `main` and approve the plan. Render creates `bawo-api` and `bawo-db`, both free and in Frankfurt.
4. When it asks for the two `sync: false` values, leave them blank for now:
   - `CLIENT_ORIGIN` — set after step 3 to the Vercel URL
   - `PUBLIC_URL` — set after this step to `https://bawo-api.onrender.com`

5. Wait for the first deploy, then confirm:

```bash
curl https://bawo-api.onrender.com/health
```

Expected: `{"ok":true,"db":"postgres","cache":"memory","otp":"dev","env":"production"}`.

`cache` is `memory` because no `REDIS_URL` is set. Presence and OTP then live in the instance's memory, which is correct for a single free instance. Add a Redis URL later to share state across instances.

The free instance sleeps after 15 minutes idle and takes roughly 30 seconds to wake. Tell testers the first request may hang briefly.

## 3. Vercel: deploy the client

The API URL is baked in at build time, so deploy the client after Render is up.

```bash
cd mobile
vercel login          # skip if already logged in
EXPO_PUBLIC_API_URL=https://bawo-api.onrender.com npx vercel deploy --prod
```

`mobile/vercel.json` sets the build command to `npx expo export --platform web` and the output to `dist`, with a catch-all rewrite so client-side routes like `/chat/<id>` survive a refresh.

Then set `EXPO_PUBLIC_API_URL` in the Vercel project's environment variables so dashboard-triggered builds keep working, and set Render's `CLIENT_ORIGIN` to the deployed origin to close CORS:

```
CLIENT_ORIGIN=https://<your-vercel-domain>
```

## 4. Android APK

`mobile/eas.json` has a `preview` profile that builds an installable APK with `EXPO_PUBLIC_API_URL=https://bawo-api.onrender.com`.

```bash
cd mobile
npx eas-cli@latest build --platform android --profile preview
```

The first run asks to create the Expo project and generates an Android keystore; accept both. When the build finishes, share the APK link. Testers enable "install from unknown sources".

Bump `version` in `mobile/app.json` before each new APK you hand out.

## 5. Verify before sharing

```bash
curl -s https://bawo-api.onrender.com/health

curl -s -X POST https://bawo-api.onrender.com/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348012345678"}'

curl -s -X POST https://bawo-api.onrender.com/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348012345678","code":"123456"}'
```

The second call must return `devMode: true` with `devCode`; the third must return a `token` and a `user`. Then open the Vercel URL in two browsers, sign in as two different numbers, and send a message each way.

## Tester notes

- Any phone number works, in E.164 form (`+2348012345678`). The code is always `123456`.
- Sign in as two different numbers in two browsers or devices to see messages move in real time.
- Free Render instance: the first request after a quiet period takes about 30 seconds.
- Messages sent while the other side is offline are stored and delivered on reconnect; delivery and read state are tracked in `message_receipts`.
- The free Render Postgres expires 90 days after creation. Back up or recreate before then.

## Not wired up yet

Push notifications and media upload. `device_tokens` and the socket `device:register` event exist but nothing sends through FCM/APNs, and `messages.media_url` has no upload endpoint behind it.
