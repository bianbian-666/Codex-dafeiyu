export function classifyReset(f,now=Date.now()) {
  if(!f||!Object.hasOwn(f,'official_signal')||!Object.hasOwn(f,'last_reset_at'))throw new Error('重置站返回的数据格式变了');
  const s=f.official_signal,at=Date.parse(s?.at??''),end=Date.parse(s?.window?.end_at??''),start=Date.parse(s?.window?.start_at??'');
  const confirmed=Number.isFinite(at)&&at<=now&&end>now&&String(s?.summary??'').trim()&&String(s?.window?.label??'').trim()&&!/timing unspecified/i.test(s.window.label)&&!(Date.parse(f.last_reset_at??'')>at);
  if(!confirmed)return {status:'quiet',text:'本鱼蹲过啦：暂无官方重置信号，先攒小鱼干～',animation:'工作状态-原地踱步张望'};
  const hours=Math.max(1,Math.ceil((end-now)/3600000));
  const range=start>now?`${Math.max(1,Math.ceil((start-now)/3600000))}～${hours} 小时后`:`未来约 ${hours} 小时内`;
  return {status:'confirmed',text:`本鱼蹲到预告啦！监测站收录官方重置预告，预计${range}，具体以实际到账为准～`,animation:'工作状态-雀跃庆祝'};
}
export async function queryReset() {
  try{const r=await fetch('https://codex-reset.com/api/forecast?tz=Asia%2FShanghai',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('重置站暂时连不上');return {ok:true,...classifyReset(await r.json()),source:'https://codex-reset.com/zh/',checkedAt:Date.now()};}
  catch{return {ok:false,status:'unavailable',text:'本鱼暂时联系不上重置站，等会儿再查吧。',animation:'工作状态-垂头叹气冒汗'};}
}
