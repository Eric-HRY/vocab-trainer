#!/usr/bin/env python3
"""解析 G10_subject_vocabulary.pdf 并去重，输出待补充的新词条
列判定：2+ 空格分列；词条之间有空行分隔（无空行的是换行）；
部分页面字母间有多余空格，做去空格修复。"""
import json
import re
import sys

from pypdf import PdfReader

PDF = '/Users/erichuo/Documents/kimi/workspace/G10_subject_vocabulary.pdf'
OUT = '/Users/erichuo/Documents/kimi/workspace/g10_vocab_parsed.json'
WORDS_JSON = '/Users/erichuo/Documents/kimi/workspace/vocab-trainer/src/data/words.json'

SUBJECTS = {'Maths', 'I&S', 'Design', 'Music', 'PHE', 'Science', 'Media & Film', 'Visual Art'}

SINGLE_CHAR_RUN = re.compile(r'\b(\w) (?=\w\b)')


def despace(s: str) -> str:
    """修复 'Te s t a p r o d u c t' 这类字母间空格：连续单字母段合并"""
    # 反复把「单字母+空格+单字母」合并，直到没有变化
    prev = None
    while prev != s:
        prev = s
        s = SINGLE_CHAR_RUN.sub(r'\1', s)
    # 处理 'Vo i c e' 合并后相邻单词间仍无空格的情况难以完全还原，尽量即可
    return s


def main():
    r = PdfReader(PDF)
    entries = []
    subject = None
    cur = None  # {'word': [...], 'def': [...]}
    prev_blank = True

    def flush():
        nonlocal cur
        if cur:
            word = despace(' '.join(cur['word']).strip())
            definition = despace(' '.join(cur['def']).strip())
            if word and subject:
                entries.append({'subject': subject, 'word': word, 'definition_en': definition})
        cur = None

    for page in r.pages:
        t = page.extract_text(extraction_mode='layout') or ''
        for ln in t.split('\n'):
            s = ln.strip()
            if not s:
                prev_blank = True
                continue
            if s.isdigit():
                continue
            if s in SUBJECTS:
                flush()
                subject = s
                prev_blank = True
                continue
            if re.match(r'^Word\s+Definition$', s):
                prev_blank = True
                continue
            parts = re.split(r'\s{2,}', s)
            leading = len(ln) - len(ln.lstrip())
            if len(parts) >= 2 and prev_blank:
                flush()
                cur = {'word': [parts[0]], 'def': [' '.join(parts[1:])]}
            elif cur is not None:
                if len(parts) >= 2:
                    # 无空行分隔的双列行：词与释义都在换行
                    cur['word'].append(parts[0])
                    cur['def'].append(' '.join(parts[1:]))
                elif leading < 20:
                    cur['word'].append(parts[0])
                else:
                    cur['def'].append(parts[0])
            prev_blank = False
        flush()
        prev_blank = True

    # 去重：同学科同词（忽略大小写）已存在则跳过
    existing = json.load(open(WORDS_JSON))
    exist_keys = {(w['subject'], w['word'].lower().strip()) for w in existing}
    seen_new = set()
    new_entries, dup = [], []
    for e in entries:
        key = (e['subject'], e['word'].lower().strip())
        if key in exist_keys or key in seen_new:
            dup.append(e)
            continue
        seen_new.add(key)
        new_entries.append(e)

    from collections import Counter
    print('解析总数:', len(entries))
    print('学科分布:', dict(Counter(e['subject'] for e in entries)))
    print('新增:', len(new_entries), dict(Counter(e['subject'] for e in new_entries)))
    print('与旧库重复跳过:', len(dup))
    json.dump(entries, open(OUT, 'w'), ensure_ascii=False, indent=1)
    json.dump(new_entries, open(OUT.replace('.json', '_new.json'), 'w'), ensure_ascii=False, indent=1)
    print('\n新增样例:')
    for e in new_entries[:8]:
        print(' ', e)
    print('\n疑似乱码条目（含连续单字母修复痕迹）:')
    weird = [e for e in new_entries if re.search(r'\b\w{6,}\b', e['definition_en'].replace(' ', '')) and len(e['definition_en']) - len(e['definition_en'].replace(' ', '')) < len(e['definition_en']) // 6]
    for e in weird[:20]:
        print(' ', e['subject'], '|', e['word'], '|', e['definition_en'][:80])


if __name__ == '__main__':
    sys.exit(main())
