import json
import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)   # start instance of Flask 

# define path names for ease, create folders if not existing
video_directory = Path("data")
results_directory = Path("results")
video_directory.mkdir(parents=True, exist_ok=True)
results_directory.mkdir(parents=True, exist_ok=True)

# global to keep track of current video
current_video_index = 0

"""
This function renders the HTML page and attaches the desired video file and previously logged data (steps)
"""
@app.route('/')
def index():
    global current_video_index
    videos = sorted([v.name for v in video_directory.iterdir()
                if v.suffix.lower() in [".mp4", ".mov"]])    # find all .mp4 and .mov (apple) files in data/

    if current_video_index > len(videos):
        current_video_index = 0

    video_file = videos[current_video_index] if videos else None 
    video_name = os.path.splitext(video_file)[0]

    saved_data = None
    path = results_directory / "results.json"
    try:
        with path.open("r") as fp:
            all_data = json.load(fp)
            saved_data = all_data.get(video_name)
    except:
        pass

    return render_template('index.html', video_file=video_file, video_name=video_name, saved_data=saved_data)   


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
    videos = sorted([v.name for v in video_directory.iterdir()
                if v.suffix.lower() in [".mp4", ".mov"]]) 
    if not videos:
        return jsonify(success=False)
    
    direction = request.json.get('direction')
    if direction == 'next':
        if current_video_index + 1 >= len(videos):
            current_video_index = 0
        else:
            current_video_index += 1
    elif direction == 'prev':
        if current_video_index - 1 < 0:
            current_video_index = 0
        else:
            current_video_index -= 1
    
    return jsonify(success=True)

"""
This function accepts JSON data from the frontend and saves it 
"""
@app.route('/save', methods=['POST'])
def save_results():
    data = request.json
    path = results_directory / "results.json"

    try:
        with path.open("r") as fp:
            existing_file = json.load(fp)
    except json.JSONDecodeError:    # if the json file didn't exist/was empty
        existing_file = {} 

    existing_file.update(data)

    with path.open("w") as fp:
        json.dump(existing_file, fp, indent=4)

    return jsonify({"status": "success", "message": "results saved to json file successfully"})


if __name__ == '__main__':
    print(f"Flask App running.")
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=False, host='0.0.0.0', port=port)   # code not used in production, but helps BuilderPack auto-detect our code needs