# Use Node.js 22 LTS
FROM node:22-slim

# Install Python and required dependencies for the Python transcript service
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create Python virtual environment and install dependencies
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir flask youtube-transcript-api certifi

# Expose ports
EXPOSE 8080 5000

# Create startup script to run both Node.js and Python services
RUN echo '#!/bin/bash\n\
/app/venv/bin/python python-transcript-service.py &\n\
node server.js' > /app/start.sh && \
    chmod +x /app/start.sh

# Start both services
CMD ["/app/start.sh"]