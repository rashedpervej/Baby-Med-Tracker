import { supabaseClient, uploadImage } from './supabase.js';
import { state, saveSettings } from './state.js';
import { showLoading, customAlert, customConfirm, closeModal } from './ui.js';

// 🔥 FETCH ALL (FINAL FIXED)
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

        state.children = childrenRes.data || [];
        state.logs = logsRes.data || [];
        state.issues = issuesRes.data || [];
        state.medicineMaster = masterRes.data || [];

        // profile auto create
        if (!profileRes.data) {
            const { data } = await supabaseClient
                .from('profiles')
                .insert([{ id: uid, name: user.email.split('@')[0] }])
                .select()
                .single();
            state.profile = data;
        } else {
            state.profile = profileRes.data;
        }

        // 🔥 MAIN FIX
        const activeIssueIds = state.issues
            .filter(i => i.status === 'active')
            .map(i => i.id);

        state.medicines = (medicinesRes.data || [])
            .filter(m => activeIssueIds.includes(m.issue_id))
            .map(m => {
                if (typeof m.times === 'string') {
                    try { m.times = JSON.parse(m.times); } catch(e) { m.times = []; }
                }
                if (!Array.isArray(m.times)) m.times = [];
                return m;
            });

    } catch (err) {
        console.error("Fetch error:", err);
        throw err;
    }
}

// SAVE MEDICINE
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

    if (!issue_id) return customAlert("Select issue first");

    let times = [];
    document.querySelectorAll('.med-time-input').forEach(t => {
        if (t.value) times.push(t.value);
    });

    showLoading(true);
    try {
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
            result = await supabaseClient.from('medicines')
                .update(medObj)
                .eq('id', id)
                .eq('user_id', uid)
                .select();
        } else {
            result = await supabaseClient.from('medicines')
                .insert([medObj])
                .select();
        }

        if (result.error) throw result.error;

        await fetchAllData();
        closeModal('modal-med');
        window.renderAllViews();

    } catch (err) {
        console.error(err);
        customAlert("Failed to save medicine");
    } finally {
        showLoading(false);
    }
}

// SAVE ISSUE
export async function saveIssue() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const id = document.getElementById('issue-id').value;
    const title = document.getElementById('issue-title').value.trim();
    const status = document.getElementById('issue-status').value;

    if (!title) return customAlert("Title required");

    showLoading(true);
    try {
        const issueObj = {
            child_id: state.activeChildId,
            title,
            status,
            user_id: uid,
            resolved_at: status === 'resolved' ? new Date().toISOString() : null
        };

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

        if (result.error) throw result.error;

        await fetchAllData();
        closeModal('modal-issue');
        window.renderAllViews();

    } catch (err) {
        console.error(err);
        customAlert("Failed to save issue");
    } finally {
        showLoading(false);
    }
}

// MARK LOG
export async function markMed(medicine_id, time, status) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const uid = user.id;

    const date = window.getYYYYMMDD(new Date());
    const datetime = `${date}T${time}:00`;

    showLoading(true);
    try {
        await supabaseClient.from('logs').insert([{
            medicine_id,
            child_id: state.activeChildId,
            status,
            datetime,
            user_id: uid
        }]);

        await fetchAllData();
        window.renderAllViews();

    } catch (err) {
        console.error(err);
    } finally {
        showLoading(false);
    }
}
