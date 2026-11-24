# RBLX Publisher

Mobile-friendly publisher for Roblox `.rbxl` and `.rbxlx` files using Roblox Open Cloud.

## Run locally
Requires Node.js 20+.
1. Run `npm install`.
2. Set `ADMIN_PASSWORD` to a long unique dashboard password.
3. Set `SESSION_SECRET` to a long random secret.
4. Run `npm start` and open http://localhost:3000.

## Deploy on Render
Create a Blueprint from this repository using `render.yaml`. Set `ADMIN_PASSWORD` in the Render environment settings before deploying. Render generates `SESSION_SECRET`.

## Roblox setup
Create a Roblox Open Cloud API key with the required Assets permissions scoped to the intended experience. Enter it in the dashboard; this app does not save it.

## Important
Publishing replaces the target place. Back up first and only publish content you own or are authorized to publish. Upload is asynchronous; verify the operation result and published status. The included Express session store is in-memory; use a persistent session store and rate limiting before scaling beyond a single instance.

Roblox documentation: https://create.roblox.com/docs/cloud/guides/usage-place-publishing