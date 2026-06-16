/**
 * Main Application JavaScript
 * Exam interface with sidebar, auto-advance, AC/WA display, text matching rate
 */

// === State Management ===
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
};

// === DOM References ===
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

// === Keyboard shortcut for sidebar ===
document.addEventListener('keydown', (e) => {
    // Press Tab or Backtick to toggle sidebar during exam
    if ((e.key === 'Tab' || e.key === '`' || e.key === 'Escape') && examSection.style.display !== 'none') {
        if (e.key === 'Escape' && state.sidebarVisible) {
            toggleSidebar();
            e.preventDefault();
        } else if (e.key === 'Tab' || e.key === '`') {
            toggleSidebar();
            e.preventDefault();
        }
    }
});

// === Upload Functionality ===

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
    if (!name.endsWith('.docx') && !name.endsWith('.doc')) {
        showNotification('仅支持 .doc 和 .docx 格式的文件', 'error');
        return;
    }

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

// === Document List ===

async function loadDocuments() {
    try {
        const response = await fetch('/api/documents');
        const docs = await response.json();
        if (docs.length === 0) {
            docList.innerHTML = '<p class="empty-hint">暂无导入的文档，请先上传</p>';
            return;
        }
        docList.innerHTML = docs.map(doc => {
            const c = doc.counts;
            return `
                <div class="doc-item">
                    <div class="doc-info">
                        <div class="doc-name">📄 ${doc.filename}</div>
                        <div class="doc-stats">
                            <span class="tag tag-choice">选择题 ${c.choice}</span>
                            <span class="tag tag-tf">判断题 ${c.true_false}</span>
                            <span class="tag tag-fill">填空题 ${c.fill_blank}</span>
                            <span>共 ${c.total} 题</span>
                        </div>
                    </div>
                    <div class="doc-actions">
                        <button class="btn btn-primary btn-sm" onclick="showConfig('${doc.doc_id}')">开始测试</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.doc_id}')">删除</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        showNotification('加载文档列表失败', 'error');
    }
}

async function deleteDocument(docId) {
    if (!confirm('确定要删除该文档吗？')) return;
    try {
        const response = await fetch(`/api/documents/${docId}/delete`, { method: 'DELETE' });
        if (!response.ok) throw new Error('删除失败');
        showNotification('文档已删除', 'success');
        await loadDocuments();
        if (state.currentDocId === docId) {
            configSection.style.display = 'none';
            examSection.style.display = 'none';
        }
    } catch (error) {
        showNotification('删除失败', 'error');
    }
}

// === Test Configuration ===

async function showConfig(docId) {
    state.currentDocId = docId;
    examSection.style.display = 'none';
    try {
        const response = await fetch(`/api/documents/${docId}`);
        const doc = await response.json();
        if (!response.ok) throw new Error(doc.error);
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
                        <div class="partial-row">
                            <label>选择题 (${c.choice}):</label>
                            <input type="number" class="number-input" id="choiceCount" value="${c.choice}" min="0" max="${c.choice}" onchange="updateSummary()">
                        </div>
                        <div class="partial-row">
                            <label>判断题 (${c.true_false}):</label>
                            <input type="number" class="number-input" id="tfCount" value="${c.true_false}" min="0" max="${c.true_false}" onchange="updateSummary()">
                        </div>
                        <div class="partial-row">
                            <label>填空题 (${c.fill_blank}):</label>
                            <input type="number" class="number-input" id="fillCount" value="${c.fill_blank}" min="0" max="${c.fill_blank}" onchange="updateSummary()">
                        </div>
                    </div>
                </div>
                <div class="config-summary" id="configSummary">📌 即将测试全部 ${total} 道题目（按题型分组进行测试）</div>
                <div class="config-actions">
                    <button class="btn btn-success" onclick="startExam()">🚀 开始测试</button>
                    <button class="btn btn-outline" onclick="configSection.style.display='none'">取消</button>
                </div>
            </div>
        `;
        configSection.style.display = 'block';
        configSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showNotification('加载文档信息失败', 'error');
    }
}

function togglePartialConfig() {
    const mode = document.querySelector('input[name="examMode"]:checked').value;
    $('partialConfig').style.display = mode === 'partial' ? 'block' : 'none';
    updateSummary();
}

function updateSummary() {
    const mode = document.querySelector('input[name="examMode"]:checked').value;
    const summary = $('configSummary');
    const shuffleType = document.querySelector('input[name="shuffleType"]:checked').value;
    if (mode === 'full') {
        summary.innerHTML = `📌 全测试模式 · ${shuffleType === 'sequential' ? '原文顺序' : '随机乱序'} · 按题型分组进行测试`;
    } else {
        const choice = parseInt($('choiceCount').value) || 0;
        const tf = parseInt($('tfCount').value) || 0;
        const fill = parseInt($('fillCount').value) || 0;
        summary.innerHTML = `📌 部分测试模式 · 共 ${choice+tf+fill} 道题 · 按题型分组进行测试`;
    }
}

// === Sidebar ===

function toggleSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    let sidebar = $('sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar';
        document.body.appendChild(sidebar);
    }
    if (state.sidebarVisible) {
        renderSidebar();
        sidebar.style.display = 'block';
    } else {
        sidebar.style.display = 'none';
    }
}

function renderSidebar() {
    let sidebar = $('sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar';
        document.body.appendChild(sidebar);
    }
    const total = state.currentQuestions.length;
    const typeLabels = { choice: '选择', true_false: '判断', fill_blank: '填空' };

    let html = `<div class="sidebar-header">
        <span>📋 题号 (${total})</span>
        <button class="sidebar-close" onclick="toggleSidebar()">✕</button>
    </div><div class="sidebar-body">`;

    let currentGroup = '';
    state.currentQuestions.forEach((q, idx) => {
        const ans = state.answers[idx];
        let statusClass = 'qid-unanswered';
        if (ans && ans.checked) {
            statusClass = ans.correct ? 'qid-correct' : 'qid-wrong';
        } else if (ans && ans.userAnswer) {
            statusClass = 'qid-answered';
        }
        const label = typeLabels[q.type] || q.type;
        if (label !== currentGroup) {
            currentGroup = label;
            html += `<div class="sidebar-group-label">${label}</div>`;
        }
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
    if (mode === 'partial') {
        counts = {
            choice: parseInt($('choiceCount').value) || 0,
            true_false: parseInt($('tfCount').value) || 0,
            fill_blank: parseInt($('fillCount').value) || 0,
        };
    }

    try {
        const response = await fetch(`/api/documents/${state.currentDocId}/exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, shuffle_type: shuffleType, counts }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.total === 0) {
            showNotification('没有可测试的题目', 'error');
            return;
        }

        state.currentQuestions = data.questions;
        state.currentIndex = 0;
        state.answers = {};
        state.results = null;

        configSection.style.display = 'none';
        examSection.style.display = 'block';
        renderQuestion();
        examSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function renderQuestion() {
    const questions = state.currentQuestions;
    const idx = state.currentIndex;

    if (idx >= questions.length) {
        showResults();
        return;
    }

    const q = questions[idx];
    const total = questions.length;
    const progress = ((idx) / total * 100).toFixed(1);

    // Get type group info
    let typeEnd = idx, typeStart = idx;
    const currentType = q.type;
    for (let i = idx + 1; i < questions.length; i++) {
        if (questions[i].type === currentType) typeEnd = i; else break;
    }
    for (let i = idx - 1; i >= 0; i--) {
        if (questions[i].type === currentType) typeStart = i; else break;
    }
    const typeProgress = idx - typeStart + 1;
    const typeTotal = typeEnd - typeStart + 1;

    const typeLabels = { choice: '选择题', true_false: '判断题', fill_blank: '填空题/问答题' };

    let questionBody = '';
    const existingAns = state.answers[idx];
    const isMultiChoice = q.options && Object.keys(q.options).length > 4;

    if (q.type === 'choice') {
        const options = q.options || {};
        // Multi-select if more than 4 options
        if (isMultiChoice || Object.keys(options).length > 4) {
            const selected = existingAns?.userAnswer ? existingAns.userAnswer.split(',').map(s => s.trim()) : [];
            questionBody = `
                <div class="options-list">
                    ${Object.entries(options).map(([letter, text]) => `
                        <div class="option-item ${selected.includes(letter) ? 'selected' : ''}" 
                             onclick="toggleChoiceMulti('${letter}', ${idx})">
                            <span class="opt-letter">${letter}</span>
                            <span class="opt-text">${escapeHtml(text)}</span>
                            <span class="opt-check">${selected.includes(letter) ? '✓' : ''}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:8px;">💡 多选题，可点击多个选项选择</div>
            `;
        } else {
            questionBody = `
                <div class="options-list">
                    ${Object.entries(options).map(([letter, text]) => `
                        <div class="option-item ${existingAns?.userAnswer === letter ? 'selected' : ''}" 
                             onclick="selectChoice('${letter}', ${idx})">
                            <span class="opt-letter">${letter}</span>
                            <span class="opt-text">${escapeHtml(text)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } else if (q.type === 'true_false') {
        const currentAnswer = existingAns?.userAnswer || '';
        questionBody = `
            <div class="tf-buttons">
                <div class="tf-btn ${currentAnswer === '正确' ? 'selected-true' : ''}" onclick="selectTF('正确', ${idx})">✅ 正确</div>
                <div class="tf-btn ${currentAnswer === '错误' ? 'selected-false' : ''}" onclick="selectTF('错误', ${idx})">❌ 错误</div>
            </div>
        `;
    } else if (q.type === 'fill_blank') {
        const currentAnswer = existingAns?.userAnswer || '';
        questionBody = `
            <textarea class="fill-input" id="fillInput_${idx}" placeholder="请输入你的答案..." oninput="saveFillAnswer(${idx})">${currentAnswer}</textarea>
        `;
    }

    // Build sidebar toggle button
    const sidebarBtn = `<button class="btn btn-outline btn-sm" onclick="toggleSidebar()" style="margin-bottom:12px;">📋 题号面板 (Tab)</button>`;

    examContent.innerHTML = `
        ${sidebarBtn}
        <div class="exam-progress">
            <div class="progress-info">
                <span>第 ${idx + 1} / ${total} 题</span>
                <span>${progress}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="type-indicator">
                📌 当前题型：${typeLabels[currentType] || currentType} · 本组 ${typeProgress}/${typeTotal} 题
            </div>
        </div>

        <div class="question-card">
            <div class="q-number">#${idx + 1}</div>
            <span class="q-type-badge ${currentType}">${typeLabels[currentType] || currentType}</span>
            <div class="q-text">${escapeHtml(q.question)}</div>
            ${questionBody}
            <div id="feedback_${idx}"></div>
        </div>

        <div class="exam-nav">
            <button class="btn btn-outline" onclick="prevQuestion()" ${idx === 0 ? 'disabled' : ''}>⬅ 上一题</button>
            <div>
                ${!existingAns?.checked ? `<button class="btn btn-primary" id="checkBtn" onclick="checkAnswer(${idx})">✅ 检查答案</button>` : ''}
                <button class="btn btn-success" id="nextBtn" onclick="nextQuestion()">${idx < total - 1 ? '下一题 ➡' : '查看结果 🎉'}</button>
            </div>
        </div>
    `;

    // If already answered and checked, show feedback
    if (existingAns?.checked) {
        showAnswerFeedback(idx, existingAns);
        // Auto advance for correct answers to choice/tf
        if (existingAns.correct && (q.type === 'choice' || q.type === 'true_false')) {
            if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
            state.autoAdvanceTimer = setTimeout(() => {
                nextQuestion();
            }, 1000);
        }
    }

    document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function selectChoice(letter, idx) {
    state.answers[idx] = { userAnswer: letter, checked: false };
    renderQuestion();
    // Auto-check if already rendered
    const fb = $(`feedback_${idx}`);
    if (fb) fb.innerHTML = '';
}

function toggleChoiceMulti(letter, idx) {
    const existing = state.answers[idx];
    let selected = existing?.userAnswer ? existing.userAnswer.split(',').map(s => s.trim()) : [];
    if (selected.includes(letter)) {
        selected = selected.filter(s => s !== letter);
    } else {
        selected.push(letter);
    }
    state.answers[idx] = { userAnswer: selected.join(','), checked: false };
    renderQuestion();
}

function selectTF(value, idx) {
    state.answers[idx] = { userAnswer: value, checked: false };
    renderQuestion();
}

function saveFillAnswer(idx) {
    const input = $(`fillInput_${idx}`);
    if (input) {
        state.answers[idx] = { userAnswer: input.value, checked: false };
    }
}

async function checkAnswer(idx) {
    const q = state.currentQuestions[idx];
    const answer = state.answers[idx];

    if (!answer || !answer.userAnswer) {
        showNotification('请先回答本题', 'warning');
        return;
    }

    // Show checking indicator
    const fb = $(`feedback_${idx}`);
    if (fb) fb.innerHTML = `<div class="answer-feedback" style="background:var(--gray-100);">⏳ 检查中...</div>`;

    try {
        const response = await fetch('/api/exam/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, answer: answer.userAnswer }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        answer.checked = true;
        answer.correct = data.correct;
        answer.matchRate = data.match_rate;
        answer.correctAnswer = data.correct_answer;

        showAnswerFeedback(idx, answer);

        // Auto advance for correct choice/tf after 1 second
        if (data.correct && (q.type === 'choice' || q.type === 'true_false')) {
            if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
            state.autoAdvanceTimer = setTimeout(() => {
                nextQuestion();
            }, 1000);
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function showAnswerFeedback(idx, answer) {
    const q = state.currentQuestions[idx];
    const fb = $(`feedback_${idx}`);
    if (!fb) return;

    let feedbackHTML = '';
    const qtype = q.type;

    if (qtype === 'choice' || qtype === 'true_false') {
        if (answer.correct) {
            feedbackHTML = `<div class="answer-feedback correct"><strong>AC</strong> ✅ 回答正确！</div>`;
        } else {
            const correctAns = answer.correctAnswer || q.answer || '';
            feedbackHTML = `<div class="answer-feedback wrong"><strong>WA</strong> ❌ 回答错误<br><span class="correct-answer">正确答案：${escapeHtml(correctAns)}</span></div>`;
        }
    } else if (qtype === 'fill_blank') {
        const rate = answer.matchRate !== undefined ? answer.matchRate : 0;
        if (rate === 100) {
            feedbackHTML = `<div class="answer-feedback correct"><strong>AC</strong> ✅ 文本完全匹配！</div>`;
        } else {
            const correctAns = answer.correctAnswer || q.answer || '';
            feedbackHTML = `<div class="answer-feedback wrong"><strong>${rate}%</strong> 文本匹配率<br><span class="correct-answer">正确答案：${escapeHtml(correctAns)}</span></div>`;
        }
    }

    fb.innerHTML = feedbackHTML;

    // Update sidebar status if visible
    if (state.sidebarVisible) renderSidebar();
}

function nextQuestion() {
    if (state.autoAdvanceTimer) {
        clearTimeout(state.autoAdvanceTimer);
        state.autoAdvanceTimer = null;
    }
    if (state.currentIndex < state.currentQuestions.length - 1) {
        state.currentIndex++;
        renderQuestion();
    } else {
        showResults();
    }
}

function prevQuestion() {
    if (state.autoAdvanceTimer) {
        clearTimeout(state.autoAdvanceTimer);
        state.autoAdvanceTimer = null;
    }
    if (state.currentIndex > 0) {
        state.currentIndex--;
        renderQuestion();
    }
}

// === Results ===

function showResults() {
    const questions = state.currentQuestions;
    let correct = 0, wrong = 0, unanswered = 0;

    for (let i = 0; i < questions.length; i++) {
        const ans = state.answers[i];
        if (!ans || !ans.checked) { unanswered++; }
        else if (ans.correct) { correct++; }
        else { wrong++; }
    }

    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passScore = 60;

    let detailsHTML = '';
    questions.forEach((q, idx) => {
        const ans = state.answers[idx];
        const typeLabels = { choice: '选择题', true_false: '判断题', fill_blank: '填空题' };
        let resultLabel = '⚠️ 未作答';
        let resultColor = 'var(--warning)';
        if (ans?.checked) {
            resultLabel = ans.correct ? 'AC ✅' : 'WA ❌';
            resultColor = ans.correct ? 'var(--success)' : 'var(--danger)';
            if (q.type === 'fill_blank' && !ans.correct) {
                resultLabel = `${ans.matchRate || 0}%`;
            }
        }
        detailsHTML += `
            <div class="question-card" style="margin-bottom:12px;">
                <div class="q-number">#${idx + 1} · ${typeLabels[q.type] || q.type}</div>
                <div class="q-text">${escapeHtml(q.question)}</div>
                <div style="font-size:0.85rem;">
                    <div>你的答案: ${escapeHtml(ans?.userAnswer || '未作答')}</div>
                    <div>正确答案: ${escapeHtml(q.answer || '无')}</div>
                    <div style="color:${resultColor};font-weight:500;">${resultLabel}</div>
                </div>
            </div>
        `;
    });

    examContent.innerHTML = `
        <div class="results-container">
            <h3>📊 测试结果</h3>
            <div class="score ${score >= passScore ? 'pass' : 'fail'}">${score}分</div>
            <div class="results-stats">
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--success)">${correct}</div>
                    <div class="stat-label">AC ✅</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--danger)">${wrong}</div>
                    <div class="stat-label">WA ❌</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--warning)">${unanswered}</div>
                    <div class="stat-label">⚠️ 未作答</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color:var(--primary)">${total}</div>
                    <div class="stat-label">📝 总题数</div>
                </div>
            </div>
            <div style="margin-top:20px;">
                <div style="font-size:0.9rem;color:var(--gray-500);margin-bottom:12px;">
                    ${score >= passScore ? '🎉 恭喜通过！' : '💪 继续加油！'}
                </div>
                <button class="btn btn-outline" onclick="showConfig('${state.currentDocId}')">重新测试</button>
            </div>
            <details style="margin-top:20px;text-align:left;">
                <summary style="cursor:pointer;font-weight:500;padding:8px;background:var(--gray-50);border-radius:8px;">📋 查看详细答题记录</summary>
                <div style="margin-top:12px;">${detailsHTML}</div>
            </details>
        </div>
    `;
    examSection.scrollIntoView({ behavior: 'smooth' });
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
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px;
        color: white; background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000;
        animation: fadeIn 0.3s ease; max-width: 350px; font-size: 0.9rem;
    `;
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