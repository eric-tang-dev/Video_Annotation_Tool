#!/bin/bash
echo "NURSING ANNOTATION TOOL..."

# 1. Check if python3 is installed
if ! command -v python3 &> /dev/null
then
    echo "Python 3 could not be found. Please install Python."
    exit
fi

# 2. Create Virtual Environment (if it doesn't exist)
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# 3. Activate venv and Install Dependencies 
echo "Installing dependencies..."
source .venv/bin/activate
pip install -r requirements.txt

# 4. Run the App
echo "Starting App..."
echo "Please open your browser to: http://127.0.0.1:5000"
python3 app.py