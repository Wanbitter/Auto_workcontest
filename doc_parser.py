"""
Word Document Parser - classifies by answer text, not section headers.
"""
import re
from docx import Document
from typing import List, Dict, Any

def parse_docx(filepath: str) -> Dict[str, Any]:
    """Parse a .docx file and extract questions."""
    doc = Document(filepath)
    lines = []
    for para in doc.paragraphs:
        for sub_line in para.text.split('\n'):
            sub = sub_line.strip()
            if sub:
                lines.append(sub)
    return parse_questions(lines)


def _extract_answer(text: str) -> str:
    """Extract answer text aggressively."""
    # Try all possible formats
    m = re.search(r'(?:正确)?答案[：:]\s*([^\n。\s]+)', text)
    if m:
        ans = m.group(1).strip()
        # Normalize: check if it's A-D letter, or checkmark/cross
        letter = re.match(r'^([A-D])', ans.upper())
        if letter:
            return letter.group(1)
        if ans in ['√', '×', '✓', '✗', '对', '错', '正确', '错误']:
            return '正确' if ans in ['√', '✓', '对'] else '错误'
        return ans
    return ''


def _classify(answer: str, lines: List[str]) -> str:
    """Determine question type from answer text and content."""
    # 1. Has options A/B/C/D → choice
    has_opts = any(re.match(r'\s*[A-D][.、．）]\s', l) for l in lines[1:]) or \
               any('A.' in l for l in lines[1:4])
    if has_opts and not answer:
        return 'choice'
    
    # 2. Answer is A/B/C/D letter → choice
    if re.match(r'^[A-D]$', answer):
        return 'choice'
    
    # 3. Answer is √/×/✓/✗/正确/错误/对/错 → true_false  
    if answer in ['√', '×', '✓', '✗', '正确', '错误', '对', '错']:
        return 'true_false'
    
    # 4. Has 答：line → fill_blank
    if any(l.startswith('答') for l in lines):
        return 'fill_blank'
    
    # 5. Has options → choice (even without answer)
    if has_opts:
        return 'choice'
    
    # 6. Default → fill_blank
    return 'fill_blank'


def parse_questions(lines: List[str]) -> Dict[str, Any]:
    questions = {"choice": [], "true_false": [], "fill_blank": []}
    
    # Filter out header lines
    skip_set = {
        '考试类型：闭卷', '题型：', '单项选择题（30题，共30分）',
        '判断题（10题，共10分）', '简答题（4题，共24分）',
        '论述题（2题，共18分）', '材料分析题（1题，共18分）',
    }
    
    # Build raw question blocks (ignore section headers entirely)
    raw_blocks = []
    current_lines = []
    
    for line in lines:
        if line in skip_set:
            continue
        if re.match(r'^[一二三四五六七八九十]+[、.．]', line):
            continue  # Skip section headers
        if re.match(r'^\d+\s*[.、．）]', line):
            if current_lines:
                raw_blocks.append(current_lines)
            current_lines = [line]
        else:
            if current_lines:
                current_lines.append(line)
    
    if current_lines:
        raw_blocks.append(current_lines)
    
    # Parse each block, classify by answer
    for block_lines in raw_blocks:
        parsed = _parse_single(block_lines)
        if parsed and parsed['type'] in questions:
            questions[parsed['type']].append(parsed)
    
    return questions


def _split_inline(line: str) -> List[tuple]:
    parts = re.split(r'\s+(?=[A-D][.、．）])', line)
    result = []
    for part in parts:
        m = re.match(r'([A-D])[.、．）]+\s*(.*)', part.strip())
        if m:
            result.append((m.group(1), m.group(2).strip()))
    return result


def _parse_single(lines: List[str]) -> Dict[str, Any]:
    if not lines:
        return None
    
    first = lines[0]
    q_text = re.sub(r'^\d+\s*[.、．）]\s*', '', first).strip()
    if not q_text:
        return None
    
    full = '\n'.join(lines)
    answer = _extract_answer(full)
    qtype = _classify(answer, lines)
    
    if qtype == 'choice':
        options = {}
        for line in lines[1:]:
            if line.startswith(('正确答案', '答案', '答案解析', '参考教材', '见教材')):
                continue
            m = re.match(r'\s*([A-D])[.、．）]\s*(.*)', line)
            if m:
                letter, rest = m.group(1), m.group(2).strip()
                inline = _split_inline(rest)
                if inline:
                    cutoff = rest.find(f'{inline[0][0]}.')
                    if cutoff > 0:
                        options[letter] = rest[:cutoff].strip()
                    else:
                        options[letter] = rest
                    for l, t in inline:
                        options[l] = t
                else:
                    options[letter] = rest
            else:
                inline = _split_inline(line)
                if inline:
                    for l, t in inline:
                        options[l] = t
        
        if not options:
            return None
        
        ans_clean = answer.strip().upper()
        m = re.match(r'^([A-D])', ans_clean)
        if m:
            ans_clean = m.group(1)
        
        return {"type": "choice", "question": q_text, "options": options, "answer": ans_clean}
    
    elif qtype == 'true_false':
        if answer in ['√', '✓', '对']: clean = '正确'
        elif answer in ['×', '✗', '错']: clean = '错误'
        else: clean = answer
        return {"type": "true_false", "question": q_text, "answer": clean}
    
    else:
        # fill_blank - get answer from 答： line
        ans = ''
        for line in lines:
            s = line.strip()
            if s.startswith('答：') or s.startswith('答:'):
                ans = re.sub(r'^答[：:]\s*', '', s).strip()
                break
        return {"type": "fill_blank", "question": q_text, "answer": ans}


def generate_exam(questions: Dict[str, List], mode: str,
                  shuffle_type: str = "sequential",
                  counts: Dict[str, int] = None) -> List[Dict]:
    import random
    result = []
    for qtype in ["choice", "true_false", "fill_blank"]:
        pool = list(questions.get(qtype, []))
        if not pool:
            continue
        if mode == "partial" and counts:
            limit = counts.get(qtype, 0)
            if limit <= 0:
                continue
            pool = pool[:limit]
        if shuffle_type == "shuffled":
            random.shuffle(pool)
        result.extend(pool)
    return result