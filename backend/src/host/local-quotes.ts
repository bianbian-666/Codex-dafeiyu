import { readFileSync } from 'node:fs';

export const DEFAULT_QUOTES = [
  "才不是大肥鱼！这是智慧的储备～",
  "今天的小鱼干到账了吗？本鱼在线等。",
  "本鱼没摸鱼，只是在思考鱼生。",
  "喝口水再忙，别把自己熬成咸鱼。",
  "代码交给你，可爱交给本鱼。",
  "终有一天，本鱼要吃遍所有蛋糕！",
  "说好了，只吃一口……一大口。",
  "本鱼帮你看着桌面，奖励一条小鱼干。",
  "别急别急，灵感正在游过来。",
  "累了就歇会儿，本鱼又不会游走。",
  "这点额度要省着吃，不能一口闷！",
  "存好文件哦，别让成果溜进海里。",
  "本鱼今天也有认真陪你，才没偷懒！",
  "伸个懒腰吧，鱼都知道换个姿势。",
  "先把这一步做完，再一起摸鱼。",
  "夸我可爱可以，叫我肥鱼不行！"
];
let previous = '';
export function pickLocalQuote(file: string): string {
  let quotes = DEFAULT_QUOTES;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (Array.isArray(raw)) {
      const valid = raw.filter((q): q is string => typeof q === 'string' && q.trim().length > 0 && q.length <= 120);
      if (valid.length) quotes = valid;
    }
  } catch { /* Missing or malformed custom quotes safely fall back to defaults. */ }
  const candidates = quotes.filter(q => q !== previous);
  const pool = candidates.length ? candidates : quotes;
  previous = pool[Math.floor(Math.random() * pool.length)];
  return previous;
}
