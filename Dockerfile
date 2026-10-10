FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["npm", "start"]
