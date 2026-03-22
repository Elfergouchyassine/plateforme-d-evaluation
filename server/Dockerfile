FROM node:18-alpine

WORKDIR /app

# Install Java + sonar-scanner (needed for SonarQube analysis)
RUN apk add --no-cache openjdk17-jre curl unzip \
  && curl -sSLo /tmp/sonar-scanner.zip https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-5.0.1.3006-linux.zip \
  && unzip /tmp/sonar-scanner.zip -d /opt \
  && rm /tmp/sonar-scanner.zip

RUN sed -i 's|use_embedded_jre=true|use_embedded_jre=false|g' /opt/sonar-scanner-5.0.1.3006-linux/bin/sonar-scanner \
  && ln -s /opt/sonar-scanner-5.0.1.3006-linux/bin/sonar-scanner /usr/local/bin/sonar-scanner

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy all server source files
COPY server.js .
COPY auth.js .
COPY users.json .

# Create temp_code directory
RUN mkdir -p temp_code

EXPOSE 5000
CMD ["npm", "start"]
