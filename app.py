import json
import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from google.cloud import storage
from google.api_core.exceptions import NotFound


app = Flask(__name__)   # start instance of Flask


# define path names for ease, create folders if not existing
video_directory = Path("data")
results_directory = Path("results")
video_directory.mkdir(parents=True, exist_ok=True)
results_directory.mkdir(parents=True, exist_ok=True)


# global to keep track of current video
current_video_index = 0


# -----------------------------
# KALTURA VIDEO INDEX (NEW)
# -----------------------------
KALTURA_VIDEOS = [
    {
        "video_name": "S3_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    }
    # Add more videos here later
]


# -----------------------------
# GCS CONFIGURATION (NEW)
# -----------------------------
GCS_BUCKET_NAME = "annotation_nursing_json"
GCS_PREFIX = "annotations"


# Reuse one storage client for the process. On Cloud Run this uses
# Application Default Credentials from the attached service account.
storage_client = storage.Client()


# -----------------------------
# GCS HELPERS (NEW)
# -----------------------------
def get_annotation_blob_name(entry_id: str) -> str:
    return f"{GCS_PREFIX}/{entry_id}.json"



def load_annotation_from_gcs(entry_id: str):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_annotation_blob_name(entry_id))

    try:
        raw = blob.download_as_text()
        return json.loads(raw)
    except NotFound:
        return None
    except Exception as exc:
        print(f"Failed to load annotation from GCS for entry_id={entry_id}: {exc}")
        return None



def save_annotation_to_gcs(entry_id: str, payload: dict):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_annotation_blob_name(entry_id))
    blob.upload_from_string(
        json.dumps(payload, indent=4),
        content_type="application/json"
    )


"""
This function renders the HTML page and attaches the desired video file and previously logged data (steps)
"""
@app.route('/')
def index():
    global current_video_index


    # Use Kaltura list instead of local directory
    if current_video_index >= len(KALTURA_VIDEOS):
        current_video_index = 0


    video = KALTURA_VIDEOS[current_video_index]


    video_file = True   # keep template logic intact
    video_name = video["video_name"]


    # CHANGED:
    # Old behavior loaded saved data from local results/results.json using video_name.
    # New behavior loads one annotation JSON object from GCS using entry_id.
    saved_data = load_annotation_from_gcs(video["entry_id"])


    return render_template(
        'index.html',
        video_file=video_file,
        video_name=video_name,
        saved_data=saved_data,
        kaltura_video=video
    )


"""
This function sends the video file's data to the frontend
"""
@app.route('/video/<path:filename>')
def send_video(filename):
    return send_from_directory(video_directory, filename)   # send the video's data to make it available for use in our app


"""
This function accepts a POST request to go to the 'prev' or 'next' video
"""
@app.route('/switch_video', methods=['POST'])
def switch_video():
    global current_video_index


    # Use Kaltura list instead of local files
    if not KALTURA_VIDEOS:
        return jsonify(success=False)

    direction = request.json.get('direction')

    if direction == 'next':
        current_video_index = (current_video_index + 1) % len(KALTURA_VIDEOS)

    elif direction == 'prev':
        current_video_index = (current_video_index - 1) % len(KALTURA_VIDEOS)

    return jsonify(success=True)


"""
This function accepts JSON data from the frontend and saves it.
The frontend now sends one direct annotation object, not a top-level
{ video_name: {...} } wrapper.
Tasks:
    1. Read the JSON payload directly from the request
    2. Validate that entry_id exists
    3. Save the payload to GCS as annotations/<entry_id>.json
"""
@app.route('/save', methods=['POST'])
def save_results():
    data = request.get_json()

    try:
        if not data:
            return jsonify({"success": False, "message": "empty payload"}), 400

        entry_id = data.get("entry_id")
        if not entry_id:
            return jsonify({"success": False, "message": "missing entry_id"}), 400

        save_annotation_to_gcs(entry_id, data)

        return jsonify({
            "success": True,
            "message": "results saved to GCS successfully",
            "entry_id": entry_id,
            "blob_name": get_annotation_blob_name(entry_id)
        })

    except Exception as exc:
        print(f"Failed to save results to GCS: {exc}")
        return jsonify({"success": False, "message": str(exc)}), 500


if __name__ == '__main__':
    print(f"Flask App running.")
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=False, host='0.0.0.0', port=port)   # code not used in production, but helps BuilderPack auto-detect our code needs what needs to change


# This function sends the video file's data to the frontend
# """
# @app.route('/video/<path:filename>')
# def send_video(filename):
#     return send_from_directory(video_directory, filename)   # send the video's data to make it available for use in our app