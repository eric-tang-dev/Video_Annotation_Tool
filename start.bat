@echo off
echo NURSING ANNOTATION TOOL...

: 1. Create venv if missing
if not exist .venv (
    echo Creating virtual environment...
    python -m venv .venv
)

: 2. Activate and Install
call .venv\Scripts\activate
echo Installing dependencies...
pip install -r requirements.txt

: 3. Run
echo Starting App...
echo Please open your browser to: http://127.0.0.1:5000
python app.py
pause