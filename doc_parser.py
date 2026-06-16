"""
Word Document Parser for Exam Questions
Simplified, robust parsing logic.
"""

import re
from docx import Document
from typing import List, Dict, Any

def parse_docx(filepath: str) -> Dict[str, Any]:
    doc = Document(filepath)
    lines = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            lines.append(text)
    return parse_questions(lines)


def parse_questions(lines: List[str]) -> Dict[str, Any]:
    questions = {"choice": [], "true_false": [], "fill_blank": []}

    # Step 1: Identify section boundaries
    # "一、复习题1" → choice, "二、复习题2" → true_false, "三、复习题3" → fill_blank
    section_markers = {}
    cn_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6}
    for i, line in enumerate(lines):
        m = re.match(r'^([一二三四五六七八九十]+)[、.．]', line)
        if m:
            n = cn_map.get(m.group(1), 0)
            if n == 1: section_markers[i] = 'choice'
            elif n == 2: section_markers[i] = 'true_false'
            elif n >= 3: section_markers[i] = 'fill_blank'

    # Step 2: Filter out non-question lines
    skip_set = {
        '考试类型：闭卷', '题型：', '单项选择题（30题，共30分）',
        '判断题（10题，共10分）', '简答题（4题，共24分）',
        '论述题（2题，共18分）', '材料分析题（1题，共18分）',
    }

    # Step 3: Build a cleaner list with only questions and answers
    # Each "paragraph" in the Word doc is one line
    # A question starts with a number: "1.", "2.", etc.
    
    current_section = None
    raw_blocks = []  # (section_type, [lines])
    current_lines = []
    
    for i, line in enumerate(lines):
        # Check for section header
        if i in section_markers:
            if current_lines:
                raw_blocks.append((current_section, current_lines))
            current_section = section_markers[i]
            current_lines = []
            continue
        
        if line in skip_set:
            continue
        
        # Check if starts a new question
        if re.match(r'^\d+\s*[.、．）]', line):
            if current_lines:
                raw_blocks.append((current_section, current_lines))
            current_lines = [line]
        else:
            if current_lines:
                current_lines.append(line)

    if current_lines:
        raw_blocks.append((current_section, current_lines))

    # Step 4: Parse each block
    for section_type, block_lines in raw_blocks:
        parsed = _parse_single(block_lines, section_type)
        if parsed and parsed['type'] in questions:
            questions[parsed['type']].append(parsed)

    return questions


def _split_inline(line: str) -> List[tuple]:
    """Split 'A.text B.text C.text D.text' into [(A,text), (B,text), ...]"""
    parts = re.split(r'\s+(?=[A-D][.、．）])', line)
    result = []
    for part in parts:
        m = re.match(r'([A-D])[.、．）]+\s*(.*)', part.strip())
        if m:
            result.append((m.group(1), m.group(2).strip()))
    return result


def _extract_answer(text: str) -> str:
    """Extract answer from block text."""
    # Priority: "正确答案：X" or "答案：X"
    m = re.search(r'(?:正确)?答案[：:]\s*([^\n。\s]+)', text)
    if m:
        ans = m.group(1).strip()
        # If it's a single letter A-D, return it
        if re.match(r'^[A-D]$', ans):
            return ans
        # If it's √/×
        if ans in ['√', '×', '✓', '✗', '对', '错']:
            return ans
        # If it starts with a letter (for choice)
        letter = re.match(r'^([A-D])', ans)
        if letter:
            return letter.group(1)
        return ans
    
    # "答：" on its own line
    for line in text.split('\n'):
        if line.startswith('答：') or line.startswith('答:'):
            return re.sub(r'^答[：:]\s*', '', line).strip()
    
    return ''


def _parse_single(lines: List[str], section_type: str) -> Dict[str, Any]:
    """Parse a single question block."""
    if not lines:
        return None
    
    first = lines[0]
    q_text = re.sub(r'^\d+\s*[.、．）]\s*', '', first).strip()
    if not q_text:
        return None
    
    full = '\n'.join(lines)
    answer = _extract_answer(full)
    
    # Determine type
    qtype = section_type
    if qtype is None:
        # Auto-detect
        opts = any(re.match(r'\s*[A-D][.、．）]\s', l) for l in lines[1:]) or \
               any(re.match(r'\s*[A-D][.、．）]', l) for l in lines[1:4])
        if opts:
            qtype = 'choice'
        elif answer in ['√', '×', '✓', '✗', '正确', '错误', '对', '错']:
            qtype = 'true_false'
        elif any(l.startswith('答') for l in lines):
            qtype = 'fill_blank'
        else:
            qtype = 'fill_blank'
    
    if qtype == 'choice':
        options = {}
        for line in lines[1:]:
            if line.startswith(('正确答案', '答案', '答案解析', '参考教材', '见教材')):
                continue
            
            # Try "A. text" format (each on its own line)
            m = re.match(r'\s*([A-D])[.、．）]\s*(.*)', line)
            if m:
                letter = m.group(1)
                rest = m.group(2).strip()
                # Check if this line has MORE inline options
                inline = _split_inline(rest)
                if inline:
                    # First letter's text is everything before the next option starts
                    options[letter] = rest[:rest.find(f'{inline[0][0]}.')].strip()
                    for l, t in inline:
                        options[l] = t
                else:
                    options[letter] = rest
            else:
                # Try inline split on the whole line
                inline = _split_inline(line)
                if inline:
                    for l, t in inline:
                        options[l] = t
        
        if not options:
            return None
        
        # Clean answer to just letter
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
        # fill_blank
        ans = re.sub(r'^答[：:]', '', answer).strip()
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