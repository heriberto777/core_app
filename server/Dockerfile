FROM node:22-alpine

WORKDIR /app

# Puppeteer descarga por defecto un build de Chrome para glibc, que no corre
# en Alpine (musl) -- el error se ve como "spawn .../chrome ENOENT" porque al
# binario le falta el intérprete dinámico esperado, no porque falte el
# archivo. Se instala el Chromium propio de Alpine (compilado para musl) y se
# le dice a Puppeteer que no descargue el suyo y use este en su lugar.
RUN apk add --no-cache python3 make g++ \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/index.js"]
