# 1. Use an official lightweight Python image
FROM python:3.11-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Install dependencies
# Copy only requirements first to leverage Docker caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy your local code into the container
COPY . .

# 5. Start the web server
# This uses Gunicorn to listen on the port Google provides
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 main:app