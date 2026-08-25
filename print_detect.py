import json
from pathlib import Path

d = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))
print(f'Total files: {d["total_files"]}')
print(f'Total words: {d["total_words"]}')
for cat, files in d['files'].items():
    if files:
        print(f'  {cat}: {len(files)}')