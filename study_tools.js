// Pure assembly helpers. Original questions, points and explanations stay intact.
(function(root){
 function shuffle(items,random=Math.random){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
 function quotas(pool,eraCount){
  if(pool.length<50)throw Error('문제가 부족합니다.');
  const totals=Array.from({length:eraCount},(_,era)=>pool.filter(q=>q.era===era).length);
  const raw=totals.map(n=>n/pool.length*50),counts=raw.map(Math.floor);
  const order=raw.map((n,i)=>({i,remainder:n-counts[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0,left=50-counts.reduce((a,b)=>a+b,0);i<left;i++)counts[order[i].i]++;
  return {totals,counts};
 }
 function generate(pool,eraCount,random=Math.random){
  const unique=[...new Map(pool.filter(q=>!q.accept_all&&[1,2,3].includes(q.points)).map(q=>[`${q.exam_round}:${q.question_number}`,q])).values()];
  const {totals,counts}=quotas(unique,eraCount);
  const groups=counts.map((count,era)=>{
   const buckets=[1,2,3].map(points=>shuffle(unique.filter(q=>q.era===era&&q.points===points),random));
   const choices=[];
   for(let one=0;one<=Math.min(count,buckets[0].length);one++)for(let three=0;three<=Math.min(count-one,buckets[2].length);three++){
    const two=count-one-three;if(two<=buckets[1].length)choices.push({score:one+two*2+three*3,one,two,three});
   }
   return {buckets,choices:shuffle(choices,random)};
  });
  // Solve the exact total across era quotas; never change official points.
  let states=new Map([[0,[]]]);
  for(const group of groups){const next=new Map();for(const [score,path] of states)for(const choice of group.choices){const sum=score+choice.score;if(sum<=100&&!next.has(sum))next.set(sum,[...path,choice])}states=next}
  const plan=states.get(100);if(!plan)throw Error('시대별 문항 수와 100점 조건을 함께 만족하지 못했습니다.');
  const questions=groups.flatMap((g,i)=>g.buckets.flatMap((bucket,j)=>bucket.slice(0,plan[i][['one','two','three'][j]])));
  return {questions:questions.sort((a,b)=>a.era-b.era||a.exam_round-b.exam_round||a.question_number-b.question_number),totals,counts,poolSize:unique.length};
 }
 function wrongEntries(saved,includeResolved=false){return Object.entries(saved.attempts||{}).flatMap(([number,attempts])=>{
  if(!Array.isArray(attempts)||!attempts.length)return [];
  const last=attempts.at(-1),wrong=attempts.filter(a=>a.correct===false);
  return wrong.length&&(includeResolved||last.correct===false)?[{number:Number(number),last,wrongCount:wrong.length,resolved:last.correct===true}]:[];
 })}
 root.STUDY_TOOLS={generate,quotas,wrongEntries};
})(typeof window==='undefined'?globalThis:window);
