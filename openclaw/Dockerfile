FROM node:20-alpine

WORKDIR /app

# Install OpenClaw
RUN npm install -g openclaw

# Copy WCP configuration
COPY . /root/.openclaw/

WORKDIR /root/.openclaw

EXPOSE 3000

CMD ["openclaw", "gateway", "start", "--foreground"]