"""Compile manually reviewed, one-line-per-question explanations from stdin.

Each line contains summary|choice1|...|choice5. @79.1.2 reuses an existing
reviewed explanation (round 79, question 1, choice 2); it does not infer facts.
"""
import json
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
def compile_rows(exam, text):
    lines=[line for line in text.strip().splitlines() if line.strip()]
    assert len(lines)==50,(exam,len(lines))
    def resolve(value):
        match=re.fullmatch(r'@(\d+)\.(\d+)\.(\d+)',value)
        if not match:return value
        r,n,i=match.groups()
        existing=json.loads((ROOT/f'data/explanations/{r}.json').read_text(encoding='utf8'))
        return existing[n]['choices'][int(i)-1]
    data={}
    for n,line in enumerate(lines,1):
        fields=line.split('|')
        assert len(fields)==6,(exam,n,len(fields))
        data[str(n)]={'summary':fields[0],'choices':[resolve(x) for x in fields[1:]]}
    (ROOT/f'data/explanations/{exam}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
if __name__=='__main__':
    compile_rows(int(sys.argv[1]),sys.stdin.read())
