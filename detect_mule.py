import json
from graphify.detect import detect
from pathlib import Path

result = detect(Path('mule-detection'))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
print(f'Detected {result["total_files"]} files')