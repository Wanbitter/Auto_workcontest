"""
Flask Web Application for Exam Question Management
"""
import os
import json
import uuid
import tempfile
import pythoncom
import win32com.client
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename

from doc_parser import parse_docx, generate_exam

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

ALLOWED_EXTENSIONS = {'docx', 'doc'}

# In-memory storage for parsed documents
documents_store = {}


def convert_doc_to_docx(doc_path):
    """Convert .doc to .docx using Microsoft Word COM."""
    abs_path = os.path.abspath(doc_path)
    docx_path = os.path.splitext(abs_path)[0] + '.docx'
    
    # If .docx already exists and is newer, use it
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
        doc.SaveAs(docx_path, FileFormat=16)  # 16 = wdFormatXMLDocument
        doc.Close()
        word.Quit()
        return docx_path
    except Exception as e:
        raise Exception(f'无法转换 .doc 文件: {str(e)}。请确保已安装 Microsoft Word。')
    finally:
        pythoncom.CoUninitialize()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
    
    # Generate unique ID and save
    doc_id = str(uuid.uuid4())[:8]
    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)
    saved_name = f"{name}_{doc_id}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], saved_name)
    file.save(filepath)
    
    try:
        # Convert .doc to .docx if needed
        parse_path = filepath
        is_doc = ext.lower() == '.doc'
        if is_doc:
            parse_path = convert_doc_to_docx(filepath)
        
        questions = parse_docx(parse_path)
        
        # Count questions by type
        counts = {
            "choice": len(questions["choice"]),
            "true_false": len(questions["true_false"]),
            "fill_blank": len(questions["fill_blank"]),
            "total": sum(len(v) for v in questions.values())
        }
        
        # Store the original file path (the .doc file)
        documents_store[doc_id] = {
            "filename": filename,
            "filepath": filepath,
            "parse_path": parse_path,  # the .docx used for parsing
            "questions": questions,
            "counts": counts
        }
        
        return jsonify({
            "doc_id": doc_id,
            "filename": filename,
            "counts": counts,
            "success": True
        })
    
    except Exception as e:
        # Clean up on failure
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'文档解析失败: {str(e)}'}), 500

@app.route('/api/documents', methods=['GET'])
def list_documents():
    docs = []
    for doc_id, doc in documents_store.items():
        docs.append({
            "doc_id": doc_id,
            "filename": doc["filename"],
            "counts": doc["counts"]
        })
    return jsonify(docs)

@app.route('/api/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    doc = documents_store.get(doc_id)
    if not doc:
        return jsonify({'error': '文档不存在'}), 404
    return jsonify({
        "doc_id": doc_id,
        "filename": doc["filename"],
        "counts": doc["counts"],
        "questions": doc["questions"]
    })

@app.route('/api/documents/<doc_id>/delete', methods=['DELETE'])
def delete_document(doc_id):
    doc = documents_store.pop(doc_id, None)
    if not doc:
        return jsonify({'error': '文档不存在'}), 404
    
    if os.path.exists(doc["filepath"]):
        os.remove(doc["filepath"])
    
    # Also clean up converted .docx if it exists
    parse_path = doc.get("parse_path")
    if parse_path and parse_path != doc["filepath"] and os.path.exists(parse_path):
        try:
            os.remove(parse_path)
        except:
            pass
    
    return jsonify({"success": True})

@app.route('/api/documents/<doc_id>/exam', methods=['POST'])
def generate_exam_api(doc_id):
    doc = documents_store.get(doc_id)
    if not doc:
        return jsonify({'error': '文档不存在'}), 404
    
    data = request.json
    mode = data.get('mode', 'full')
    shuffle_type = data.get('shuffle_type', 'sequential')
    counts = data.get('counts', None)
    
    questions = doc["questions"]
    exam = generate_exam(questions, mode, shuffle_type, counts)
    
    # Assign temporary IDs for the exam session
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
        # Support multi-select: answer could be "A,B,C" or "A"
        user_set = set(a.strip().upper() for a in user_answer.split(',') if a.strip())
        correct_set = set(a.strip().upper() for a in correct_answer.split(',') if a.strip())
        is_correct = user_set == correct_set
    
    elif qtype == 'true_false':
        is_correct = user_answer.strip() == correct_answer.strip()
    
    elif qtype == 'fill_blank':
        # Text matching rate
        from difflib import SequenceMatcher
        ratio = SequenceMatcher(None, user_answer.lower(), correct_answer.lower()).ratio()
        
        return jsonify({
            'correct': ratio >= 1.0,
            'match_rate': round(ratio * 100),
            'correct_answer': correct_answer,
            'user_answer': user_answer
        })
    
    else:
        is_correct = False
    
    return jsonify({
        'correct': is_correct,
        'correct_answer': correct_answer,
        'user_answer': user_answer
    })

if __name__ == '__main__':
    import webbrowser
    import threading
    
    # Determine base path (works for both source and PyInstaller exe)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    upload_dir = os.path.join(base_dir, 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    
    # Auto-open browser after a short delay
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open('http://127.0.0.1:5000')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    print('[智能题库测试系统已启动]')
    print('[请访问] http://127.0.0.1:5000')
    print(f'[上传目录] {upload_dir}')
    print()
    
    app.run(debug=False, host='0.0.0.0', port=5000)
