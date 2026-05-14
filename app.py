import json
import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for
from google.cloud import storage
from google.api_core.exceptions import NotFound
from video_index import KALTURA_VIDEOS
from entry_id_aliases import ENTRY_ID_ALIASES



app = Flask(__name__)   # start instance of Flask
app.secret_key = "replace-this-with-a-long-random-secret"


# define path names for ease, create folders if not existing
video_directory = Path("data")
results_directory = Path("results")
video_directory.mkdir(parents=True, exist_ok=True)
results_directory.mkdir(parents=True, exist_ok=True)

# -----------------------------
# EXPERT IDS 
# -----------------------------

VALID_EXPERT_IDS = {"1183456", "100121_eric", "110121_shen", "120121_francis", "130121_jessica"}

# -----------------------------
# STEP OPTIONS FOR DROPDOWN
# -----------------------------

STEP_OPTIONS_BY_CATEGORY = {
    "ostomy-skills": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself",
        "Verify the patient's name and DOB",
        "Don gloves",
        "Verbalize: Obtain proper supplies and review physician order",
        "Place a waterproof barrier under stoma appliance",
        "Verbalize: Empty ostomy appliance using proper technique",
        "Remove the appliance carefully. Avoid damaging skin. Use adhesive remover if applicable",
        "Dispose of appliance according to agency policy",
        "Verbalize: Remove excess stool or urine from stoma site with toilet tissue. Clean skin around site according to agency policy",
        "Pat dry",
        "Verbalize: Assess stoma site and area around site",
        "If skin protectant is applicable, apply prior to placing skin barrier",
        "Verbalize the measurement: Measure stoma site and cut barrier larger by 1/8 inch",
        "After removing paper backing, apply barrier around site",
        "Apply pressure around barrier to ensure adhesive is sealed",
        "Attach appliance pouch to barrier",
        "Ensure pouch is closed",
        "Remove gloves and perform hand hygiene",
        "Ensure that the patient is in a safe position prior to leaving the room and has the call light within reach"
    ],
    "sterile-gloves": [
        "Provide privacy as needed and Perform Hand Hygiene",
        "Introduce yourself",
        "Verify the patient's name and DOB",
        "Provide patient education about the procedure",
        "Adjust table to appropriate working height (waist level)",
        "Unwrap sterile package",
        "Lift the glove off the wrapper by touching only the outside surface of the glove. (first by the dominant hand)",
        "Apply the glove to the non-dominant hand",
        "Once the second glove is applied, adjust the gloves as necessary",
        "Verbalize: Ensure that the patient is in a safe position prior to leaving the room and has the call light within reach",
        "Verbalize: Document the procedure"
    ],
    "foley-catheter": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself to the patient",
        "Verify the patient’s name and DOB",
        "Explain the procedure to the patient",
        "Verbalize: Review the provider’s order for the indwelling catheter",
        "Place equipment on a stable surface within reach (such as a bedside table)",
        "Adjust the environment (including the patient’s bed) for convenience, ergonomics, and lighting",
        "Verbalize: Assist the patient to a position that accounts for their physical limitations and performing the procedure",
        "Verbalize: Apply clean gloves and perform perineal care",
        "Verbalize: For a client who has a penis, retract foreskin, if needed, then perform perineal care",
        "Perform hand hygiene",

        "Open kit",
        "Open kit (Opens package flap away from their body first)",
        "Open kit (Places drape underneath patient only touching outer 1” border)",

        "Dons Sterile Gloves (Opens sterile gloves on separate surface)",
        "Dons Sterile Gloves (Applies sterile glove to dominate hand)",
        "Dons Sterile Gloves (Applies sterile gloves to other hand)",
        "Dons Sterile Gloves (Once the second glove is applied, adjust the gloves as necessary)",

        "Prepares kit (Attaches prefilled syringe to inflation port, does not inflate balloon prior to insertion)",
        "Prepares kit (Opens lubricant and applies to tip of catheter)",
        "Prepares kit (Removes plastic sheath from catheter)",
        "Prepares kit (Prepare cleansing swabs)",

        "Move box to the bed while maintaining sterility",

        "Cleanse the meatus (Leaves non-dominant hand in place during and after cleansing)",
        "Cleanse the meatus (For client who has a penis: Retract foreskin with non-dominant hand, if needed. Hold the shaft of the penis with the non-dominant hand in an upward position; with the dominant hand, cleanse the meatus use a circular motion with all three swabs, starting at the meatus and circling away from the meatus and around the glans)",
        "Cleanse the meatus (For client who has a vagina: spread the labia minora with the non-dominant hand and cleanse from top-to-bottom with the first swab on one side of the labial fold, second swab on the opposite labial fold and third swab directly over the meatus)",

        "Insert the catheter (Slowly insert the lubricated catheter into the meatus using dominant hand, advancing the catheter until urine appears in the drainage tubing, as indicated by the instructor’s verbalization)",
        "Insert the catheter (For clients with a vagina, advance the catheter another 2 inches after urine appears in the tubing)",
        "Insert the catheter (For clients with a penis, advance the catheter all the way to the tubing bifurcation once urine appears in the tubing)",

        "Hold the catheter securely with the nondominant hand while inflating the catheter balloon",
        "Gently pull back on the catheter until resistance is felt",
        "Verbalize: If client is uncircumcised, replace the foreskin",
        "Verbalize: Secure catheter with securement device",
        "Secure the collection bag below the level of the bladder",
        "Verbalize: Perform perineal care",
        "Dispose of equipment per agency policy",
        "Perform hand hygiene",
        "Verbalize: Ensure that the patient is safe before leaving the room and has the call light within reach",
        "Verbalize: Document the procedure in EHR tutor"
    ]
}

# -----------------------------
# GCS CONFIGURATION 
# -----------------------------
GCS_BUCKET_NAME = "annotations_nursing_json"
GCS_PREFIX = "annotations"

def resolve_annotation_entry_id(entry_id: str) -> str:
    return ENTRY_ID_ALIASES.get(entry_id, entry_id)


# Reuse one storage client for the process. On Cloud Run this uses
# Application Default Credentials from the attached service account.
storage_client = storage.Client()


# -----------------------------
# GCS HELPERS 
# -----------------------------
def get_annotation_blob_name(entry_id: str, expert_id: str) -> str:
    resolved_entry_id = resolve_annotation_entry_id(entry_id)
    return f"{GCS_PREFIX}/{resolved_entry_id}/{expert_id}.json"

def load_annotation_from_gcs(entry_id: str, expert_id: str):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_annotation_blob_name(entry_id, expert_id))

    try:
        raw = blob.download_as_text()
        return json.loads(raw)
    except NotFound:
        return None
    except Exception as exc:
        print(f"Failed to load annotation from GCS for entry_id={entry_id}, expert_id={expert_id}: {exc}")
        return None



def save_annotation_to_gcs(entry_id: str, expert_id: str, payload: dict):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_annotation_blob_name(entry_id, expert_id))
    blob.upload_from_string(
        json.dumps(payload, indent=4),
        content_type="application/json"
    )

def get_completion_index_blob_name(expert_id: str) -> str:
    return f"{GCS_PREFIX}/completion_index/{expert_id}.json"


def load_completion_index(expert_id: str):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_completion_index_blob_name(expert_id))

    try:
        raw = blob.download_as_text()
        return json.loads(raw)
    except NotFound:
        return {}
    except Exception as exc:
        print(f"Failed to load completion index from GCS for expert_id={expert_id}: {exc}")
        return {}


def save_completion_index(expert_id: str, index_data: dict):
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(get_completion_index_blob_name(expert_id))
    blob.upload_from_string(
        json.dumps(index_data, indent=4),
        content_type="application/json"
    )

# -----------------------------
# EXPERT ID HELPERS
# -----------------------------

def require_expert_id():
    expert_id = session.get("expert_id")
    if not expert_id:
        return None
    return expert_id


# -----------------------------
# REST ENDPOINTS
# -----------------------------
@app.route('/')
def index():
    # Require expert ID to access annotation page
    expert_id = require_expert_id()
    if not expert_id:
        return redirect(url_for('expert_login'))

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
    saved_data = load_annotation_from_gcs(video['entry_id'], expert_id)

    return render_template(
        'index.html',
        video_file=video_file,
        video_name=video_name,
        saved_data=saved_data,
        kaltura_video=video,
        all_videos=KALTURA_VIDEOS,
        step_options_by_category=STEP_OPTIONS_BY_CATEGORY,
        selected_entry_id=video["entry_id"],
        expert_id=expert_id
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
    expert_id = require_expert_id()
    if not expert_id:
        return redirect(url_for('expert_login'))

    selected_entry_id = request.args.get("entry_id")
    completion_index = load_completion_index(expert_id)

    videos_with_status = []

    for video in KALTURA_VIDEOS:
        video_copy = video.copy()
        resolved_entry_id = resolve_annotation_entry_id(video["entry_id"])
        video_copy["completed"] = bool(completion_index.get(resolved_entry_id, False))
        videos_with_status.append(video_copy)

    return render_template(
        'select_video.html',
        all_videos=videos_with_status,
        selected_entry_id=selected_entry_id,
        expert_id=expert_id
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
    expert_id = require_expert_id()
    if not expert_id:
        return jsonify({"success": False, "message": "missing expert session"}), 401

    data = request.get_json()

    try:
        if not data:
            return jsonify({"success": False, "message": "empty payload"}), 400

        entry_id = data.get("entry_id")
        if not entry_id:
            return jsonify({"success": False, "message": "missing entry_id"}), 400

        resolved_entry_id = resolve_annotation_entry_id(entry_id)
        
        save_annotation_to_gcs(entry_id, expert_id, data)

        completion_index = load_completion_index(expert_id)
        completion_index[entry_id] = bool(data.get("completed", False))
        save_completion_index(expert_id, completion_index)

        return jsonify({
            "success": True,
            "message": "results saved to GCS successfully",
            "entry_id": entry_id,
            "resolved_entry_id": resolved_entry_id,
            "expert_id": expert_id,
            "blob_name": get_annotation_blob_name(entry_id, expert_id)
        })

    except Exception as exc:
        print(f"Failed to save results to GCS: {exc}")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route('/expert-login', methods=['GET', 'POST'])
def expert_login():
    if request.method == 'POST':
        expert_id = request.form.get('expert_id', '').strip()

        if not expert_id:
            return render_template('expert_login.html', error="Please enter your expert ID.")

        if expert_id not in VALID_EXPERT_IDS:
            return render_template('expert_login.html', error="Invalid expert ID.")

        session['expert_id'] = expert_id
        return redirect(url_for('select_video'))

    return render_template('expert_login.html', error=None)


@app.route('/switch-expert')
def switch_expert():
    session.pop('expert_id', None)
    return redirect(url_for('expert_login'))





if __name__ == '__main__':
    print(f"Flask App running.")
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=False, host='0.0.0.0', port=port)   # code not used in production, but helps BuilderPack auto-detect our code needs what needs to change


# This function sends the video file's data to the frontend
# """
# @app.route('/video/<path:filename>')
# def send_video(filename):
#     return send_from_directory(video_directory, filename)   # send the video's data to make it available for use in our app