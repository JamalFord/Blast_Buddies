# Publish Blast Buddies

Repository: https://github.com/JamalFord/Blast_Buddies

The website goes on GitHub Pages. Its multiplayer server goes on Render. The code includes the required deployment files; you only need to connect the accounts and copy the server URL into GitHub.

## 1. Deploy the Render server

1. Sign up or sign in at https://dashboard.render.com. Connecting your GitHub account is the easiest route.
2. Choose **New → Web Service**. Do not choose Static Site: the game needs a running server.
3. Connect GitHub and select **JamalFord / Blast_Buddies**. If it is missing, adjust the Render GitHub app's repository access to include this repository.
4. Enter these settings:

| Setting | Value |
|---|---|
| Name | `blast-buddies-server` (or another available name) |
| Language / runtime | `Node` |
| Branch | `main` |
| Region | A region near most players; US East is a sensible starting point for Jamal |
| Root Directory | Leave blank |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance type | Free for initial testing |
| Health Check Path | `/health` |

5. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.15.0` |
| `CLIENT_ORIGIN` | `https://jamalford.github.io` |

`CLIENT_ORIGIN` is just the origin: do not add `/Blast_Buddies/` or a trailing slash. Multiple allowed origins can be comma-separated. Render's own public origin is added automatically from `RENDER_EXTERNAL_URL`.

6. Click **Deploy Web Service**. Wait until Render shows **Live**.
7. Copy the actual HTTPS service URL shown by Render. It may differ from the service name if that name was already taken. Open its `/health` URL; it should return `{"ok":true,"game":"Blast Buddies"}`. The service root also serves the game for a quick test.

Alternative: **New → Blueprint**, choose this repository, review `render.yaml`, and deploy the listed free web service. Use either the manual route or Blueprint route, not both.

## 2. Connect GitHub Pages to the server

1. Open repository **Settings → Secrets and variables → Actions → Variables**.
2. Choose **New repository variable**.
3. Name: `VITE_SERVER_URL`.
4. Value: the actual Render HTTPS URL, such as `https://your-service.onrender.com`, with no `/health` or `/socket.io` suffix.
5. Save. This is a public server address, not a secret or password. If you already added it as an Actions **Secret** named `VITE_SERVER_URL`, that also works; the workflow accepts either location. A Variable takes precedence when both exist.
6. Open **Settings → Pages** and choose **GitHub Actions** as the source.
7. Open **Actions → Deploy game to GitHub Pages → Run workflow**, select `main`, and run it.
8. Once the run succeeds, the website should be at **https://jamalford.github.io/Blast_Buddies/**. Use the URL shown by the successful deployment as the final confirmation.

The Pages job checks that `VITE_SERVER_URL` is a valid HTTPS service address and explains how to configure it if missing. Adding or changing a variable or secret does not itself rebuild the site; run the workflow again. Future pushes to `main` automatically publish changes.

## 3. Test before submitting

Open the Pages URL on a computer and a phone using cellular data, or invite a friend on another network. Create a room, copy its invite, ready both players, and finish a match. Repeat with up to four players. Confirm the winner matches on all devices, and test a rematch and phone touch controls.

Submit the Pages URL once this passes. Keep your computer off for a quick check: the game should still work because Render runs the server.

## Cost and common problems

- **Free Render wake-up:** after 15 minutes without inbound traffic, the server can sleep; waking can take about a minute. Leave the game open while its connection retries. An always-on paid instance removes this idle sleep, but payment is not necessary for the first test. Review Render's current limits before choosing a paid plan.
- **Website loads but cannot connect:** check Render is Live, `VITE_SERVER_URL` matches its real HTTPS URL, and `CLIENT_ORIGIN` is `https://jamalford.github.io`. Then rerun the Pages workflow.
- **Server address check fails:** add `VITE_SERVER_URL` as a repository Variable or Secret, then manually run the workflow. Use the service's root HTTPS URL.
- **Pages deployment fails:** verify Pages source is GitHub Actions and Actions are enabled for the repository. Read the failed step's log.
- **An invite returns 404:** share the link created by the game. It uses `/Blast_Buddies/?room=ABC123` so Pages does not need server-side routing.
- **A room disappeared:** server redeployments/restarts clear temporary rooms. Create a new room.
- **Name or repository changes:** update the Pages base path in `.github/workflows/pages.yml` and the allowed origin if the GitHub username/domain changes.

Official references: [Render Node hosting](https://render.com/docs/deploy-node-express-app), [Render free limitations](https://render.com/docs/free), [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
