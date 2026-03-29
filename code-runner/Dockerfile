FROM node:20-alpine

# Install Python 3, pip, pytest and pytest-json-report
RUN apk add --no-cache python3 py3-pip && \
    pip3 install pytest pytest-json-report --break-system-packages

WORKDIR /app
COPY package.json .
RUN npm install

COPY index.js .

EXPOSE 4000
CMD ["node", "index.js"]
