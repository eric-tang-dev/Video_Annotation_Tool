// State Variables 
let all_steps = []
let active_step_id = null
let temp_start_time = null
let video_length = 1
let kalturaReady = false
let playerState = 'paused'
let isCompleted = !!window.IS_COMPLETED;

let timelineUndoSnapshot = null; // for undo functionality for addHandle
let deletedStepTrashCan = null // for undo functionality for delete step

const STERILE_BREACH_NAME = "Sterile Breach";
const STERILE_BREACH_DURATION = 0.5;
const STERILE_BREACH_RATING = 0.0;
const STERILE_BREACH_COMMENTS = [
    "contamination",
    "touching the one-inch border",
    "grabbing the wrong part of the glove",
    "paper falling back onto the gloves"
];

const ALLOWANCE_STEP_NAME = "Allowance";
const ALLOWANCE_DEFAULT_RATING = 0.5;
let allowance_start_time = null; // Track live recording toggles


// This function returns the current video's stable browser draft key
function getDraftStorageKey() {
    const entryId = (window.CURRENT_ENTRY_ID || "").trim();
    if (!entryId) return null;
    return `draft:${entryId}`;
}


/*
    This function builds the current video's annotation payload.
    It keeps the same structure currently used by the app for JSON saves.
*/
function buildCurrentVideoPayload() {
    return {
        timestamps: all_steps.map(a => [a.start, a.end]),
        actions: all_steps.map(a => a.name),

        correctness_evaluation: all_steps.map(a => a.correctness_rating),
        performance_evaluation: all_steps.map(a => a.performance_rating),
        difficulty_evaluation: all_steps.map(a => a.difficulty_rating),
        
        correctness_comments: all_steps.map(a => a.correctness_comment),
        performance_comments: all_steps.map(a => a.performance_comment),
        difficulty_comments: all_steps.map(a => a.difficulty_comment)
    };
}


/*
    This function saves the current in-progress annotation draft to browser localStorage.
    It is used for draft recovery if the page refreshes or the browser is interrupted.
*/
function saveDraftToLocal() {
    const key = getDraftStorageKey();
    if (!key) return;

    const draft = {
        entry_id: window.CURRENT_ENTRY_ID,
        video_name: CURRENT_VIDEO_NAME,
        updated_at: new Date().toISOString(),
        data: buildCurrentVideoPayload()
    };

    localStorage.setItem(key, JSON.stringify(draft));
}


/*
    This function tries to load a saved browser draft for the current entry_id.
    It returns the inner annotation JSON structure if found, otherwise null.
*/
function loadDraftFromLocal() {
    const key = getDraftStorageKey();
    if (!key) return null;

    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) return null;
        return parsed.data;
    } catch (err) {
        console.error("Failed to parse local draft:", err);
        return null;
    }
}


/*
    This function clears the local browser draft after a successful durable save.
*/
function clearDraftFromLocal() {
    const key = getDraftStorageKey();
    if (!key) return;
    localStorage.removeItem(key);
}


const timeline = document.getElementById("timelineContainer");

const sterileBreachBtn = document.getElementById("sterile-breach-btn");

if (sterileBreachBtn) {
    sterileBreachBtn.addEventListener("click", () => {
        addSterileBreachStep();
    });
}


let video = {
    play() {
        if (!window.kalturaPlayerInstance || !kalturaReady) return;
        window.kalturaPlayerInstance.play();
    },


    pause() {
        if (!window.kalturaPlayerInstance || !kalturaReady) return;
        window.kalturaPlayerInstance.pause();
    },


    set currentTime(t) {
        if (!window.kalturaPlayerInstance || !kalturaReady) return;
        window.kalturaPlayerInstance.currentTime = t;
    },


    get currentTime() {
        if (!window.kalturaPlayerInstance) return 0;
        return Number(window.kalturaPlayerInstance.currentTime || 0);
    },


    get duration() {
        if (!window.kalturaPlayerInstance) return 0;
        return Number(window.kalturaPlayerInstance.duration || 0);
    },


    get paused() {
        return playerState !== 'playing';
    }
};


function updatePlayPauseButton(isPaused) {
    const btn = document.getElementById('btnPlayPause');
    if (!btn) return;

    if (isPaused) {
        btn.innerText = "Play";
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    } else {
        btn.innerText = "Pause";
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    }
}


function updateTimeUI() {
    const current = video.currentTime;
    const duration = video_length || video.duration || 1;
    const pos = (current / duration) * 100;

    document.getElementById('playhead').style.left = `${Math.max(0, Math.min(pos, 100))}%`;
    document.getElementById('timeDisplay').innerText =
        `${formatTime(current)} / ${formatTime(duration)}`;
}

document.addEventListener("DOMContentLoaded", function () {
    loadSavedData();
    updateCompletionButtons();
    populateStepOptions();

    const stepSelect = document.getElementById('inpActionSelect');
    if (stepSelect) {
        stepSelect.addEventListener('change', handleStepSelectChange);
    }

    const commentSelect = document.getElementById('inpCommentSelect');
    if (commentSelect) {
        commentSelect.addEventListener('change', handleCommentSelectChange);
    }
});

function initializeKalturaBindings() {
    const player = window.kalturaPlayerInstance;
    if (!player || !player.addEventListener) return;

    player.addEventListener('timeupdate', () => {
        updateTimeUI();
    });

    player.addEventListener('loadedmetadata', () => {
        if (player.duration) {
            video_length = player.duration;
        }

        if (!kalturaReady) {
            kalturaReady = true;
            initPlayheadDrag();
            renderTimeline();
            updateTimeUI();
        }
    });

    player.addEventListener('durationchange', () => {
        if (player.duration) {
            video_length = player.duration;
            updateTimeUI();
        }
    });

    player.addEventListener('playing', () => {
        playerState = 'playing';
        updatePlayPauseButton(false);
    });

    player.addEventListener('play', () => {
        playerState = 'playing';
        updatePlayPauseButton(false);
    });

    player.addEventListener('pause', () => {
        playerState = 'paused';
        updatePlayPauseButton(true);
    });

    player.addEventListener('ended', () => {
        playerState = 'paused';
        updatePlayPauseButton(true);
    });

    player.addEventListener('playerStateChanged', (event) => {
        const newState = event && event.payload && event.payload.newState
            ? event.payload.newState.type
            : null;

        if (!newState) return;

        if (newState.toLowerCase() === 'playing') {
            playerState = 'playing';
            updatePlayPauseButton(false);
        }

        if (newState.toLowerCase() === 'paused' || newState.toLowerCase() === 'ready' || newState.toLowerCase() === 'ended') {
            playerState = 'paused';
            updatePlayPauseButton(true);
        }
    });

    player.addEventListener('error', (event) => {
        console.error('Kaltura player error:', event);
    });

    const metadataPoll = setInterval(() => {
        if (player.duration && player.duration > 0) {
            video_length = player.duration;

            if (!kalturaReady) {
                kalturaReady = true;
                initPlayheadDrag();
                renderTimeline();
            }

            if (video && typeof video.pause === 'function') {
                    video.pause(); // Ensure the playhead is strictly frozen on load
                }

                // Isolate valid physical steps on the timeline, ordered from start to end
                const validTimelineSteps = all_steps
                    .filter(s => !isNaN(s.start) && s.start !== null)
                    .sort((a, b) => a.start - b.start);

                if (validTimelineSteps.length > 0) {
                    // Pass the first chronological item directly into your select engine
                    selectStep(validTimelineSteps[0].id);
                }

            updateTimeUI();
            clearInterval(metadataPoll);
        }
    }, 250);
}


if (window.kalturaPlayerInstance) {
    initializeKalturaBindings();
}

window.addEventListener('load', () => {
    if (window.kalturaPlayerInstance) {
        initializeKalturaBindings();
    }
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
        const allowanceBtn = document.getElementById("allowance-btn");              
        const isAllowanceActive = allowanceBtn && allowanceBtn.innerText === "End Allowance";

        temp_start_time = video.currentTime;
        
        // Show the "LOGGING STEP..." text
        const recIndicator = document.getElementById('recIndicator');   
        if (recIndicator) {                          
            if (isAllowanceActive) {                    
                recIndicator.innerText = "RECORDING ALLOWANCE...";   
            } else {                        
                recIndicator.innerText = "LOGGING STEP...";                       
            }                                     
            recIndicator.style.display = 'inline';
        }
        
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

        const allowanceBtn = document.getElementById("allowance-btn");
        const isAllowanceActive = allowanceBtn && allowanceBtn.innerText === "End Allowance";

        if (isAllowanceActive) {
            toggleAllowanceStep(); // Safely close and commit the allowance step
        }
        else if (temp_start_time !== null) {
            finishCapture();
        }
    }

    // Check for Ctrl + Z (or Cmd + Z on Mac) UNDO FUNCTIONALITY
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); // Stop default browser behavior
        executeUndo();
    }
});

/*
    This function pre-loads the timeline and step list with saved data.
    The saved data is already available (sent by app.py's index() function).
    Tasks:
        1. Prefer browser local draft data if it exists
        2. Otherwise use backend-provided saved data
        3. Count the number of steps 
        4. For each step, extract their data and format into a new object
        5. Add the step to the global all_steps
        6. Refresh the timeline and step list to reflect the new data
*/
function loadSavedData() {
    if (all_steps.length > 0) return;

    const preferredData = loadDraftFromLocal() || SAVED_DATA;
    if (!preferredData) return;

    const timestamps = preferredData.timestamps || [];
    const actions = preferredData.actions || [];
    const evaluation = preferredData.evaluation || [];
    const comments = preferredData.comments || [];

    const count = timestamps.length;

    // 1. Load the existing saved annotations
    for (let i = 0; i < count; i++) {
        const name = actions[i] ?? "Untitled Action";

        const defaultRating = evaluation[i] ?? 0.5;
        const defaultComment = comments[i] ?? "";

        // Extract raw timestamp values from the array row 
        let startTime = timestamps[i] ? timestamps[i][0] : NaN;
        let endTime = timestamps[i] ? timestamps[i][1] : NaN;

        // convert null timestamps to NaN so they are recognized as missing steps 
        if (startTime === null || endTime === null) {
            startTime = NaN;
            endTime = NaN;
        }
    
        const newStep = {
            id: Date.now() + i + Math.random(), // unique ID safe from refresh 
            name: name,
            start: startTime,
            end: endTime,

            // New flat independent properties
            correctness_rating: preferredData.correctness_evaluation ? (preferredData.correctness_evaluation[i] ?? defaultRating) : defaultRating,
            performance_rating: preferredData.performance_evaluation ? (preferredData.performance_evaluation[i] ?? defaultRating) : defaultRating,
            difficulty_rating: preferredData.difficulty_evaluation ? (preferredData.difficulty_evaluation[i] ?? defaultRating) : defaultRating,
            
            correctness_comment: preferredData.correctness_comments ? (preferredData.correctness_comments[i] ?? defaultComment) : defaultComment,
            performance_comment: preferredData.performance_comments ? (preferredData.performance_comments[i] ?? defaultComment) : defaultComment,
            difficulty_comment: preferredData.difficulty_comments ? (preferredData.difficulty_comments[i] ?? defaultComment) : defaultComment,
            
            isSterileBreach: (name === STERILE_BREACH_NAME)
        };
        all_steps.push(newStep);
    }

    // 2. Find any missing mandatory steps for this specific video category and inject placeholders
    /* const currentCategory = window.CURRENT_VIDEO_CATEGORY;
    const masterOptions = window.STEP_OPTIONS_BY_CATEGORY || {};
    const mandatorySteps = masterOptions[currentCategory] || [];
    const existingNames = new Set(all_steps.map(s => s.name));

    if (String(window.CURRENT_EXPERT_ID).trim() !== "expert_100") {
        mandatorySteps.forEach((stepName, index) => {
            if (!existingNames.has(stepName)) {
                const placeholderStep = {
                    id: Date.now() + 5000 + index, 
                    start: NaN,
                    end: NaN,
                    name: stepName,
                    correctness_rating: 0.0,
                    performance_rating: 0.0,
                    difficulty_rating: 0.0,
                    correctness_comment: "",
                    performance_comment: "",
                    difficulty_comment: "",
                    isSterileBreach: (stepName === STERILE_BREACH_NAME)
                };
                all_steps.push(placeholderStep);
            }
        });
    } */

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

    // Save draft locally
    saveDraftToLocal();
    
    // Open the Evaluation Form with the new step
    selectStep(newStep.id); 
}

function addSterileBreachStep() {
    // current time from your video wrapper
    const start = video.currentTime || 0;
    const end = Math.min(start + STERILE_BREACH_DURATION, video_length || video.duration || (start + STERILE_BREACH_DURATION));

    const newStep = {
        id: Date.now(),    // unique ID like other steps
        name: STERILE_BREACH_NAME,
        start: start,
        end: end,
        rating: STERILE_BREACH_RATING,
        comment: '',
        isSterileBreach: true
    };

    all_steps.push(newStep);

    // keep ordering consistent with renderList()
    all_steps.sort((a, b) => a.start - b.start);

    // save draft, refresh UI, and open eval form
    saveDraftToLocal();
    renderTimeline();
    renderList();
    selectStep(newStep.id);
}

// This function handles the toggle behavior of the "Allowance" step recording button. 
// It uses the allowance_start_time variable to track whether we are currently recording an allowance step or not. 
// Depending on the state, it either starts a new allowance step or ends the current one and saves it.
function toggleAllowanceStep() {
    const btn = document.getElementById("allowance-btn");
    if (!btn) return;

    // SCENARIO A: Start recording the state segment
    if (allowance_start_time === null) {
        allowance_start_time = video.currentTime;
        temp_start_time = allowance_start_time; // for green marker on timeline

        btn.innerText = "End Allowance";
        btn.classList.remove("btn-success");
        btn.classList.add("btn-warning"); // Turn yellow/orange while active
        
        // Show recording layout status
        const recIndicator = document.getElementById('recIndicator');
        if (recIndicator) {                                    
            recIndicator.innerText = "RECORDING ALLOWANCE...";  
            recIndicator.style.display = 'inline';
        }

        // Build the green timeline temporary bar immediately on button click
        const track = document.getElementById('timelineTrack');   
        if (track) {  
            const old = document.getElementById('tempMarker');           
            if (old) old.remove();                                       

            const marker = document.createElement('div');              
            marker.id = 'tempMarker'; 
            marker.className = 'temp-marker';  
            
            const pos = (temp_start_time / video_length) * 100;
            marker.style.left = `${pos}%`;
            
            track.appendChild(marker);
        }
    } 
    // SCENARIO B: Commit the finalized step boundaries
    else {
        const end_time = video.currentTime;

        // Pause the video if it's still playing
        if (video && typeof video.pause === "function") {
            video.pause();
        }
        
        const newStep = {
            id: Date.now(),
            name: ALLOWANCE_STEP_NAME,
            start: allowance_start_time,
            end: Math.max(end_time, allowance_start_time + 0.5), // enforce 0.5s min
            correctness_rating: ALLOWANCE_DEFAULT_RATING,
            performance_rating: ALLOWANCE_DEFAULT_RATING,
            difficulty_rating: ALLOWANCE_DEFAULT_RATING,
            correctness_comment: '',
            performance_comment: '',
            difficulty_comment: '',
            isAllowanceStep: true
        };

        all_steps.push(newStep);
        all_steps.sort((a, b) => (a.start || 0) - (b.start || 0));

        // Reset Toggle UI Buttons
        allowance_start_time = null;
        temp_start_time = null;

        const old = document.getElementById('tempMarker');
        if (old) old.remove();

        btn.innerText = "Start Allowance";
        btn.classList.remove("btn-warning");
        btn.classList.add("btn-success");
        document.getElementById('recIndicator').innerText = "LOGGING STEP...";
        document.getElementById('recIndicator').style.display = 'none';

        // Auto-save, render and focus form
        saveDraftToLocal();
        renderTimeline();
        renderList();
        selectStep(newStep.id);
    }
}


/*
    This function is called when the top-right 'Save' button is pressed.
    Its purpose is to save the logged steps into JSON format.
    It is saved into the backend persistence layer and then to GCS.
    Tasks:
        1. Create the payload by formatting global all_steps into JSON
        2. Send POST request to the endpoint /save (defined in app.py)
        3. If successful, clear the local browser draft
*/
function saveData(markComplete = false) {
    // check completion status
    if (markComplete) {
        isCompleted = true;
    }


    // Format all_steps into JSON
    const payload = {
        "entry_id": CURRENT_ENTRY_ID,
        "video_name": CURRENT_VIDEO_NAME,
        "completed": isCompleted,
        ...buildCurrentVideoPayload()
    };


    // Send POST request to /save endpoint
    fetch('/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            clearDraftFromLocal();
            updateCompletionButtons();

            // Notify user that Save was successful
            if (!markComplete) {
                showSaveToast("Saved successfully.");
            }
        }
    })
    .catch(err => {
        console.error("Save failed:", err);
    });
}

function markIncomplete() {
    isCompleted = false;
    saveData(false);
}

function populateStepOptions() {
    const select = document.getElementById('inpActionSelect');
    if (!select) return;

    const options = (window.STEP_OPTIONS_BY_CATEGORY || {})[window.CURRENT_VIDEO_CATEGORY] || [];

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a step...';
    select.appendChild(placeholder);

    options.forEach(stepName => {
        const opt = document.createElement('option');
        opt.value = stepName;
        opt.textContent = stepName;
        select.appendChild(opt);
    });

    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Custom...';
    select.appendChild(custom);
}

function populateCommentOptions(options, selectedValue = "") {
    const select = document.getElementById('inpCommentSelect');
    if (!select) return;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a comment...';
    select.appendChild(placeholder);

    options.forEach(commentText => {
        const opt = document.createElement('option');
        opt.value = commentText;
        opt.textContent = commentText;
        select.appendChild(opt);
    });

    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Custom...';
    select.appendChild(custom);

    if (options.includes(selectedValue)) {
        select.value = selectedValue;
    } else if (selectedValue && selectedValue.trim() !== '') {
        select.value = '__custom__';
    } else {
        select.value = '';
    }
}

/*
    This function is called when the user clicks "Custom..." 
    on the dropdown menu. 
    Tasks:
        1. Checks if "Custom..." was selected in the dropdown
        2. If so, display the text field allowing user to type.
*/
function handleStepSelectChange() {
    const select = document.getElementById('inpActionSelect');
    const input = document.getElementById('inpActionName');
    if (!select || !input) return;

    if (select.value === '__custom__') {
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.style.display = 'none';
        input.value = select.value || '';
    }
}

function handleCommentSelectChange() {
    const select = document.getElementById('inpCommentSelect');
    const input = document.getElementById('inpDifficultyComment');
    if (!select || !input) return;

    if (select.value === '__custom__') {
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.style.display = 'block';
        input.value = select.value || '';
    }
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

    // move video to the step's start time
    if (step && !isNaN(step.start)) {
        video.currentTime = step.start;
    }
    
    // Re-render timeline and step list 
    renderTimeline();
    renderList(); 


    // Show the form
    const form = document.getElementById('editForm');
    form.style.display = 'block';

    // determine if the step is a missing step (has NaN timestamps) 
    const startInput = document.getElementById('inpStart');
    const endInput = document.getElementById('inpEnd');
    const missingStepDetected = isNaN(step.start);

    // Populate the form with the step's current information
    // -------------------------------------------------------------------------
    // CONSOLIDATED: Removed old flat document.getElementById('inpComment') mapping
    // because comments have now been separated entirely into their respective metrics.
    // -------------------------------------------------------------------------
    startInput.value = missingStepDetected ? "" : formatTime(step.start);
    endInput.value = missingStepDetected ? "" : formatTime(step.end);

    // if step is missing/NaN, don't allow editing timestamps
    startInput.disabled = missingStepDetected;
    endInput.disabled = missingStepDetected;
    
    const nudgeButtons = form.querySelectorAll('.nudge-btn');
    nudgeButtons.forEach(btn => {
        btn.disabled = missingStepDetected;
    });
    
    // Map the step's rating to the correct slider and label
    const sliderCorrectness = document.getElementById('inpCorrectnessRating');
    const lblCorrectness = document.getElementById('lblCorrectnessVal');
    const txtCorrectness = document.getElementById('inpCorrectnessComment');

    const sliderPerformance = document.getElementById('inpPerformanceRating');
    const lblPerformance = document.getElementById('lblPerformanceVal');
    const txtPerformance = document.getElementById('inpPerformanceComment');

    const sliderDifficulty = document.getElementById('inpDifficultyRating');
    const lblDifficulty = document.getElementById('lblDifficultyVal');
    const txtDifficulty = document.getElementById('inpDifficultyComment');

    // Populate ratings and comments for each category
    txtCorrectness.value = step.correctness_comment || '';
    txtPerformance.value = step.performance_comment || '';
    txtDifficulty.value = step.difficulty_comment || '';

    // If the step is missing (NaN) or existing, sync current numeric states to sliders
    if (sliderCorrectness) sliderCorrectness.value = step.correctness_rating ?? 0.5;
    if (lblCorrectness) lblCorrectness.innerText = Number(sliderCorrectness.value).toFixed(1);

    if (sliderPerformance) sliderPerformance.value = step.performance_rating ?? 0.5;
    if (lblPerformance) lblPerformance.innerText = Number(sliderPerformance.value).toFixed(1);

    if (sliderDifficulty) sliderDifficulty.value = step.difficulty_rating ?? 0.5;
    if (lblDifficulty) lblDifficulty.innerText = Number(sliderDifficulty.value).toFixed(1);

    const actionSelect = document.getElementById('inpActionSelect');
    const customActionInput = document.getElementById('inpActionName');
    const stepOptions = (window.STEP_OPTIONS_BY_CATEGORY || {})[window.CURRENT_VIDEO_CATEGORY] || [];

    if (actionSelect && customActionInput) {
        if (step.name === STERILE_BREACH_NAME) {
            actionSelect.value = '';
            customActionInput.value = step.name;
            customActionInput.style.display = 'block';
        } else if (stepOptions.includes(step.name)) {
            actionSelect.value = step.name;
            customActionInput.value = step.name;
            customActionInput.style.display = 'none';
        } else {
            actionSelect.value = '__custom__';
            customActionInput.value = step.name || '';
            customActionInput.style.display = 'block';
        }
    }

    const isSterile = step.isSterileBreach || step.name === STERILE_BREACH_NAME;
    const isAllowance = step.isAllowanceStep || step.name === ALLOWANCE_STEP_NAME;

    const commentSelect = document.getElementById('inpCommentSelect');
    const fieldTitle = document.getElementById('lblDifficultyFieldTitle');

    // Determine form control availability states based on configuration parameters
    if (missingStepDetected) {
        // if step is missing (NaN), disable sliders entirely
        if (sliderCorrectness) sliderCorrectness.disabled = true;
        if (sliderPerformance) sliderPerformance.disabled = true;
        if (sliderDifficulty) sliderDifficulty.disabled = true;
        if (actionSelect) actionSelect.disabled = false; // allow action selection for missing steps (not locked to preset)

        if (startInput) { startInput.value = "Missing"; startInput.disabled = true; }
        if (endInput) { endInput.value = "Missing"; endInput.disabled = true; }

        if (fieldTitle) fieldTitle.innerText = "Comments for Missing Step"

        // hide the rewatch button for missing steps since there is no valid timestamp to jump to
        const rewatchBtn = document.getElementById('rewatchBtnContainer');
        if (rewatchBtn) rewatchBtn.style.setProperty('visibility', 'hidden');

        document.querySelectorAll('.allowance-hide-target').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });

        if (commentSelect) commentSelect.style.display = 'none';

        if (txtDifficulty) {
            txtDifficulty.disabled = false;
            txtDifficulty.style.display = 'block';
        }
    } else if (isSterile) {
        // force fixed values for objective items during a breach event
        step.name = STERILE_BREACH_NAME;
        step.correctness_rating = STERILE_BREACH_RATING; // 0.0
        step.performance_rating = STERILE_BREACH_RATING; // 0.0
        step.difficulty_rating = STERILE_BREACH_RATING; // 0.0
        
        // do not compute timestamps if they are NaN
        if (!isNaN(step.start) && !isNaN(step.end)) {
            step.end = Math.max(step.start + STERILE_BREACH_DURATION, step.end);
            document.getElementById('inpEnd').value = formatTime(step.end);
        }

        document.getElementById('inpActionName').value = step.name;

        // Explicitly force freeze Correctness & Performance sliders to 0.0,
        // while leaving the subjective Difficulty slider completely interactive.
        if (sliderCorrectness) { sliderCorrectness.value = 0.0; sliderCorrectness.disabled = true; }
        if (lblCorrectness) lblCorrectness.innerText = "0.0";
        
        if (sliderPerformance) { sliderPerformance.value = 0.0; sliderPerformance.disabled = true; }
        if (lblPerformance) lblPerformance.innerText = "0.0";

        if (sliderDifficulty) { sliderDifficulty.value = 0.0; sliderDifficulty.disabled = true; }
        if (lblDifficulty) lblDifficulty.innerText = "0.0";

        if (fieldTitle) fieldTitle.innerText = "Reason for Sterile Breach";
        if (startInput) startInput.disabled = true;
        if (endInput) endInput.disabled = true;

        // lock timestamp editing
        const nudgeButtons = form.querySelectorAll('.nudge-btn');
        nudgeButtons.forEach(btn => {
            btn.disabled = true;
        });

        // restore the rewatch button for other non-missing steps since we can jump to the breach event timestamps
        const rewatchBtn = document.getElementById('rewatchBtnContainer');
        if (rewatchBtn) {
            rewatchBtn.style.visibility = 'visible';
        }

        // HIDE comments fields 1 & 2, keep field 3 interactive for sterile breaches
        document.querySelectorAll('.allowance-hide-target').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });

        // Populate the comment dropdown with sterile breach specific comments and show the comment select field
        if (commentSelect) {                                                                        
            commentSelect.style.display = 'block';                                                  
            populateCommentOptions(STERILE_BREACH_COMMENTS, step.difficulty_comment);               
        }                                                                                           

        if (txtDifficulty) {                                                                        
            txtDifficulty.disabled = false;                                                         
            txtDifficulty.style.display = 'block';                                                  
        }

        // lock action selection to Sterile Breach
        if (actionSelect) {
            // ensure dropdown shows current name but user can't choose different preset
            actionSelect.value = '';
            actionSelect.disabled = true;
        }
        if (customActionInput) {
            customActionInput.value = STERILE_BREACH_NAME;
            customActionInput.disabled = true;                      // <-- LOCK THE ACTION NAME TO "Sterile Breach" FOR STERILE BREACH STEPS
            customActionInput.style.display = 'block';
        }

    } else if (isAllowance) {
        step.name = ALLOWANCE_STEP_NAME;
        step.correctness_rating = ALLOWANCE_DEFAULT_RATING; // 0.5
        step.performance_rating = ALLOWANCE_DEFAULT_RATING; // 0.5
        step.difficulty_rating = ALLOWANCE_DEFAULT_RATING;  // 0.5

        // Force sliders to show 0.5 dynamically and disable them
        if (sliderCorrectness) { sliderCorrectness.value = 0.5; sliderCorrectness.disabled = true; }
        if (lblCorrectness) lblCorrectness.innerText = "0.5";
        if (sliderPerformance) { sliderPerformance.value = 0.5; sliderPerformance.disabled = true; }
        if (lblPerformance) lblPerformance.innerText = "0.5";
        if (sliderDifficulty) { sliderDifficulty.value = 0.5; sliderDifficulty.disabled = true; }
        if (lblDifficulty) lblDifficulty.innerText = "0.5";

        if (fieldTitle) fieldTitle.innerText = "Comments on Allowance Step";
        if (startInput) startInput.disabled = false;
        if (endInput) endInput.disabled = false;

        // HIDE comments fields 1 & 2, keep field 3 interactive
        document.querySelectorAll('.allowance-hide-target').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });

        if (commentSelect) commentSelect.style.display = 'none'; // hide comment dropdown (only for sterile breach)

        if (txtDifficulty) {
            txtDifficulty.disabled = false; // keep open
            txtDifficulty.style.display = 'block';
        }

        if (actionSelect) {
            actionSelect.value = '';
            actionSelect.disabled = true;
        }
        if (customActionInput) customActionInput.value = ALLOWANCE_STEP_NAME;

        const rewatchBtn = document.getElementById('rewatchBtnContainer');
        if (rewatchBtn) {
            rewatchBtn.style.visibility = 'visible';
        }

    } else {
        if (fieldTitle) fieldTitle.innerText = "3. Allowance/Difficulty Rating";
        if (startInput) startInput.disabled = false;
        if (endInput) endInput.disabled = false;

        // For normal steps, ensure all fields are interactive and visible
        document.querySelectorAll('.allowance-hide-target').forEach(el => {
            if (el.classList.contains('d-flex')) {
                el.style.display = 'flex'; // Restore correct flex layout if needed
            } else {
                el.style.display = 'block';
            }
        });

        if (commentSelect) commentSelect.style.display = 'none'; // hide comment dropdown (only for sterile breach)

        // Enable slider interactive functionalities for standard steps
        if (sliderCorrectness) sliderCorrectness.disabled = false;
        if (sliderPerformance) sliderPerformance.disabled = false;
        if (sliderDifficulty) sliderDifficulty.disabled = false;

        if (txtCorrectness) txtCorrectness.disabled = false;
        if (txtPerformance) txtPerformance.disabled = false;
        if (txtDifficulty) txtDifficulty.disabled = false;
        
        if (actionSelect) {
            actionSelect.disabled = false;
        }

        // show the rewatch button for standard procedural steps
        const rewatchBtn = document.getElementById('rewatchBtnContainer');
        if (rewatchBtn) {
            rewatchBtn.style.visibility = 'visible';
        }
    }

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
        const selectedStepValue = document.getElementById('inpActionSelect').value;
        const customStepValue = document.getElementById('inpActionName').value.trim();

        const isSterile = step.isSterileBreach || step.name === STERILE_BREACH_NAME;
        const isAllowance = step.isAllowanceStep || step.name === ALLOWANCE_STEP_NAME;

        // Always update comment and update based on corresponding inputs
        step.correctness_comment = document.getElementById('inpCorrectnessComment').value;
        step.performance_comment = document.getElementById('inpPerformanceComment').value;
        step.difficulty_comment = document.getElementById('inpDifficultyComment').value;


        if (isSterile) {
            // lock name and rating
            step.name = STERILE_BREACH_NAME;
            step.correctness_rating = STERILE_BREACH_RATING;
            step.performance_rating = STERILE_BREACH_RATING;
            step.difficulty_rating = STERILE_BREACH_RATING;
        } else if (isAllowance) {
            step.name = ALLOWANCE_STEP_NAME;
            step.correctness_rating = ALLOWANCE_DEFAULT_RATING; // 0.5
            step.performance_rating = ALLOWANCE_DEFAULT_RATING; // 0.5
            step.difficulty_rating = ALLOWANCE_DEFAULT_RATING;  // 0.5
        } else {
            step.name =
                selectedStepValue === '__custom__'
                    ? (customStepValue || step.name || "Untitled Action")
                    : (selectedStepValue || customStepValue || step.name || "Untitled Action");

            step.correctness_rating = parseFloat(document.getElementById('inpCorrectnessRating').value);
            step.performance_rating = parseFloat(document.getElementById('inpPerformanceRating').value);
            step.difficulty_rating = parseFloat(document.getElementById('inpDifficultyRating').value);;

        }

        // for missing steps with NaN timestamps, don't enforce tStart < tEnd
        if (isNaN(step.start)) {
            active_step_id = null;
            document.getElementById('editForm').style.display = 'none';
            saveDraftToLocal();
            renderTimeline();
            renderList();
            return;
        }

        // time validation for common procedural steps
        let rawStart = document.getElementById('inpStart').value;
        let rawEnd = document.getElementById('inpEnd').value;
        let tStart = parseTimeStr(rawStart);
        let tEnd = parseTimeStr(rawEnd);

        // validate timestamps (parseTimeStr can return null)
        if ((tStart !== null) && (tEnd !== null) && (tEnd > tStart)) {
            step.start = tStart;
            step.end = isSterile ? Math.max(tEnd, tStart + STERILE_BREACH_DURATION) : tEnd;        
        } 
            else {
            alert("Invalid Time Format (MM:SS.mmm) or End time is before Start time.");
            return; 
        }
    }
    
    // Set the step to "Not Active" and hide the Evaluation Form 
    active_step_id = null;
    document.getElementById('editForm').style.display = 'none';

    // Save the step's data locally only
    saveDraftToLocal();

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


    all_steps.forEach(step => {
        // skip NaN steps
        if (isNaN(step.start) || isNaN(step.end)) {
            return; 
        }

        const left = (step.start / video_length) * 100;
        const width = ((step.end - step.start) / video_length) * 100;

        const el = document.createElement('div');
        if (step.isAllowanceStep || step.name === ALLOWANCE_STEP_NAME) {
            el.className = `t-block bg-success border-success ${step.id === active_step_id ? 'active' : ''}`;
        } else {
            el.className = `t-block ${step.id === active_step_id ? 'active' : ''}`;
        }
        el.style.left = `${left}%`;
        el.style.width = `${width}%`;
        el.onclick = () => selectStep(step.id);

        if (step.id === active_step_id) {
            addHandle(el, step, 'left'); // add drag handles 
            addHandle(el, step, 'right');
        }

        track.appendChild(el);
    });
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
    if (!list) return;

    // Move the form out of the way (to the sidebar) before wiping the list, otherwise it will be deleted
    const actualForm = document.getElementById('editForm');
    const sidebar = document.getElementById('sidebar');
    if (actualForm && sidebar) {
        sidebar.appendChild(actualForm);
        actualForm.style.display = 'none';
    }

    list.innerHTML = '';    // wipe the existing step list 
    
    // Sort all_steps and loop through it 
    all_steps.sort((a, b) => {
        const aIsNaN = isNaN(a.start);
        const bIsNaN = isNaN(b.start);

        if (aIsNaN && !bIsNaN) return 1;  
        if (!aIsNaN && bIsNaN) return -1; 
        if (aIsNaN && bIsNaN) return 0;   
        
        return a.start - b.start;         
    }).forEach(step => {
        const div = document.createElement('div');

        // if step is missing, give slight red tinted background. if step is a sterile breach, give it a yellow tinted background.
        const missingStepDetected = isNaN(step.start);
        const isSterile = step.isSterileBreach || step.name === STERILE_BREACH_NAME;
        const isAllowance = step.isAllowanceStep || step.name === ALLOWANCE_STEP_NAME; 

        let backgroundClass = '';
        if (missingStepDetected) {
            backgroundClass = 'bg-danger-subtle';
        } else if (isSterile) {
            backgroundClass = 'bg-warning-subtle';
        }  else if (isAllowance) {
            backgroundClass = 'bg-success-subtle border-success text-success-emphasis'; 
        }

        div.className = `action-item p-2 mb-1 border rounded ${backgroundClass} ${step.id === active_step_id ? 'active' : ''}`;

        // Calculate average rating for the step (used for badge color)
        const scoreCorrectness = step.correctness_rating ?? 0.5;
        const scorePerformance = step.performance_rating ?? 0.5;
        const scoreDifficulty = step.difficulty_rating ?? 0.5;
        const compositeAverage = (scoreCorrectness + scorePerformance + scoreDifficulty) / 3;

        const hue = compositeAverage * 120; 
        const badgeColor = `style="background-color: hsl(${hue}, 70%, 45%); color: white;"`;

        const timeDisplayString = (isNaN(step.start) || isNaN(step.end)) 
            ? "Missing Step" 
            : `${formatTime(step.start)} - ${formatTime(step.end)}`;

        div.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>${step.name}</strong>
                <span class="badge" ${badgeColor}>${compositeAverage.toFixed(2)}</span>
            </div>
            <div class="small text-muted">
                ${timeDisplayString}
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

        if (step.id === active_step_id) {
            const formSlot = document.createElement('div');
            formSlot.id = "activeFormSlot";
            formSlot.className = "my-2 w-100";
            list.appendChild(formSlot);
        }
    });

    const targetSlot = document.getElementById('activeFormSlot');
    
    if (targetSlot && actualForm) {
        targetSlot.appendChild(actualForm);
        actualForm.style.display = 'block';
    }
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

        saveUndoSnapshot();
        
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

            // Save updated draft after timestamp drag completes
            saveDraftToLocal();
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
    const clickedControls = e.target.closest('.controls-bar');
    const clickedVideoFrame = e.target.closest('.video-wrapper');
    
    if (!clickedTimeline && !clickedSidebar && !clickedControls && !clickedVideoFrame) {
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

    const targetStep = all_steps.find(s => s.id === id);
    if (targetStep) {
        deletedStepTrashCan = JSON.parse(JSON.stringify(targetStep));
        timelineUndoSnapshot = null; // Clear timeline undo to prevent cross-feature bugs
    }

    // Remove the step from the global all_steps
    all_steps = all_steps.filter(s => s.id !== id);
    
    // If open, clear the Evaluation Form and close it
    if (active_step_id === id) {
        active_step_id = null;
        document.getElementById('editForm').style.display = 'none';
    }

    // Save the step's data locally only
    saveDraftToLocal();

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

function updateCompletionButtons() {
    const btnSaveComplete = document.getElementById('btnSaveComplete');
    const btnMarkIncomplete = document.getElementById('btnMarkIncomplete');

    if (!btnSaveComplete || !btnMarkIncomplete) return;

    if (isCompleted) {
        btnSaveComplete.style.display = 'none';
        btnMarkIncomplete.style.display = 'inline-block';
    } else {
        btnSaveComplete.style.display = 'inline-block';
        btnMarkIncomplete.style.display = 'none';
    }

    updateCompletedBadge();
}

function updateCompletedBadge() {
    const badge = document.getElementById('completedBadge');
    if (!badge) return;

    badge.style.display = isCompleted ? 'inline-block' : 'none';
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
    
    // 6. Save browser draft
    saveDraftToLocal();
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

// This function controls the "Saved successfully" message that
// appears after you click the "Save" button
function showSaveToast(message = "Saved successfully.") {
    const toastEl = document.getElementById("saveToast");
    if (!toastEl) return;

    const body = toastEl.querySelector(".toast-body");
    if (body) body.textContent = message;

    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
        autohide: true,
        delay: 2500
    });

    toast.show();
}

/*
    Captures the current state of all_steps before a change occurs,
    allowing for a single-step undo.
*/
function saveUndoSnapshot() {
    const step = all_steps.find(s => s.id === active_step_id);
    if (!step) return;

    timelineUndoSnapshot = {
        stepId: step.id,
        originalStart: step.start,
        originalEnd: step.end
    };
    
    if (typeof updateUndoButtonUI === "function") updateUndoButtonUI();
}

/*
    Reverts only the timestamps of the last dragged step.
*/
function executeUndo() {
    if (deletedStepTrashCan) {

        // If the deleted step had NaN timestamps (missing step), ensure they remain NaN when restored
        if (isNaN(deletedStepTrashCan.start) || deletedStepTrashCan.start === null) {
            deletedStepTrashCan.start = NaN;
            deletedStepTrashCan.end = NaN;
        }

        // Push the step object right back into the array
        all_steps.push(deletedStepTrashCan);
        
        // Clear trash container so they can't spam duplicates
        deletedStepTrashCan = null;

        // Synchronize and rebuild UI structures
        saveDraftToLocal();
        renderTimeline();
        renderList();

        showSaveToast("Step deletion undone.");
        return; // Exit out early
    }

    if (!timelineUndoSnapshot) {
        showSaveToast("Nothing to undo."); 
        return;
    }

    // Find the exact step that was adjusted
    const step = all_steps.find(s => s.id === timelineUndoSnapshot.stepId);
    if (step) {
        // Restore only its timestamps
        step.start = timelineUndoSnapshot.originalStart;
        step.end = timelineUndoSnapshot.originalEnd;

        // Synchronize and rebuild UI views
        saveDraftToLocal();
        renderTimeline();
        renderList();

        // Update the open evaluation form inputs instantly
        const startInput = document.getElementById('inpStart');
        const endInput = document.getElementById('inpEnd');
        if (startInput && endInput && !isNaN(step.start)) {
            startInput.value = formatTime(step.start);
            endInput.value = formatTime(step.end);
        }
        
        showSaveToast("Timeline drag undone.");
    } else {
        showSaveToast("Unable to find step to undo.");
    }

    // Clear snapshot so they can't spam undo
    timelineUndoSnapshot = null; 
    if (typeof updateUndoButtonUI === "function") updateUndoButtonUI();
}

// Optional helper function to toggle UI button states
function updateUndoButtonUI() {
    const undoBtn = document.getElementById("btnUndo");
    if (undoBtn) {
        undoBtn.disabled = !timelineUndoSnapshot;
    }
}

/**
 * Jumps the video player and evaluation form focus to the chronologically
 * previous or next valid timeline step based on the current playhead time.
 * @param {string} direction - Either 'prev' or 'next'
 */
function jumpToStep(direction) {
    // 1. Isolate and sort only steps that have valid physical timeline positions
    const validTimelineSteps = all_steps
        .filter(s => !isNaN(s.start) && s.start !== null)
        .sort((a, b) => a.start - b.start);

    if (validTimelineSteps.length === 0) return;

    const currentTime = video.currentTime;
    let targetStep = null;

    // 2. Scan the chronological timeline arrays
    if (direction === 'prev') {
        // Find the closest step that starts before the current playback marker
        // We loop backwards from the end of the array to catch the nearest preceding match
        for (let i = validTimelineSteps.length - 1; i >= 0; i--) {
            // Give a tiny 0.1-second grace window in case the playhead is sitting right at the mark
            if (validTimelineSteps[i].start < (currentTime - 0.1)) {
                targetStep = validTimelineSteps[i];
                break;
            }
        }
    } else if (direction === 'next') {
        // Find the closest step that starts after the current playback marker
        for (let i = 0; i < validTimelineSteps.length; i++) {
            if (validTimelineSteps[i].start > (currentTime + 0.1)) {
                targetStep = validTimelineSteps[i];
                break;
            }
        }
    }

    // 3. If an eligible matching boundary step was located, commit the full tracking migration
    if (targetStep) {
        if (video && typeof video.pause === 'function') {
            video.pause(); // Ensure the video is explicitly paused at the target point
        }
        selectStep(targetStep.id); // Re-focuses text fields, timeline highlight states, and scrolls into view
    }
}

/**
 * Snaps the video playhead back to the start time of the currently active step.
 */
function rewatchCurrentStep() {
    if (!active_step_id) return;

    // Find the current focused step object in state memory
    const step = all_steps.find(s => s.id === active_step_id);
    
    // Ensure the step exists and has a valid timeline position (not a missing step)
    if (step && !isNaN(step.start) && step.start !== null) {
        video.currentTime = step.start;
        
        // Optional: If you want the video to automatically play when they hit rewatch, 
        // uncomment the line below:
        // video.play();
    }
}