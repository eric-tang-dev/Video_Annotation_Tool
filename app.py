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

VALID_EXPERT_IDS = {"1183456", "100121_eric", "110121_shen", "120121_francis", "130121_jessica", "stacie_1", "dagne_1"}

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
    ], 
    "venipuncture": [
        "Provide privacy as needed",
        "Introduce yourself",
        "Perform hand hygiene",
        "Verify the patient’s name and DOB",
        "Provide patient education about the procedure",
        "Verbalize: Review the provider’s order for venipuncture",
        "Gather equipment at the bedside",
        "Don gloves",
        "Raise the bed to a comfortable height and place equipment on a side table or clean area near the patient",
        "Assess the patient's arm for a suitable vein for venipuncture",
        "Apply a tourniquet to the patient’s arm above the identified site",
        "Cleanse the venipuncture site with antiseptic and allow it to air-dry",
        "Remove the needle cover, inform the patient that the stick will last a few seconds",
        "Use the thumb or forefinger of the nondominant hand to hold the skin taut and stabilize the vein",
        "Using the dominant hand, insert the needle with the bevel up into the vein until you observe for blood return",
        "When the desired amount of blood is collected by syringe or desired specimen tubes are collected via vacutainer, release the tourniquet",
        "Have the proper collection tube resting in the vacutainer device and advance the tube into the needle on the holder",
        "Apply the gauze to the site without pressure, withdraw the needle, then apply pressure with the gauze",
        "Dispose of the needle in the proper receptacle",
        "Continue to apply pressure to the site until the bleeding stops, observe for a hematoma, and tape the dressing securely",
        "Verbalize: Ensure that the patient is in a safe position prior to leaving the room and has the call light within reach",
        "Verbalize: Document the procedure"
    ],
    "ng-insertion": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself to the patient",
        "Verify the patient’s name and DOB",
        "Explain the procedure to the patient",
        "Verbalize: Inspect patient nares and check for patency",
        "Assist patient into high-Fowler’s position or sitting at a 45° angle",
        "Place a towel over the patient’s chest",
        "Open kit",
        "Measure the length of tubing required for the patient, then mark it with a piece of tape",
        "Apply clean gloves",
        "Open Lubricant",
        "Lubricate the tip of the tube",
        "Verbalize: Give the patient a cup of water with a straw and have them extend their head back on a pillow",
        "Verbalize: Have the patient flex their chin to their chest and encourage patient to sip through a straw while the tube advances",
        "Insert tube following the nasal passage. Rotate the tube to help pass through the nasopharynx",
        "Ensure the tube is not coiled in the pharynx",
        "Continue advancing the tubing until the measured mark is reached",
        "Secure tubing temporarily with tape",
        "Verbalize: Stop the procedure if the patient becomes cyanotic, is unable to speak or hum, has continuous coughing or gagging, or if unable to advance the tube after rotating it",
        "Apply skin barrier to the nose and secure tube in place with tape or a fixation device",
        "Secure the tubing to the patient’s gown. If a double-lumen is used, ensure vent is above patient’s stomach",
        "Remove gloves and perform hand hygiene",
        "Verbalize: Arrange for an x-ray to confirm placement",
        "Ensure that the patient is safe and has call light before leaving the room",
        "Document the procedure"
    ],
    "enteral-feeding": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself to the patient",
        "Verify the patient’s name and DOB",
        "Explain the procedure to the patient",
        "Verbalize: Verify the provider’s prescription and check the expiration date on the formula",
        "Don gloves",
        "Elevate patient’s HOB to 30 to 45 degrees",
        "Attach Lopez Valve to the patient's feeding tube",
        "Flush the tube with 30 mL of air to clear the tube out",
        "Confirm tube placement. The gold standard is Xray confirmation, but if that is done you can confirm by checking the pH of the stomach contents. Verbalize what the pH should be",
        "Flush the tube with 30 ml of water",
        "Hang the feeding and flush bags to the IV pole",
        "Administer via feeding bag (Fill the bag with the prescribed amount of formula and then fill flush bag)",
        "Administer via feeding bag (Prime feeding bag and flush)",
        "Administer via feeding bag (Connect the feeding bag to the feeding tube port (Lopez valve or straight into the Gtube))",
        "Administer via feeding bag (Administer feeding at the prescribed rate via a feeding pump (kangaroo pump))",
        "Remove gloves and perform hand hygiene",
        "Verbalize: Have the patient remain upright or in Fowler’s position for 30 mins after feeding",
        "Ensure that the patient has the call light within reach and is in a safe position",
        "Document the procedure"
    ],
    "ppe-ambulation": [
        "Perform hand hygiene",
        "Before entering the patient’s room don the appropriate PPE",
        "Provide Privacy",
        "Introduce yourself",
        "Verify patient name and DOB",
        "Verbalize: Obtain proper supplies and review physician order",
        "Place the bed in the lowest position and lock the brake.",
        "Verbalize: Instruct the patient to report any dizziness, weakness, or shortness of breath",
        "Verbalize: Instruct the patient to move to the side of the bed if they are able and sit on the side of the bed, with feet firmly on the floor",
        "Place the gait belt around the patient’s waist",
        "Ensure the walker is in front of the patient before having the patient stand",
        "Assist the patient to stand, using the gait belt",
        "Verbalize: After the patient stands, instruct the patient to hold the handgrips on the walker firmly",
        "Position yourself slightly behind the patient on one side",
        "Verbalize: Instruct the patient to move the walker forward 6 to 8 inches, setting it down with all four feet on the floor",
        "While supporting their weight on the walker, tell the patient to move one foot forward, following the other foot",
        "Verbalize: Tell the patient to move the walker forward, repeating the same step",
        "After ambulating the patient, place them back into bed. Ensure they are in a safe position with the call light",
        "Doff PPE"
    ],
    "im-injection": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself to the patient",
        "Verify the patient’s name and DOB",
        "Explain the procedure to the patient",
        "Verbalize: Review the provider’s prescription for the medication to be administered",
        "Verbalize: Ensure all necessary supplies are readily available (needles, syringe, medication vial, alcohol wipes, adhesive bandage, MAR)",
        "Don gloves or perform hand hygiene",
        "Verbalize: Verify medication order, medication name, and expiration date on the medication and compare to the patient’s MAR",
        "Prepare the medication",
        "Verbalize: Choose an injection site based on volume to be injected and the assessment of the area",
        "Verbalize: Select needle length and gauge based upon the thickness of the subcutaneous tissue the needle will need to pass through. State size that should be used for a deltoid IM injection",
        "Position the patient for comfort and accessibility of the injection site",
        "Locate the muscle using landmarks",
        "Cleanse the skin with the alcohol pad",
        "Using the Z-Track method (Displace the skin by pulling the skin and underlying tissue over about 1 inch with the non-dominant hand)",
        "Using the Z-Track method (Only let go of the skin once the injection has been given and the needle has been removed)",
        "Using a dart-like movement, administer the injection at 90-degree angle",
        "Use the thumb and index finger of the dominant hand to press the plunger and slowly inject the medication",
        "Steadily withdraw the needle at the same angle at which it was inserted",
        "Immediately deploy needle safety device",
        "Verbalize: Apply light pressure, if needed, and apply a bandage over the injection site",
        "Ensure the patient is in a safe and comfortable position",
        "Discard the needle and syringe in the appropriate receptacle",
        "Remove gloves and perform hand hygiene",
        "Document the relevant information in the patient’s MAR"
    ],
    "enteral-medication": [
        "Provide privacy and perform hand hygiene",
        "Introduce yourself to the patient",
        "Verify the patient’s name and DOB",
        "Explain the procedure to the patient",
        "Verbalize: Review the provider’s order for medication administration",
        "Verbalize: Ensure all necessary supplies are readily available (i.e., pill crusher, syringe, water, medication)",
        "Crush the medication, if required, then dissolve the medication in recommended liquid",
        "Elevate the HOB 30 degrees",
        "Verbalize: If applicable, pause tube feeding according to facility policy and medication recommendations",
        "Flush the tube with 30 mL of air to clear the tube out",
        "Confirm tube placement. The gold standard is Xray confirmation, but if that is done you can confirm by checking the pH of the stomach contents. Verbalize what the pH should be for a gastric tube",
        "Check the gastric residual volume",
        "Insert a 60ml syringe into the gastric tube and flush the gastric tube with 30 ml water",
        "Pour medication into the syringe and administer it into the gastric tube",
        "After administering the last dose of medication, flush gastric tube with 30 to 60ml of water",
        "Clamp the feeding tube, remove syringe, and cap the end of the feeding tube. Restart feeding, if indicated, according to agency policy and medication recommendations",
        "Ensure that the patient is safe before leaving the room and has the call light within reach",
        "Document the procedure"
    ]
}

# -----------------------------
# GCS CONFIGURATION 
# -----------------------------
GCS_BUCKET_NAME = "nursing_annotations_json"
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

    CATEGORY_ORDER = [
        "foley-catheter",
        "sterile-gloves",
        "ostomy-skills",
        "venipuncture",
        "ng-insertion",
        "enteral-feeding"
    ]

    grouped_videos = {category: [] for category in CATEGORY_ORDER}
    grouped_videos["other"] = []

    for video in KALTURA_VIDEOS:
        video_copy = video.copy()
        resolved_entry_id = resolve_annotation_entry_id(video["entry_id"])
        video_copy["completed"] = bool(completion_index.get(resolved_entry_id, False))
        
        cat = video_copy.get("category", "other")
        if cat in grouped_videos:
            grouped_videos[cat].append(video_copy)
        else:
            grouped_videos["other"].append(video_copy)

    if not grouped_videos["other"]:
        grouped_videos.pop("other")

    def get_video_number(v):
        name = v.get("video_name", "") 
        
        if name.startswith('S'):
            parts = name.split('_')
            number_part = parts[0][1:] 
            if number_part.isdigit():
                return int(number_part)
                
        return 999 

    for cat in grouped_videos:
        grouped_videos[cat] = sorted(grouped_videos[cat], key=get_video_number)

    return render_template(
        'select_video.html',
        grouped_videos=grouped_videos,
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
        completion_index[resolved_entry_id] = bool(data.get("completed", False))
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