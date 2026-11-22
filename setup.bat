@echo off
echo === Shonglap Setup ===

where node >nul 2>&1 || (echo Node.js is required. Install from https://nodejs.org && exit /b 1)
where npm >nul 2>&1 || (echo npm is required. && exit /b 1)

echo Installing root dependencies...
call npm install

echo Installing server dependencies...
cd server && call npm install && cd ..

echo Installing client dependencies...
cd client && call npm install && cd ..

if not exist .env (
  copy .env.example .env
  echo Created .env from .env.example - please edit with your values
)
if not exist server\.env (
  copy .env.example server\.env
  echo Created server\.env from .env.example
)

echo.
echo === Setup Complete ===
echo Next steps:
echo   1. Edit .env with your MongoDB URI and API keys
echo   2. Start MongoDB: docker-compose up -d mongodb
echo   3. Seed the database: npm run server:seed
echo   4. Start the server: npm run server:dev
echo   5. Start the client: npm run client:dev
echo.
echo Or use Docker Compose for everything:
echo   docker-compose up --build
pause
