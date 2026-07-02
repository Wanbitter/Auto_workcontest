"""
Flask Web Application for Exam Question Management
SQLite + Wrong Questions + Favorites System
"""
import os
import sys
import json
import uuid
import datetime
import sqlite3
import tempfile
import pythoncom
import win32com.client
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
from doc_parser import parse_docx, generate_exam


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and PyInstaller."""
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


def get_writable_dir():
    """Get a writable directory for runtime data (DB, uploads)."""
    if getattr(sys, 'frozen', False):
        # Use the directory where the exe is located
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = get_writable_dir()
DATA_DIR = BASE_DIR  # writable directory for DB and uploads

TEMPLATE_DIR = resource_path('templates')
STATIC_DIR = resource_path('static')

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.config['UPLOAD_FOLDER'] = os.path.join(DATA_DIR, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

ALLOWED_EXTENSIONS = {'docx', 'doc'}

DB_PATH = os.path.join(DATA_DIR, 'data.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            doc_id TEXT PRIMARY KEY,
            filename TEXT,
            filepath TEXT,
            parse_path TEXT,
            questions TEXT,
            counts TEXT
        );
        CREATE TABLE IF NOT EXISTS wrong_question_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT,
            test_index INTEGER,
            timestamp TEXT,
            question_count INTEGER,
            questions TEXT,
            completed INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS question_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT,
            question_text TEXT,
            correct INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            UNIQUE(doc_id, question_text)
        );
        CREATE TABLE IF NOT EXISTS favorite_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT,
            name TEXT,
            is_orphan INTEGER DEFAULT 0,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS favorite_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER,
            doc_id TEXT,
            question_text TEXT UNIQUE,
            question_data TEXT,
            favorited_at TEXT,
            FOREIGN KEY(collection_id) REFERENCES favorite_collections(id)
        );
    """)
    conn.commit()
    conn.close()


def convert_doc_to_docx(doc_path):
    abs_path = os.path.abspath(doc_path)
    docx_path = os.path.splitext(abs_path)[0] + '.docx'
    if os.path.exists(docx_path):
        doc_mtime = os.path.getmtime(abs_path)
        docx_mtime = os.path.getmtime(docx_path)
        if docx_mtime >= doc_mtime:
            return docx_path
    pythoncom.CoInitialize()
    try:
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False
        word.DisplayAlerts = False
        doc = word.Documents.Open(abs_path)
        doc.SaveAs(docx_path, FileFormat=16)
        doc.Close()
        word.Quit()
        return docx_path
    except Exception as e:
        raise Exception(f'无法转换 .doc 文件: {str(e)}。请确保已安装 Microsoft Word。')
    finally:
        pythoncom.CoUninitialize()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ===================== Document APIs =====================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '请选择一个文件'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': '仅支持 .doc 和 .docx 格式的文件'}), 400

    doc_id = str(uuid.uuid4())[:8]
    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)
    saved_name = f"{name}_{doc_id}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], saved_name)

    # Ensure upload directory exists BEFORE saving file
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    file.save(filepath)

    try:
        parse_path = filepath
        is_doc = ext.lower() == '.doc'
        if is_doc:
            all_docx = [f for f in os.listdir(app.config['UPLOAD_FOLDER'])
                       if f.endswith('.docx') and f.startswith(name)]
            if all_docx:
                parse_path = os.path.join(app.config['UPLOAD_FOLDER'], all_docx[0])
            else:
                try:
                    pythoncom.CoInitialize()
                    word = win32com.client.Dispatch('Word.Application')
                    word.Visible = False
                    word.DisplayAlerts = False
                    docx_path = os.path.splitext(filepath)[0] + '.docx'
                    doc = word.Documents.Open(os.path.abspath(filepath))
                    doc.SaveAs(os.path.abspath(docx_path), FileFormat=16)
                    doc.Close()
                    word.Quit()
                    parse_path = docx_path
                except Exception as conv_err:
                    print(f'[警告] .doc转换失败: {conv_err}')
                    return jsonify({'error': '无法转换 .doc 文件。请尝试以下方法：\n'
                                            '1. 在Word中另存为 .docx 格式再上传\n'
                                            '2. 或直接上传 .docx 文件'}), 400
                finally:
                    try: pythoncom.CoUninitialize()
                    except: pass

        questions = parse_docx(parse_path)
        counts = {
            "choice": len(questions["choice"]),
            "true_false": len(questions["true_false"]),
            "fill_blank": len(questions["fill_blank"]),
            "total": sum(len(v) for v in questions.values())
        }

        conn = get_db()
        conn.execute("INSERT INTO documents (doc_id, filename, filepath, parse_path, questions, counts) VALUES (?,?,?,?,?,?)",
                     (doc_id, filename, filepath, parse_path, json.dumps(questions), json.dumps(counts)))
        conn.commit()
        conn.close()

        return jsonify({"doc_id": doc_id, "filename": filename, "counts": counts, "success": True})

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'文档解析失败: {str(e)}'}), 500


@app.route('/api/documents', methods=['GET'])
def list_documents():
    conn = get_db()
    rows = conn.execute("SELECT doc_id, filename, counts FROM documents").fetchall()
    docs = []
    for r in rows:
        docs.append({"doc_id": r["doc_id"], "filename": r["filename"],
                      "counts": json.loads(r["counts"])})
    conn.close()
    return jsonify(docs)


@app.route('/api/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    conn = get_db()
    r = conn.execute("SELECT * FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
    conn.close()
    if not r:
        return jsonify({'error': '文档不存在'}), 404
    return jsonify({
        "doc_id": r["doc_id"],
        "filename": r["filename"],
        "counts": json.loads(r["counts"]),
        "questions": json.loads(r["questions"])
    })


@app.route('/api/documents/<doc_id>/delete', methods=['DELETE'])
def delete_document(doc_id):
    conn = get_db()
    r = conn.execute("SELECT * FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
    if not r:
        conn.close()
        return jsonify({'error': '文档不存在'}), 404

    # Mark associated favorite collections as orphan
    conn.execute("UPDATE favorite_collections SET is_orphan=1 WHERE doc_id=? AND is_orphan=0", (doc_id,))
    
    # Clean up files
    if os.path.exists(r["filepath"]):
        os.remove(r["filepath"])
    parse_path = r["parse_path"]
    if parse_path and parse_path != r["filepath"] and os.path.exists(parse_path):
        try: os.remove(parse_path)
        except: pass

    conn.execute("DELETE FROM documents WHERE doc_id=?", (doc_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route('/api/documents/<doc_id>/exam', methods=['POST'])
def generate_exam_api(doc_id):
    conn = get_db()
    r = conn.execute("SELECT questions FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
    conn.close()
    if not r:
        return jsonify({'error': '文档不存在'}), 404

    questions = json.loads(r["questions"])
    data = request.json
    mode = data.get('mode', 'full')
    shuffle_type = data.get('shuffle_type', 'sequential')
    counts = data.get('counts', None)
    exam = generate_exam(questions, mode, shuffle_type, counts)
    for i, q in enumerate(exam):
        q['exam_index'] = i
    return jsonify({
        "questions": exam,
        "total": len(exam),
        "counts": {
            "choice": sum(1 for q in exam if q["type"] == "choice"),
            "true_false": sum(1 for q in exam if q["type"] == "true_false"),
            "fill_blank": sum(1 for q in exam if q["type"] == "fill_blank"),
        }
    })


# ===================== Answer Check =====================

@app.route('/api/exam/check', methods=['POST'])
def check_answer():
    data = request.json
    question = data.get('question', {})
    user_answer = data.get('answer', '').strip()
    if not question:
        return jsonify({'correct': False, 'message': '缺少必要参数'}), 400
    correct_answer = question.get('answer', '')
    qtype = question.get('type', '')
    if qtype == 'choice':
        user_set = set(a.strip().upper() for a in user_answer.split(',') if a.strip())
        correct_set = set(a.strip().upper() for a in correct_answer.split(',') if a.strip())
        is_correct = user_set == correct_set
    elif qtype == 'true_false':
        is_correct = user_answer.strip() == correct_answer.strip()
    elif qtype == 'fill_blank':
        from difflib import SequenceMatcher
        ratio = SequenceMatcher(None, user_answer.lower(), correct_answer.lower()).ratio()
        return jsonify({'correct': ratio >= 0.7, 'match_rate': round(ratio * 100),
                        'correct_answer': correct_answer, 'user_answer': user_answer})
    else:
        is_correct = False
    return jsonify({'correct': is_correct, 'correct_answer': correct_answer, 'user_answer': user_answer})


# ===================== Wrong Questions =====================

@app.route('/api/documents/<doc_id>/wrong-questions', methods=['GET'])
def get_wrong_questions(doc_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, test_index, timestamp, question_count, completed FROM wrong_question_sets WHERE doc_id=? ORDER BY test_index",
        (doc_id,)).fetchall()
    result = [{"id": r["id"], "test_index": r["test_index"], "timestamp": r["timestamp"],
               "question_count": r["question_count"], "completed": bool(r["completed"])} for r in rows]
    conn.close()
    return jsonify(result)


@app.route('/api/documents/<doc_id>/wrong-questions/detail', methods=['GET'])
def get_wrong_questions_detail(doc_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, test_index, timestamp, question_count, questions, completed FROM wrong_question_sets WHERE doc_id=? ORDER BY test_index",
        (doc_id,)).fetchall()
    result = []
    for r in rows:
        result.append({
            "id": r["id"], "test_index": r["test_index"], "timestamp": r["timestamp"],
            "question_count": r["question_count"],
            "questions": json.loads(r["questions"]),
            "completed": bool(r["completed"])
        })
    conn.close()
    return jsonify(result)


@app.route('/api/documents/<doc_id>/wrong-questions/save', methods=['POST'])
def save_wrong_questions(doc_id):
    data = request.json
    wrong_questions = data.get('wrong_questions', [])
    test_index = data.get('test_index', 1)
    if not wrong_questions:
        return jsonify({'success': True, 'saved': 0})
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute(
        "INSERT INTO wrong_question_sets (doc_id, test_index, timestamp, question_count, questions, completed) VALUES (?,?,?,?,?,0)",
        (doc_id, test_index, now, len(wrong_questions), json.dumps(wrong_questions)))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'saved': len(wrong_questions), 'test_index': test_index, 'timestamp': now})


@app.route('/api/documents/<doc_id>/wrong-questions/<int:test_idx>/review', methods=['GET'])
def get_wrong_review(doc_id, test_idx):
    conn = get_db()
    r = conn.execute(
        "SELECT * FROM wrong_question_sets WHERE doc_id=? AND test_index=?",
        (doc_id, test_idx)).fetchone()
    conn.close()
    if not r:
        return jsonify({'error': '错题集不存在'}), 404
    questions = json.loads(r["questions"])
    for i, q in enumerate(questions):
        q['exam_index'] = i
        q['wrong_test_index'] = test_idx
    return jsonify({"questions": questions, "total": len(questions),
                    "test_index": test_idx, "timestamp": r["timestamp"]})


@app.route('/api/documents/<doc_id>/wrong-questions/<int:test_idx>/complete', methods=['POST'])
def mark_wrong_complete(doc_id, test_idx):
    conn = get_db()
    conn.execute("UPDATE wrong_question_sets SET completed=1 WHERE doc_id=? AND test_index=?", (doc_id, test_idx))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ===================== Question Stats =====================

@app.route('/api/documents/<doc_id>/stats/update', methods=['POST'])
def update_question_stats(doc_id):
    data = request.json
    question_text = data.get('question')
    is_correct = data.get('correct', False)
    if not question_text:
        return jsonify({'success': False}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO question_stats (doc_id, question_text, correct, total) VALUES (?,?,?,?) "
        "ON CONFLICT(doc_id, question_text) DO UPDATE SET "
        "total = total + 1, correct = correct + ?",
        (doc_id, question_text, 1 if is_correct else 0, 1, 1 if is_correct else 0))
    conn.commit()
    r = conn.execute("SELECT correct, total FROM question_stats WHERE doc_id=? AND question_text=?",
                     (doc_id, question_text)).fetchone()
    conn.close()
    return jsonify({'success': True, 'stats': {"correct": r["correct"], "total": r["total"]}})


@app.route('/api/documents/<doc_id>/stats', methods=['GET'])
def get_question_stats(doc_id):
    conn = get_db()
    rows = conn.execute("SELECT question_text, correct, total FROM question_stats WHERE doc_id=?", (doc_id,)).fetchall()
    stats = {r["question_text"]: {"correct": r["correct"], "total": r["total"]} for r in rows}
    conn.close()
    return jsonify(stats)


# ===================== Favorites =====================

@app.route('/api/documents/<doc_id>/favorites/toggle', methods=['POST'])
def toggle_favorite(doc_id):
    """Toggle a question's favorite status."""
    data = request.json
    question_text = data.get('question_text')
    question_data = data.get('question_data', {})
    
    if not question_text:
        return jsonify({'error': '缺少题目文本'}), 400

    conn = get_db()
    
    # Check if already favorited (by question_text anywhere)
    existing = conn.execute(
        "SELECT fq.id, fq.collection_id FROM favorite_questions fq "
        "JOIN favorite_collections fc ON fq.collection_id = fc.id "
        "WHERE fq.question_text=? AND fc.doc_id=?",
        (question_text, doc_id)).fetchone()

    if existing:
        # Unfavorite: remove it
        conn.execute("DELETE FROM favorite_questions WHERE id=?", (existing["id"],))
        # Check if collection is now empty
        remaining = conn.execute(
            "SELECT COUNT(*) as cnt FROM favorite_questions WHERE collection_id=?",
            (existing["collection_id"],)).fetchone()["cnt"]
        if remaining == 0:
            conn.execute("DELETE FROM favorite_collections WHERE id=?", (existing["collection_id"],))
        conn.commit()
        conn.close()
        return jsonify({"starred": False})

    # Find or create collection for this doc
    coll = conn.execute(
        "SELECT id FROM favorite_collections WHERE doc_id=? AND is_orphan=0",
        (doc_id,)).fetchone()
    
    # Get doc name for collection name
    doc_r = conn.execute("SELECT filename FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
    doc_name = doc_r["filename"] if doc_r else "未知文档"
    
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    if not coll:
        cursor = conn.execute(
            "INSERT INTO favorite_collections (doc_id, name, is_orphan, created_at) VALUES (?,?,0,?)",
            (doc_id, f"⭐ {doc_name}", now))
        coll_id = cursor.lastrowid
    else:
        coll_id = coll["id"]
        # Update name to reflect current doc name
        conn.execute("UPDATE favorite_collections SET name=? WHERE id=?", (f"⭐ {doc_name}", coll_id))

    conn.execute(
        "INSERT OR IGNORE INTO favorite_questions (collection_id, doc_id, question_text, question_data, favorited_at) VALUES (?,?,?,?,?)",
        (coll_id, doc_id, question_text, json.dumps(question_data, ensure_ascii=False), now))
    conn.commit()
    conn.close()
    return jsonify({"starred": True})


@app.route('/api/documents/<doc_id>/favorites', methods=['GET'])
def get_doc_favorites(doc_id):
    """Get favorited question texts for a document (for star display)."""
    conn = get_db()
    rows = conn.execute(
        "SELECT fq.question_text FROM favorite_questions fq "
        "JOIN favorite_collections fc ON fq.collection_id = fc.id "
        "WHERE fc.doc_id=?", (doc_id,)).fetchall()
    texts = [r["question_text"] for r in rows]
    conn.close()
    return jsonify(texts)


@app.route('/api/favorites/collections', methods=['GET'])
def get_all_favorite_collections():
    """Get all favorite collections (including orphan/wild ones)."""
    conn = get_db()
    rows = conn.execute(
        "SELECT fc.*, (SELECT COUNT(*) FROM favorite_questions WHERE collection_id=fc.id) as q_count "
        "FROM favorite_collections fc ORDER BY fc.is_orphan ASC, fc.created_at DESC"
    ).fetchall()
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "doc_id": r["doc_id"],
            "name": r["name"],
            "is_orphan": bool(r["is_orphan"]),
            "created_at": r["created_at"],
            "question_count": r["q_count"]
        })
    conn.close()
    return jsonify(result)


@app.route('/api/favorites/collections/<int:coll_id>', methods=['GET'])
def get_favorite_collection(coll_id):
    """Get all questions in a favorite collection."""
    conn = get_db()
    r = conn.execute("SELECT * FROM favorite_collections WHERE id=?", (coll_id,)).fetchone()
    if not r:
        conn.close()
        return jsonify({'error': '收藏集不存在'}), 404
    
    rows = conn.execute(
        "SELECT * FROM favorite_questions WHERE collection_id=? ORDER BY favorited_at",
        (coll_id,)).fetchall()
    questions = []
    for qr in rows:
        qdata = json.loads(qr["question_data"])
        questions.append(qdata)
    
    conn.close()
    return jsonify({
        "id": r["id"],
        "doc_id": r["doc_id"],
        "name": r["name"],
        "is_orphan": bool(r["is_orphan"]),
        "created_at": r["created_at"],
        "questions": questions,
        "total": len(questions)
    })


@app.route('/api/favorites/collections/<int:coll_id>/rename', methods=['PUT'])
def rename_favorite_collection(coll_id):
    """Rename a favorite collection (for wild collections)."""
    data = request.json
    new_name = data.get('name', '').strip()
    if not new_name:
        return jsonify({'error': '名称不能为空'}), 400
    conn = get_db()
    conn.execute("UPDATE favorite_collections SET name=? WHERE id=?", (new_name, coll_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'name': new_name})


# ===================== Delete orphan collections =====================

@app.route('/api/favorites/collections/<int:coll_id>', methods=['DELETE'])
def delete_favorite_collection(coll_id):
    conn = get_db()
    conn.execute("DELETE FROM favorite_questions WHERE collection_id=?", (coll_id,))
    conn.execute("DELETE FROM favorite_collections WHERE id=?", (coll_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ===================== Start =====================

if __name__ == '__main__':
    import webbrowser
    import threading

    init_db()

    upload_dir = os.path.join(BASE_DIR, 'uploads')
    os.makedirs(upload_dir, exist_ok=True)

    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open('http://127.0.0.1:5000')

    threading.Thread(target=open_browser, daemon=True).start()

    print('[智能题库测试系统已启动 - SQLite模式]')
    print('[请访问] http://127.0.0.1:5000')
    print(f'[数据库] {DB_PATH}')
    print(f'[上传目录] {upload_dir}')
    print()

    app.run(debug=False, host='0.0.0.0', port=5000)