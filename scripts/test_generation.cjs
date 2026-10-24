const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const context=vm.createContext({window:{}});
for(const p of ['complete_questions.js','explanations.js','choice_explanations.js','study_tools.js'])vm.runInContext(read(p),context);
const metadata=JSON.parse(read('data/question_eras.json')),tools=context.window.STUDY_TOOLS,pool=[];
assert.equal(Object.keys(metadata.rounds).length,24);
let summaries=0,choices=0;
for(let round=57;round<=80;round++){
 const questions=round===80?context.window.COMPLETE_QUESTIONS:JSON.parse(read(`data/exams/${round}.json`)).questions;
 const details=round===80?Object.fromEntries(questions.map(q=>[q.question_number,{summary:context.window.EXPLANATIONS[q.question_number],choices:context.window.CHOICE_EXPLANATIONS[q.question_number]}])):JSON.parse(read(`data/explanations/${round}.json`));
 assert.equal(questions.length,50);assert.equal(questions.reduce((n,q)=>n+q.points,0),100);
 assert.equal(metadata.rounds[round].length,50);
 for(const [i,q] of questions.entries()){
  assert.equal(q.question_number,i+1);assert.equal(q.exam_round,round);
  assert.ok(q.question_text.endsWith('?'));assert.equal(q.question_text.split("'").length%2,1,`${round}:${i+1} quotes`);
  assert.ok(!/[�]|않읕|않을 것은|시가의/.test(q.question_text),`${round}:${i+1} typo`);
  assert.equal(q.options.length,5);assert.equal(new Set(q.options.map(o=>o.number)).size,5);
  assert.ok(q.accept_all||(q.correct_option>=1&&q.correct_option<=5));
  for(const image of [q.image,q.material_image,...q.options.map(o=>o.image)].filter(Boolean))assert.ok(fs.existsSync(path.join(root,image)),image);
  for(const o of q.options){
   assert.ok(!o.source_image,`${round}:${i+1} text screenshot remains`);
   if(o.image)assert.equal(o.picture_only,true);
   else assert.ok(o.text.trim().length>0&&!/[\u0000-\u001f\u200c�]/.test(o.text),`${round}:${i+1}:${o.number} invalid text`);
  }
  const ex=details[i+1];assert.ok(ex.summary.length>=25);assert.equal(ex.choices.length,5);
  for(const text of [ex.summary,...ex.choices])assert.ok(typeof text==='string'&&text.length>=10&&!/TODO|검토 중|해당 지점|�/.test(text));
  assert.ok(metadata.rounds[round][i]>=0&&metadata.rounds[round][i]<8);
  summaries++;choices+=5;pool.push({...q,era:metadata.rounds[round][i]});
 }
}
let seed=13579;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const fingerprints=new Set();let first;
for(let run=0;run<200;run++){
 const result=tools.generate(pool,8,random);first??=result;
 assert.equal(result.questions.length,50);assert.equal(result.questions.reduce((n,q)=>n+q.points,0),100);
 assert.equal(new Set(result.questions.map(q=>`${q.exam_round}:${q.question_number}`)).size,50);
 assert.ok(result.questions.every(q=>!q.accept_all));
 for(let era=0;era<8;era++){
  assert.equal(result.questions.filter(q=>q.era===era).length,result.counts[era]);
  assert.ok(Math.abs(result.counts[era]-result.totals[era]/result.poolSize*50)<1);
 }
 fingerprints.add(result.questions.map(q=>`${q.exam_round}:${q.question_number}`).join(','));
}
assert.ok(fingerprints.size>190,'random generation should produce distinct papers');
assert.throws(()=>tools.generate(pool.filter(q=>q.era===0),8),/부족|만족/);
assert.equal(tools.wrongEntries({attempts:{1:[{correct:false},{correct:true}],2:[{correct:false}]}}).length,1);
assert.equal(tools.wrongEntries({attempts:{1:[{correct:false},{correct:true}],2:[{correct:false}]}},true).length,2);
console.log(`PASS: ${summaries} questions, ${choices} choice explanations, all era tags/assets; 200 different exact 100-point papers`);
console.log(metadata.eras.map((name,i)=>`${name}: ${first.totals[i]}/${first.poolSize} → ${first.counts[i]} questions`).join('\n'));
