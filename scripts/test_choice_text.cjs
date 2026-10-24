const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const texts=read('scripts/choice_text_overrides.json');let count=0;
for(const [key,expected] of Object.entries(texts)){
 const [r,n]=key.split('-').map(Number),q=read(`data/exams/${r}.json`).questions[n-1];
 assert.equal(expected.length,5);assert.deepEqual(q.options.map(o=>o.text),expected);
 assert.ok(q.options.every(o=>o.image===null&&!o.source_image));count+=5;
}
assert.equal(count,3350);
assert.equal(texts['66-30'][0],'(가) - 만권당에서 원의 학자들과 교유하였으며, 성리학의 보급에 기여하였다.');
assert.equal(texts['57-50'][2],'10·4 남북 공동 선언을 발표하였다.');
assert.equal(texts['63-42'][3],'거제도 포로수용소에서 석방되는 반공 포로');
assert.deepEqual(texts['58-5'],['(가)','(나)','(다)','(라)','(마)']);
assert.deepEqual(texts['60-50'],['단오','칠석','백중','동지','한식']);
assert.deepEqual(texts['65-45'],['ㄱ, ㄴ','ㄱ, ㄷ','ㄴ, ㄷ','ㄴ, ㄹ','ㄷ, ㄹ']);
console.log(`PASS: ${count} transcribed choices, source-label/date/line-break regressions, timeline and combination labels`);
