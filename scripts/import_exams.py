"""Prepare and import source PDFs without changing their contents.

Usage: bundled Python -X utf8 scripts/import_exams.py prepare
Scanned pages then need scripts/ocr-pages.ps1 (Windows PowerShell 5.1).
"""
from pathlib import Path
import json
import re
import sys
import pypdfium2 as pdfium
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'tmp' / 'pdfs'

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def sources():
    manifest = json.loads((CACHE / 'manifest.json').read_text(encoding='utf-8'))
    return {r: next(m for m in manifest if str(r) in m['name'] and m['pages'] > 1) for r in range(70, 80)}

def prepare():
    for exam, source in sources().items():
        pdf = pdfium.PdfDocument(source['path'])
        for i, page in enumerate(pdf):
            prefix = CACHE / f'{exam}-{i+1:02}'
            text_path = prefix.with_suffix('.text.json')
            if not text_path.exists():
                textpage = page.get_textpage()
                text = textpage.get_text_range()
                chars = []
                for j in range(textpage.count_chars()):
                    ch = textpage.get_text_range(j, 1)
                    x0, y0, x1, y1 = textpage.get_charbox(j)
                    if ch.strip():
                        chars.append(dict(text=ch, x=x0, y=page.get_height()-y1, w=x1-x0, h=y1-y0))
                write_json(text_path, dict(width=page.get_width(), height=page.get_height(), text=text, chars=chars))
            png_path = prefix.with_suffix('.png')
            if not png_path.exists():
                page.render(scale=2.5).to_pil().convert('RGB').save(png_path)
        print(f'{exam}: prepared {len(pdf)} pages', flush=True)

SYMBOLS = '①②③④⑤'

def page_words(exam, page):
    prefix = CACHE / f'{exam}-{page:02}'
    native = json.loads(prefix.with_suffix('.text.json').read_text(encoding='utf-8'))
    if len(native['chars']) > 100:
        return native['chars'], native['width'], native['height'], False
    ocr = json.loads(prefix.with_suffix('.ocr.json').read_text(encoding='utf-8-sig'))
    scale = ocr['width'] / native['width']
    words = [{**w, **{k: w[k]/scale for k in ('x','y','w','h')}} for line in ocr['lines'] for w in line['words']]
    return words, native['width'], native['height'], True

def make_lines(words):
    groups = []
    for w in sorted(words, key=lambda w: (w['y']+w['h'], w['x'])):
        baseline = w['y']+w['h']
        if groups and abs(baseline-groups[-1]['baseline']) < 4:
            groups[-1]['words'].append(w)
        else:
            groups.append(dict(baseline=baseline, words=[w]))
    for g in groups:
        row = sorted(g['words'], key=lambda w:w['x'])
        text = ''
        last = None
        for w in row:
            if last is not None and w['x']-last > 2.0:
                text += ' '
            text += w['text']
            last = w['x']+w['w']
        g.update(text=text, x=min(w['x'] for w in row), y=min(w['y'] for w in row), bottom=max(w['y']+w['h'] for w in row))
    return sorted(groups, key=lambda g:g['y'])

def answer_keys():
    manifest=json.loads((CACHE/'manifest.json').read_text(encoding='utf8'))
    keys={}
    for exam in range(70,80):
        items=[m for m in manifest if str(exam) in m['name'] and m['pages']==1]
        parsed=[]
        for item in items:
            text=pdfium.PdfDocument(item['path'])[0].get_textpage().get_text_range()
            rows={}
            for line in text.splitlines():
                cells=re.findall(r'(?<!\d)(\d{1,2})\s+([①②③④⑤1-5])\s+([123])(?=\s|$)',line)
                if len(cells)!=5:
                    continue
                for n,answer,points in cells:
                    rows[int(n)]={'correct_option':SYMBOLS.index(answer)+1 if answer in SYMBOLS else int(answer),'points':int(points)}
            assert sorted(rows)==list(range(1,51)), (exam,'answer count',len(rows))
            assert sum(r['points'] for r in rows.values())==100,(exam,'points')
            parsed.append(rows)
        assert all(k==parsed[0] for k in parsed),(exam,'conflicting answer sheets')
        keys[exam]=parsed[0]
    write_json(CACHE/'answer-keys.json',keys)
    return keys

def extract():
    keys=answer_keys()
    geometry=json.loads((ROOT/'scripts/exam_geometry.json').read_text(encoding='utf8'))
    all_questions={}
    issues=[]
    for exam in range(70,80):
        questions=[]
        pdf=pdfium.PdfDocument(sources()[exam]['path'])
        for page in range(1,13):
            words,width,height,scanned=page_words(exam,page)
            textpage=pdf[page-1].get_textpage()
            mid=width/2
            for left,right in [(40,mid-8),(mid+8,width-40)]:
                col=[w for w in words if left<=w['x']<right and w['y']>70 and w['y']<height-45]
                lines=make_lines(col)
                starts=[]
                for line in lines:
                    m=re.match(r'^((?:\d\s*){1,2})\.\s*',line['text'])
                    if not m and scanned:
                        m=re.match(r'^(\d{1,2})\s+(?=[(가나다밑다교])',line['text'])
                    n=int(re.sub(r'\s','',m[1])) if m else 0
                    if m and line['x']<left+14 and 1<=n<=50:
                        starts.append((n,line))
                for j,(n,line) in enumerate(starts):
                    top=line['y']-2
                    bottom=starts[j+1][1]['y']-15 if j+1<len(starts) else height-53
                    section=[l for l in lines if top<=l['y']<bottom]
                    header=[]
                    for l in section:
                        header.append(l)
                        if '?' in l['text'] or re.search(r'것은2|\[[123]\s*점\]',l['text']):
                            following=section[len(header):len(header)+1]
                            if following and re.fullmatch(r'\[[^\]]{1,8}\]',following[0]['text']):header.extend(following)
                            break
                        if len(header)==3:break
                    title=' '.join(l['text'] for l in header)
                    title=re.sub(r'^(?:\d\s*){1,2}[. ]\s*','',title)
                    title=re.sub(r'\[[^\]]{1,8}\]','',title).strip()
                    title=re.sub(r'것은2\s*$', '것은?', title)
                    title=re.sub(r'\[[^\]〕]{1,8}〕','',title).strip()
                    if not scanned:
                        title=textpage.get_text_bounded(left,height-max(l['bottom'] for l in header)-1,right,height-top+1)
                        title=re.sub(r'^\s*\d+\s*\.\s*','',title)
                        title=re.sub(r'\[[123]\s*점\]','',title).replace('\r',' ').replace('\n',' ').strip()
                    material_top=max(l['bottom'] for l in header)+7
                    sw=[w for w in col if w['y']>material_top and w['y']<bottom]
                    markers=[]
                    for w in sw:
                        if not scanned and w['text'] in SYMBOLS:
                            markers.append({**w,'number':SYMBOLS.index(w['text'])+1})
                        elif scanned and re.match(r'^[①-⑤㉠-㉻ⓐ-ⓩ⑴-⑸]',w['text']) and w['x']<left+30:
                            markers.append({**w,'number':0})
                    markers.sort(key=lambda w:(round(w['y']/12),w['x']))
                    if not scanned:
                        # Last complete 1..5 sequence avoids numbered examples in source material.
                        groups=[markers[k:k+5] for k in range(len(markers)-4) if [x['number'] for x in markers[k:k+5]]==[1,2,3,4,5]]
                        markers=groups[-1] if groups else markers
                    else:
                        candidate_lines=[l for l in section if l['y']>material_top and l['x']<left+31 and len(l['text'])>5]
                        tail=candidate_lines[-5:]
                        if len(tail)==5 and all(15 < tail[k+1]['y']-tail[k]['y'] < 45 for k in range(4)):
                            markers=[dict(x=l['x'],y=l['y'],w=10,h=l['bottom']-l['y'],text=l['text'],number=0) for l in tail]
                        elif len(markers)>=5:
                            markers=markers[-5:]
                        for k,w in enumerate(markers):w['number']=k+1
                    override=geometry.get(f'{exam}-{n}',{})
                    if override.get('photo_rows'):
                        markers=[dict(x=x,y=row[0],w=10,h=12,text=SYMBOLS[k],number=k+1) for k,(row,x) in enumerate((row,x) for row in override['photo_rows'] for x in row[1:])]
                    elif override.get('horizontal'):
                        markers=[dict(x=left+14+k*60,y=override['horizontal'],w=10,h=12,text=SYMBOLS[k],number=k+1) for k in range(5)]
                    elif override.get('text_rows'):
                        ys=override['text_rows']
                        if override.get('combination'):
                            markers=[dict(x=left+14+(k%2)*160,y=ys[k//2],w=10,h=12,text=SYMBOLS[k],number=k+1) for k in range(5)]
                        else:
                            markers=[dict(x=left+14,y=y,w=10,h=12,text=SYMBOLS[k],number=k+1) for k,y in enumerate(ys)]
                    if len(markers)!=5:
                        issues.append([exam,n,'markers',len(markers)])
                    options=[]
                    is_photo=len(markers)==5 and (max(w['x'] for w in markers)-min(w['x'] for w in markers)>40)
                    if len(markers)==5 and not is_photo:
                        for k,w in enumerate(markers):
                            end=markers[k+1]['y']-2 if k<4 else bottom
                            rows=[l['text'] for l in section if l['y']>=w['y']-4 and l['y']<end]
                            txt=re.sub(r'^(?:[①-⑤㉠-㉻ⓐ-ⓩ⑴-⑸]|\([0-9기가]\))\s*','', ' '.join(rows)).strip()
                            if not scanned:
                                txt=textpage.get_text_bounded(w['x']-1,height-end,right,height-w['y']+4)
                                txt=re.sub(r'^[①-⑤]\s*','',txt).replace('\r',' ').replace('\n',' ').strip()
                            options.append(dict(number=k+1,text=txt,image=None))
                    if override.get('labels'):
                        options=[dict(number=k+1,text=t,image=None) for k,t in enumerate(override['labels'])]
                        is_photo=False
                    if override.get('combination'):
                        options=[dict(number=k+1,text=t,image=None) for k,t in enumerate(['(가) - (나) - (다)','(가) - (다) - (나)','(나) - (가) - (다)','(나) - (다) - (가)','(다) - (가) - (나)'])]
                        is_photo=False
                    material_bottom=min((w['y'] for w in markers),default=bottom)-7
                    q=dict(exam_round=exam,exam_level='심화',question_number=n,source_page=page,question_text=title,options=options,
                           **keys[exam].get(n,{}),_scanned=scanned,_photo=is_photo,
                           _bounds=[left,top,right,bottom],_material=[left+2,material_top,right,material_bottom],_markers=markers,
                           _source_text='\n'.join(l['text'] for l in section) if scanned else textpage.get_text_bounded(left,height-bottom,right,height-top))
                    questions.append(q)
        nums=[q['question_number'] for q in questions]
        if sorted(nums)!=list(range(1,51)):
            issues.append([exam,'question numbers',sorted(nums)])
        all_questions[exam]=sorted(questions,key=lambda q:q['question_number'])
        print(exam,len(questions),'questions',flush=True)
    write_json(CACHE/'extracted.json',all_questions)
    write_json(CACHE/'issues.json',issues)
    print('ISSUES',json.dumps(issues,ensure_ascii=False))

def crop_asset(image, bounds, path, scale):
    left,top,right,bottom=bounds
    if right<=left or bottom<=top:
        raise ValueError((str(path),bounds))
    crop=image.crop((round(left*scale),round(top*scale),round(right*scale),round(bottom*scale))).convert('RGB')
    mask=ImageChops.difference(crop,Image.new('RGB',crop.size,'white')).convert('L').point(lambda x:255 if x>35 else 0)
    box=mask.getbbox()
    if box:
        x0,y0,x1,y1=box
        crop=crop.crop((max(0,x0-6),max(0,y0-6),min(crop.width,x1+6),min(crop.height,y1+6)))
    path.parent.mkdir(parents=True,exist_ok=True)
    crop.save(path,'WEBP',quality=91,method=6)
    return str(path.relative_to(ROOT)).replace('\\','/')

def export():
    data=json.loads((CACHE/'extracted.json').read_text(encoding='utf8'))
    geometry=json.loads((ROOT/'scripts/exam_geometry.json').read_text(encoding='utf8'))
    for exam,questions in data.items():
        out=[]
        images={}
        for q in questions:
            n=q['question_number'];page=q['source_page']
            if page not in images:images[page]=Image.open(CACHE/f'{exam}-{page:02}.png')
            im=images[page];scale=im.width/728.504
            folder=ROOT/'assets/exams'/exam
            public={k:v for k,v in q.items() if not k.startswith('_')}
            title=q['question_text']
            replacements={'옳은것은':'옳은 것은','적절한것은':'적절한 것은','볼수':'볼 수','시가에':"시기'에",'적절하지 않읕':'적절하지 않은','적절하지 않음':'적절하지 않은','검색장':'검색창','디음':'다음','운두에':"운동'에",'이 전부 이후':"이 전투' 이후",'일기가작성된':'일기가 작성된'}
            for a,b in replacements.items():title=title.replace(a,b)
            for noun in ['이 나라','이 국가','이 왕','이 탑','임금','그','신문','이곳']:
                title=title.replace("'"+noun+'의',"'"+noun+"'의").replace("'"+noun+'에',"'"+noun+"'에").replace("'"+noun+'으로',"'"+noun+"'으로")
            title=title.replace('(가에','(가)에').replace("자건'", "'사건'")
            title=title.replace('발표한정부','발표한 정부').replace('않은것은','않은 것은').replace('사실로옳은','사실로 옳은')
            override=geometry.get(f'{exam}-{n}',{})
            public['question_text']=override.get('title',title)
            public['image']=crop_asset(im,q['_bounds'],folder/f'q{n:02}.webp',scale)
            public['material_image']=crop_asset(im,q['_material'],folder/f'material{n:02}.webp',scale)
            if override.get('material_regions'):
                # Shared stimuli may precede the question heading (72:47–48).
                pieces=[]
                for bounds in override['material_regions']:
                    pieces.append(im.crop(tuple(round(v*scale) for v in bounds)).convert('RGB'))
                joined=Image.new('RGB',(max(p.width for p in pieces),sum(p.height for p in pieces)+16*(len(pieces)-1)),'white')
                y=0
                for piece in pieces:
                    joined.paste(piece,(0,y));y+=piece.height+16
                joined.save(ROOT/public['material_image'],'WEBP',quality=91,method=6)
            markers=q['_markers']
            if override.get('labels'):
                public['options']=[dict(number=k+1,text=t,image=None) for k,t in enumerate(override['labels'])]
            elif q['_photo'] or (q['_scanned'] and not override.get('combination')):
                options=[]
                left,top,right,bottom=q['_bounds']
                row_ys=sorted(set(round(w['y']) for w in markers))
                row_ys=[y for i,y in enumerate(row_ys) if i==0 or y-row_ys[i-1]>12]
                for k,w in enumerate(markers):
                    row=min(row_ys,key=lambda y:abs(y-w['y']))
                    row_markers=sorted([x for x in markers if abs(x['y']-row)<12],key=lambda x:x['x'])
                    pos=row_markers.index(w)
                    x0=w['x']-3
                    x1=row_markers[pos+1]['x']-4 if pos+1<len(row_markers) else right-1
                    y0=w['y']-4
                    y1=next((y-5 for y in row_ys if y>row+12),bottom-2)
                    text=q['options'][k]['text'] if len(q['options'])==5 else f'{k+1}번 원문 보기'
                    asset=crop_asset(im,[x0,y0,x1,y1],folder/f'option{n:02}_{k+1}.webp',scale)
                    with Image.open(ROOT/asset) as choice_image:
                        image_width=round(min(100,choice_image.width/((right-left)*scale)*100),2)
                    options.append(dict(number=k+1,text=text,image=asset,source_image=True,image_width=image_width))
                public['options']=options
            assert len(public['options'])==5,(exam,n,'option count')
            out.append(public)
        write_json(ROOT/'data/exams'/f'{exam}.json',dict(round=int(exam),level='심화',questions=out))
        print(exam,'exported',len(out),flush=True)

if __name__ == '__main__':
    if sys.argv[1:] == ['prepare']:
        prepare()
    elif sys.argv[1:] == ['extract']:
        extract()
    elif sys.argv[1:] == ['export']:
        export()
