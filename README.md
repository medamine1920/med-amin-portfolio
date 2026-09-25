# Med Amin Gnichi — dynamic AI Engineer portfolio

A React portfolio and a small Node 24 API. The bundle includes a built `dist/`, so the Hetzner server does not need to install npm packages or build the frontend. The first run seeds the editor from the supplied September 2026 resume and the current portfolio: projects, experience, education, stats, skills, contact details, and verified links. The original resume PDF is included. Changes live in SQLite under `data/`; project images and replacement PDFs live in `data/media/`.

## What you can edit

At `/admin`: hero text, availability, location, skills, projects and screenshots, project links, experience, education, stats, contact details, extra links, and resume PDF. The editor supports reordering, a draft preview, explicit Save draft and Publish actions, JSON backup/import, and an inbox for contact form submissions. No changes appear on the public site until Publish.

The contact form stores messages in the admin inbox. It does **not** send emails or notifications. The published email link opens the visitor's email client.

## Security model

- Admin password is supplied through `.env`, never committed. Sessions are signed, HTTP-only, SameSite=Strict, last 12 hours, and invalidated on sign-out. Admin writes require a session and CSRF token. Login attempts are limited.
- Uploaded files are size-limited and signature-checked. Only PNG, JPEG, WebP, and PDF are accepted. Public visitors can view only media referenced by published content.
- Content is rendered as text through React. URLs are restricted to HTTP(S); uploaded media references must match stored image IDs.
- The included Compose configuration binds to **127.0.0.1:8080**, so the admin cannot be reached directly from the Internet. Use an SSH tunnel over Tailscale for staging. Do not forward this app from a public HTTP port until HTTPS is configured. With HTTPS, set `SECURE_COOKIES=true` and place it behind a trusted reverse proxy.
- This is a single-admin password setup, not multi-user RBAC or two-factor authentication.

## Deploy privately on your Hetzner server

1. Upload this source folder to your server. Your previous `scp` upload failed, so diagnose home-directory write access or free space before retrying.
2. On Ubuntu, enter the folder and create the settings:

   ```sh
   cp .env.example .env
   python3 -c 'import secrets; print(secrets.token_hex(32))'
   nano .env
   ```

   Paste the generated secret as `SESSION_SECRET`, choose a unique password of at least 16 characters for `ADMIN_PASSWORD`, and keep `SECURE_COOKIES=false` while accessing through the SSH tunnel. The default `PORT=3000` and `DATA_DIR=./data` can remain. Run `chmod 600 .env`.
3. Start without affecting the existing site on port 80 or API on port 8000:

   ```sh
   mkdir -p data
   docker compose up -d --build
   docker compose ps
   ```

4. On your computer, open a separate terminal and tunnel through Tailscale:

   ```sh
   ssh -L 8080:127.0.0.1:8080 amine@100.122.97.26
   ```

   Open `http://127.0.0.1:8080` for the portfolio and `http://127.0.0.1:8080/admin` for the editor. Keep the tunnel open while using it.

## Make the portfolio public later

Once you have a domain, point its A record to `91.99.98.217` and put an HTTPS reverse proxy in front of this app. Keep the container bound to the host loopback interface and proxy to `127.0.0.1:8080`. Set `SECURE_COOKIES=true` in `.env` and restart the app. Do not put the admin password into a public HTTP form. We can switch the existing portfolio after testing the replacement; the current `port 80` site and `port 8000` API remain independent until then.

## Back up and restore

Use the editor's JSON backup for content. It does not include images, messages, or the SQLite database. For a complete backup, stop the container and archive the entire `data/` directory:

```sh
docker compose stop
tar -czf portfolio-data-$(date +%F).tar.gz data
docker compose start
```

Keep this archive private because it contains contact messages. To restore, stop the container, replace `data/` from a known-good archive, then start it.

## Local development

Requires Node 24+. Run `npm ci`, copy `.env.example` to `.env`, set the secret and password, then `npm run build` and `npm start`. For live UI edits, run `npm run dev` in another terminal; Vite proxies API calls to port 3000. Run `npm test` for the backend flow. After editing React or CSS, run `npm run build` before deploying; Docker serves the resulting `dist/`.

## Files

- `src/main.jsx` — public React site and admin editor
- `src/styles.css` — responsive styling
- `server/index.js` — API, authentication, SQLite, uploads, static serving
- `server/seed.json` — initial portfolio content (used only when the database is first created)
- `server/seed-resume.pdf` — initial resume PDF
- `data/` — durable database and uploaded files; excluded from source archives
