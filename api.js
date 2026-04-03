import { supabaseClient, uploadImage } from './supabase.js';
import { state, saveSettings } from './state.js';
import { showLoading, customAlert, customConfirm, closeModal, openModal } from './ui.js';

export async function fetchAllData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    try {
        const [childrenRes, medicinesRes, logsRes, issuesRes, masterRes, profileRes] = await Promise.all([
            supabaseClient.from('children').select('*').eq('user_id', uid),
            supabaseClient.from('medicines').select('*').eq('user_id', uid),
            supabaseClient.from('logs').select('*').eq('user_id', uid),
            supabaseClient.from('issues').select('*').eq('user_id', uid),
            supabaseClient.from('medicine_master').select('*'),
            supabaseClient.from('profiles').select('*').eq('id', uid).single()
        ]);

        if (childrenRes.error) throw childrenRes.error;
        if (medicinesRes.error) throw medicinesRes.error;
        if (logsRes.error) throw logsRes.error;
        if (issuesRes.error) throw issuesRes.error;
        if (masterRes.error) throw masterRes.error;

        // Handle profile
        if (profileRes.error && profileRes.code !== 'PGRST116') {
            console.error("Error fetching profile:", profileRes.error);
        }
        
        if (!profileRes.data) {
            // Create profile if it doesn't exist
            console.log("Profile not found, creating one...");
            const { data: newProfile, error: createError } = await supabaseClient
                .from('profiles')
                .insert([{ id: uid, name: user.email.split('@')[0] }])
                .select()
                .single();
            
            if (createError) console.error("Error creating profile:", createError);
            state.profile = newProfile;
        } else {
            state.profile = profileRes.data;
        }

        state.children = childrenRes.data || [];
        state.medicines = (medicinesRes.data || []).map(m => {
            if (typeof m.times === 'string') {
                try { m.times = JSON.parse(m.times); } catch(e) { m.times = []; }
            }
            if (!Array.isArray(m.times)) m.times = [];
            return m;
        });
        state.logs = logsRes.data || [];
        state.issues = issuesRes.data || [];
        state.medicineMaster = masterRes.data || [];
    } catch (err) {
        console.error("Error fetching data:", err.message || err);
        throw err;
    }
}

export async function saveChild() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const name = document.getElementById('child-name').value.trim();
    const age = document.getElementById('child-age').value.trim();
    if(!name) return customAlert("Name is required");

    showLoading(true);
    try {
        const { data, error } = await supabaseClient.from('children').insert([{ 
            name, 
            age, 
            user_id: uid 
        }]).select();
        if (error) throw error;

        const newChild = data[0];
        state.children.push(newChild);
        if(!state.activeChildId) state.activeChildId = newChild.id;
        
        saveSettings();
        window.renderHeader();
        window.renderManageChildren();
        document.getElementById('child-name').value = '';
        document.getElementById('child-age').value = '';
        window.renderAllViews();
        
        if(state.children.length === 1) closeModal('modal-child'); 
    } catch (err) {
        console.error("Error saving child:", err.message || err);
        customAlert("Failed to save child profile.");
    } finally {
        showLoading(false);
    }
}

export async function deleteChild(id) {
    customConfirm("Delete this profile and all related data?", async () => {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const uid = user.id;

        showLoading(true);
        try {
            const { error } = await supabaseClient.from('children').delete().eq('id', id).eq('user_id', uid);
            if (error) throw error;

            state.children = state.children.filter(c => c.id !== id);
            state.medicines = state.medicines.filter(m => m.child_id !== id);
            state.logs = state.logs.filter(l => l.child_id !== id);
            
            if(state.activeChildId === id) {
                state.activeChildId = state.children.length ? state.children[0].id : null;
            }
            
            saveSettings();
            window.renderHeader();
            window.renderManageChildren();
            window.renderAllViews();
            if(!state.activeChildId) window.openChildModal();
        } catch (err) {
            console.error("Error deleting child:", err.message || err);
            customAlert("Failed to delete child profile.");
        } finally {
            showLoading(false);
        }
    });
}

export async function saveIssue() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        console.error("Save Issue failed: No authenticated user found.");
        return customAlert("You must be logged in to save issues.");
    }
    const uid = user.id;

    const id = document.getElementById('issue-id').value;
    const title = document.getElementById('issue-title').value.trim();
    const description = document.getElementById('issue-desc').value.trim();
    const status = document.getElementById('issue-status').value;
    const doctor_name = document.getElementById('issue-doctor').value.trim();
    const medical_center = document.getElementById('issue-center').value.trim();
    const doctor_follow_up = document.getElementById('issue-follow-up').value.trim();
    const follow_up_date = document.getElementById('issue-follow-up-date').value;
    const imageData = document.getElementById('issue-image-data').value;

    if (!title) return customAlert("Title is required");
    if (!state.activeChildId) return customAlert("No active child selected.");

    showLoading(true);
    try {
        let prescription_url = null;
        
        // If there's new image data (base64), upload it to Supabase Storage
        if (imageData && imageData.startsWith('data:image')) {
            console.log("Uploading new prescription image...");
            try {
                const byteString = atob(imageData.split(',')[1]);
                const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                
                const fileName = `${uid}/${Date.now()}.jpg`;
                prescription_url = await uploadImage('prescriptions', fileName, blob);
                console.log("Image uploaded successfully:", prescription_url);
            } catch (uploadErr) {
                console.error("Image upload failed:", uploadErr);
                // Continue without image if upload fails, or stop? 
                // Let's alert but continue if title is present.
                customAlert("Image upload failed, but we will try to save the issue text.");
            }
        } else if (imageData && imageData.startsWith('http')) {
            prescription_url = imageData;
        }

        // Construct object carefully to avoid undefined values
        const issueObj = {
            child_id: state.activeChildId,
            title: title,
            description: description || "",
            status: status || "active",
            doctor_name: doctor_name || "",
            medical_center: medical_center || "",
            doctor_follow_up: doctor_follow_up || "",
            follow_up_date: follow_up_date || null,
            prescription_url: prescription_url || null,
            user_id: uid
        };

        // Handle resolved_at
        if (status === 'resolved') {
            issueObj.resolved_at = new Date().toISOString();
        } else {
            issueObj.resolved_at = null;
        }

        console.log("Saving issue to Supabase:", issueObj);

        let result;
        if (id) {
            result = await supabaseClient.from('issues')
                .update(issueObj)
                .eq('id', id)
                .eq('user_id', uid)
                .select();
        } else {
            issueObj.created_at = new Date().toISOString();
            result = await supabaseClient.from('issues')
                .insert([issueObj])
                .select();
        }

        if (result.error) {
            console.error("Supabase Error Details:", {
                message: result.error.message,
                details: result.error.details,
                hint: result.error.hint,
                code: result.error.code
            });
            throw result.error;
        }

        console.log("Issue saved successfully:", result.data[0]);

        if (id) {
            const idx = state.issues.findIndex(i => i.id.toString() === id.toString());
            if (idx !== -1) state.issues[idx] = result.data[0];
        } else {
            state.issues.push(result.data[0]);
        }

        closeModal('modal-issue');
        window.renderAllViews();
        customAlert(id ? "Issue updated successfully!" : "New issue created!");
    } catch (err) {
        console.error("Final Error saving issue:", err);
        customAlert(`Error: ${err.message || "Failed to save issue. Check console for details."}`);
    } finally {
        showLoading(false);
    }
}

export async function deleteIssue(id) {
    customConfirm("Delete this issue? Medicines and logs will be unlinked but kept.", async () => {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const uid = user.id;

        showLoading(true);
        try {
            const { error } = await supabaseClient.from('issues').delete().eq('id', id).eq('user_id', uid);
            if (error) throw error;

            state.issues = state.issues.filter(i => i.id.toString() !== id.toString());
            // Unlink medicines
            state.medicines = state.medicines.map(m => {
                if (m.issue_id && m.issue_id.toString() === id.toString()) {
                    return { ...m, issue_id: null };
                }
                return m;
            });
            window.renderAllViews();
        } catch (err) {
            console.error("Error deleting issue:", err.message || err);
            customAlert("Failed to delete issue.");
        } finally {
            showLoading(false);
        }
    });
}

export async function saveMed() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const id = document.getElementById('med-id').value;
    const name = document.getElementById('med-name').value.trim();
    const dosage = document.getElementById('med-dosage').value.trim();
    const start_date = document.getElementById('med-start').value;
    const end_date = document.getElementById('med-end').value;
    const issue_id = document.getElementById('med-issue-id').value;
    
    if (!issue_id) return customAlert("Please create and select an active issue first.");

    const timeInputs = document.querySelectorAll('.med-time-input');
    let times = [];
    timeInputs.forEach(ti => { if(ti.value) times.push(ti.value); });
    
    if(!name || !start_date || !end_date || times.length === 0) return customAlert("Please fill all required fields and add at least one time.");
    if(start_date > end_date) return customAlert("Start date cannot be after end date.");

    showLoading(true);
    try {
        // Smart Medicine Input: Check/Insert into medicine_master
        let masterId = null;
        const existingMaster = state.medicineMaster.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (existingMaster) {
            masterId = existingMaster.id;
        } else {
            const { data: masterData, error: masterError } = await supabaseClient.from('medicine_master').insert([{
                name
            }]).select();
            if (masterError) throw masterError;
            masterId = masterData[0].id;
            state.medicineMaster.push(masterData[0]);
        }

        const medObj = {
            child_id: state.activeChildId,
            name, 
            dosage, 
            start_date, 
            end_date, 
            times,
            issue_id,
            user_id: uid
        };

        let result;
        if (id) {
            result = await supabaseClient.from('medicines').update(medObj).eq('id', id).eq('user_id', uid).select();
        } else {
            result = await supabaseClient.from('medicines').insert([medObj]).select();
        }

        if (result.error) throw result.error;

        let savedMed = result.data[0];
        if (typeof savedMed.times === 'string') {
            try { savedMed.times = JSON.parse(savedMed.times); } catch(e) { savedMed.times = []; }
        }
        if (!Array.isArray(savedMed.times)) savedMed.times = [];

        if (id) {
            const idx = state.medicines.findIndex(m => m.id.toString() === id.toString());
            if (idx !== -1) state.medicines[idx] = savedMed;
        } else {
            state.medicines.push(savedMed);
        }

        closeModal('modal-med');
        window.renderAllViews();
    } catch (err) {
        console.error("Error saving medicine:", err.message || err);
        customAlert("Failed to save medicine.");
    } finally {
        showLoading(false);
    }
}

export async function deleteMed(id) {
    customConfirm("Delete this medicine? History will be kept.", async () => {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const uid = user.id;

        showLoading(true);
        try {
            const { error } = await supabaseClient.from('medicines').delete().eq('id', id).eq('user_id', uid);
            if (error) throw error;

            state.medicines = state.medicines.filter(m => m.id.toString() !== id.toString());
            window.renderAllViews();
        } catch (err) {
            console.error("Error deleting medicine:", err.message || err);
            customAlert("Failed to delete medicine.");
        } finally {
            showLoading(false);
        }
    });
}

export async function markMed(medicine_id, time, status) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const date = window.getYYYYMMDD(new Date());
    const datetime = `${date}T${time}:00`;
    
    // Find medicine to get issue_id
    const med = state.medicines.find(m => m.id.toString() === medicine_id.toString());
    const issue_id = med ? med.issue_id : null;

    showLoading(true);
    try {
        const { data, error } = await supabaseClient.from('logs').insert([{
            medicine_id,
            child_id: state.activeChildId,
            status,
            datetime,
            issue_id,
            user_id: uid
        }]).select();

        if (error) throw error;

        state.logs.push(data[0]);
        window.renderAllViews();
    } catch (err) {
        console.error("Error logging medicine:", err.message || err);
        customAlert("Failed to log medicine.");
    } finally {
        showLoading(false);
    }
}

export async function undoLog(logId) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    showLoading(true);
    try {
        const { error } = await supabaseClient.from('logs').delete().eq('id', logId).eq('user_id', uid);
        if (error) throw error;

        state.logs = state.logs.filter(l => l.id !== logId);
        window.renderAllViews();
    } catch (err) {
        console.error("Error undoing log:", err.message || err);
        customAlert("Failed to undo log.");
    } finally {
        showLoading(false);
    }
}

export async function saveProfile() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const name = document.getElementById('profile-name').value.trim();
    if (!name) return customAlert("Name is required");

    showLoading(true);
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({ 
                name: name, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', uid)
            .select()
            .single();

        if (error) throw error;
        
        state.profile = data;
        closeModal('modal-profile');
        if (window.renderProfile) window.renderProfile();
        customAlert("Profile updated successfully!");
    } catch (err) {
        console.error("Error updating profile:", err);
        customAlert("Failed to update profile: " + (err.message || err));
    } finally {
        showLoading(false);
    }
}

// --- GLOBAL EXPOSURE ---
window.saveChild = saveChild;
window.deleteChild = deleteChild;
window.saveMed = saveMed;
window.deleteMed = deleteMed;
window.markMed = markMed;
window.undoLog = undoLog;
window.saveIssue = saveIssue;
window.deleteIssue = deleteIssue;
