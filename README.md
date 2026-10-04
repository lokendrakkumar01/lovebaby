# Little Moments

A responsive photo, video, and message space. Express serves the app and API; MongoDB stores accounts and memory metadata; Cloudinary stores authenticated media.

## Deploy on Render

1. **Rotate the credentials you pasted into chat before deploying.** Create a new Cloudinary API secret and change the MongoDB Atlas database user's password. Update the MongoDB connection string with the new password. Do not add credentials to source files or Git.
2. Push this repository to GitHub. In Render choose **New → Blueprint**, connect the repository, and apply `render.yaml`. This creates a Node web service rather than a static site.
3. In the Render service's **Environment** page, set `MONGODB_URI`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. `CLOUDINARY_CLOUD_NAME` is already set in the blueprint. Render creates `SESSION_SECRET` for the service. Set a unique admin password with at least 20 characters; keep it in Render and do not commit it.
4. In MongoDB Atlas, allowlist the outbound IP ranges shown for your Render service. Use a dedicated database user with access only to this app's database.
5. Deploy and open the Render URL. Create an account, then upload a small photo and video to confirm both services are connected.

### Manual Render setup

If you prefer not to use a Blueprint, create a **Web Service** connected to the repo. Set **Build Command** to `npm ci`, **Start Command** to `npm start`, and **Health Check Path** to `/healthz`. Add the environment variables listed in `.env.example` in Render's Environment settings. Do not make this a Static Site: the Express API is required for login, uploads, and sharing.

## How privacy works

- By default, every signed-in member can see each member's memories. New members must acknowledge this when registering. Existing accounts also use this default unless the admin changes access.
- The admin portal at `/Admin/login` can see every account and memory, suspend accounts, delete memories, and set each album to all members, selected members, or its owner only. Restricted albums lose their public view and contributor links.
- Admins can upload photos and videos into the shared Admin gallery and create a revocable `/story/...` link that opens the animated gift page from the supplied design. The page loads current memories from active albums set to all signed-in members; anyone with the link can view those eligible memories.
- The admin can choose any photo or video as the signed-in app background. Members see it only when their album permissions allow them to view that memory.
- Members can download photos/videos or notes and create a share link for an individual memory. Account sessions are persistent for 30 days and renew while the member uses the app; signing out or an admin suspension ends the session.
- The web app includes an installable mobile PWA shell. Offline caching is limited to app files; private API data and media responses are not cached by the service worker.
- Users can add notes, photos, and videos. Cloudinary stores authenticated media; the Express API checks member access before streaming it. Legacy records try supported Cloudinary delivery types so older uploads can load too.
- **Create share link** publishes an album to anyone with that URL. Anyone who has already viewed or saved media may keep their own copy.
- **Create upload link** makes a separate, revocable `/add/...` link. Anyone with it can view the album's photos/videos and add more; notes and account controls remain private. The admin can revoke these links by restricting the album.
- Uploads accept supported image/video files up to 100 MB, with an hourly rate limit. Do not upload media you do not have permission to share.

Local setup: copy `.env.example` to `.env`, replace every placeholder with your rotated credentials, then run `npm install` and `npm start`.
