import { state, notifiedMeds, saveSettings } from './state.js';
import { testConnection, onAuthStateChange, getUser } from './supabase.js';
import { fetchAllData, saveProfile } from './api.js';
import { 
    showLoading, customAlert, showIssueRequiredModal, applySettings, 
    getYYYYMMDD, playBeep, playVoice, 
    openModal, closeModal,
    addTimeRow, showAuthView,
    enablePermissions, toggleSound,
    handleSignUp, handleSignIn, handleSignOut, toggleAuthMode,
    togglePasswordVisibility, handleForgotPassword
} from './ui.js';
import { renderHeader, renderAllViews, renderHome, renderProfile } from './render.js';

// --- INITIALIZATION ---
async function init() {
    showLoading(true);
    try {
        // Connection Test
        const isConnected = await testConnection();
        if (!isConnected) {
            console.warn("Supabase connection failed. The app will attempt to load but may not function correctly.");
        }

        // Auth Listener
        onAuthStateChange(async (event, session) => {
            console.log("Auth Event:", event);
            if (session?.user) {
                state.user = session.user;
                showAuthView(false);
                await loadAppData();
            } else {
                state.user = null;
                showAuthView(true);
            }
        });

        // Initial Auth Check
        const user = await getUser();
        if (user) {
            state.user = user;
            showAuthView(false);
            await loadAppData();
        } else {
            showAuthView(true);
        }

    } catch (e) {
        console.error("Initialization failed:", e.message || e);
        showAuthView(true);
        customAlert("Application initialization failed. " + (e.message || ""), "Initialization Error");
    } finally {
        showLoading(false);
    }
}

async function loadAppData() {
    showLoading(true);
    try {
        // Load settings from LocalStorage
        const savedSettings = localStorage.getItem('babyMedTrackerSettings');
        if (savedSettings) {
            state.settings = JSON.parse(savedSettings);
        }
        
        // Fetch data from Supabase
        try {
            await fetchAllData();
        } catch (fetchErr) {
            console.error("Initial data fetch failed:", fetchErr);
            customAlert("Could not fetch data from Supabase. Please check your database tables and RLS policies.");
        }
        
        applySettings();
        
        if (!state.children || state.children.length === 0) {
            openChildModal();
        } else {
            // Restore active child from LocalStorage if possible
            const savedActiveId = localStorage.getItem('babyMedTrackerActiveChild');
            if (savedActiveId && state.children.find(c => c.id.toString() === savedActiveId)) {
                state.activeChildId = isNaN(savedActiveId) ? savedActiveId : parseInt(savedActiveId);
            } else {
                state.activeChildId = state.children[0].id;
            }
        }
        
        renderHeader();
        renderAllViews();

        // Show banner if sound is off OR notifications are not granted
        const showBanner = !state.settings.sound || (("Notification" in window) && Notification.permission !== "granted");
        const banner = document.getElementById('banner');
        if (banner) {
            banner.style.display = showBanner ? 'block' : 'none';
        }

        if (!window.reminderInterval) {
            window.reminderInterval = setInterval(checkReminders, 30000);
            checkReminders();
        }
    } catch (err) {
        console.error("Error loading app data:", err);
    } finally {
        showLoading(false);
    }
}

function checkReminders() {
    const now = new Date();
    const today = getYYYYMMDD(now);
    const currentHHMM = now.toTimeString().substring(0,5);

    state.medicines.forEach(m => {
        // Check if the medicine is linked to an active issue
        const issue = m.issue_id ? state.issues.find(i => i.id.toString() === m.issue_id.toString()) : null;
        const isIssueActive = issue ? issue.status === 'active' : true; // If no issue linked, assume active or handle as per requirement

        if (isIssueActive && m.start_date <= today && m.end_date >= today) {
            if (m.times.includes(currentHHMM)) {
                const log = state.logs.find(l => l.medicine_id.toString() === m.id.toString() && l.datetime.startsWith(today) && l.datetime.includes(currentHHMM));
                const notifKey = `${m.id}-${today}-${currentHHMM}`;
                
                if (!log && !notifiedMeds[notifKey]) {
                    triggerAlarm(m, currentHHMM);
                    notifiedMeds[notifKey] = true;
                }
            }
        }
    });
    
    // Re-render home every minute to update overdue UI
    if(now.getSeconds() < 30 && document.getElementById('view-home').classList.contains('active')) {
        renderHome();
    }
}

function triggerAlarm(med, time) {
    const child = state.children.find(c => c.id === med.child_id);
    const childName = child ? child.name : '';
    const msg = `Time for ${childName}'s medicine: ${med.name} (${med.dosage})`;
    console.log("ALARM TRIGGERED:", msg, "Sound:", state.settings.sound, "Notification:", Notification.permission);

    // System Notification
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Medicine Reminder", { body: msg, icon: "💊" });
    }

    // Sound
    if (state.settings.sound) {
        playBeep();
        playVoice(msg);
    }

    // In-app Alert (delay slightly so voice can start)
    setTimeout(() => customAlert(msg, "Medicine Reminder"), 500);
}

// --- MEDICINE MGMT (UI logic that needs state) ---
export function openMedModal(editId = null, preSelectedIssueId = null) {
    if(!state.activeChildId) return customAlert("Please add a child first.");
    
    // Check if any active issues exist
    const activeIssues = state.issues.filter(i => i.child_id.toString() === state.activeChildId.toString() && i.status === 'active');
    if (activeIssues.length === 0) {
        return showIssueRequiredModal();
    }

    const c = document.getElementById('med-times-container');
    c.innerHTML = ''; // Clear existing rows
    
    const issueSelect = document.getElementById('med-issue-id');
    issueSelect.innerHTML = activeIssues.map(i => `<option value="${i.id}">${i.title}</option>`).join('');

    if (editId) {
        document.getElementById('med-modal-title').innerText = "Edit Medicine";
        const m = state.medicines.find(x => x.id.toString() === editId.toString());
        if (!m) return;
        
        // Ensure times is an array
        if (typeof m.times === 'string') {
            try { m.times = JSON.parse(m.times); } catch(e) { m.times = []; }
        }
        if (!Array.isArray(m.times)) m.times = [];

        document.getElementById('med-id').value = m.id;
        document.getElementById('med-name').value = m.name;
        document.getElementById('med-dosage').value = m.dosage;
        document.getElementById('med-start').value = m.start_date;
        document.getElementById('med-end').value = m.end_date;
        issueSelect.value = m.issue_id || (activeIssues.length > 0 ? activeIssues[0].id : "");
        
        m.times.forEach(t => addTimeRow(t));
        if (m.times.length === 0) addTimeRow(); // At least one empty row if none exist
    } else {
        document.getElementById('med-modal-title').innerText = "Add Medicine";
        document.getElementById('med-id').value = '';
        document.getElementById('med-name').value = '';
        document.getElementById('med-dosage').value = '';
        const today = getYYYYMMDD(new Date());
        document.getElementById('med-start').value = today;
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        document.getElementById('med-end').value = getYYYYMMDD(nextWeek);
        
        // Pre-select issue if provided, or auto-select if only one active
        if (preSelectedIssueId) {
            issueSelect.value = preSelectedIssueId;
        } else if (activeIssues.length > 0) {
            issueSelect.value = activeIssues[0].id;
        }
        
        addTimeRow('08:00'); // Start with one default row
    }
    openModal('modal-med');
}

export function openChildModal(editId = null) {
    const idField = document.getElementById('child-id');
    const nameField = document.getElementById('child-name');
    const dobField = document.getElementById('child-dob');
    const titleField = document.getElementById('child-modal-title');

    if (editId) {
        const c = state.children.find(x => x.id.toString() === editId.toString());
        if (!c) return;
        idField.value = c.id;
        nameField.value = c.name;
        dobField.value = c.dob || "";
        titleField.innerText = "Edit Child Profile";
    } else {
        idField.value = '';
        nameField.value = '';
        dobField.value = '';
        titleField.innerText = "Add Child Profile";
    }
    
    window.renderManageChildren();
    openModal('modal-child');
}

export function openProfileModal() {
    if (state.profile) {
        document.getElementById('profile-name').value = state.profile.name || '';
    }
    openModal('modal-profile');
}

export function changeChild(id) {
    state.activeChildId = isNaN(id) ? id : parseInt(id);
    saveSettings();
    window.renderAllViews();
}

// --- GLOBAL EXPOSURE ---
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleSignOut = handleSignOut;
window.toggleAuthMode = toggleAuthMode;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleForgotPassword = handleForgotPassword;
window.addTimeRow = addTimeRow;
window.openMedModal = openMedModal;
window.openChildModal = openChildModal;
window.openProfileModal = openProfileModal;
window.changeChild = changeChild;
window.getYYYYMMDD = getYYYYMMDD;
window.enablePermissions = enablePermissions;
window.toggleSound = toggleSound;
window.saveProfile = saveProfile;
window.renderProfile = renderProfile;

// Boot App
document.addEventListener('DOMContentLoaded', init);
