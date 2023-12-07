FROM node:20
USER node
WORKDIR /usr/src/app
COPY package*.json .
COPY generated/ldn-deals.ndjson .
COPY scripts scripts
RUN ls -l
RUN npm ci

ENV SERVE=1
CMD [ "node", "--no-warnings", "scripts/build-retrieval-tasks.js", "ldn-deals.ndjson" ]
