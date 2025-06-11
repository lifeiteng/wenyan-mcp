FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/
RUN npm install --production
RUN npm install typescript
RUN npx tsc -b && npm run copy-assets
CMD ["node", "dist/index.js"]
