# HTML Email Sender — VPS Deployment Guide

Complete step-by-step guide for deploying on Ubuntu 22.04+ LTS.

---

## Prerequisites

- A VPS running Ubuntu 22.04 or newer
- A domain or subdomain (e.g., `mail.example.com`) pointing to your VPS IP
- A [Neon](https://neon.tech) PostgreSQL database
- One or more Mailgun accounts/domains
- SSH access to the VPS

---

## 1. Install Node.js (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # Should show v20.x
npm -v
```

---

## 2. Install PM2 & Nginx

```bash
sudo npm install -g pm2
sudo apt-get install -y nginx
```

---

## 3. Upload Project

Option A — Clone from a Git repo:
```bash
sudo mkdir -p /var/www/mailgun-dashboard
cd /var/www/mailgun-dashboard
git clone <your-repo-url> .
```

Option B — Upload via `scp`:
```bash
# From your local machine:
scp -r ./mailgun-dashboard user@your-vps-ip:/var/www/mailgun-dashboard
```

---

## 4. Install Dependencies

```bash
cd /var/www/mailgun-dashboard
npm install
```

---

## 5. Configure Environment

```bash
cp .env.example .env.local
nano .env.local
```

Fill in all values:

```env
DATABASE_URL="postgresql://user:password@your-neon-host.neon.tech/neondb?sslmode=require"

AUTH_SECRET="<run: openssl rand -base64 32>"

ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="your-secure-password"

MAILGUN_1_DOMAIN="yourdomain.com"
MAILGUN_1_API_KEY="key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
MAILGUN_1_FROM="Sender Name <noreply@yourdomain.com>"

MAILGUN_2_DOMAIN="domain2.com"
MAILGUN_2_API_KEY="key-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
MAILGUN_2_FROM="Another Sender <noreply@domain2.com>"

# Add MAILGUN_3, MAILGUN_4, etc. as needed
```

---

## 6. Configure Neon Database

1. Go to [neon.tech](https://neon.tech) and create a project
2. Copy the connection string (with `?sslmode=require`)
3. Paste it as `DATABASE_URL` in `.env.local`

---

## 7. Run Prisma Migrations

```bash
npx prisma generate
npx prisma db push
```

---

## 8. Create Admin User

```bash
npm run setup
```

You should see: `Created user: admin@yourdomain.com`

---

## 9. Build Application

```bash
npm run build
```

---

## 10. Start with PM2

```bash
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

Follow the output of `pm2 startup` to run the generated command (it will look like `sudo env PATH=... pm2 startup ...`).

This ensures the app restarts on VPS reboot.

---

## 11. Configure Nginx

```bash
sudo cp nginx.conf /etc/nginx/sites-available/mailgun-dashboard
sudo nano /etc/nginx/sites-available/mailgun-dashboard
```

**Change `mail.example.com` to your actual domain** in the nginx config.

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mailgun-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 12. Configure HTTPS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mail.example.com
```

Follow the prompts. Certbot will automatically update your Nginx config with SSL certificates.

Auto-renewal is set up automatically. Test it with:

```bash
sudo certbot renew --dry-run
```

---

## 13. Verify

Visit: `https://mail.example.com`

1. You should see the login page
2. Log in with the admin credentials you set in `.env.local`
3. You should see the dashboard with Mailgun accounts in the dropdown
4. Try sending a test email

---

## Common Commands

### View application logs
```bash
pm2 logs mailgun-dashboard
```

### Restart application
```bash
pm2 restart mailgun-dashboard
```

### Update application
```bash
cd /var/www/mailgun-dashboard
git pull                 # or upload new files
npm install
npm run build
pm2 restart mailgun-dashboard
```

### Check application status
```bash
pm2 status
```

### Stop application
```bash
pm2 stop mailgun-dashboard
```

---

## Adding More Mailgun Accounts

Simply add new environment variables to `.env.local`:

```env
MAILGUN_5_DOMAIN=domain5.com
MAILGUN_5_API_KEY=key-zzzzzzzzzzzzzzzzzzzzzzzzz
MAILGUN_5_FROM=Sender <noreply@domain5.com>
```

Then restart the app:

```bash
pm2 restart mailgun-dashboard
```

The new account will appear in the dropdown automatically. No code changes required.

---

## Security Checklist

- [x] API keys stored only in server-side `.env.local`
- [x] API keys never sent to the browser
- [x] Passwords hashed with bcrypt
- [x] Authentication required for all routes
- [x] HTML preview rendered in sandboxed iframe
- [x] File uploads validated (type, size, extension)
- [x] Rate limiting on send endpoint
- [x] HTTPS via Let's Encrypt
- [x] Nginx security headers configured
- [x] No uploaded file execution
- [x] Safe error messages (no key leakage)

---

## Troubleshooting

### App won't start
```bash
pm2 logs mailgun-dashboard --lines 50
```

### Database connection issues
- Make sure `DATABASE_URL` includes `?sslmode=require` for Neon
- Test: `npx prisma db pull`

### Emails not sending
- Verify Mailgun API keys are correct
- Check domain verification status in Mailgun dashboard
- Check `pm2 logs` for error messages

### Port already in use
```bash
sudo lsof -i :3000
# Kill the process if needed
```
