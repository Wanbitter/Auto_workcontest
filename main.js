/**
 * Main Application JavaScript
 * Exam interface + Wrong Questions + Favorites + SQLite
 */

const state = {
    currentDocId: null,
    currentQuestions: [],
    currentIndex: 0,
    answers: {},
    results: null,
    examMode: null,
    examShuffleType: null,
    sidebarVisible: false,
    autoAdvanceTimer: null,
    wrongQuestionsInfo: [],
    reviewMode: false,
    reviewTestIndex: null,
    favoriteMode: false,      // true when reviewing a favorite collection
    favoriteCollId: null,     // which favorite collection
    questionStats: {},
    favoritedQuestions: [],   // list of question_text that are favorited (for star display)
};

const $ = id => document.getElementById(id);
const uploadArea = $('uploadArea');
const fileInput = $('fileInput');
const uploadProgress = $('uploadProgress');
const progressFill = $('progressFill');
const uploadStatus = $('uploadStatus');
const docList = $('docList');
const configSection = $('configSection');
const configContent = $('configContent');
const examSection = $('examSection');
const examContent = $('examContent');

/**
 * Safely fetch JSON from an API endpoint.
 * Returns [data, error]. Always check error before using data.
 */
async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`服务器返回了非JSON响应 (${response.status})：${text.substring(0, 200)}`);
        }
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || data.message || `请求失败 (${response.status})`);
        }
        const data = await response.json();
        return [data, null];
    } catch (error) {
        console.error('[safeFetch]', url, error.message);
        return [null, error];
    }
}

// === Keyboard shortcut for sidebar ===
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Tab' || e.key === '`' || e.key === 'Escape') && examSection.style.display !== 'none') {
        if (e.key === 'Escape' && state.sidebarVisible) { toggleSidebar(); e.preventDefault(); }
        else if (e.key === 'Tab' || e.key === '`') { toggleSidebar(); e.preventDefault(); }
    }
});

// === Upload ===
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
});
$('selectFileBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
});

async function handleFileUpload(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.docx') && !name.endsWith('.doc')) { showNotification('仅支持 .doc 和 .docx 格式的文件', 'error'); return; }
    uploadArea.style.display = 'none';
    uploadProgress.style.display = 'block';
    progressFill.style.width = '30%';
    uploadStatus.textContent = '正在上传文档...';
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        progressFill.style.width = '80%';
        uploadStatus.textContent = '正在解析题目...';
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '上传失败');
        progressFill.style.width = '100%';
        uploadStatus.textContent = '✅ 解析完成！';
        await loadDocuments();
        setTimeout(() => {
            uploadArea.style.display = '';
            uploadProgress.style.display = 'none';
            progressFill.style.width = '0%';
            fileInput.value = '';
        }, 1500);
        showNotification(`成功导入"${data.filename}"，共 ${data.counts.total} 道题目`, 'success');
    } catch (error) {
        uploadArea.style.display = '';
        uploadProgress.style.display = 'none';
        progressFill.style.width = '0%';
        showNotification(error.message, 'error');
    }
}

// === Document List + Favorites ===
async function loadDocuments() {
    try {
        const [docs, docsErr] = await safeFetch('/api/documents');
        if (docsErr || !docs) {
            docList.innerHTML = '<p class="empty-hint">加载文档列表失败，请检查服务是否正常</p>';
            return;
        }

        // Fetch all favorite collections
        let favCollections = [];
        try {
            const [data, _favErr] = await safeFetch('/api/favorites/collections');
            if (data) favCollections = data;
        } catch(e) {}

        if (docs.length === 0 && favCollections.length === 0) {
            docList.innerHTML = '<p class="empty-hint">暂无导入的文档，请先上传</p>';
            return;
        }

        let allHtml = '';

        // === Document items ===
        for (const doc of docs) {
            const c = doc.counts;
            let wrongHtml = '';
            let favHtml = '';
            try {
                const [wrongInfo, _wrErr] = await safeFetch(`/api/documents/${doc.doc_id}/wrong-questions`);
                if (wrongInfo) {
                    const unfinished = wrongInfo.filter(w => !w.completed);
                    if (unfinished.length > 0) {
                        const totalWrong = unfinished.reduce((sum, w) => sum + w.question_count, 0);
                        wrongHtml = `<div class="sub-info"><span class="tag tag-wrong">❌ ${totalWrong} 道错题待复习</span></div>`;
                    }
                }
            } catch(e) {}

            // Check if this doc has a favorite collection
            const docFav = favCollections.find(f => f.doc_id === doc.doc_id && !f.is_orphan);
            if (docFav && docFav.question_count > 0) {
                favHtml = `<div class="sub-info"><span class="tag tag-fav">⭐ ${docFav.question_count} 道收藏</span></div>`;
            }

            allHtml += `
                <div class="doc-item">
                    <div class="doc-info">
                        <div class="doc-name">📄 ${doc.filename}</div>
                        <div class="doc-stats">
                            <span class="tag tag-choice">选择题 ${c.choice}</span>
                            <span class="tag tag-tf">判断题 ${c.true_false}</span>
                            <span class="tag tag-fill">填空题 ${c.fill_blank}</span>
                            <span>共 ${c.total} 题</span>
                        </div>
                        ${wrongHtml}
                        ${favHtml}
                    </div>
                    <div class="doc-actions">
                        <button class="btn btn-primary btn-sm" onclick="showConfig('${doc.doc_id}')">开始测试</button>
                        ${docFav ? `<button class="btn btn-fav btn-sm" onclick="startFavoriteReview(${docFav.id})">⭐ 收藏集</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.doc_id}')">删除</button>
                    </div>
                </div>`;
        }

        // === Orphan (wild) collections ===
        const orphanFavs = favCollections.filter(f => f.is_orphan && f.question_count > 0);
        if (orphanFavs.length > 0) {
            allHtml += `<div style="margin-top:16px;padding:8px 0;"><h3 style="font-size:1rem;color:var(--gray-700);">📂 野生收藏集（文档已删除）</h3></div>`;
            for (const ofav of orphanFavs) {
                allHtml += `
                    <div class="doc-item orphan-fav">
                        <div class="doc-info">
                            <div class="doc-name">⭐ ${escapeHtml(ofav.name)}</div>
                            <div class="doc-stats"><span class="tag tag-fav">${ofav.question_count} 道收藏</span></div>
                        </div>
                        <div class="doc-actions">
                            <button class="btn btn-primary btn-sm" onclick="startFavoriteReview(${ofav.id})">📖 打开</button>
                            <button class="btn btn-outline btn-sm" onclick="renameCollection(${ofav.id})">✏️ 重命名</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteCollection(${ofav.id})">删除</button>
                        </div>
                    </div>`;
            }
        }

        docList.innerHTML = allHtml || '<p class="empty-hint">暂无导入的文档，请先上传</p>';
    } catch (error) {
        showNotification('加载文档列表失败', 'error');
    }
}

async function deleteDocument(docId) {
    if (!confirm('确定要删除该文档吗？关联的收藏集将变为野生收藏集')) return;
    try {
        const response = await fetch(`/api/documents/${docId}/delete`, { method: 'DELETE' });
        if (!response.ok) throw new Error('删除失败');
        showNotification('文档已删除', 'success');
        await loadDocuments();
        if (state.currentDocId === docId) {
            configSection.style.display = 'none';
            examSection.style.display = 'none';
        }
    } catch (error) { showNotification('删除失败', 'error'); }
}

// === Wrong Question Sets Display ===
async function showWrongSets(docId) {
    try {
        const [wrongSets, err] = await safeFetch(`/api/documents/${docId}/wrong-questions/detail`);
        if (err) throw err;
        if (!wrongSets || wrongSets.length === 0) { showNotification('暂无错题集', 'info'); return; }
        let html = `<div class="wrong-sets-container"><h3>📚 历史错题集</h3><p style="font-size:0.8rem;color:var(--gray-500);margin-bottom:12px;">✅ 已完成的错题集不再提示复习</p>`;
        wrongSets.forEach(ws => {
            const isCompleted = ws.completed;
            const statusLabel = isCompleted ? '<span class="tag tag-done">✅ 已完成</span>' : `<span class="tag tag-wrong">❌ ${ws.question_count} 道错题</span>`;
            const reviewBtn = isCompleted ? '' : `<button class="btn btn-primary btn-sm" onclick="startWrongReview('${docId}', ${ws.test_index})">🔄 复习错题</button>`;
            html += `<div class="wrong-set-card ${isCompleted ? 'completed' : ''}"><div class="wrong-set-header"><span class="wrong-set-title">第${ws.test_index}次测试错题</span><span class="wrong-set-time">🕐 ${ws.timestamp}</span></div><div class="wrong-set-body">${statusLabel}${reviewBtn}</div></div>`;
        });
        html += `</div>`;
        showModal(html);
    } catch (error) { showNotification('加载错题集失败', 'error'); }
}

// === Modal ===
function showModal(html) {
    let overlay = $('modalOverlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'modalOverlay'; document.body.appendChild(overlay); }
    overlay.innerHTML = `<div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-content"><button class="modal-close" onclick="closeModal()">✕</button>${html}</div>`;
    overlay.style.display = 'block';
}

function closeModal() {
    const overlay = $('modalOverlay');
    if (overlay) overlay.style.display = 'none';
}

// === Confirm Dialog ===
function showConfirmDialog(title, message, buttons) {
    return new Promise((resolve) => {
        let html = `<div class="confirm-dialog"><h3>${title}</h3><p>${message}</p><div class="confirm-actions">`;
        buttons.forEach((btnText, idx) => {
            const btnClass = idx === 0 ? 'btn-primary' : 'btn-outline';
            html += `<button class="btn ${btnClass}" onclick="closeModal(); resolveConfirm(${idx})">${btnText}</button>`;
        });
        html += `</div></div>`;
        window._confirmResolve = resolve;
        showModal(html);
    });
}

function resolveConfirm(idx) {
    if (window._confirmResolve) { window._confirmResolve(idx); window._confirmResolve = null; }
}

// === Rename Collection ===
async function renameCollection(collId) {
    const newName = prompt('请输入新的收藏集名称：');
    if (!newName || !newName.trim()) return;
    try {
        const response = await fetch(`/api/favorites/collections/${collId}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
        });
        if (!response.ok) throw new Error('重命名失败');
        showNotification('重命名成功', 'success');
        await loadDocuments();
    } catch(e) { showNotification('重命名失败', 'error'); }
}

async function deleteCollection(collId) {
    if (!confirm('确定要删除这个收藏集吗？')) return;
    try {
        await fetch(`/api/favorites/collections/${collId}`, { method: 'DELETE' });
        showNotification('收藏集已删除', 'success');
        await loadDocuments();
    } catch(e) { showNotification('删除失败', 'error'); }
}

// === Test Configuration ===
async function showConfig(docId) {
    state.currentDocId = docId;
    state.reviewMode = false;
    examSection.style.display = 'none';
    try {
        const [wrongInfo, _wrErr] = await safeFetch(`/api/documents/${docId}/wrong-questions`);
        if (wrongInfo) {
            const unfinished = wrongInfo.filter(w => !w.completed);
            if (unfinished.length > 0) {
                const totalWrong = unfinished.reduce((sum, w) => sum + w.question_count, 0);
                const choice = await showConfirmDialog(
                    `📝 检测到 ${totalWrong} 道历史错题`,
                    `你有 ${totalWrong} 道错题记录，是否先复习？<br><small style="color:var(--gray-500)">错题集会一直保留，方便反复练习</small>`,
                    ['复习错题', '直接测试']
                );
                if (choice === 0) { showWrongSets(docId); return; }
            }
        }
    } catch(e) {}
    showConfigPanel(docId);
}

function showConfigPanel(docId) {
    safeFetch(`/api/documents/${docId}`).then(async ([doc, err]) => {
        if (err || !doc) { showNotification('加载文档信息失败', 'error'); return; }
        const c = doc.counts;
        const total = c.total;
        configContent.innerHTML = `
            <div class="config-container">
                <div class="config-option">
                    <h3>🔄 测试模式</h3>
                    <div class="radio-group">
                        <label><input type="radio" name="examMode" value="full" checked onchange="togglePartialConfig()">📋 全测试 - 所有题目</label>
                        <label><input type="radio" name="examMode" value="partial" onchange="togglePartialConfig()">✂️ 部分测试 - 自定义数量</label>
                    </div>
                </div>
                <div class="config-option">
                    <h3>🔀 题目顺序</h3>
                    <div class="radio-group">
                        <label><input type="radio" name="shuffleType" value="sequential" checked>📑 原文顺序</label>
                        <label><input type="radio" name="shuffleType" value="shuffled">🔀 随机乱序</label>
                    </div>
                </div>
                <div class="config-option" id="partialConfig" style="display:none;">
                    <h3>📊 各题型数量</h3>
                    <div class="partial-config">
                        <div class="partial-row"><label>选择题 (${c.choice}):</label><input type="number" class="number-input" id="choiceCount" value="${c.choice}" min="0" max="${c.choice}" onchange="updateSummary()"></div>
                        <div class="partial-row"><label>判断题 (${c.true_false}):</label><input type="number" class="number-input" id="tfCount" value="${c.true_false}" min="0" max="${c.true_false}" onchange="updateSummary()"></div>
                        <div class="partial-row"><label>填空题 (${c.fill_blank}):</label><input type="number" class="number-input" id="fillCount" value="${c.fill_blank}" min="0" max="${c.fill_blank}" onchange="updateSummary()"></div>
                    </div>
                </div>
                <div class="config-summary" id="configSummary">📌 即将测试全部 ${total} 道题目（按题型分组进行测试）</div>
                <div class="config-actions">
                    <button class="btn btn-success" onclick="startExam()">🚀 开始测试</button>
                    <button class="btn btn-outline" onclick="configSection.style.display='none'">取消</button>
                </div>
            </div>`;
        configSection.style.display = 'block';
        configSection.scrollIntoView({ behavior: 'smooth' });
    }).catch(error => { showNotification('加载文档信息失败', 'error'); });
}

function togglePartialConfig() {
    const mode = document.querySelector('input[name="examMode"]:checked').value;
    $('partialConfig').style.display = mode === 'partial' ? 'block' : 'none';
    updateSummary();
}

function updateSummary() {
    const mode = document.querySelector('input[name="examMode"]:checked').value;
    const s = $('configSummary');
    const st = document.querySelector('input[name="shuffleType"]:checked').value;
    if (mode === 'full') { s.innerHTML = `📌 全测试模式 · ${st === 'sequential' ? '原文顺序' : '随机乱序'} · 按题型分组进行测试`; }
    else { const choice = parseInt($('choiceCount').value) || 0; const tf = parseInt($('tfCount').value) || 0; const fill = parseInt($('fillCount').value) || 0; s.innerHTML = `📌 部分测试模式 · 共 ${choice+tf+fill} 道题 · 按题型分组进行测试`; }
}

// === Sidebar ===
function toggleSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    let sidebar = $('sidebar');
    if (!sidebar) { sidebar = document.createElement('div'); sidebar.id = 'sidebar'; document.body.appendChild(sidebar); }
    if (state.sidebarVisible) { renderSidebar(); sidebar.style.display = 'block'; } else { sidebar.style.display = 'none'; }
}

function renderSidebar() {
    let sidebar = $('sidebar');
    if (!sidebar) { sidebar = document.createElement('div'); sidebar.id = 'sidebar'; document.body.appendChild(sidebar); }
    const total = state.currentQuestions.length;
    const typeLabels = { choice: '选择', true_false: '判断', fill_blank: '填空' };
    let html = `<div class="sidebar-header"><span>📋 题号 (${total})</span><button class="sidebar-close" onclick="toggleSidebar()">✕</button></div><div class="sidebar-body">`;
    let currentGroup = '';
    state.currentQuestions.forEach((q, idx) => {
        const ans = state.answers[idx];
        let statusClass = 'qid-unanswered';
        if (ans && ans.checked) { statusClass = ans.correct ? 'qid-correct' : 'qid-wrong'; }
        else if (ans && ans.userAnswer) { statusClass = 'qid-answered'; }
        const label = typeLabels[q.type] || q.type;
        if (label !== currentGroup) { currentGroup = label; html += `<div class="sidebar-group-label">${label}</div>`; }
        html += `<div class="qid-item ${statusClass}" onclick="jumpToQuestion(${idx})">${idx + 1}</div>`;
    });
    html += '</div>';
    sidebar.innerHTML = html;
}

function jumpToQuestion(idx) {
    state.currentIndex = idx;
    renderQuestion();
    toggleSidebar();
}

// === Exam ===
async function startExam() {
    const mode = document.querySelector('input[name="examMode"]:checked').value;
    const shuffleType = document.querySelector('input[name="shuffleType"]:checked').value;
    let counts = null;
    if (mode === 'partial') { counts = { choice: parseInt($('choiceCount').value) || 0, true_false: parseInt($('tfCount').value) || 0, fill_blank: parseInt($('fillCount').value) || 0 }; }
    try {
        const [data, err] = await safeFetch(`/api/documents/${state.currentDocId}/exam`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, shuffle_type: shuffleType, counts }),
        });
        if (err) throw err;
        if (data.total === 0) { showNotification('没有可测试的题目', 'error'); return; }
        state.currentQuestions = data.questions;
        state.currentIndex = 0;
        state.answers = {};
        state.results = null;
        state.reviewMode = false;
        state.favoriteMode = false;
        await loadQuestionStats(state.currentDocId);
        await loadFavoritedQuestions(state.currentDocId);
        configSection.style.display = 'none';
        examSection.style.display = 'block';
        renderQuestion();
        examSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) { showNotification(error.message, 'error'); }
}

async function loadQuestionStats(docId) {
    try { const [data, _] = await safeFetch(`/api/documents/${docId}/stats`); state.questionStats = data || {}; } catch(e) { state.questionStats = {}; }
}

async function loadFavoritedQuestions(docId) {
    try { const [data, _] = await safeFetch(`/api/documents/${docId}/favorites`); state.favoritedQuestions = Array.isArray(data) ? data : []; } catch(e) { state.favoritedQuestions = []; }
}

// === Favorite Review ===
async function startFavoriteReview(collId) {
    try {
        const [data, err] = await safeFetch(`/api/favorites/collections/${collId}`);
        if (err) throw err;
        if (data.total === 0) { showNotification('收藏集为空', 'info'); return; }

        state.currentDocId = data.doc_id || null;
        state.currentQuestions = data.questions;
        state.currentIndex = 0;
        state.answers = {};
        state.results = null;
        state.reviewMode = false;
        state.favoriteMode = true;
        state.favoriteCollId = collId;

        // Load stats if doc still exists
        if (state.currentDocId) {
            await loadQuestionStats(state.currentDocId);
            await loadFavoritedQuestions(state.currentDocId);
        } else {
            state.questionStats = {};
            state.favoritedQuestions = [];
        }

        configSection.style.display = 'none';
        examSection.style.display = 'block';
        renderQuestion();
        examSection.scrollIntoView({ behavior: 'smooth' });
        showNotification(`⭐ 收藏集：${data.name} · 共 ${data.total} 题`, 'info');
    } catch (error) { showNotification(error.message, 'error'); }
}

// === Wrong Question Review ===
async function startWrongReview(docId, testIndex) {
    closeModal();
    try {
        const [data, err] = await safeFetch(`/api/documents/${docId}/wrong-questions/${testIndex}/review`);
        if (err) throw err;
        if (data.total === 0) { showNotification('该错题集已清空', 'info'); return; }
        state.currentDocId = docId;
        state.currentQuestions = data.questions;
        state.currentIndex = 0;
        state.answers = {};
        state.results = null;
        state.reviewMode = true;
        state.reviewTestIndex = testIndex;
        state.favoriteMode = false;
        await loadQuestionStats(docId);
        await loadFavoritedQuestions(docId);
        configSection.style.display = 'none';
        examSection.style.display = 'block';
        renderQuestion();
        examSection.scrollIntoView({ behavior: 'smooth' });
        showNotification(`📝 错题复习模式：共 ${data.total} 道错题（错题集会一直保留）`, 'info');
    } catch (error) { showNotification(error.message, 'error'); }
}

// === Star / Favorite Toggle ===
function toggleStarByIndex(idx) {
    const q = state.currentQuestions[idx];
    if (q) {
        toggleStar(q.question, q);
    }
}

async function toggleStar(questionText, questionData) {
    if (!state.currentDocId) {
        showNotification('无法收藏：文档已不存在', 'warning');
        return;
    }
    try {
        const [data, err] = await safeFetch(`/api/documents/${state.currentDocId}/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_text: questionText, question_data: questionData }),
        });
        if (err) throw err;
        if (data.starred) {
            if (!state.favoritedQuestions.includes(questionText)) state.favoritedQuestions.push(questionText);
        } else {
            state.favoritedQuestions = state.favoritedQuestions.filter(t => t !== questionText);
        }
        renderQuestion();
        showNotification(data.starred ? '⭐ 已收藏' : '☆ 已取消收藏', 'success');
    } catch(e) { showNotification('操作失败', 'error'); }
}

function isFavorited(questionText) {
    return state.favoritedQuestions.includes(questionText);
}

// === Stats Display ===
function getStatsDisplay(q) {
    const stats = state.questionStats[q.question];
    if (stats && stats.total > 0) {
        const rate = Math.round((stats.correct / stats.total) * 100);
        const color = rate >= 70 ? 'var(--success)' : (rate >= 40 ? 'var(--warning)' : 'var(--danger)');
        return `<span class="stats-badge" style="color:${color}">📊 ${stats.correct}/${stats.total} (${rate}%)</span>`;
    }
    return '';
}

function renderQuestion() {
    const questions = state.currentQuestions;
    const idx = state.currentIndex;
    if (idx >= questions.length) { showResults(); return; }
    const q = questions[idx];
    const total = questions.length;
    const progress = total > 0 ? ((idx) / total * 100).toFixed(1) : 0;
    let typeEnd = idx, typeStart = idx;
    const currentType = q.type;
    for (let i = idx + 1; i < questions.length; i++) { if (questions[i].type === currentType) typeEnd = i; else break; }
    for (let i = idx - 1; i >= 0; i--) { if (questions[i].type === currentType) typeStart = i; else break; }
    const typeProgress = idx - typeStart + 1;
    const typeTotal = typeEnd - typeStart + 1;
    const typeLabels = { choice: '选择题', true_false: '判断题', fill_blank: '填空题/问答题' };
    let questionBody = '';
    const existingAns = state.answers[idx];
    const isMultiChoice = q.options && Object.keys(q.options).length > 4;

    if (q.type === 'choice') {
        const options = q.options || {};
        if (isMultiChoice || Object.keys(options).length > 4) {
            const selected = existingAns?.userAnswer ? existingAns.userAnswer.split(',').map(s => s.trim()) : [];
            questionBody = `<div class="options-list">${Object.entries(options).map(([letter, text]) => `<div class="option-item ${selected.includes(letter) ? 'selected' : ''}" onclick="toggleChoiceMulti('${letter}', ${idx})"><span class="opt-letter">${letter}</span><span class="opt-text">${escapeHtml(text)}</span><span class="opt-check">${selected.includes(letter) ? '✓' : ''}</span></div>`).join('')}</div><div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:8px;">💡 多选题，可点击多个选项选择</div>`;
        } else {
            questionBody = `<div class="options-list">${Object.entries(options).map(([letter, text]) => `<div class="option-item ${existingAns?.userAnswer === letter ? 'selected' : ''}" onclick="selectChoice('${letter}', ${idx})"><span class="opt-letter">${letter}</span><span class="opt-text">${escapeHtml(text)}</span></div>`).join('')}</div>`;
        }
    } else if (q.type === 'true_false') {
        const currentAnswer = existingAns?.userAnswer || '';
        questionBody = `<div class="tf-buttons"><div class="tf-btn ${currentAnswer === '正确' ? 'selected-true' : ''}" onclick="selectTF('正确', ${idx})">✅ 正确</div><div class="tf-btn ${currentAnswer === '错误' ? 'selected-false' : ''}" onclick="selectTF('错误', ${idx})">❌ 错误</div></div>`;
    } else if (q.type === 'fill_blank') {
        const currentAnswer = existingAns?.userAnswer || '';
        questionBody = `<textarea class="fill-input" id="fillInput_${idx}" placeholder="请输入你的答案..." oninput="saveFillAnswer(${idx})">${currentAnswer}</textarea>`;
    }

    const sidebarBtn = `<button class="btn btn-outline btn-sm" onclick="toggleSidebar()" style="margin-bottom:12px;">📋 题号面板 (Tab)</button>`;
    let modeBadge = '';
    if (state.reviewMode) { modeBadge = `<div class="review-badge">🔄 错题复习模式（错题集会一直保留）</div>`; }
    if (state.favoriteMode) { modeBadge = `<div class="review-badge review-badge-fav">⭐ 收藏集复习模式</div>`; }
    const statsDisplay = getStatsDisplay(q);
    const starred = isFavorited(q.question);
    const starBtn = state.currentDocId ? `<span class="star-btn ${starred ? 'starred' : ''}" onclick="toggleStarByIndex(${idx})">${starred ? '★' : '☆'}</span>` : '';

    examContent.innerHTML = `${sidebarBtn}${modeBadge}<div class="exam-progress"><div class="progress-info"><span>第 ${idx + 1} / ${total} 题</span><span>${progress}%</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div><div class="type-indicator">📌 当前题型：${typeLabels[currentType] || currentType} · 本组 ${typeProgress}/${typeTotal} 题</div></div><div class="question-card"><div class="q-header"><span class="q-number">#${idx + 1}</span>${starBtn}</div><span class="q-type-badge ${currentType}">${typeLabels[currentType] || currentType}</span>${statsDisplay ? `<span style="margin-left:8px;">${statsDisplay}</span>` : ''}<div class="q-text">${escapeHtml(q.question)}</div>${questionBody}<div id="feedback_${idx}"></div></div><div class="exam-nav"><button class="btn btn-outline" onclick="prevQuestion()" ${idx === 0 ? 'disabled' : ''}>⬅ 上一题</button><div>${!existingAns?.checked ? `<button class="btn btn-primary" id="checkBtn" onclick="checkAnswer(${idx})">✅ 检查答案</button>` : ''}<button class="btn btn-success" id="nextBtn" onclick="nextQuestion()">${idx < total - 1 ? '下一题 ➡' : '查看结果 🎉'}</button></div></div>`;

    if (existingAns?.checked) {
        showAnswerFeedback(idx, existingAns);
        if (existingAns.correct && (q.type === 'choice' || q.type === 'true_false')) {
            if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
            state.autoAdvanceTimer = setTimeout(() => { nextQuestion(); }, 1000);
        }
    }
    document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escapeHtmlAttr(text) {
    return escapeHtml(text).replace(/"/g, '"').replace(/'/g, '&#39;');
}

function selectChoice(letter, idx) {
    state.answers[idx] = { userAnswer: letter, checked: false };
    renderQuestion();
    const fb = $(`feedback_${idx}`);
    if (fb) fb.innerHTML = '';
}

function toggleChoiceMulti(letter, idx) {
    const existing = state.answers[idx];
    let selected = existing?.userAnswer ? existing.userAnswer.split(',').map(s => s.trim()) : [];
    if (selected.includes(letter)) { selected = selected.filter(s => s !== letter); } else { selected.push(letter); }
    state.answers[idx] = { userAnswer: selected.join(','), checked: false };
    renderQuestion();
}

function selectTF(value, idx) {
    state.answers[idx] = { userAnswer: value, checked: false };
    renderQuestion();
}

function saveFillAnswer(idx) {
    const input = $(`fillInput_${idx}`);
    if (input) { state.answers[idx] = { userAnswer: input.value, checked: false }; }
}

async function checkAnswer(idx) {
    const q = state.currentQuestions[idx];
    const answer = state.answers[idx];
    if (!answer || !answer.userAnswer) { showNotification('请先回答本题', 'warning'); return; }
    const fb = $(`feedback_${idx}`);
    if (fb) fb.innerHTML = `<div class="answer-feedback" style="background:var(--gray-100);">⏳ 检查中...</div>`;
    try {
        const [data, err] = await safeFetch('/api/exam/check', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, answer: answer.userAnswer }),
        });
        if (err) throw err;
        answer.checked = true;
        answer.correct = data.correct;
        answer.matchRate = data.match_rate;
        answer.correctAnswer = data.correct_answer;

        if (state.currentDocId) {
            try {
                await fetch(`/api/documents/${state.currentDocId}/stats/update`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: q.question, correct: data.correct }),
                });
                await loadQuestionStats(state.currentDocId);
            } catch(e) {}
        }

        showAnswerFeedback(idx, answer);
        renderQuestion();

        if (data.correct && (q.type === 'choice' || q.type === 'true_false')) {
            if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
            state.autoAdvanceTimer = setTimeout(() => { nextQuestion(); }, 1000);
        }
    } catch (error) { showNotification(error.message, 'error'); }
}

function showAnswerFeedback(idx, answer) {
    const q = state.currentQuestions[idx];
    const fb = $(`feedback_${idx}`);
    if (!fb) return;
    let feedbackHTML = '';
    const qtype = q.type;
    if (qtype === 'choice' || qtype === 'true_false') {
        if (answer.correct) { feedbackHTML = `<div class="answer-feedback correct"><strong>AC</strong> ✅ 回答正确！</div>`; }
        else { const correctAns = answer.correctAnswer || q.answer || ''; feedbackHTML = `<div class="answer-feedback wrong"><strong>WA</strong> ❌ 回答错误<br><span class="correct-answer">正确答案：${escapeHtml(correctAns)}</span></div>`; }
    } else if (qtype === 'fill_blank') {
        const rate = answer.matchRate !== undefined ? answer.matchRate : 0;
        if (rate >= 70) { feedbackHTML = `<div class="answer-feedback correct"><strong>${rate}%</strong> ✅ 文本匹配率达标（≥70%）！</div>`; }
        else { const correctAns = answer.correctAnswer || q.answer || ''; feedbackHTML = `<div class="answer-feedback wrong"><strong>${rate}%</strong> 文本匹配率不足（需≥70%）<br><span class="correct-answer">正确答案：${escapeHtml(correctAns)}</span></div>`; }
    }
    fb.innerHTML = feedbackHTML;
    if (state.sidebarVisible) renderSidebar();
}

function nextQuestion() {
    if (state.autoAdvanceTimer) { clearTimeout(state.autoAdvanceTimer); state.autoAdvanceTimer = null; }
    if (state.currentIndex < state.currentQuestions.length - 1) { state.currentIndex++; renderQuestion(); }
    else { showResults(); }
}

function prevQuestion() {
    if (state.autoAdvanceTimer) { clearTimeout(state.autoAdvanceTimer); state.autoAdvanceTimer = null; }
    if (state.currentIndex > 0) { state.currentIndex--; renderQuestion(); }
}

// === Results ===
async function showResults() {
    const questions = state.currentQuestions;
    for (let i = 0; i < questions.length; i++) {
        const ans = state.answers[i];
        if (ans && ans.userAnswer && !ans.checked) {
            try {
                const q = questions[i];
                const [data, fetchErr] = await safeFetch('/api/exam/check', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: q, answer: ans.userAnswer }),
                });
                if (fetchErr) {
                    ans.checked = true;
                    ans.correct = false;
                    ans.correctAnswer = q.answer || '';
                    continue;
                }
                ans.checked = true;
                ans.correct = data.correct;
                ans.matchRate = data.match_rate;
                ans.correctAnswer = data.correct_answer;
                if (state.currentDocId) {
                    try { await fetch(`/api/documents/${state.currentDocId}/stats/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q.question, correct: data.correct }) }); } catch(e) {}
                }
            } catch(e) {}
        }
    }

    let correct = 0, wrong = 0, unanswered = 0;
    const wrongQuestionsList = [];
    for (let i = 0; i < questions.length; i++) {
        const ans = state.answers[i];
        if (!ans || !ans.checked) { unanswered++; }
        else if (ans.correct) { correct++; }
        else {
            wrong++;
            const q = { ...questions[i] };
            delete q.exam_index; delete q.wrong_test_index;
            wrongQuestionsList.push(q);
        }
    }
    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passScore = 60;

    if (state.reviewMode && wrong === 0 && unanswered === 0 && state.reviewTestIndex !== null && state.currentDocId) {
        try { await fetch(`/api/documents/${state.currentDocId}/wrong-questions/${state.reviewTestIndex}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }); } catch(e) {}
    }

    let saveInfoHtml = '';
    if (!state.reviewMode && !state.favoriteMode && wrongQuestionsList.length > 0 && state.currentDocId) {
        try {
            const wrongInfoResponse = await fetch(`/api/documents/${state.currentDocId}/wrong-questions`);
            const existingWrong = await wrongInfoResponse.json();
            const nextTestIdx = existingWrong.length > 0 ? Math.max(...existingWrong.map(w => w.test_index || 0)) + 1 : 1;
            const saveResponse = await fetch(`/api/documents/${state.currentDocId}/wrong-questions/save`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc_id: state.currentDocId, wrong_questions: wrongQuestionsList, test_index: nextTestIdx }),
            });
            const saveData = await saveResponse.json();
            if (saveData.success && saveData.saved > 0) {
                saveInfoHtml = `<div class="wrong-save-info"><span>📝 第${saveData.test_index}次测试错题已保存</span><span style="font-size:0.8rem;color:var(--gray-500);">🕐 ${saveData.timestamp}</span><button class="btn btn-sm btn-warning" onclick="showWrongSets('${state.currentDocId}')">📖 查看错题集</button></div>`;
            }
        } catch(e) {}
    }

    let detailsHTML = '';
    function formatAnswerWithText(answerKey, options) {
        if (!answerKey) return '无';
        if (!options) return escapeHtml(answerKey);
        const keys = answerKey.split(',').map(k => k.trim().toUpperCase());
        const parts = keys.map(key => { const text = options[key]; return text ? `${key}. ${text}` : key; });
        return escapeHtml(parts.join(', '));
    }
    questions.forEach((q, idx) => {
        const ans = state.answers[idx];
        const typeLabels = { choice: '选择题', true_false: '判断题', fill_blank: '填空题' };
        let resultLabel = '⚠️ 未作答';
        let resultColor = 'var(--warning)';
        if (ans?.checked) {
            resultLabel = ans.correct ? 'AC ✅' : 'WA ❌';
            resultColor = ans.correct ? 'var(--success)' : 'var(--danger)';
            if (q.type === 'fill_blank' && !ans.correct) { resultLabel = `${ans.matchRate || 0}%`; }
            else if (q.type === 'fill_blank' && ans.correct) { resultLabel = `${ans.matchRate || 100}% ✅`; }
        }
        const userAnswerDisplay = q.type === 'choice' && q.options ? formatAnswerWithText(ans?.userAnswer || '', q.options) : escapeHtml(ans?.userAnswer || '未作答');
        const correctAnswerDisplay = q.type === 'choice' && q.options ? formatAnswerWithText(q.answer || '', q.options) : escapeHtml(q.answer || '无');
        const stats = state.questionStats[q.question];
        const statsDisplay = stats && stats.total > 0 ? `<div style="font-size:0.8rem;color:var(--gray-500);">📊 正确率：${stats.correct}/${stats.total} (${Math.round(stats.correct/stats.total*100)}%)</div>` : '';
        detailsHTML += `<div class="question-card" style="margin-bottom:12px;"><div class="q-number">#${idx + 1} · ${typeLabels[q.type] || q.type}</div><div class="q-text">${escapeHtml(q.question)}</div><div style="font-size:0.85rem;"><div>你的答案: ${userAnswerDisplay}</div><div>正确答案: ${correctAnswerDisplay}</div><div style="color:${resultColor};font-weight:500;">${resultLabel}</div>${statsDisplay}</div></div>`;
    });

    const titleText = state.reviewMode ? '错题复习结果' : (state.favoriteMode ? '收藏集复习结果' : '测试结果');
    examContent.innerHTML = `
        <div class="results-container">
            <h3>📊 ${titleText}</h3>
            <div class="score ${score >= passScore ? 'pass' : 'fail'}">${score}分</div>
            <div class="results-stats">
                <div class="stat-item"><div class="stat-value" style="color:var(--success)">${correct}</div><div class="stat-label">AC ✅</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--danger)">${wrong}</div><div class="stat-label">WA ❌</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--warning)">${unanswered}</div><div class="stat-label">⚠️ 未作答</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--primary)">${total}</div><div class="stat-label">📝 总题数</div></div>
            </div>
            ${saveInfoHtml ? `<div style="margin-top:16px;">${saveInfoHtml}</div>` : ''}
            <div style="margin-top:20px;">
                <div style="font-size:0.9rem;color:var(--gray-500);margin-bottom:12px;">${score >= passScore ? '🎉 恭喜通过！' : '💪 继续加油！'}</div>
                <button class="btn btn-outline" onclick="exitReview()">返回文档列表</button>
            </div>
            <details style="margin-top:20px;text-align:left;">
                <summary style="cursor:pointer;font-weight:500;padding:8px;background:var(--gray-50);border-radius:8px;">📋 查看详细答题记录</summary>
                <div style="margin-top:12px;">${detailsHTML}</div>
            </details>
        </div>`;
    examSection.scrollIntoView({ behavior: 'smooth' });
    loadDocuments();
}

function exitReview() {
    state.reviewMode = false;
    state.reviewTestIndex = null;
    state.favoriteMode = false;
    state.favoriteCollId = null;
    examSection.style.display = 'none';
    configSection.style.display = 'none';
    loadDocuments();
}

// === Helpers ===
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#4f46e5' };
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px;color: white; background: ${colors[type] || colors.info};box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000;animation: fadeIn 0.3s ease; max-width: 350px; font-size: 0.9rem;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// === Initialize ===
document.addEventListener('DOMContentLoaded', () => { loadDocuments(); });