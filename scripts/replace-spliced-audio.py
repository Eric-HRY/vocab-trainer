#!/usr/bin/env python3
"""把分词拼接的词条音频（{id}_1.mp3, {id}_2.mp3 ...）替换为整句自然读音。

策略：
1. 先试有道整短语接口（type=1 英式）：https://dict.youdao.com/dictvoice?audio=<url编码>&type=1
   校验：>2KB 且前 3 字节为 ID3 或首字节 0xFF（不是 JSON 错误体）
2. 失败则用 macOS `say` 生成整句朗读（优先 en_GB 嗓音），afconvert 转 AAC .m4a
3. 更新 audio-manifest.json 为单文件条目，删除旧的 _N 分词文件
脚本可断点重跑：已替换成单文件的条目自动跳过。
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'src/data/audio-manifest.json')
WORDS_JSON = os.path.join(ROOT, 'src/data/words.json')
AUDIO_DIR = os.path.join(ROOT, 'public/audio')

SAY_VOICE_CANDIDATES = ['Daniel (Enhanced)', 'Serena (Enhanced)', 'Daniel', 'Serena', 'Kate', 'Samantha (Enhanced)', 'Samantha', 'Alex']


def pick_say_voice() -> str | None:
    try:
        out = subprocess.run(['say', '-v', '?'], capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return None
    available = []
    for line in out.splitlines():
        name = line.split()[0] if line.split() else ''
        m = re.match(r'^(.+?)\s{2,}(\w{2}_[A-Z]{2})', line)
        if m:
            available.append((m.group(1).strip(), m.group(2)))
    for cand in SAY_VOICE_CANDIDATES:
        for name, locale in available:
            if name == cand and locale.startswith('en'):
                return name
    for name, locale in available:
        if locale.startswith('en_GB'):
            return name
    for name, locale in available:
        if locale.startswith('en'):
            return name
    return None


def valid_mp3(data: bytes) -> bool:
    return len(data) > 2048 and (data[:3] == b'ID3' or data[0] == 0xFF) and data[0:1] != b'{'


def fetch_youdao(text: str) -> bytes | None:
    url = 'https://dict.youdao.com/dictvoice?audio=' + urllib.parse.quote(text) + '&type=1'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
    except Exception:
        return None
    return data if valid_mp3(data) else None


def say_to_m4a(text: str, voice: str, out_path: str) -> bool:
    aiff = out_path + '.aiff'
    try:
        r1 = subprocess.run(['say', '-v', voice, '-o', aiff, text], timeout=60)
        if r1.returncode != 0 or not os.path.exists(aiff):
            return False
        r2 = subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', aiff, out_path], timeout=60)
        return r2.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 1024
    except Exception:
        return False
    finally:
        if os.path.exists(aiff):
            os.remove(aiff)


def main() -> None:
    manifest = json.load(open(MANIFEST))
    words = json.load(open(WORDS_JSON))
    word_by_id = {w['id']: w for w in words}

    targets = {k: v for k, v in manifest.items() if isinstance(v, list) and len(v) > 1}
    print(f'待替换拼接条目: {len(targets)}')
    if not targets:
        return

    voice = pick_say_voice()
    print(f'say 备用嗓音: {voice}')

    done_youdao, done_say, failed = 0, 0, []
    for i, (wid, files) in enumerate(sorted(targets.items()), 1):
        w = word_by_id.get(wid)
        if not w:
            failed.append((wid, '词条不存在'))
            continue
        phrase = re.sub(r'[（(].*?[)）]', '', w['word']).strip()

        # 1) 有道整短语
        data = fetch_youdao(phrase)
        if data:
            out_name = f'{wid}.mp3'
            with open(os.path.join(AUDIO_DIR, out_name), 'wb') as f:
                f.write(data)
            done_youdao += 1
        else:
            # 2) say 兜底
            out_name = f'{wid}.m4a'
            if voice and say_to_m4a(phrase, voice, os.path.join(AUDIO_DIR, out_name)):
                done_say += 1
            else:
                failed.append((wid, phrase))
                print(f'[{i}/{len(targets)}] FAIL {wid} {phrase}', flush=True)
                time.sleep(1.0)
                continue

        # 更新清单、删旧分词文件
        manifest[wid] = [out_name]
        for old in files:
            p = os.path.join(AUDIO_DIR, old)
            if os.path.exists(p):
                os.remove(p)
        print(f'[{i}/{len(targets)}] OK {wid} -> {out_name} ({phrase})', flush=True)
        with open(MANIFEST, 'w') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write('\n')
        time.sleep(1.0)

    print(f'\n完成: 有道 {done_youdao}, say {done_say}, 失败 {len(failed)}')
    for wid, info in failed:
        print('  FAILED', wid, info)


if __name__ == '__main__':
    sys.exit(main())
