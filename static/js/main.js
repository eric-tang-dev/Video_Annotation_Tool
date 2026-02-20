// State Variables 
let all_steps = []
let active_step_id = null
let temp_start_time = null
let video_length = 1

// DOM elements
const video = document.getElementById("mainVideo")
const timeline = document.getElementById("timelineContainer")

// save video length into variable before playback starts
video.addEventListener('loadedmetadata', () => {
    video_length = video.duration;
    initPlayheadDrag();
    loadSavedData();
    renderTimeline(); 
});

// update timeline's red bar as video plays
video.addEventListener('timeupdate', () => {
    const pos = (video.currentTime / video_length) * 100;
    document.getElementById('playhead').style.left = `${pos}%`;
    document.getElementById('timeDisplay').innerText = 
        `${formatTime(video.currentTime)} / ${formatTime(video_length)}`;
});

// Clicking the video screen plays/pauses
video.addEventListener('click', togglePlay);

video.addEventListener('play', () => {      // pause button appears when vid 'playing'
    const btn = document.getElementById('btnPlayPause');
    btn.innerText = "Pause";
    btn.classList.replace('btn-primary', 'btn-secondary'); 
});

video.addEventListener('pause', () => {     // play button appears when 'paused'
    const btn = document.getElementById('btnPlayPause');
    btn.innerText = "Play";
    btn.classList.replace('btn-secondary', 'btn-primary'); 
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // NO shortcuts if user is typing into the Evaluation Form
    if ((e.target.tagName === 'INPUT') || (e.target.tagName === 'TEXTAREA')) {
        if (e.key === 'Enter') {    // 'Enter' key submits Evaluation Form
            commitEdit(); 
        }
        return;
    }

    // Spacebar = Toggle Play/Pause
    if (e.key === ' ') {
        e.preventDefault(); // stop page from scrolling down
        togglePlay();
    }

    // '[' = Start Logging Step
    if (e.key === '[') {
        temp_start_time = video.currentTime;
        
        // Show the "LOGGING STEP..." text
        document.getElementById('recIndicator').style.display = 'inline';
        
        // Draw Green Marker (indicating step's start time)
        const track = document.getElementById('timelineTrack');
        
        // Remove old marker if exists
        const old = document.getElementById('tempMarker');
        if (old) old.remove();

        // Create new marker
        const marker = document.createElement('div');
        marker.id = 'tempMarker';
        marker.className = 'temp-marker';

        // Calculate position
        const pos = (temp_start_time / video_length) * 100;
        marker.style.left = `${pos}%`;
        
        // Place new marker on timeline
        track.appendChild(marker);
    }

    // ']' = Mark End
    if (e.key === ']') {
        e.preventDefault();

        if (temp_start_time !== null) {
            finishCapture();
        }
    }
});

/*
    This function pre-loads the timeline and step list with saved data.
    The saved data is already available (sent by app.py's index() function).
    Tasks:
        1. Count the number of steps 
        2. For each step, extract their data and format into a new object
        3. Add the step to the global all_steps
        4. Refresh the timeline and step list to reflect the new data
*/
function loadSavedData() {
    if (!SAVED_DATA) return; 

    // Find the number of steps 
    const count = SAVED_DATA.timestamps.length;
    
    for (let i = 0; i < count; i++) {
        const newStep = {
            id: Date.now() + i, // unique ID
            start: SAVED_DATA.timestamps[i][0],
            end: SAVED_DATA.timestamps[i][1],
            name: SAVED_DATA.actions[i],
            rating: SAVED_DATA.evaluation[i],
            comment: SAVED_DATA.comments[i]
        };
        all_steps.push(newStep);
    }
    
    // Refresh 
    renderTimeline();
    renderList();
}

/*
   This function is called when ']' is pressed. 
   Tasks:
        1. Pauses the video 
        2. Removes the temporary green "start of step" marker
        3. Removes the red "LOGGING STEP..." block
        4. Creates a new 'Step' object
        5. Adds the new 'Step' to the global array
        5. Calls selectStep(id), opening the Evaluation Form.
*/
function finishCapture() {
    video.pause();
    const end_time = video.currentTime;

    // Remove the Green Marker
    const marker = document.getElementById('tempMarker');
    if (marker) marker.remove();
    
    // Create the Step Object
    const newStep = {
        id: Date.now(), // unique ID
        name: "Untitled Action",
        start: temp_start_time,
        end: Math.max(end_time, temp_start_time + 0.5), // minimum 0.5-second step
        rating: 0.5, 
        comment: ''
    };

    // Add to Global Array 
    all_steps.push(newStep);
    
    // Reset "Logging" State
    temp_start_time = null;
    document.getElementById('recIndicator').style.display = 'none';
    
    // Open the Evaluation Form with the new step
    selectStep(newStep.id); 
}

/*
    This function is called when the top-right 'Save' button is pressed.
    Its purpose is to save the logged steps into JSON format.
    It is saved into ../results/results.json
    Tasks:
        1. Create the payload by formatting global all_steps into JSON  
        2. Send POST request to the endpoint /save (defined in app.py)
*/
function saveData() {
    // Format all_steps into JSON 
    const video_data =  {
        "timestamps": all_steps.map(a => [a.start, a.end]),
        "actions": all_steps.map(a => a.name),
        "evaluation": all_steps.map(a => a.rating),
        "comments": all_steps.map(a => a.comment)
    };

    const payload = {}
    payload[CURRENT_VIDEO_NAME] = video_data;
    
    // Send POST request to /save endpoint 
    fetch('/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
}

/*
    This function is called when a new step is created OR
    when a logged step is selected.
    Tasks:
        1. Marks selected step as "Active"
        2. Re-renders the timeline and list of steps (for highlighting)
        3. Opens the Evaluation Form
        4. Fills the form with the step's current information
*/
function selectStep(id) {
    // Ensure the step exists
    const step = all_steps.find(a => a.id === id);
    if (!step) return;

    active_step_id = id;
    
    // Re-render timeline and step list 
    renderTimeline();
    renderList(); 

    // Show the form
    const form = document.getElementById('editForm');
    form.style.display = 'block';
    
    // Populate the form with the step's current information 
    document.getElementById('inpActionName').value = step.name;
    document.getElementById('inpComment').value = step.comment;
    document.getElementById('inpStart').value = formatTime(step.start);
    document.getElementById('inpEnd').value = formatTime(step.end);
    const slider = document.getElementById('inpRating');
    slider.value = step.rating !== null ? step.rating : 0.5; 
    document.getElementById('lblRatingVal').innerText = slider.value;

    // scroll down to form 
    setTimeout(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 10);
}

/*
    This function is called when 'Enter' is pressed in the Evaluation Form.
    Tasks:
        1. Reads the Evaluation Form Data
        2. Edits the Step's data (in global all_steps) based on the evaluation form
*/
function commitEdit() {
    // If there is no "Active" step, return 
    if (!active_step_id) return;
    
    let step = all_steps.find(a => a.id === active_step_id);
    if (step) {
        // Edit the step's data based on the Evaluation Form's data 
        step.name = document.getElementById('inpActionName').value;
        step.comment = document.getElementById('inpComment').value;
        
        step.rating = parseFloat(document.getElementById('inpRating').value);

        let rawStart = document.getElementById('inpStart').value;
        let rawEnd = document.getElementById('inpEnd').value;
        let tStart = parseTimeStr(rawStart);
        let tEnd = parseTimeStr(rawEnd);

        // validate timestamps (parseTimeStr can return null)
        if ((tStart !== null) && (tEnd !== null) && (tEnd > tStart)) {
            step.start = tStart;
            step.end = tEnd;
        } else {
            alert("Invalid Time Format (MM:SS.mmm) or End time is before Start time.");
            return; 
        }
    }
    
    // Set the step to "Not Active" and hide the Evaluation Form 
    active_step_id = null;
    document.getElementById('editForm').style.display = 'none';

    // Save the step's data to JSON
    saveData();

    // Re-render timeline and step list 
    renderTimeline();
    renderList();
}

/*
    This function is called multiple times in the program by other functions.
    It draws the timeline from scratch.
    Tasks:
        1. Wipes the original timeline 
        2. Loops through each step in the global all_steps. For each step:
            a. Check Active Status
            b. Calculate block's start/end position based on step.start, step.end
            c. Creates a block
            d. Assigns the block a CSS class based on Active status
            e. Attaches a Mouse Interaction (click to select) to the block
            f. If Active, add Drag Handles (via addHandle())
*/
function renderTimeline() {
    const track = document.getElementById('timelineTrack');
    track.innerHTML = ''; // wipe original timeline 

    // find the current active step, if there is
    const activeStep = all_steps.find(step => step.id === active_step_id);
    if (!activeStep) return;

    // calculate position on the timeline for the block 
    const left = (activeStep.start / video_length) * 100;
    const width = ((activeStep.end - activeStep.start) / video_length) * 100;

    // create the block for the active step
    const el = document.createElement('div');
    el.className = 't-block active';
    el.style.left = `${left}%`;
    el.style.width = `${width}%`;
    addHandle(el, activeStep, 'left'); // add drag handles 
    addHandle(el, activeStep, 'right');
    track.appendChild(el);
}

/*
    This function is called multiple times in the program by other functions.
    It generates the List of Steps from scratch. 
    Tasks:
        1. Wipes the original list
        2. Sorts the global all_steps. Steps arranged earliest --> latest 
        3. Loops through the sorted global all_steps. For each step:
            a. Creates a <div>
            b. Fills the <div> with Action Name, start/end timestamps, and
                a green/red S/U badge based on Satisfactory/Unsatisfactory
            c. Attaches an onclick command to the <div> (Click to Select)
            d. Adds a Delete Button, and attaches onclick logic to it (click to delete)
            e. Adds the <div> to the HTML page
*/
function renderList() {
    const list = document.getElementById('actionList');
    list.innerHTML = '';    // wipe the existing step list 
    
    // Sort all_steps and loop through it 
    all_steps.sort((a,b) => a.start - b.start).forEach(step => {
        const div = document.createElement('div');
        div.className = `action-item p-2 mb-1 border rounded ${step.id === active_step_id ? 'active' : ''}`;

        const hue = step.rating * 120; 
        const badgeColor = `style="background-color: hsl(${hue}, 70%, 45%); color: white;"`;

        div.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>${step.name}</strong>
                <span class="badge" ${badgeColor}>${step.rating.toFixed(1)}</span>
            </div>
            <div class="small text-muted">
                ${formatTime(step.start)} - ${formatTime(step.end)}
            </div>`;
        // Add onclick to entire block (click to select it)
        div.onclick = () => selectStep(step.id);

        // Add Delete button, 'x' is the text inside the button
        const delBtn = document.createElement('div');
        delBtn.className = 'list-delete-btn';
        delBtn.innerHTML = '&times;'; 
        
        // Add onclick to delete button 
        delBtn.onclick = (e) => {
            e.stopPropagation(); // Stop it from selecting the item
            deleteStep(step.id);
        };

        div.appendChild(delBtn);
        list.appendChild(div);
    });
}

/*
    This function adds handles to active steps on the timeline.
    These handles can be dragged to adjust the timestamps of the step's block. 
    Tasks:
        1. Create a <div> for the handle and add needles
        2. Track the handle's movement. Calculate how far it's moved from its original position (deltaX). 
        3. Calculate the change in the step's start/end timestamp based on deltaX.
        4. Re-render the timeline and update the step's timestamps.
        5. This happens 60+ times a second, creating a "scrubbing" animation. 
*/
function addHandle(parent, step, side) {
    const h = document.createElement('div');
    h.className = `t-handle`;

    // Add needle to appropriate position based on side
    if (side === 'left') {
        h.style.left = '0%'; 
    } else {
        h.style.right = '0%';
    }

    parent.appendChild(h);
    
    h.onmousedown = (e) => {
        e.stopPropagation(); 
        e.preventDefault(); 
        
        const startX = e.clientX;
        const originalTime = (side === 'left') ? step.start : step.end;
        const trackWidth = document.getElementById('timelineTrack').offsetWidth;

        // Hide red currentTime bar 
        document.querySelector('.timeline-container').classList.add('is-dragging');
        
        // Define movement logic
        const onMove = (m) => {
            const deltaX = m.clientX - startX;
            
            // Math: Pixels -> Seconds
            const deltaSeconds = (deltaX / trackWidth) * video_length;
            let newTime = originalTime + deltaSeconds;
            
            // Apply Update (with Constraints)
            if (side === 'left') {
                step.start = Math.min(newTime, step.end - 0.5); 
                step.start = Math.max(0, step.start); // Can't go below 0
                video.currentTime = step.start; // so video can "scrub" while dragging
            } else {
                step.end = Math.max(newTime, step.start + 0.5);
                step.end = Math.min(video_length, step.end); // Cannot go past video end
                video.currentTime = step.end;   // so video can "scrub" while dragging
            }
            
            renderTimeline(); // Re-render timeline to update block 

            // Update the step's start/end timestamps
            document.getElementById('inpStart').value = formatTime(step.start);
            document.getElementById('inpEnd').value = formatTime(step.end);
        };
        
        // Remove window event listeners 
        const onUp = () => {
            document.querySelector('.timeline-container').classList.remove('is-dragging'); // un-hide red bar 
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        
        // Attach to Window to allow mouse to go anywhere, and keep dragging
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
}

/*
    This event listener deselects steps from the timeline and list of steps
    if the user clicks outside of both. 
    e.g. timeline step block goes from purple to gray
*/
document.addEventListener('mousedown', (e) => {
    const clickedTimeline = e.target.closest('#timelineContainer');
    const clickedSidebar = e.target.closest('#sidebar');
    
    if (!clickedTimeline && !clickedSidebar) {
        if (active_step_id !== null) {
            active_step_id = null;
            document.getElementById('editForm').style.display = 'none';
            renderTimeline();
            renderList();
        }
    }
});

// When the timeline is clicked, jump to the specified timestamp in the video 
timeline.onmousedown = (e) => {
    if ((e.target === timeline) || (e.target.id === 'timelineTrack')) {
        const rect = timeline.getBoundingClientRect();  
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video_length;
    }
};

/*
    This function makes the red bar on the timeline draggable. 
    This function is called upon page load. 
    As the user drags, the function:
        1. Uses the mouse's position to calculate the video's currentTime
        2. Sets the video's currentTime to correspond to the mouse 
        3. This happens 60+ times a second, giving us a "scrubbing" animation
*/
function initPlayheadDrag() {
    const playhead = document.getElementById('playhead');
    const track = document.getElementById('timelineTrack');

    playhead.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault(); 

        const onMove = (m) => {
            const rect = track.getBoundingClientRect();
            // Calculate mouse position 
            let offsetX = m.clientX - rect.left;
            offsetX = Math.max(0, Math.min(offsetX, rect.width));
            
            // Set the video's currentTime to correspond to the position
            const pos = offsetX / rect.width;
            video.currentTime = pos * video_length;
            
            // The existing 'timeupdate' listener will handle moving the red bar visually
        };

        // Remove window event listeners 
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        // Attach to Window to allow mouse to go anywhere, and keep dragging
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
}

/*
    This function deletes a step from the global all_steps.
    Tasks:
        1. Ask for confirmation from the user. If received, continue.
        2. Remove the step from the global all_steps
        3. Clear and Close the Evaluation Form, if it was open
        4. Re-render the timeline and step list 
*/
function deleteStep(id) {
    if (!confirm("Delete this step?")) return;

    // Remove the step from the global all_steps
    all_steps = all_steps.filter(s => s.id !== id);
    
    // If open, clear the Evaluation Form and close it
    if (active_step_id === id) {
        active_step_id = null;
        document.getElementById('editForm').style.display = 'none';
    }

    // auto-save the deletion
    saveData();

    // Re-render the timeline and step list 
    renderTimeline();
    renderList();
}

/*
    This function switches the current video in the video player. 
    It is only called by two buttons, which move to the 'prev' or 'next' video
    Tasks:
        1. Reminds user to save changes
        2. Makes a call to /switch-video endpoint, and sends direction in JSON payload
        3. /switch-video will switch the video on the backend, and send a SUCCESS message
        4. The function receives the SUCCESS message, and reloads the window 
*/
function switchVideo(direction) {
    // Remind user to save changes 

    fetch('/switch_video', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ direction: direction })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) { 
            // reload window
            window.location.reload();
        }
    });
}

function nudgeTime(type, amount) {
    // 1. Get the Active Step
    // (Assuming you have a global variable 'active_step_id' or similar)
    const step = all_steps.find(s => s.id === active_step_id);
    if (!step) return;

    // 2. Calculate New Time
    let newTime;
    if (type === 'start') {
        newTime = step.start + amount;
        // Constraint: Start cannot be < 0 and cannot pass End
        newTime = Math.max(0, Math.min(newTime, step.end - 0.5));
        step.start = newTime;
    } else {
        newTime = step.end + amount;
        // Constraint: End cannot pass Video Length and cannot pass Start
        newTime = Math.min(video_length, Math.max(newTime, step.start + 0.5));
        step.end = newTime;
    }

    // 3. Update the UI
    document.getElementById('inpStart').value = formatTime(step.start);
    document.getElementById('inpEnd').value = formatTime(step.end);
    
    // 4. Update the Visuals
    renderTimeline(); // Redraws the gray block/needles
    
    // 5. Jump video to show the change (Optional but helpful)
    video.currentTime = newTime; 
    
    // 6. Auto-save
    saveData(true);
}

// This function is called to play/pause the video 
function togglePlay() {
    if (video.paused) video.play();
    else video.pause();
}

// This function skips 'amt' seconds 
function skip(amt) {
    video.currentTime += amt;
}

// This function converts a floating point number into MM:SS.mm format (human-readable time)
function formatTime(seconds) {
    if (!seconds && seconds !== 0) return "00:00.000";
    
    let m = Math.floor(seconds / 60);
    let s = Math.floor(seconds % 60);
    let ms = Math.floor((seconds % 1) * 1000); // milliseconds

    let mStr = m < 10 ? "0" + m : m;
    let sStr = s < 10 ? "0" + s : s;
    let msStr = ms < 100 ? (ms < 10 ? "00" + ms : "0" + ms) : ms;

    return `${mStr}:${sStr}.${msStr}`;
}

// This function converts a string like "01:01.011" back to seconds 
function parseTimeStr(str) {
    let parts = str.split(':');
    if (parts.length !== 2) return null;
    let min = parseInt(parts[0]);
    let sec = parseFloat(parts[1]); 
    return (min * 60) + sec;
}

// This function sets the playback speed of the video 
function setSpeed(rate) {
    const video = document.getElementById("mainVideo");
    
    rate = parseFloat(rate); 
    
    video.playbackRate = rate;
    
    // Update buttons to show new speed
    document.getElementById("btnSpeed").innerText = rate + "x";
    document.getElementById("speedRange").value = rate;
    document.getElementById("lblSpeedVal").innerText = rate;
}