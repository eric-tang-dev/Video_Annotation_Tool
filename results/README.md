# Nursing Video Annotation Tool

## Instructions to Get Started

1. **Unzip** the folder. Just double click it once downloaded. 
2. **Run the start script:**
   * **Windows:** Double-click `start.bat`
   * **Mac:** Run `sh start.sh` in Terminal.
3. If the browser doesn't open automatically, go to `http://127.0.0.1:5000`

## User Guide

### Video Controls
* **Play/Pause:** Press `Spacebar` or click the video.
* **Scrub:** Click or drag the **red playhead** on the timeline to seek.
* **Speed:** Use the drop-up menu to adjust playback speed.
* **Switch Videos:** Use the `<` and `>` arrow buttons in the header to cycle through videos.

### Recording Steps
* Press `[` to mark the **start time** of the step. 
* Press `]` to mark the **end time** of the step. This creates the step and pauses the video.

### Editing
* **Adjust Time:** Click a step to select it, then drag the **white handles** on the left/right of the timeline block to fine-tune timing.
* **Edit Details:** Use the evaluation form to name the action, add comments, and rate it (**Satisfactory** / **Unsatisfactory**).
* **Confirm:** Press `Enter` or click **Confirm** to save edits.

### Deleting
Hover over the item in the sidebar list and click the **red X**.

### Saving
Click the green **Save** button in the top right. This saves all work to `results.json`. \
You should be able to access `results.json` in the **results/** folder. \
*Note: Switching videos or closing the browser without clicking Save will lose unsaved progress.*
