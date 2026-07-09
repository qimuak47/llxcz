/**
 * 先天灵宝系统 - 独立模块
 * 获得后自动行动，不需要玩家操作
 */

export type SpiritTreasureId = 'zhan_yan_luo' | 'bu_gu_po_fa' | 'fu_cang_long';

export interface SpiritTreasure {
  id: SpiritTreasureId;
  name: string;
  desc: string;
  price: number;  // 业值
}

/** 先天灵宝池 */
export const SPIRIT_TREASURE_POOL: SpiritTreasure[] = [
  {
    id: 'zhan_yan_luo',
    name: '斩阎罗',
    desc: '老雷头最爱の宝刀，可以减少敌人7%hp上限，造成5倍伤害',
    price: 100,
  },
  {
    id: 'bu_gu_po_fa',
    name: '不顾破法之责',
    desc: '老雷三兄弟在木星分期付款买来的神秘短棍，可以自动驱散debuff',
    price: 100,
  },
  {
    id: 'fu_cang_long',
    name: '缚苍龙',
    desc: '老雷用野人炼器法制作的神秘赤色金索',
    price: 100,
  },
];

/** 法宝熔铸为业的数值 */
export const MELT_VALUES: Record<string, number> = {
  human: 10,
  earth: 30,
  heaven: 100,
};

/** 获取灵宝名称 */
export function getSpiritTreasureName(id: SpiritTreasureId): string {
  const t = SPIRIT_TREASURE_POOL.find(t => t.id === id);
  return t ? t.name : '';
}
