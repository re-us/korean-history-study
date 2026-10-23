"""Compare published material/choice crops with locally supplied PDF page renders.

Requires the import cache, not a network connection. This detects changed/missing
pixels and crop regressions; it cannot prove that the selected crop is semantically
the right region. Shared source regions are checked using reviewed geometry.
"""
import json
from PIL import Image, ImageChops, ImageStat
from import_exams import ROOT, CACHE

raw=json.loads((CACHE/'extracted.json').read_text(encoding='utf8'))
geometry=json.loads((ROOT/'scripts/exam_geometry.json').read_text(encoding='utf8'))

def crop(image,bounds,scale):
    result=image.crop(tuple(round(v*scale) for v in bounds)).convert('RGB')
    mask=ImageChops.difference(result,Image.new('RGB',result.size,'white')).convert('L').point(lambda x:255 if x>35 else 0)
    box=mask.getbbox()
    if box:
        x0,y0,x1,y1=box
        result=result.crop((max(0,x0-6),max(0,y0-6),min(result.width,x1+6),min(result.height,y1+6)))
    return result

issues=[];checked=0
def compare(expected,path):
    global checked
    with Image.open(ROOT/path) as actual:
        actual=actual.convert('RGB')
        delta=max(abs(a-b) for a,b in zip(actual.size,expected.size))
        if delta>2:issues.append([path,'dimensions',actual.size,expected.size]);return
        if actual.size!=expected.size:expected=expected.resize(actual.size)
        error=sum(ImageStat.Stat(ImageChops.difference(expected,actual)).mean)/3
        if error>12:issues.append([path,'pixel difference',round(error,2)])
    checked+=1

for r in range(57,80):
    data=json.loads((ROOT/f'data/exams/{r}.json').read_text(encoding='utf8'))
    pages={}
    for q,source in zip(data['questions'],raw[str(r)]):
        n=q['question_number'];page=q['source_page'];override=geometry.get(f'{r}-{n}',{})
        if page not in pages:pages[page]=Image.open(CACHE/f'{r}-{page:02}.png')
        image=pages[page];meta=json.loads((CACHE/f'{r}-{page:02}.text.json').read_text(encoding='utf8'))
        scale=image.width/(meta['width'] if r<70 else 728.504)
        compare(crop(image,source['_bounds'],scale),q['image'])
        regions=override.get('material_regions')
        if regions:
            pieces=[image.crop(tuple(round(v*scale) for v in bounds)).convert('RGB') for bounds in regions]
            expected=Image.new('RGB',(max(p.width for p in pieces),sum(p.height for p in pieces)+16*(len(pieces)-1)),'white');y=0
            for piece in pieces:expected.paste(piece,(0,y));y+=piece.height+16
        else:expected=crop(image,source['_material'],scale)
        compare(expected,q['material_image'])
        if r>=70:continue  # Earlier choice exports retain their original crop policy.
        markers=source['_markers'];left,top,right,bottom=source['_bounds']
        ys=sorted(set(round(w['y']) for w in markers));ys=[y for i,y in enumerate(ys) if i==0 or y-ys[i-1]>12]
        for k,option in enumerate(q['options']):
            if not option.get('source_image'):continue
            w=markers[k];row=min(ys,key=lambda y:abs(y-w['y']))
            peers=sorted([x for x in markers if abs(x['y']-row)<12],key=lambda x:x['x']);pos=peers.index(w)
            bounds=[w['x']-3,w['y']-4,peers[pos+1]['x']-4 if pos+1<len(peers) else right-1,next((y-5 for y in ys if y>row+12),min(bottom-2,meta['height']-(100 if meta['width']>740 else 70)))]
            compare(crop(image,bounds,scale),option['image'])
    for image in pages.values():image.close()
    print(r,'checked',flush=True)
(CACHE/'source-audit.json').write_text(json.dumps({'checked':checked,'issues':issues},ensure_ascii=False,indent=2),encoding='utf8')
print('Compared:',checked,'Issues:',len(issues))
for issue in issues:print(issue)
if issues:raise SystemExit(1)
