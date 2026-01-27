# Use an official Node.js runtime as the base image
FROM node:23-alpine

# Set the working directory inside the container
WORKDIR /taproom-offering-engine

# Copy package.json and package-lock.json (or yarn.lock) to the working directory
# This allows installing dependencies before copying the entire application code
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

RUN npm run build

# Expose the port your Node.js server listens on
EXPOSE 3000

# Define the command to run your application
CMD [ "npm", "run", "start" ]
