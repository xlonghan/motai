// node scripts/update-emoji-categories.mjs path/to/emoji-test.txt
// Keep existing CLDR Chinese annotations; fail instead of dropping an unknown entry.
import { readFileSync, writeFileSync } from 'node:fs';
const destination = new URL('../src/data/emoji.json', import.meta.url);
const old = JSON.parse(readFileSync(destination, 'utf8'));
const lookup = new Map(old.items.map(item => [item.e, item]));
const componentNames = ['浅色肤色','中浅肤色','中等肤色','中深肤色','深色肤色','红发','卷发','白发','秃顶'];
const componentPoints = [0x1f3fb,0x1f3fc,0x1f3fd,0x1f3fe,0x1f3ff,0x1f9b0,0x1f9b1,0x1f9b3,0x1f9b2];
const labels = `微笑|爱意|吐舌|手与表情|平静与怀疑|困倦|不适|帽子|眼镜|担忧|生气与负面|装扮与幻想|猫脸|猴脸|爱心|情感符号
张开的手|手指手势|单指手势|握拳|双手|手持物品|身体部位|人物|人物手势|职业与身份|幻想人物|人物活动|运动人物|休息|家庭与关系|人物标志
肤色组件|发型组件
哺乳动物|鸟类|两栖动物|爬行动物|海洋动物|昆虫|花朵|其他植物
水果|蔬菜|烹饪食物|亚洲食物|甜食|饮品|餐具
地图|自然地理|建筑|宗教场所|其他地点|陆地交通|水上交通|航空|酒店|时间|天空与天气
节日与庆典|奖项与奖牌|体育|游戏|艺术与手工
服饰|声音|音乐|乐器|电话|电脑|灯光与影像|书籍与纸张|钱币|邮件|书写|办公|锁与钥匙|工具|科学|医疗|家居|其他物品
交通标志|警告|箭头|宗教|星座|音视频控制|性别|数学|标点|货币|其他符号|键帽|字母与数字|几何图形
常用旗帜|国家与地区旗帜|地区旗帜`.replaceAll('\n','|').split('|');
const groups = [], subgroups = [], items = [];
let group, subgroup;
const source = readFileSync(process.argv[2], 'utf8');
for (const line of source.split(/\r?\n/)) {
  if (line.startsWith('# group: ')) { group = line.slice(9); groups.push(group); }
  if (line.startsWith('# subgroup: ')) { subgroup = line.slice(12); subgroups.push({ id: subgroup, g: group, n: labels[subgroups.length] }); }
  const match = line.match(/^([0-9A-F ]+)\s*;\s*(fully-qualified|component)\s*#\s*\S+\s+E([\d.]+)\s+(.+)$/);
  if (!match) continue;
  const e = String.fromCodePoint(...match[1].trim().split(/\s+/).map(hex => parseInt(hex,16)));
  let item = lookup.get(e);
  if (!item) {
    const n = componentNames[componentPoints.indexOf(e.codePointAt(0))];
    if (!n) throw new Error(`Missing annotation: ${e} ${match[4]}`);
    item = { e, n, k: `${n} ${match[4]}`.toLowerCase(), g: group, v: Number(match[3]) };
  }
  items.push({ ...item, s: subgroup });
}
if (labels.length !== subgroups.length || subgroups.some(s => !s.n) || items.length < old.items.length) throw new Error('Incomplete category mapping');
writeFileSync(destination, JSON.stringify({ ...old, groups, subgroups, items }));
console.log(`${groups.length} groups, ${subgroups.length} subgroups, ${items.length} entries`);
