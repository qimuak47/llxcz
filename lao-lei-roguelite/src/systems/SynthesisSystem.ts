/**
 * 法宝合成表系统 - 独立模块
 * 遵循开闭原则：不修改现有类，通过组合方式扩展
 *
 * 合成规则：
 * 3青木符 → 1万年青木心
 * 3寒冰玉 → 1玄冰寒玉
 * 3烈火珠 → 1九转火丹
 * 3庚金钉 → 1天罡金剑
 * 3厚土印 → 1地脉灵珠
 * (2聚灵佩+2疾风环) → 1万灵宝匣
 * 3斩妖符 → 1雷劫符
 * 3万年青木心 → 1太乙青木灵
 * 3玄冰寒玉 → 1混沌玄冰
 * 3九转火丹 → 1焚天火莲
 * 3天罡金剑 → 1诛仙金锋
 * 3地脉灵珠 → 1镇岳神石
 * 3雷劫符 → 1灭世雷劫
 * 3万灵宝匣 → 1造化玉碟
 * (1万年青木心+1玄冰寒玉+1九转火丹+1天罡金剑+1地脉灵珠) → 1万剑归宗
 */
import { Treasure } from './TreasureSystem';

/** 合成配方 */
export interface Recipe {
  /** 需要的材料：{ id: 数量 } */
  materials: { id: string; count: number }[];
  /** 合成产物 id */
  resultId: string;
  /** 合成产物名称 */
  resultName: string;
}

/** 全部合成配方 */
export const RECIPES: Recipe[] = [
  { materials: [{ id: 'h1', count: 3 }], resultId: 'e1', resultName: '万年青木心' },
  { materials: [{ id: 'h2', count: 3 }], resultId: 'e2', resultName: '玄冰寒玉' },
  { materials: [{ id: 'h3', count: 3 }], resultId: 'e3', resultName: '九转火丹' },
  { materials: [{ id: 'h4', count: 3 }], resultId: 'e4', resultName: '天罡金剑' },
  { materials: [{ id: 'h5', count: 3 }], resultId: 'e5', resultName: '地脉灵珠' },
  { materials: [{ id: 'h6', count: 2 }, { id: 'h7', count: 2 }], resultId: 'e6', resultName: '万灵宝匣' },
  { materials: [{ id: 'h8', count: 3 }], resultId: 'e7', resultName: '雷劫符' },
  { materials: [{ id: 'e1', count: 3 }], resultId: 't1', resultName: '太乙青木灵' },
  { materials: [{ id: 'e2', count: 3 }], resultId: 't2', resultName: '混沌玄冰' },
  { materials: [{ id: 'e3', count: 3 }], resultId: 't3', resultName: '焚天火莲' },
  { materials: [{ id: 'e4', count: 3 }], resultId: 't4', resultName: '诛仙金锋' },
  { materials: [{ id: 'e5', count: 3 }], resultId: 't5', resultName: '镇岳神石' },
  { materials: [{ id: 'e7', count: 3 }], resultId: 't7', resultName: '灭世雷劫' },
  { materials: [{ id: 'e6', count: 3 }], resultId: 't6', resultName: '造化玉碟' },
  { materials: [
    { id: 'e1', count: 1 }, { id: 'e2', count: 1 }, { id: 'e3', count: 1 },
    { id: 'e4', count: 1 }, { id: 'e5', count: 1 },
  ], resultId: 't8', resultName: '万剑归宗' },
];

/**
 * 检查是否可以合成，返回可合成的配方列表
 * @param allTreasures 所有法宝（装备栏+背包）
 */
export function checkSynthesizable(allTreasures: Treasure[]): Recipe[] {
  const result: Recipe[] = [];
  for (const recipe of RECIPES) {
    let canSynth = true;
    for (const mat of recipe.materials) {
      const count = allTreasures.filter(t => t.id === mat.id).length;
      if (count < mat.count) {
        canSynth = false;
        break;
      }
    }
    if (canSynth) result.push(recipe);
  }
  return result;
}

/**
 * 执行合成：从法宝列表中移除材料，返回产物 id
 * 注意：调用方需要自行从 TREASURE_POOL 找到产物对象
 */
export function executeSynthesis(
  equipped: (Treasure | null)[],
  bag: Treasure[],
  recipe: Recipe,
): Treasure | null {
  // 收集所有法宝的引用（装备栏+背包），按 id 分组
  const allSlots: { treasure: Treasure; source: 'equip' | 'bag'; index: number }[] = [];
  for (let i = 0; i < equipped.length; i++) {
    if (equipped[i]) allSlots.push({ treasure: equipped[i]!, source: 'equip', index: i });
  }
  for (let i = 0; i < bag.length; i++) {
    allSlots.push({ treasure: bag[i], source: 'bag', index: i });
  }

  // 按配方移除材料
  const toRemove: { source: 'equip' | 'bag'; index: number }[] = [];
  for (const mat of recipe.materials) {
    let remaining = mat.count;
    for (const slot of allSlots) {
      if (remaining <= 0) break;
      if (toRemove.some(r => r.source === slot.source && r.index === slot.index)) continue;
      if (slot.treasure.id === mat.id) {
        toRemove.push({ source: slot.source, index: slot.index });
        remaining--;
      }
    }
  }

  // 执行移除
  for (const r of toRemove) {
    if (r.source === 'equip') {
      equipped[r.index] = null;
    } else {
      bag[r.index] = null as any;
    }
  }
  // 清理 bag 中的 null
  const cleanBag = bag.filter(t => t !== null);

  // 返回产物（调用方需要从 TREASURE_POOL 查找）
  return { id: recipe.resultId, name: recipe.resultName } as any;
}
