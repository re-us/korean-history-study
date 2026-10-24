"""Recreate picture-only choices from cached PDF pixels, excluding printed numbers.
Text transcriptions are maintained separately in choice_text_overrides.json.
Run after import_exams.py export; original question images remain available.
"""
import json
from pathlib import Path
from PIL import Image,ImageDraw
from import_exams import crop_asset
ROOT=Path(__file__).resolve().parents[1]
PHOTOS={57:[4,15],58:[16],59:[6,15],60:[10],61:[18,28],62:[5],63:[10,15,46],64:[4,16],65:[4,17,22],66:[3,17],67:[4,16],68:[10,49],69:[6,16],70:[27],71:[7,16],72:[17,23],73:[6,26],74:[13,19],75:[3,18],76:[4,17,27],77:[4,13],78:[9,14,26],79:[6,11]}
def apply():
 cache=ROOT/'tmp/pdfs';raw=json.loads((cache/'extracted.json').read_text(encoding='utf8'))
 texts=json.loads((ROOT/'scripts/choice_text_overrides.json').read_text(encoding='utf8'))
 count=0
 for r in range(57,80):
  path=ROOT/f'data/exams/{r}.json';data=json.loads(path.read_text(encoding='utf8'))
  for q in data['questions']:
   n=q['question_number'];key=f'{r}-{n}'
   if key in texts:q['options']=[dict(number=k+1,text=t,image=None) for k,t in enumerate(texts[key])]
   if n not in PHOTOS[r]:continue
   source=raw[str(r)][n-1];page=q['source_page'];im=Image.open(cache/f'{r}-{page:02}.png').convert('RGB')
   page_info=json.loads((cache/f'{r}-{page:02}.text.json').read_text(encoding='utf8'));scale=im.width/page_info['width']
   markers=source['_markers'];left,top,right,bottom=source['_bounds'];row_ys=sorted(set(round(w['y']) for w in markers));row_ys=[y for i,y in enumerate(row_ys) if i==0 or y-row_ys[i-1]>12]
   for k,w in enumerate(markers):
    row=min(row_ys,key=lambda y:abs(y-w['y']));same=sorted([a for a in markers if abs(a['y']-row)<12],key=lambda a:a['x']);pos=same.index(w)
    x0=w['x']-3;x1=same[pos+1]['x']-4 if pos+1<len(same) else right-1;y0=w['y']-4
    footer=page_info['height']-(100 if page_info['width']>740 else 70);y1=next((y-5 for y in row_ys if y>row+12),min(bottom-2,footer))
    picture=im.copy();draw=ImageDraw.Draw(picture)
    # Erase only the existing number glyph's rectangle, keeping all source artwork.
    draw.rectangle(tuple(round(v*scale) for v in [w['x']-4,w['y']-4,w['x']+w['w']+4,w['y']+w['h']+4]),fill='white')
    asset=crop_asset(picture,[x0,y0,x1,y1],ROOT/f'assets/exams/{r}/picture{n:02}_{k+1}.webp',scale)
    q['options'][k]=dict(number=k+1,text='',image=asset,picture_only=True);count+=1
  path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 # Round 80 uses existing JPG crops with a number in the top-left white margin.
 path=ROOT/'complete_questions.js';src=path.read_text(encoding='utf8');data=json.loads(src.split('=',1)[1].strip().removesuffix(';'))
 for q in data:
  for o in q['options']:
   if not o['image']:continue
   old=ROOT/f"assets/option{q['question_number']:02}_{o['number']}.jpg";im=Image.open(old).convert('RGB');ImageDraw.Draw(im).rectangle((8,4,35,32),fill='white')
   asset=f"assets/picture{q['question_number']:02}_{o['number']}.webp";im.save(ROOT/asset,'WEBP',quality=95,method=6);o.update(image=asset,picture_only=True);count+=1
  if q['question_number']==49:q['options'][4]['text']='부산에서 아시아 태평양 경제 협력체(APEC) 정상 회의가 개최되었다.'
  if q['question_number']==50:q['options'][4]['text']='유계춘이 주도하여 경상 우병사의 수탈에 맞서 봉기한 곳을 답사한다.'
 path.write_text('window.COMPLETE_QUESTIONS = '+json.dumps(data,ensure_ascii=False)+';\n',encoding='utf8')
 print(f'{len(texts)*5} text choices; {count} picture choices with separate numbers')
if __name__=='__main__':apply()
