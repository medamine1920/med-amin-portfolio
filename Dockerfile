# dist/ is built before the image (in GitHub Actions); the image installs only runtime dependencies.
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
# Runtime dependencies only (the Anthropic SDK); the front-end packages are build-time devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY dist ./dist
COPY server ./server
RUN mkdir -p /app/data/media && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/site').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
