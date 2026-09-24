# bawo — how testers use it

bawo is a messaging app. Anyone can sign in with any phone number — the verification code is always **123456**.

## Web (no install needed)

Open in any browser:

**https://bawo-ivory.vercel.app**

1. Pick a country (default is auto-detected from your browser) and enter your phone number, e.g. `+2348012345678`.
2. Enter your name (optional).
3. Click **Send code**.
4. The code field is prefilled with **123456**. Click **Verify and continue**.
5. You land on the chats list. Tap **New chat**, type a phone number, and start talking.

To see messages arrive in real time, open the link in a second browser or device, sign in as a different number, and send a message each way.

## Android (native app)

Install this APK, then enable **Install from unknown sources** when asked:

**https://expo.dev/artifacts/eas/cZDXJ6P9ei5ULqU48zxIHFGz53jOD4a4N49D0OorY3c.apk**

Then follow the same sign-in steps above.

## Notes

- The first request can take up to 30 seconds — the backend sleeps when idle and wakes on the first hit.
- Messages sent while the other person is offline are stored and delivered when they come back.
- Every phone number works. There is no real SMS provider behind this test build.

## Need to talk to the team?

The app is in dev mode and the backend is a free instance, so expect occasional cold starts and no push notifications yet.