# Use Node.js LTS version
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=https://talkbridge-backend-149462569558.us-central1.run.app
ENV NEXT_PUBLIC_WS_URL=talkbridge-backend-149462569558.us-central1.run.app

# Build Next.js application
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment variable for port
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
