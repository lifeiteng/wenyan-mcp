FROM node:22-alpine

WORKDIR /app

COPY . .
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/
RUN npm install
RUN npx tsc -b && npm run copy-assets
CMD ["node", "dist/index.js"]
