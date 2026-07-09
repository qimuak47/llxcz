/**
 * 法宝系统 - 天地人三品级
 * 人品：门派弟子掉落
 * 地品：宗门老祖掉落
 * 天品：神之手掉落
 * 大部分增加五行法术效果，少数稀有特效
 */
import { Element } from './ElementSystem';

export type TreasureGrade = 'human' | 'earth' | 'heaven';

export interface TreasureEffect {
  /** 法术伤害加成（乘数） */
  spellDamageMul?: number;
  /** 法术范围加成（乘数） */
  spellRangeMul?: number;
  /** 法术频率加成（乘数，越大越快） */
  spellSpeedMul?: number;
  /** 特定五行法术加成 */
  elementBonus?: Partial<Record<Element, { damageMul?: number; rangeMul?: number; speedMul?: number }>>;
  /** 移速加成（固定数值） */
  moveSpeedAdd?: number;
  /** 防御加成（固定数值） */
  defenseAdd?: number;
  /** 稀有特效 ID */
  special?: string;
  /** 稀有特效参数 */
  specialValue?: number;
  /** 稀有特效冷却（秒） */
  specialCooldown?: number;
}

export interface Treasure {
  id: string;
  name: string;
  grade: TreasureGrade;
  element: Element | 'none';
  desc: string;
  effect: TreasureEffect;
}

/** 法宝池 */
export const TREASURE_POOL: Treasure[] = [
  // ===== 人品法宝（弟子掉落，法术伤害/频率加成减半）=====
  {
    id: 'h1', name: '青木符', grade: 'human', element: 'wood',
    desc: '木行法术伤害 +10%，移速 +5',
    effect: { elementBonus: { wood: { damageMul: 1.1 } }, moveSpeedAdd: 5 },
  },
  {
    id: 'h2', name: '寒冰玉', grade: 'human', element: 'water',
    desc: '水行法术范围 +25%',
    effect: { elementBonus: { water: { rangeMul: 1.25 } } },
  },
  {
    id: 'h3', name: '烈火珠', grade: 'human', element: 'fire',
    desc: '火行法术伤害 +10%',
    effect: { elementBonus: { fire: { damageMul: 1.1 } } },
  },
  {
    id: 'h4', name: '庚金钉', grade: 'human', element: 'metal',
    desc: '金行法术频率 +10%',
    effect: { elementBonus: { metal: { speedMul: 1.1 } } },
  },
  {
    id: 'h5', name: '厚土印', grade: 'human', element: 'earth',
    desc: '土行法术范围 +25%，防御 +2',
    effect: { elementBonus: { earth: { rangeMul: 1.25 } }, defenseAdd: 2 },
  },
  {
    id: 'h6', name: '聚灵佩', grade: 'human', element: 'none',
    desc: '所有法术伤害 +6%',
    effect: { spellDamageMul: 1.06 },
  },
  {
    id: 'h7', name: '疾风环', grade: 'human', element: 'none',
    desc: '所有法术频率 +7%',
    effect: { spellSpeedMul: 1.075 },
  },
  // 人品稀有特效
  {
    id: 'h8', name: '斩妖符', grade: 'human', element: 'none',
    desc: '稀有：每10秒秒杀600范围内的小怪',
    effect: { special: 'kill_minions', specialValue: 600, specialCooldown: 10 },
  },

  // ===== 地品法宝（老祖掉落，法术伤害/频率加成减30%）=====
  {
    id: 'e1', name: '万年青木心', grade: 'earth', element: 'wood',
    desc: '木行法术伤害 +28%，范围 +20%，移速 +15',
    effect: { elementBonus: { wood: { damageMul: 1.28, rangeMul: 1.2 } }, moveSpeedAdd: 15 },
  },
  {
    id: 'e2', name: '玄冰寒玉', grade: 'earth', element: 'water',
    desc: '水行法术伤害 +24%，范围 +30%',
    effect: { elementBonus: { water: { damageMul: 1.245, rangeMul: 1.3 } } },
  },
  {
    id: 'e3', name: '九转火丹', grade: 'earth', element: 'fire',
    desc: '火行法术伤害 +31%，频率 +14%',
    effect: { elementBonus: { fire: { damageMul: 1.315, speedMul: 1.14 } } },
  },
  {
    id: 'e4', name: '天罡金剑', grade: 'earth', element: 'metal',
    desc: '金行法术伤害 +28%，频率 +17%',
    effect: { elementBonus: { metal: { damageMul: 1.28, speedMul: 1.175 } } },
  },
  {
    id: 'e5', name: '地脉灵珠', grade: 'earth', element: 'earth',
    desc: '土行法术伤害 +24%，范围 +35%，防御 +5',
    effect: { elementBonus: { earth: { damageMul: 1.245, rangeMul: 1.35 } }, defenseAdd: 5 },
  },
  {
    id: 'e6', name: '万灵宝匣', grade: 'earth', element: 'none',
    desc: '所有法术伤害 +17%，频率 +14%',
    effect: { spellDamageMul: 1.175, spellSpeedMul: 1.14 },
  },
  // 地品稀有特效
  {
    id: 'e7', name: '冰封法印', grade: 'earth', element: 'water',
    desc: '稀有：每8秒冻住中等范围敌人3秒',
    effect: { special: 'freeze_area', specialValue: 3, specialCooldown: 8 },
  },
  {
    id: 'e8', name: '雷劫符', grade: 'earth', element: 'none',
    desc: '稀有：每8秒秒杀1000范围内小怪，对弟子老祖造成40%最大生命伤害',
    effect: { special: 'thunder_tribulation', specialValue: 1000, specialCooldown: 8 },
  },

  // ===== 天品法宝（神之手掉落）=====
  {
    id: 't1', name: '月彩花芍氅', grade: 'heaven', element: 'wood',
    desc: '木行法术伤害 +80%，范围 +40%，频率 +30%，移速 +30',
    effect: { elementBonus: { wood: { damageMul: 1.8, rangeMul: 1.4, speedMul: 1.3 } }, moveSpeedAdd: 30 },
  },
  {
    id: 't2', name: '混沌玄冰', grade: 'heaven', element: 'water',
    desc: '水行法术伤害 +75%，范围 +50%，频率 +25%',
    effect: { elementBonus: { water: { damageMul: 1.75, rangeMul: 1.5, speedMul: 1.25 } } },
  },
  {
    id: 't3', name: '焚天火莲', grade: 'heaven', element: 'fire',
    desc: '火行法术伤害 +90%，范围 +35%，频率 +35%',
    effect: { elementBonus: { fire: { damageMul: 1.9, rangeMul: 1.35, speedMul: 1.35 } } },
  },
  {
    id: 't4', name: '诛仙金锋', grade: 'heaven', element: 'metal',
    desc: '金行法术伤害 +85%，频率 +40%',
    effect: { elementBonus: { metal: { damageMul: 1.85, speedMul: 1.4 } } },
  },
  {
    id: 't5', name: '镇岳神石', grade: 'heaven', element: 'earth',
    desc: '土行法术伤害 +75%，范围 +60%，防御 +10',
    effect: { elementBonus: { earth: { damageMul: 1.75, rangeMul: 1.6 } }, defenseAdd: 10 },
  },
  {
    id: 't6', name: '造化玉碟', grade: 'heaven', element: 'none',
    desc: '所有法术伤害 +50%，范围 +30%，频率 +30%',
    effect: { spellDamageMul: 1.5, spellRangeMul: 1.3, spellSpeedMul: 1.3 },
  },
  // 天品稀有特效
  {
    id: 't7', name: '灭世雷劫', grade: 'heaven', element: 'none',
    desc: '稀有：每6秒秒杀1500范围内小怪，对弟子老祖造成80%最大生命伤害',
    effect: { special: 'armageddon', specialValue: 1500, specialCooldown: 6 },
  },
  {
    id: 't8', name: '万剑归宗', grade: 'heaven', element: 'metal',
    desc: '稀有：每5秒对全屏敌人发射彩色飞剑，造成10倍伤害。基础伤害+50%',
    effect: { special: 'sword_circle', specialValue: 10, specialCooldown: 5, spellDamageMul: 1.5 },
  },
];

/** 随机抽取指定品级法宝 */
export function rollTreasure(grade: TreasureGrade): Treasure {
  const pool = TREASURE_POOL.filter(t => t.grade === grade);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 法宝品级名称 */
export const GRADE_NAMES: Record<TreasureGrade, string> = {
  human: '人品',
  earth: '地品',
  heaven: '天品',
};

/** 法宝品级颜色 */
export const GRADE_COLORS: Record<TreasureGrade, number> = {
  human: 0x90a4ae,    // 灰
  earth: 0x4dd0e1,    // 青
  heaven: 0xffd54f,   // 金
};

/** 法宝品级升级路径：人→地→天 */
export const GRADE_UPGRADE: Record<TreasureGrade, TreasureGrade | null> = {
  human: 'earth',
  earth: 'heaven',
  heaven: null,
};

/** 合成表：3个相同id法宝合成更高品级 */
export function canSynthesize(treasures: Treasure[]): { index: number; treasure: Treasure } | null {
  // 统计每个id+品级的数量
  const counts: Record<string, { indices: number[]; treasure: Treasure }> = {};
  for (let i = 0; i < treasures.length; i++) {
    const t = treasures[i];
    const key = t.id + '_' + t.grade;
    if (!counts[key]) counts[key] = { indices: [], treasure: t };
    counts[key].indices.push(i);
  }
  // 找到3个相同的，且有更高品级版本
  for (const key in counts) {
    if (counts[key].indices.length >= 3) {
      const t = counts[key].treasure;
      const higherGrade = GRADE_UPGRADE[t.grade];
      if (higherGrade) {
        // 检查是否存在更高品级的同类型法宝
        const higherExists = TREASURE_POOL.some(
          tp => tp.id === t.id && tp.grade === higherGrade
        );
        if (higherExists) {
          return { index: counts[key].indices[0], treasure: t };
        }
      }
    }
  }
  return null;
}

/** 获取合成后的高品级法宝 */
export function getUpgradedTreasure(t: Treasure): Treasure | null {
  const higherGrade = GRADE_UPGRADE[t.grade];
  if (!higherGrade) return null;
  const upgraded = TREASURE_POOL.find(tp => tp.id === t.id && tp.grade === higherGrade);
  return upgraded ?? null;
}
