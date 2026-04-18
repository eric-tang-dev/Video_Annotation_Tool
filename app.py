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


# -----------------------------
# KALTURA VIDEO INDEX
# -----------------------------
KALTURA_VIDEOS = [
    {
        "category": "ostomy-skills",
        "video_name": "S1_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57908202,
        "entry_id": "1_pc9nnlfe"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S2_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S3_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S4_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S5_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_5k6laa17"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S6_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S7_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "ostomy-skills",
        "video_name": "S8_compressed",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_ifhnx26b"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S10_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_0ukvx295"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S11_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_db5y1w1d"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S12_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_0xox0f5v"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S13_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_8b1ax3dm"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S14_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_xv3090hc"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S15_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_bcsjp5p4"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S16_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_3qk65el8"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S17_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_yc3r5qe0"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S18_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_hxpqt5l2"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S19_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_k7f8r6ha"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S20_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_yc3r5qe0"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S21_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_gw7va375"
    },
    {
        "category": "sterile-gloves",
        "video_name": "S22_compressed_gloves",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_7p7029hd"
    },
    {
        "category": "TEST VIDEO FOR DEVELOPER",
        "video_name": "test_1",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_jyzyakxa"
    },
    {
        "category": "",
        "video_name": "test_1",
        "target_id": "kaltura_player",
        "wid": "_6489582",
        "uiconf_id": 57873862,
        "entry_id": "1_jyzyakxa"
    }
    
]

STEP_OPTIONS_BY_CATEGORY = {
    "ostomy-skills": [
        "Provide Privacy",
        "Introduce yourself",
        "Perform hand hygiene and don gloves",
        "Verify patient name and DOB",
        "Obtain proper supplies and review physician order",
        "Place a waterproof barrier under stoma appliance",
        "Empty ostomy appliance using proper technique",
        "Remove the appliance carefully",
        "Dispose of appliance according to agency policy",
        "Remove excess stool or urine from stoma site",
        "Pat dry",
        "Assess stoma site and area around site",
        "Apply skin protectant if applicable",
        "Measure stoma site and cut barrier",
        "Apply barrier around site",
        "Apply pressure around barrier to ensure adhesive is sealed",
        "Attach appliance pouch to barrier",
        "Ensure pouch is closed",
        "Remove gloves and perform hand hygiene",
        "Ensure patient is safe before leaving room"
    ],
    "sterile-gloves": [
        "Provide privacy as needed",
        "Introduce yourself",
        "Perform hand hygiene",
        "Verify the patient's name and DOB",
        "Provide patient education about the procedure",
        "Gather equipment at the bedside",
        "Raise the bed to a comfortable height and place equipment on a side table or clean area near the patient",
        "Lift the glove off the wrapper by touching only the outside surface of the glove",
        "Apply the glove to the non-dominant hand",
        "Once the second glove is applied, adjust the gloves as necessary",
        "Ensure that the patient is in a safe position prior to leaving the room and has the call light within reach",
        "Document the procedure"
    ]
}

# -----------------------------
# GCS CONFIGURATION (NEW)
# -----------------------------
GCS_BUCKET_NAME = "annotations_nursing_json"
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


@app.route('/')
def index():
    # Read the selected entry_id from the query string
    requested_entry_id = request.args.get("entry_id")

    # Default to the first video if no query param is provided
    video = KALTURA_VIDEOS[0]

    # If entry_id is provided, find the matching video in the hardcoded catalog
    if requested_entry_id:
        matched_video = next(
            (v for v in KALTURA_VIDEOS if v["entry_id"] == requested_entry_id),
            None
        )
        if matched_video:
            video = matched_video

    video_file = True   # keep template logic intact
    video_name = video["video_name"]

    # Load saved annotation data from GCS using the selected video's entry_id
    saved_data = load_annotation_from_gcs(video["entry_id"])

    return render_template(
        'index.html',
        video_file=video_file,
        video_name=video_name,
        saved_data=saved_data,
        kaltura_video=video,
        all_videos=KALTURA_VIDEOS,
        selected_entry_id=video["entry_id"]
    )


"""
This function sends the video file's data to the frontend
"""
@app.route('/video/<path:filename>')
def send_video(filename):
    return send_from_directory(video_directory, filename)   # send the video's data to make it available for use in our app


"""
This function renders a full-page video picker.
It groups all hardcoded Kaltura videos by category and highlights the current selection.
Clicking a video card returns the user to the main annotation page with ?entry_id=...
"""
@app.route('/select-video')
def select_video():
    selected_entry_id = request.args.get("entry_id")

    return render_template(
        'select_video.html',
        all_videos=KALTURA_VIDEOS,
        selected_entry_id=selected_entry_id
    )

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