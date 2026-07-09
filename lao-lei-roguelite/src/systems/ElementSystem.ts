/**
 * 五行系统 - 金木水火土相生相克
 * 相克关系：金克木、木克土、土克水、水克火、火克金
 * 相克造成 2 倍伤害，被克造成 0.5 倍伤害
 */

export type Element = 'none' | 'metal' | 'wood' | 'earth' | 'water' | 'fire';

/** 五行相克表：key 克 value */
export const OVERCOMES: Record<Exclude<Element, 'none'>, Exclude<Element, 'none'>> = {
  metal: 'wood',   // 金克木
  wood: 'earth',   // 木克土
  earth: 'water',  // 土克水
  water: 'fire',   // 水克火
  fire: 'metal',   // 火克金
};

/** 五行中文名 */
export const ELEMENT_NAMES: Record<Element, string> = {
  none: '无',
  metal: '金',
  wood: '木',
  earth: '土',
  water: '水',
  fire: '火',
};

/** 五行颜色（数字，用于 Graphics） */
export const ELEMENT_COLORS: Record<Element, number> = {
  none: 0x9e9e9e,
  metal: 0xffd54f,
  wood: 0x66bb6a,
  earth: 0xa1887f,
  water: 0x4fc3f7,
  fire: 0xff7043,
};

/** 五行颜色（字符串，用于 Text） */
export const ELEMENT_COLOR_STR: Record<Element, string> = {
  none: '#9e9e9e',
  metal: '#ffd54f',
  wood: '#66bb6a',
  earth: '#a1887f',
  water: '#4fc3f7',
  fire: '#ff7043',
};

/**
 * 计算伤害倍率
 * @param attack 攻击方五行
 * @param defend 防御方五行
 * @returns 2.0=相克, 0.5=被克, 1.0=无关系
 */
export function elementMultiplier(attack: Element, defend: Element): number {
  if (attack === 'none' || defend === 'none') return 1.0;
  if (OVERCOMES[attack] === defend) return 2.0;       // 相克
  if (OVERCOMES[defend] === attack) return 0.5;       // 被克
  return 1.0;
}

/** 判断是否相克（用于显示提示） */
export function isOvercoming(attack: Element, defend: Element): boolean {
  if (attack === 'none' || defend === 'none') return false;
  return OVERCOMES[attack] === defend;
}
