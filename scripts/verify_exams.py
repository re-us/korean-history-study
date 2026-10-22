"""Validate every imported question against the supplied official answer PDFs.

Run after import with the same local tmp/pdfs/manifest.json used by the importer.
No source PDFs or personal paths are published.
"""
import json
from pathlib import Path
from PIL import Image
from import_exams import ROOT, answer_keys

keys = answer_keys()
count = 0
assets = set()
for exam in range(70, 80):
    data = json.loads((ROOT / f'data/exams/{exam}.json').read_text(encoding='utf8'))
    details = json.loads((ROOT / f'data/explanations/{exam}.json').read_text(encoding='utf8'))
    questions = data['questions']
    assert data['round'] == exam
    assert [q['question_number'] for q in questions] == list(range(1, 51))
    assert set(details) == {str(n) for n in range(1, 51)}
    assert sum(q['points'] for q in questions) == 100
    for q in questions:
        n = q['question_number']
        assert all(q[k] == v for k, v in keys[exam][n].items()), (exam, n, 'official answer/points')
        assert q['exam_round'] == exam and q['exam_level'] == '심화'
        assert 1 <= q['source_page'] <= 12
        assert q['question_text'].endswith('?'), (exam, n, 'question heading')
        assert len(q['options']) == 5
        assert [o['number'] for o in q['options']] == [1, 2, 3, 4, 5]
        for option in q['options']:
            assert option['text'] or option['image'], (exam, n, 'empty option')
            if option.get('source_image'):
                assert 0 < option['image_width'] <= 100
        paths = [q['image'], q['material_image']] + [o['image'] for o in q['options'] if o['image']]
        for path in paths:
            assert path.startswith(f'assets/exams/{exam}/')
            with Image.open(ROOT / path) as im:
                im.verify()
            assets.add(path)
        with Image.open(ROOT / q['material_image']) as im:
            assert im.width >= 150 and im.height >= 70, (exam, n, 'missing material', im.size)
        explanation = details[str(n)]
        assert len(explanation['summary']) >= 25
        assert len(explanation['choices']) == 5
        for text in [explanation['summary'], *explanation['choices']]:
            assert isinstance(text, str) and len(text) >= 10
            assert not any(s in text for s in ['검토 중', '검토하고', 'TODO', '@79.']), (exam, n, 'unfinished explanation')
        count += 1
    print(f'{exam}: 50 questions, 100 points, official key and all explanations/assets verified')
print(f'PASS: {count} questions, {count*5} choice explanations, {len(assets)} valid images')
