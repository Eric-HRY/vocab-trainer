#!/usr/bin/env python3
"""为 6 个此前无音频的词条生成整句朗读（macOS say -> m4a），并写入 audio-manifest.json"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'src/data/audio-manifest.json')
AUDIO_DIR = os.path.join(ROOT, 'public/audio')

ITEMS = {
    'w117': 'Civil Society Organisations',
    'w227': 'Universal Declaration of Human Rights',
    'w238': 'Zainichi Koreans',
    'w291': 'film tropes',
    'w371': 'Musique Concrète',
    'w533': 'carbon fourteen dating',
}

VOICE_CANDIDATES = ['Daniel (Enhanced)', 'Serena (Enhanced)', 'Daniel', 'Serena', 'Kate', 'Samantha (Enhanced)', 'Samantha', 'Alex']


def pick_voice():
    out = subprocess.run(['say', '-v', '?'], capture_output=True, text=True).stdout
    available = []
    for line in out.splitlines():
        m = re.match(r'^(.+?)\s{2,}(\w{2}_[A-Z]{2})', line)
        if m:
            available.append((m.group(1).strip(), m.group(2)))
    for cand in VOICE_CANDIDATES:
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


def main():
    voice = pick_voice()
    print('voice:', voice)
    manifest = json.load(open(MANIFEST))
    for wid, text in ITEMS.items():
        if wid in manifest:
            print('skip', wid, '已有条目')
            continue
        out_path = os.path.join(AUDIO_DIR, f'{wid}.m4a')
        aiff = out_path + '.aiff'
        r1 = subprocess.run(['say', '-v', voice, '-o', aiff, text])
        r2 = subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', aiff, out_path])
        os.remove(aiff)
        if r1.returncode == 0 and r2.returncode == 0 and os.path.getsize(out_path) > 1024:
            manifest[wid] = [f'{wid}.m4a']
            print('OK', wid, text)
        else:
            print('FAIL', wid, text)
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('manifest 条目数:', len(manifest))


if __name__ == '__main__':
    main()
