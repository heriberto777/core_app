# Walkthrough: Connectivity & 502 Fix

I have implemented the changes to ensure the application connects correctly and resolved the **502 Bad Gateway** error.

Backend Deployment Walkthrough (esbuild Bundle)

This guide explains how to build and deploy the backend as a single bundled artifact, resolving Git conflicts and streamline production updates.

## 1. Backend Bundling Process

We are using `esbuild` for its speed, reliability, and granular control. It bundles all source code into a single [dist/index.js](file:///d:/proyectos/app/core_app/server/dist/index.js) file while keeping heavy native modules external.

### Local Build
Run the following command in the `server` directory:
```bash
npm run build
```
This will:
1. Clean the `dist` folder.
2. Bundle the backend into a 7MB [dist/index.js](file:///d:/proyectos/app/core_app/server/dist/index.js) file.
3. Obscure paths for `logs` and `uploads` to keep them external.

## 2. Production Deployment Steps

To update the production server without Git conflicts:

1.  **Prepare the Artifacts**: Collect the following files/folders from your local machine:
    - [server/dist/index.js](file:///d:/proyectos/app/core_app/server/dist/index.js) (The bundled backend)
    - [server/.env](file:///d:/proyectos/app/core_app/server/.env) (Production environment variables)
    - `server/templates/` (If you have email templates)

2.  **Upload to Server**: Copy these artifacts to your production directory (e.g., `/var/www/core_app/server/`).

3.  **Production Directory Structure**:
    ```text
    /var/www/core_app/server/
    ├── dist/
    │   └── index.js
    ├── .env
    ├── templates/
    ├── uploads/ (Auto-created if missing)
    └── logs/    (Auto-created if missing)
    ```

4.  **Install Production Dependencies**:
    Since we externalized some heavy modules to ensure compatibility, the production server still needs its own `node_modules` for those specific packages.
    Run this **once** on the server in the backend directory:
    ```bash
    npm install --production winston mssql mongoose ioredis puppeteer tedious bcrypt
    ```

5.  **Restart the Service**:
    Run the bundled application (using PM2 or similar):
    ```bash
    pm2 restart core_app_backend --interpreter node dist/index.js
    ```
    *Or manually:* `node dist/index.js`

## 3. Key Improvements Made

- **Dynamicity**: `SERVER_IP` is now dynamic in the frontend.
- **Nginx Compatibility**: Added `DISABLE_SSL` logic for proxy environments.
- **Atomic Deployment**: Using `esbuild` allows deploying a single file instead of thousands of source files.
- **Git Safety**: `.env` is now properly ignored by Git to prevent production overwrites.
- **MongoDB Resilience**: Added auto-generation for `code` and auto-cleanup for legacy indexes (`blockReservations.blockId_1`) to avoid `E11000` duplicate key errors.
- **Clean Code**: Fixed duplicate key bugs in `linkedGroupsController.js`, `transferTaskController.js`, and `DynamicTransferService.js`.

## 4. Troubleshooting (502 Bad Gateway)

If you still see 502 errors, ensure your Nginx config matches this:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3979/api/; # Use 127.0.0.1 and HTTP
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```
And verify `.env` has `DISABLE_SSL=true`.

### 5. Static Files (404 Not Found)
If your images/avatars are not loading, add this block to Nginx:
```nginx
location /uploads/ {
    proxy_pass http://127.0.0.1:3979/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Verification
- Access `https://catelli.ddns.net:8085`.
- The `502 Bad Gateway` should be gone.
- API calls should return JSON data instead of HTML error pages.
