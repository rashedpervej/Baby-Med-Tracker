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
        const isConnected = await testConnection();

        onAuthStateChange(async (event, session) => {
            if (session?.user) {
                state.user = session.user;
                showAuthView(false);
                await loadAppData();
            } else {
                state.user = null;
                showAuthView(true);
            }
        });

        const user = await getUser();
        if (user) {
            state.user = user;
            showAuthView(false);
            await loadAppData();
        } else {
            showAuthView(true);
        }

    } catch (e) {
        console.error(e);
        showAuthView(true);
    } finally {
        showLoading(false);
    }
}

async function loadAppData() {
    showLoading(true);
    try {
        const savedSettings = localStorage.getItem('babyMedTrackerSettings');
        if (savedSettings) {
            state.settings = JSON.parse(savedSettings);
        }

        await fetchAllData(); // 🔥 already filtered

        applySettings();

        if (!state.children || state.children.length === 0) {
            openChildModal();
        } else {
            const savedActiveId = localStorage.getItem('babyMedTrackerActiveChild');
            if (savedActiveId && state.children.find(c => c.id.toString() === savedActiveId)) {
                state.activeChildId = savedActiveId;
            } else {
                state.activeChildId = state.children[0].id;
            }
        }

        renderHeader();
        renderAllViews();

        if (!window.reminderInterval) {
            window.reminderInterval = setInterval(checkReminders, 30000);
            checkReminders();
        }

    } catch (err) {
        console.error(err);
    } finally {
        showLoading(false);
    }
}

// 🔥 FIXED REMINDER
function checkReminders() {
    const now = new Date();
    const today = getYYYYMMDD(now);
    const currentHHMM = now.toTimeString().substring(0,5);

    state.medicines.forEach(m => {

        // ✅ issue filter
        const issue = state.issues.find(i => i.id === m.issue_id);
        if (!issue || issue.status !== 'active') return;

        if (m.start_date <= today && m.end_date >= today) {
            if (m.times.includes(currentHHMM)) {

                const log = state.logs.find(l =>
                    l.medicine_id === m.id &&
                    l.datetime.startsWith(today) &&
                    l.datetime.includes(currentHHMM)
                );

                const notifKey = `${m.id}-${today}-${currentHHMM}`;

                if (!log && !notifiedMeds[notifKey]) {
                    triggerAlarm(m, currentHHMM);
                    notifiedMeds[notifKey] = true;
                }
            }
        }
    });

    if(now.getSeconds() < 30 && document.getElementById('view-home').classList.contains('active')) {
        renderHome();
    }
}

// 🔔 ALARM
function triggerAlarm(med, time) {
    const child = state.children.find(c => c.id === med.child_id);
    const childName = child ? child.name : '';
    const msg = `Time for ${childName}'s medicine: ${med.name} (${med.dosage})`;

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Medicine Reminder", { body: msg });
    }

    if (state.settings.sound) {
        playBeep();
        playVoice(msg);
    }

    setTimeout(() => customAlert(msg, "Medicine Reminder"), 500);
}

// --- MED MODAL ---
export function openMedModal(editId = null, preSelectedIssueId = null) {
    if(!state.activeChildId) return customAlert("Please add a child first.");

    const activeIssues = state.issues.filter(i =>
        i.child_id.toString() === state.activeChildId.toString() &&
        i.status === 'active'
    );

    if (activeIssues.length === 0) {
        return showIssueRequiredModal();
    }

    const issueSelect = document.getElementById('med-issue-id');
    issueSelect.innerHTML = activeIssues.map(i =>
        `<option value="${i.id}">${i.title}</option>`
    ).join('');

    openModal('modal-med');
}

// --- GLOBAL ---
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleSignOut = handleSignOut;
window.toggleAuthMode = toggleAuthMode;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleForgotPassword = handleForgotPassword;
window.addTimeRow = addTimeRow;
window.openMedModal = openMedModal;
window.enablePermissions = enablePermissions;
window.toggleSound = toggleSound;
window.saveProfile = saveProfile;
window.renderProfile = renderProfile;

document.addEventListener('DOMContentLoaded', init);
