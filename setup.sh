#!/bin/bash
set -e

echo "=== Shonglap Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required."; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Node.js 20+ is required. Current: $(node -v)"
  exit 1
fi

echo "Node.js $(node -v) OK"

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Install server dependencies
echo "Installing server dependencies..."
cd server && npm install && cd ..

# Install client dependencies
echo "Installing client dependencies..."
cd client && npm install && cd ..

# Copy env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example - please edit with your values"
fi
if [ ! -f server/.env ]; then
  cp .env.example server/.env
  echo "Created server/.env from .env.example"
fi

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "  1. Edit .env with your MongoDB URI and API keys"
echo "  2. Start MongoDB: docker-compose up -d mongodb"
echo "  3. Seed the database: npm run server:seed"
echo "  4. Start the server: npm run server:dev"
echo "  5. Start the client: npm run client:dev"
echo ""
echo "Or use Docker Compose for everything:"
echo "  docker-compose up --build"
