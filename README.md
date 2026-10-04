# Little Moments

A private-by-default photo, video, and message album. Express serves the responsive web app and API; MongoDB stores accounts and memory metadata; Cloudinary stores private media.

## Deploy on Render

1. **Rotate the credentials you pasted into chat before deploying.** Create a new Cloudinary API secret and change the MongoDB Atlas database user's password. Update the MongoDB connection string with the new password. Do not add credentials to source files or Git.
2. Push this repository to GitHub. In Render choose **New → Blueprint**, connect the repository, and apply `render.yaml`. This creates a Node web service rather than a static site.
3. In the Render service's **Environment** page, set `MONGODB_URI`, `CLOUDINARY_API_KEY`, and the new `CLOUDINARY_API_SECRET`. `CLOUDINARY_CLOUD_NAME` is already set in the blueprint. Render creates `SESSION_SECRET` for the service.
4. In MongoDB Atlas, allowlist the outbound IP ranges shown for your Render service. Use a dedicated database user with access only to this app's database.
5. Deploy and open the Render URL. Create an account, then upload a small photo and video to confirm both services are connected.

### Manual Render setup

If you prefer not to use a Blueprint, create a **Web Service** connected to the repo. Set **Build Command** to `npm ci`, **Start Command** to `npm start`, and **Health Check Path** to `/healthz`. Add the environment variables listed in `.env.example` in Render's Environment settings. Do not make this a Static Site: the Express API is required for login, uploads, and sharing.

## How privacy works

- Accounts are separate. Passwords are hashed; session cookies are HTTP-only and secure in production.
- Notes, photos, and videos are private to the signed-in owner by default. Cloudinary media is uploaded as authenticated assets and streamed through owner-checked routes.
- **Create share link** publishes that account's full album to anyone who has the link. **Revoke link** disables that link. Anyone who has already viewed or saved a photo/video may retain their own copy.
- **Create upload link** makes a separate, revocable `/add/...` link. Anyone who receives it can view the album's photos/videos and add more photos or videos; notes and account controls stay private. Share this link only with people you trust.
- Uploads accept supported image/video files up to 100 MB, with an hourly rate limit. Do not upload media you do not have permission to share.

Local setup: copy `.env.example` to `.env`, replace every placeholder with your rotated credentials, then run `npm install` and `npm start`.

