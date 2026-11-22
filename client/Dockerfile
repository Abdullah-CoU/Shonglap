FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build for production
RUN npm run build

EXPOSE 5173

# Serve with vite preview (or use nginx in production)
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
