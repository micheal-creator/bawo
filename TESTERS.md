# bawo — how testers use it

bawo is a messaging app. Anyone can sign in with any phone number — the verification code is always **123456**.

## Web (no install needed)

Open in any browser:

**https://www.bawo.com.ng**

1. The app detects your country and shows its dial code, e.g. 🇳🇬 +234.
2. Enter your number **the way you normally dial it**, e.g. `09016625779`. Leading zeros and spaces are fine.
3. Enter your name (optional).
4. Click **Send code**. The code field is prefilled with **123456**. Click **Verify and continue**.
5. You keep seeing the number exactly as you typed it, even though bawo stored `+2349016625779` behind the scenes.

## Android (native app)

Install this APK (v0.2.1), then allow **Install from unknown sources**:

**https://expo.dev/artifacts/eas/0es7-6SW9aBJovrzTjdZl_XcLk2N3-tSNhfuDUOjIEg.apk**

Then follow the same sign-in steps. Calls work on the Android app and in the browser.

## The four tabs

**Chats** — tap **New chat**, enter a number, and optionally tick **Save to my contacts** with a name. Saved numbers keep the format you typed. Tap **Call** or **Video** in a chat to ring the other person.

**Status** — tap **My status** to post text and/or a photo. It disappears after 24 hours. It is visible to your saved contacts and to anyone you already chat with. The people you can see status from show a green ring; when you open yours you can see who viewed it.

**Community** — tap **New** to create one, or **Join** someone else's. Members see a shared post feed. Admins can mark a post as an 📣 announcement, which is pinned above normal posts.

**Shop** — tap **Sell** to list something with a price, currency, photo, and location. Buyers browse, open the listing, and tap **Message seller**, which opens a normal chat. Sellers can mark an item sold or archive it. No payment happens inside bawo.

To see messages, calls, and presence move in real time, sign in as two different numbers in two browsers or on two devices.

## Notes

- The first request can take up to 30 seconds — the backend sleeps when idle and wakes on the first hit.
- Messages sent while the other person is offline are stored and delivered when they come back.
- Calls connect directly between the two phones. On strict office or mobile networks a call may fail to connect; if that happens on a normal network, tell the team so a TURN relay can be configured.
- Photos are stored on the server's temporary disk, so an uploaded photo may disappear after the next deploy. Text and numbers are permanent.
- Every phone number works. There is no real SMS provider behind this test build, and no push notifications yet — keep the app open to receive calls.
