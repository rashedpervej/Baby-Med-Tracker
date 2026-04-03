import { state, saveSettings } from './state.js';
import { signUp, signIn, signOut, resetPassword, supabaseClient } from './supabase.js';

// --- AUTH UI ---
export async function handleSignUp() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const btn = document.getElementById('auth-submit-btn');
    if (!email || !password) return customAlert("Email and password are required");
    if (password.length < 6) return customAlert("Password must be at least 6 characters long");

    if (btn.disabled) return; // Extra safety

    showLoading(true);
    btn.disabled = true;
    try {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        customAlert("Account created! Please check your email for a confirmation link before logging in.", "Signup Success");
    } catch (err) {
        console.error("Signup Error:", err);
        let msg = (typeof err === 'string' ? err : err.message) || "An error occurred during signup.";
        if (msg.toLowerCase().includes("rate limit exceeded")) {
            msg = "Too many signup attempts. The server has temporarily blocked requests from your IP. Please wait 5 minutes.";
            // Add a 5-minute cooldown timer to the button
            let cooldown = 300; // 300 seconds (5 minutes)
            btn.disabled = true;
            const originalText = btn.innerText;
            const timer = setInterval(() => {
                cooldown--;
                const mins = Math.floor(cooldown / 60);
                const secs = cooldown % 60;
                btn.innerText = `Wait ${mins}:${secs.toString().padStart(2, '0')}...`;
                if (cooldown <= 0) {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            }, 1000);
        } else if (msg.toLowerCase().includes("user already registered")) {
            msg = "This email is already registered. Try logging in instead.";
        }
        customAlert(msg, "Signup Error");
    } finally {
        showLoading(false);
        // Only re-enable if not in cooldown
        if (!btn.innerText.includes("Wait")) {
            btn.disabled = false;
        }
    }
}

export async function handleSignIn() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const btn = document.getElementById('auth-submit-btn');
    if (!email || !password) return customAlert("Email and password are required");

    if (btn.disabled) return; // Extra safety

    showLoading(true);
    btn.disabled = true;
    try {
        const { data, error } = await signIn(email, password);
        if (error) throw error;
    } catch (err) {
        console.error("Login Error:", err);
        let msg = (typeof err === 'string' ? err : err.message) || "An error occurred during login.";
        if (msg.toLowerCase().includes("invalid login credentials")) {
            msg = "Incorrect email or password. Please try again.";
            document.getElementById('auth-password').value = ''; // Clear password on failure
        } else if (msg.toLowerCase().includes("email not confirmed")) {
            msg = "Please confirm your email address before logging in. Check your inbox for a link.";
        } else if (msg.toLowerCase().includes("rate limit exceeded")) {
            msg = "Too many login attempts. Please wait 2 minutes and try again.";
            // Add a 2-minute cooldown timer to the button
            let cooldown = 120; 
            btn.disabled = true;
            const originalText = btn.innerText;
            const timer = setInterval(() => {
                cooldown--;
                const mins = Math.floor(cooldown / 60);
                const secs = cooldown % 60;
                btn.innerText = `Wait ${mins}:${secs.toString().padStart(2, '0')}...`;
                if (cooldown <= 0) {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            }, 1000);
        }
        customAlert(msg, "Login Error");
    } finally {
        showLoading(false);
        // Only re-enable if not in cooldown
        if (!btn.innerText.includes("Wait")) {
            btn.disabled = false;
        }
    }
}

export async function handleForgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    const link = document.getElementById('auth-forgot-link');
    if (!email) return customAlert("Please enter your email address first.");
    if (link.style.pointerEvents === 'none') return;

    showLoading(true);
    try {
        const { error } = await resetPassword(email);
        if (error) throw error;
        customAlert("Password reset link sent! Check your inbox.", "Success");
    } catch (err) {
        console.error("Reset Error:", err);
        let msg = (typeof err === 'string' ? err : err.message) || "Could not send reset link.";
        
        // Handle Supabase rate limit error
        if (msg.toLowerCase().includes("security purposes")) {
            // Extract seconds from message if possible
            const match = msg.match(/(\d+)\s+seconds/);
            let cooldown = match ? parseInt(match[1]) : 60;
            
            msg = `Too many requests. Please wait ${cooldown} seconds before trying again.`;
            
            // Disable the link and show a timer
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.5';
            const originalText = link.innerText;
            
            const timer = setInterval(() => {
                cooldown--;
                link.innerText = `Retry in ${cooldown}s`;
                if (cooldown <= 0) {
                    clearInterval(timer);
                    link.style.pointerEvents = 'auto';
                    link.style.opacity = '1';
                    link.innerText = originalText;
                }
            }, 1000);
        }
        
        customAlert(msg, "Reset Error");
    } finally {
        showLoading(false);
    }
}

export function togglePasswordVisibility() {
    const pwdInput = document.getElementById('auth-password');
    const toggleIcon = document.getElementById('toggle-password-visibility');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        toggleIcon.innerText = '🙈';
    } else {
        pwdInput.type = 'password';
        toggleIcon.innerText = '👁️';
    }
}

// Add Enter key support
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const authView = document.getElementById('view-auth');
        if (authView && authView.style.display !== 'none') {
            const btn = document.getElementById('auth-submit-btn');
            if (btn && !btn.disabled) {
                btn.click();
            }
        }
    }
});

export async function handleSignOut() {
    showLoading(true);
    try {
        const { error } = await signOut();
        if (error) throw error;
        location.reload();
    } catch (err) {
        console.error("Logout Error:", err);
        customAlert(err.message || "An error occurred during logout.", "Logout Error");
    } finally {
        showLoading(false);
    }
}

export function showAuthView(show) {
    document.getElementById('view-auth').style.display = show ? 'flex' : 'none';
    document.getElementById('app-container').style.display = show ? 'none' : 'block';
}

export function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    const toggleLink = document.getElementById('auth-toggle-link');
    const forgotPwd = document.getElementById('forgot-password-container');
    
    if (title.innerText === 'Login') {
        title.innerText = 'Sign Up';
        btn.innerText = 'Create Account';
        btn.onclick = handleSignUp;
        toggleLink.innerText = 'Already have an account? Login';
        forgotPwd.style.display = 'none';
    } else {
        title.innerText = 'Login';
        btn.innerText = 'Login';
        btn.onclick = handleSignIn;
        toggleLink.innerText = "Don't have an account? Sign Up";
        forgotPwd.style.display = 'block';
    }
    
    // Reset button state if not in cooldown
    if (!btn.innerText.includes("Wait")) {
        btn.disabled = false;
    }
}

// --- LOADING OVERLAY ---
export function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// --- CUSTOM DIALOGS ---
export function customAlert(message, title = "Alert") {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    document.getElementById('alert-actions').innerHTML = '<button class="btn btn-primary" onclick="window.closeModal(\'modal-alert\')">OK</button>';
    openModal('modal-alert');
}

export function showIssueRequiredModal() {
    document.getElementById('alert-title').innerText = "Issue Required";
    document.getElementById('alert-message').innerText = "Please create an active Issue first before adding medicine.";
    document.getElementById('alert-actions').innerHTML = `
        <div class="flex-3-1">
            <button class="btn btn-primary btn-3" onclick="window.closeModal('modal-alert'); window.openIssueModal();">+ New Issue</button>
            <button class="btn btn-outline btn-1" onclick="window.closeModal('modal-alert')">OK</button>
        </div>
    `;
    openModal('modal-alert');
}

export function customConfirm(message, onConfirm, title = "Confirm") {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    document.getElementById('alert-actions').innerHTML = `
        <button class="btn btn-outline" onclick="window.closeModal(\'modal-alert\')">Cancel</button>
        <button class="btn btn-red" id="confirm-btn">Confirm</button>
    `;
    document.getElementById('confirm-btn').onclick = () => {
        closeModal('modal-alert');
        onConfirm();
    };
    openModal('modal-alert');
}

// --- MODAL HANDLING ---
export function openModal(id) {
    document.getElementById(id).classList.add('active');
}
export function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// --- NAVIGATION ---
export function switchTab(tabId, el) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');

    // Context-aware FAB visibility
    const fab = document.getElementById('fab');
    if (tabId === 'home' || tabId === 'meds') {
        fab.style.display = 'flex';
    } else {
        fab.style.display = 'none';
    }

    if(tabId === 'history') {
        const activeSubTab = document.getElementById('tab-history-stats').classList.contains('btn-primary') ? 'stats' : 'logs';
        if(activeSubTab === 'stats') window.renderAnalytics();
        else window.renderHistory();
    }
}

// --- HISTORY SUB-TABS ---
export function switchHistoryTab(tab) {
    document.getElementById('tab-history-logs').className = tab === 'logs' ? 'btn btn-small btn-primary' : 'btn btn-small btn-outline';
    document.getElementById('tab-history-stats').className = tab === 'stats' ? 'btn btn-small btn-primary' : 'btn btn-small btn-outline';
    
    document.getElementById('section-history-logs').style.display = tab === 'logs' ? 'block' : 'none';
    document.getElementById('section-history-stats').style.display = tab === 'stats' ? 'block' : 'none';
    
    if(tab === 'stats') window.renderAnalytics();
    else window.renderHistory();
}

// --- SETTINGS ---
export function applySettings() {
    document.getElementById('toggle-dark').checked = state.settings.darkMode;
    document.getElementById('toggle-sound').checked = state.settings.sound;
    toggleDarkMode(state.settings.darkMode);
    
    // Banner visibility
    const showBanner = !state.settings.sound || (("Notification" in window) && Notification.permission !== "granted");
    const banner = document.getElementById('banner');
    if (banner) {
        banner.style.display = showBanner ? 'block' : 'none';
    }
}

export function toggleDarkMode(isDark) {
    state.settings.darkMode = isDark;
    if(isDark) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
    saveSettings();
}

export function toggleSound(isSound) {
    state.settings.sound = isSound;
    saveSettings();
    if (isSound) {
        playBeep();
        // Also check notifications if enabling sound
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }
    // Update banner
    const showBanner = !isSound || (("Notification" in window) && Notification.permission !== "granted");
    const banner = document.getElementById('banner');
    if (banner) banner.style.display = showBanner ? 'block' : 'none';
}

export function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const anchor = document.createElement('a');
    anchor.href = dataStr;
    anchor.download = "BabyMedTracker_Backup.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

export function enablePermissions() {
    // Always enable sound when user clicks this
    state.settings.sound = true;
    const toggleSound = document.getElementById('toggle-sound');
    if(toggleSound) toggleSound.checked = true;
    saveSettings();
    playBeep(); // Test sound to unlock AudioContext on iOS/Android
    
    // Unlock SpeechSynthesis on iOS/Mobile
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }

    if ("Notification" in window) {
        Notification.requestPermission().then(perm => {
            console.log("Notification permission:", perm);
            document.getElementById('banner').style.display = 'none';
        }).catch(e => {
            console.error("Notification request failed:", e);
            document.getElementById('banner').style.display = 'none';
        });
    } else {
        document.getElementById('banner').style.display = 'none';
    }
}

let audioCtx = null;

export function playBeep() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
        
        setTimeout(() => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
            osc2.connect(audioCtx.destination);
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.5);
        }, 300);
    } catch(e) { console.log("AudioContext not supported/allowed", e); }
}

export function playVoice(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; // slightly slower for clarity
        utterance.pitch = 1.1; // slightly higher pitch
        window.speechSynthesis.speak(utterance);
    }
}

// --- UTILS ---
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

export function getYYYYMMDD(dateObj) {
    const offset = dateObj.getTimezoneOffset();
    dateObj = new Date(dateObj.getTime() - (offset*60*1000));
    return dateObj.toISOString().split('T')[0];
}

export function formatTimeFriendly(time24) {
    if (!time24) return "";
    let [h, m] = time24.split(':');
    let hours = parseInt(h);
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${m} ${ampm}`;
}

// --- FORM UTILS ---
export function addTimeRow(time = '') {
    const c = document.getElementById('med-times-container');
    const div = document.createElement('div');
    div.className = 'time-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '8px';
    div.innerHTML = `
        <input type="time" class="med-time-input" value="${time}" required style="flex: 1;">
        <button class="btn btn-red btn-small" onclick="this.parentElement.remove()" title="Remove time slot" style="padding: 0 12px;">✕</button>
    `;
    c.appendChild(div);
}

// --- AUTOCOMPLETE ---
export async function handleMedNameInput(val) {
    const list = document.getElementById('med-autocomplete-list');
    list.innerHTML = '';
    if (!val || val.length < 1) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('medicine_master')
            .select('name')
            .ilike('name', `%${val}%`)
            .order('name')
            .limit(50);
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            data.forEach(match => {
                const div = document.createElement('div');
                // Highlight the match
                const regex = new RegExp(`(${val})`, 'gi');
                const highlightedName = match.name.replace(regex, '<strong>$1</strong>');
                div.innerHTML = highlightedName;
                div.onclick = () => {
                    document.getElementById('med-name').value = match.name;
                    list.innerHTML = '';
                };
                list.appendChild(div);
            });
        }
    } catch (err) {
        console.error("Error fetching medicine suggestions:", err);
        // Fallback to local search if database query fails
        const matches = state.medicineMaster.filter(m => m.name.toLowerCase().includes(val.toLowerCase())).slice(0, 50);
        matches.forEach(match => {
            const div = document.createElement('div');
            const regex = new RegExp(`(${val})`, 'gi');
            const highlightedName = match.name.replace(regex, '<strong>$1</strong>');
            div.innerHTML = highlightedName;
            div.onclick = () => {
                document.getElementById('med-name').value = match.name;
                list.innerHTML = '';
            };
            list.appendChild(div);
        });
    }
}

// --- ISSUE MGMT ---
let currentIssueTab = 'active';

export function switchIssueTab(tab) {
    currentIssueTab = tab;
    document.getElementById('tab-issues-active').className = tab === 'active' ? 'btn btn-small btn-primary' : 'btn btn-small btn-outline';
    document.getElementById('tab-issues-resolved').className = tab === 'resolved' ? 'btn btn-small btn-primary' : 'btn btn-small btn-outline';
    renderIssues();
}

export function openIssueModal(editId = null) {
    if(!state.activeChildId) return customAlert("Please add a child first.");
    
    const title = document.getElementById('issue-modal-title');
    const idField = document.getElementById('issue-id');
    const titleField = document.getElementById('issue-title');
    const descField = document.getElementById('issue-desc');
    const statusField = document.getElementById('issue-status');
    const doctorField = document.getElementById('issue-doctor');
    const centerField = document.getElementById('issue-center');
    const followUpField = document.getElementById('issue-follow-up');
    const followUpDateField = document.getElementById('issue-follow-up-date');
    const imageDataField = document.getElementById('issue-image-data');
    const imagePreview = document.getElementById('issue-image-preview');
    const previewContainer = document.getElementById('issue-image-preview-container');
    const cropperContainer = document.getElementById('cropper-container');
    const fileInput = document.getElementById('issue-image-input');

    // Reset image fields
    fileInput.value = '';
    cropperContainer.style.display = 'none';
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    if (editId) {
        const issue = state.issues.find(i => i.id.toString() === editId.toString());
        title.innerText = "Edit Issue";
        idField.value = issue.id;
        titleField.value = issue.title;
        descField.value = issue.description || '';
        statusField.value = issue.status;
        doctorField.value = issue.doctor_name || '';
        centerField.value = issue.medical_center || '';
        followUpField.value = issue.doctor_follow_up || '';
        followUpDateField.value = issue.follow_up_date || '';
        imageDataField.value = issue.prescription_url || '';
        
        if (issue.prescription_url) {
            imagePreview.src = issue.prescription_url;
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    } else {
        title.innerText = "Add Issue";
        idField.value = "";
        titleField.value = "";
        descField.value = "";
        statusField.value = "active";
        doctorField.value = "";
        centerField.value = "";
        followUpField.value = "";
        followUpDateField.value = "";
        imageDataField.value = "";
        previewContainer.style.display = 'none';
    }
    openModal('modal-issue');
}

// --- IMAGE HANDLING ---
let cropper = null;

export function handleIssueImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const cropperImg = document.getElementById('cropper-image');
        cropperImg.src = e.target.result;
        document.getElementById('cropper-container').style.display = 'block';
        document.getElementById('issue-image-preview-container').style.display = 'none';

        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImg, {
            aspectRatio: NaN, // Free aspect ratio
            viewMode: 1,
        });
    };
    reader.readAsDataURL(file);
}

export function cropAndUpload() {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({
        maxWidth: 1024,
        maxHeight: 1024,
    });
    const base64 = canvas.toDataURL('image/jpeg', 0.7);
    document.getElementById('issue-image-data').value = base64;
    document.getElementById('issue-image-preview').src = base64;
    document.getElementById('issue-image-preview-container').style.display = 'block';
    document.getElementById('cropper-container').style.display = 'none';
    cropper.destroy();
    cropper = null;
}

export function cancelCrop() {
    document.getElementById('cropper-container').style.display = 'none';
    document.getElementById('issue-image-input').value = '';
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
}

export function removeIssueImage() {
    document.getElementById('issue-image-data').value = '';
    document.getElementById('issue-image-preview-container').style.display = 'none';
    document.getElementById('issue-image-input').value = '';
}

export function zoomImage(src) {
    document.getElementById('zoom-img').src = src;
    openModal('modal-zoom');
}

window.handleIssueImageSelect = handleIssueImageSelect;
window.cropAndUpload = cropAndUpload;
window.cancelCrop = cancelCrop;
window.removeIssueImage = removeIssueImage;
window.zoomImage = zoomImage;

export function renderIssues() {
    const container = document.getElementById('issues-list-container');
    if (!container) return;
    
    const filtered = state.issues.filter(i => 
        i.child_id.toString() === state.activeChildId?.toString() && 
        i.status === currentIssueTab
    );

    if (filtered.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); margin-top: 20px;">No ${currentIssueTab} issues found.</p>`;
        return;
    }

    container.innerHTML = filtered.map(issue => {
        const medCount = state.medicines.filter(m => m.issue_id?.toString() === issue.id.toString()).length;
        const isNearFollowUp = issue.follow_up_date && (new Date(issue.follow_up_date) - new Date()) < (3 * 24 * 60 * 60 * 1000) && (new Date(issue.follow_up_date) - new Date()) > - (24 * 60 * 60 * 1000);

        return `
            <div class="card ${isNearFollowUp ? 'near-follow-up' : ''}" style="padding: 15px; position: relative;">
                ${isNearFollowUp ? '<div style="position: absolute; top: -5px; right: -5px; background: var(--red); color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: bold; animation: pulse 2s infinite;">Follow-up Near</div>' : ''}
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <h3 style="font-size: 16px;">${issue.title}</h3>
                        ${issue.doctor_name || issue.medical_center ? `
                            <p style="font-size: 11px; color: var(--primary); margin-top: 2px;">
                                ${issue.doctor_name ? `Dr. ${issue.doctor_name}` : ''} 
                                ${issue.doctor_name && issue.medical_center ? ' @ ' : ''} 
                                ${issue.medical_center || ''}
                            </p>
                        ` : ''}
                        ${issue.follow_up_date ? `
                            <p style="font-size: 11px; ${isNearFollowUp ? 'color: var(--red); font-weight: bold;' : 'color: var(--primary);'} margin-top: 4px;">
                                🗓️ Follow-up: ${new Date(issue.follow_up_date).toLocaleDateString()}
                            </p>
                        ` : ''}
                        <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${issue.description || 'No description'}</p>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                            <div class="badge ${issue.status === 'active' ? 'badge-green' : 'badge-yellow'}">
                                ${issue.status.toUpperCase()}
                            </div>
                            <span style="font-size: 11px; color: var(--text-muted);">${medCount} Meds</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; margin-left: 10px;">
                        <button class="btn btn-outline btn-small" onclick="openIssueModal('${issue.id}')">✎</button>
                        <button class="btn btn-red btn-small" onclick="deleteIssue('${issue.id}')">🗑</button>
                    </div>
                </div>
                <div style="margin-top: 15px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 10px;">
                    <button class="btn btn-primary btn-small" style="width: 100%;" onclick="showIssueDetails('${issue.id}')">View Details & History</button>
                </div>
            </div>
        `;
    }).join('');
}

export function showIssueDetails(issueId) {
    const issue = state.issues.find(i => i.id.toString() === issueId.toString());
    const meds = state.medicines.filter(m => m.issue_id?.toString() === issueId.toString());
    const logs = state.logs.filter(l => l.issue_id?.toString() === issueId.toString()).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    const isNearFollowUp = issue.follow_up_date && (new Date(issue.follow_up_date) - new Date()) < (3 * 24 * 60 * 60 * 1000) && (new Date(issue.follow_up_date) - new Date()) > - (24 * 60 * 60 * 1000);

    let content = `
        <div style="text-align: left;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <h2 style="font-size: 20px; margin: 0;">${issue.title}</h2>
                <div class="badge ${issue.status === 'active' ? 'badge-green' : 'badge-yellow'}">${issue.status.toUpperCase()}</div>
            </div>
            
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">
                ${issue.doctor_name ? `<div><strong>Doctor:</strong> ${issue.doctor_name}</div>` : ''}
                ${issue.medical_center ? `<div><strong>Center:</strong> ${issue.medical_center}</div>` : ''}
                <div><strong>Created:</strong> ${new Date(issue.created_at).toLocaleDateString()}</div>
                ${issue.resolved_at ? `<div><strong>Resolved:</strong> ${new Date(issue.resolved_at).toLocaleDateString()}</div>` : ''}
                ${issue.follow_up_date ? `
                    <div style="margin-top: 5px; padding: 5px 10px; border-radius: 6px; display: inline-block; ${isNearFollowUp ? 'background: var(--red); color: white; font-weight: bold; animation: pulse 2s infinite;' : 'background: rgba(var(--primary-rgb), 0.1); color: var(--primary);'}">
                        <strong>Follow-up:</strong> ${new Date(issue.follow_up_date).toLocaleDateString()}
                    </div>
                ` : ''}
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button class="btn btn-primary btn-small" onclick="window.openFollowUpAction('${issue.id}')">👉 Add Follow-up</button>
                <button class="btn btn-outline btn-small" onclick="window.openMedModal(null, '${issue.id}')">+ Add Medicine</button>
            </div>

            ${issue.prescription_url ? `
                <div style="margin-bottom: 15px;">
                    <p style="font-size: 12px; font-weight: 600; margin-bottom: 5px;">Prescription Image:</p>
                    <img src="${issue.prescription_url}" style="max-width: 100%; border-radius: 8px; cursor: zoom-in;" onclick="window.zoomImage(this.src)">
                </div>
            ` : ''}

            ${issue.doctor_follow_up ? `
                <div style="background: rgba(var(--primary-rgb), 0.1); padding: 10px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
                    <p style="font-size: 12px; font-weight: 600; margin-bottom: 3px;">Follow-up / Instructions:</p>
                    <p style="font-size: 13px;">${issue.doctor_follow_up}</p>
                </div>
            ` : ''}

            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 15px;">${issue.description || ''}</p>
            
            <h4 style="margin-bottom: 10px; border-bottom: 1px solid var(--primary); display: inline-block; font-size: 14px;">Linked Medicines</h4>
            <div style="margin-bottom: 15px;">
                ${meds.length ? meds.map(m => `<div style="font-size: 14px; margin-bottom: 5px;">• ${m.name} (${m.dosage})</div>`).join('') : '<p style="font-size: 12px; color: var(--text-muted);">No medicines linked.</p>'}
            </div>
            
            <h4 style="margin-bottom: 10px; border-bottom: 1px solid var(--primary); display: inline-block; font-size: 14px;">Intake History</h4>
            <div style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.02); border-radius: 8px; padding: 5px;">
                ${logs.length ? logs.map(l => {
                    const med = state.medicines.find(m => m.id.toString() === l.medicine_id.toString());
                    return `
                        <div style="font-size: 12px; padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between;">
                            <span>${med ? med.name : 'Unknown'} - ${l.status}</span>
                            <span style="color: var(--text-muted);">${new Date(l.datetime).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                    `;
                }).join('') : '<p style="font-size: 12px; color: var(--text-muted); padding: 10px;">No history for this issue.</p>'}
            </div>
            
            <button class="btn btn-outline" style="width: 100%; margin-top: 20px;" onclick="window.closeModal('modal-alert')">Close</button>
        </div>
    `;

    const alertModal = document.getElementById('modal-alert');
    const alertMsg = document.getElementById('alert-message');
    alertMsg.innerHTML = content;
    alertModal.classList.add('active');
}

export function openFollowUpAction(issueId) {
    const issue = state.issues.find(i => i.id.toString() === issueId.toString());
    closeModal('modal-alert');
    
    // Open issue modal in "follow-up" mode
    openIssueModal(issueId);
    
    // Pre-fill follow-up text
    document.getElementById('issue-modal-title').innerText = "Add Follow-up for " + issue.title;
    const followUpField = document.getElementById('issue-follow-up');
    const currentVal = followUpField.value;
    followUpField.value = (currentVal ? currentVal + "\n\n" : "") + "Follow-up visit: ";
    
    // Reset image preview for new prescription
    document.getElementById('issue-image-data').value = '';
    document.getElementById('issue-image-preview-container').style.display = 'none';
}

window.openFollowUpAction = openFollowUpAction;

// --- GLOBAL EXPOSURE (for HTML onclick) ---
window.showLoading = showLoading;
window.customAlert = customAlert;
window.customConfirm = customConfirm;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.toggleDarkMode = toggleDarkMode;
window.toggleSound = toggleSound;
window.exportData = exportData;
window.enablePermissions = enablePermissions;
window.addTimeRow = addTimeRow;
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleSignOut = handleSignOut;
window.toggleAuthMode = toggleAuthMode;
window.handleMedNameInput = handleMedNameInput;
window.switchIssueTab = switchIssueTab;
window.switchHistoryTab = switchHistoryTab;
window.openIssueModal = openIssueModal;
window.showIssueDetails = showIssueDetails;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleForgotPassword = handleForgotPassword;
