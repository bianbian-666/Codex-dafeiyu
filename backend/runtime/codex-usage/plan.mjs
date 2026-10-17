const names={free:'Free',go:'Go',plus:'Plus',pro:'Pro',team:'Team',business:'Business',enterprise:'Enterprise',edu:'Edu'};

export function normalizePlan(value) {
  if(typeof value!=='string')return null;
  const plan=value.trim().toLowerCase();
  return plan && plan.length<=80 && !/[\x00-\x1f\x7f]/.test(plan)?plan:null;
}

// A plan name is metadata, never a substitute for the returned quota windows.
// Keep future plan names usable without inventing their limits or entitlements.
export function identifyPlan(accountPlan,bucketPlan,authType=null) {
  const bucket=normalizePlan(bucketPlan),account=normalizePlan(accountPlan);
  const plan=bucket??account;
  return {plan,planLabel:plan?(names[plan]??plan):'未知套餐',planKnown:plan!==null && Object.hasOwn(names,plan),planSource:bucket?'rateLimits':account?'account':null,authType};
}

export function quotaWindowLabel(minutes) {
  if(minutes===300)return '5 小时';
  if(minutes===10080)return '每周';
  if(minutes%1440===0)return (minutes/1440)+' 天';
  if(minutes%60===0)return (minutes/60)+' 小时';
  return minutes+' 分钟';
}
