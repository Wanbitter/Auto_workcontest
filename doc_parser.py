"""
Word Document Parser for Exam Questions
Matched to the MaoGai exam document format.
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

    # Map section headers to types
    section_map = {}
    for i, line in enumerate(lines):
        m = re.match(r'^([一二三四五六七八九十]+)[、.．]', line)
        if m:
            num_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6}
            n = num_map.get(m.group(1), 0)
            if n == 1: section_map[i] = 'choice'
            elif n == 2: section_map[i] = 'true_false'
            elif n >= 3: section_map[i] = 'fill_blank'

    skip_lines = {
        '考试类型：闭卷', '题型：', '单项选择题（30题，共30分）',
        '判断题（10题，共10分）', '简答题（4题，共24分）',
        '论述题（2题，共18分）', '材料分析题（1题，共18分）',
    }

    # Extract question blocks
    q_blocks = []
    current_block = []
    current_type = None

    for i, line in enumerate(lines):
        if i in section_map:
            current_type = section_map[i]
            current_block = []
            continue
        if line in skip_lines:
            continue

        q_match = re.match(r'^\d+\s*[.、．）]', line)
        if q_match:
            if current_block:
                q_blocks.append((current_block, current_type))
            current_block = [line]
        else:
            if current_block:
                current_block.append(line)

    if current_block:
        q_blocks.append((current_block, current_type))

    # Parse each block
    for block, inferred_type in q_blocks:
        parsed = _parse_block(block, inferred_type)
        if parsed and parsed['type'] in questions:
            questions[parsed['type']].append(parsed)

    return questions


def _split_inline_options(line: str) -> List[tuple]:
    """Split a line like 'A.xxx B.yyy C.zzz D.www' into individual options."""
    # Match patterns like A.xxx or A.xxx where xxx may contain Chinese/parentheses
    parts = re.split(r'\s+(?=[A-D][.、．）])', line)
    result = []
    for part in parts:
        m = re.match(r'([A-D])[.、．）]\s*(.*)', part.strip())
        if m:
            result.append((m.group(1), m.group(2).strip()))
    return result


def _parse_block(lines: List[str], inferred_type: str) -> Dict[str, Any]:
    if not lines:
        return None

    first_line = lines[0]
    q_text = re.sub(r'^\d+\s*[.、．）]\s*', '', first_line).strip()
    if not q_text:
        return None

    full_text = '\n'.join(lines)

    # Extract answer
    answer = ''
    ans_match = re.search(r'(?:正确)?答案[：:]\s*([^\n。]+)', full_text)
    if ans_match:
        answer = ans_match.group(1).strip()
        # Clean trailing spaces/tabs
        answer = re.sub(r'\s+$', '', answer)

    # Determine type
    qtype = inferred_type
    if qtype is None:
        has_options = any(re.match(r'\s*[A-D][.、．）]\s', line) for line in lines[1:]) or \
                      any('A.' in line for line in lines[1:4])
        if has_options:
            qtype = 'choice'
        elif answer in ['√', '×', '正确', '错误', '对', '错']:
            qtype = 'true_false'
        elif any(line.startswith('答') for line in lines):
            qtype = 'fill_blank'
        else:
            qtype = 'fill_blank'

    if qtype == 'choice':
        # Parse options - try each line first for single options, then inline
        options = {}
        for line in lines[1:]:
            # Skip answer/analysis lines
            if line.startswith('正确答案') or line.startswith('答案') or line.startswith('答案解析'):
                continue
            # Try individual A. B. C. D. format
            opt_match = re.match(r'\s*([A-D])[.、．）]\s*(.*)', line)
            if opt_match:
                letter = opt_match.group(1)
                text = opt_match.group(2).strip()
                # Check if text contains more options (inline format)
                inline_parts = _split_inline_options(text)
                if inline_parts:
                    for l, t in inline_parts:
                        options[l] = t
                else:
                    options[letter] = text
            else:
                # Try inline at beginning of line
                inline_parts = _split_inline_options(line)
                if inline_parts:
                    for l, t in inline_parts:
                        options[l] = t

        if not options:
            return None

        return {
            "type": "choice",
            "question": q_text,
            "options": options,
            "answer": answer.strip()
        }

    elif qtype == 'true_false':
        if answer in ['√', '对']: clean = '正确'
        elif answer in ['×', '错']: clean = '错误'
        else: clean = answer
        return {"type": "true_false", "question": q_text, "answer": clean}

    else:  # fill_blank
        # Find answer starting with "答："
        ans_content = ''
        answer_found = False
        for line in lines:
            if line.startswith('答：') or line.startswith('答:'):
                ans_content = re.sub(r'^答[：:]\s*', '', line).strip()
                answer_found = True
                break
        
        # If not found, try "答案" label
        if not answer_found and answer:
            ans_content = re.sub(r'^答[：:]', '', answer).strip()
        
        return {"type": "fill_blank", "question": q_text, "answer": ans_content}


def generate_exam(questions: Dict[str, List], mode: str,
                  shuffle_type: str = "sequential",
                  counts: Dict[str, int] = None) -> List[Dict]:
    import random
    result = []
    type_order = ["choice", "true_false", "fill_blank"]
    for qtype in type_order:
        pool = list(questions.get(qtype, []))
        if not pool:
            continue
        if mode == "partial" and counts:
            limit = counts.get(qtype, 0)
            if limit <= 0:
                continue
            pool = pool[:limit] if limit < len(pool) else pool
        if shuffle_type == "shuffled":
            random.shuffle(pool)
        result.extend(pool)
    return result