/**
 * 升级系统 - 肉鸽核心
 * 每次升级三选一，包含属性强化和新能力解锁
 * 主题：磁场转动修炼路线 + 五行法术
 */
import { Element } from './ElementSystem';

export type UpgradeRarity = 'common' | 'rare' | 'epic';

export interface UpgradeEffect {
  /** 伤害加成（乘数，1.2 = +20%） */
  damageMul?: number;
  /** 攻速加成（乘数） */
  attackSpeedMul?: number;
  /** 移速加成（乘数，特殊三选一用） */
  moveSpeedMul?: number;
  /** 移速加成（固定数值，普通三选一用） */
  moveSpeedAdd?: number;
  /** 最大生命加成（加法） */
  maxHpAdd?: number;
  /** 磁场范围加成（乘数） */
  auraRangeMul?: number;
  /** 拾取范围加成（乘数） */
  pickupRangeMul?: number;
  /** 经验加成（乘数） */
  xpMul?: number;
  /** 生命再生（每秒） */
  hpRegenAdd?: number;
  /** 弹射数量加成 */
  projectileAdd?: number;
  /** 弹射穿透加成 */
  pierceAdd?: number;
  /** 解锁新能力 */
  unlock?: 'chain' | 'storm' | 'shield';
  /** 五行减伤加成（乘算叠加） */
  elementReductionAdd?: number;
  /** 防御加成（固定数值） */
  defenseAdd?: number;
  /** 解锁五行法术 */
  unlockSpell?: SpellDef;
}

/** 五行法术定义 */
export interface SpellDef {
  id: string;
  element: Element;
  name: string;
  /** 触发方式：'auto' 周期触发 / 'onHit' 攻击命中触发 */
  trigger: 'auto' | 'onHit';
  /** 自动触发间隔（秒） */
  interval?: number;
  /** 法术类型 */
  type: 'aoe' | 'projectile' | 'buff' | 'wall' | 'melee' | 'drain' | 'freeze' | 'vortex' | 'shield' | 'mark';
  /** 伤害（基于玩家伤害的倍率） */
  damageMul?: number;
  /** 范围（像素） */
  range?: number;
  /** 持续时间（秒） */
  duration?: number;
  /** 数值参数（减速倍率/中毒dps/治疗量等） */
  value?: number;
  /** 描述 */
  desc: string;
  /** 是否已进化（5次叠加后） */
  evolved?: boolean;
}

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  rarity: UpgradeRarity;
  /** 可叠加次数上限，0=无限 */
  maxStacks: number;
  effect: UpgradeEffect;
}

/** 全部升级池 */
export const UPGRADE_POOL: Upgrade[] = [
  // ===== 放电强化 =====
  {
    id: 'dmg1', name: '雷霆万钧', desc: '基础伤害 +30%',
    rarity: 'common', maxStacks: 8,
    effect: { damageMul: 1.30 },
  },
  {
    id: 'spd1', name: '电光石火', desc: '攻击速度 +25%',
    rarity: 'common', maxStacks: 6,
    effect: { attackSpeedMul: 1.25 },
  },
  {
    id: 'proj1', name: '磁暴分流', desc: '同时多发射 1 道雷电',
    rarity: 'rare', maxStacks: 3,
    effect: { projectileAdd: 1 },
  },
  {
    id: 'def1', name: '铜筋铁骨', desc: '防御 +3',
    rarity: 'common', maxStacks: 8,
    effect: { defenseAdd: 3 },
  },

  // ===== 磁场领域 =====
  {
    id: 'aura1', name: '磁场扩张', desc: '磁场领域范围 +35%',
    rarity: 'common', maxStacks: 5,
    effect: { auraRangeMul: 1.35 },
  },

  // ===== 肉身强化 =====
  {
    id: 'hp1', name: '铜皮铁骨', desc: '最大生命 +50',
    rarity: 'common', maxStacks: 8,
    effect: { maxHpAdd: 50 },
  },
  {
    id: 'regen1', name: '生生不息', desc: '每秒恢复 2 点生命',
    rarity: 'rare', maxStacks: 5,
    effect: { hpRegenAdd: 2 },
  },
  {
    id: 'move1', name: '御风而行', desc: '移动速度 +15',
    rarity: 'common', maxStacks: 5,
    effect: { moveSpeedAdd: 15 },
  },

  // ===== 灵石收集 =====
  {
    id: 'pickup1', name: '磁吸之力', desc: '灵石拾取范围 +50%',
    rarity: 'common', maxStacks: 4,
    effect: { pickupRangeMul: 1.5 },
  },
  {
    id: 'xp1', name: '悟道通明', desc: '经验获取 +30%',
    rarity: 'common', maxStacks: 5,
    effect: { xpMul: 1.30 },
  },

  // ===== 史诗新能力 =====
  {
    id: 'elem_reduction', name: '五行护身', desc: '五行减伤 +40%（乘算叠加）',
    rarity: 'epic', maxStacks: 5,
    effect: { elementReductionAdd: 0.4 },
  },
  {
    id: 'unlock_storm', name: '磁暴领域', desc: '解锁：周期性释放磁暴冲击波',
    rarity: 'epic', maxStacks: 1,
    effect: { unlock: 'storm' },
  },
  {
    id: 'unlock_shield', name: '磁场护体', desc: '解锁：受伤时生成磁场护盾',
    rarity: 'epic', maxStacks: 1,
    effect: { unlock: 'shield' },
  },

  // ===== 五行法术（每个法术可叠加 3 次增强） =====
  // 金行：高伤 + 中毒
  {
    id: 'spell_metal', name: '庚金剑气', desc: '解锁金行：周期发射金剑，命中中毒',
    rarity: 'epic', maxStacks: 3,
    effect: { unlockSpell: {
      id: 'metal', element: 'metal', name: '庚金剑气',
      trigger: 'auto', interval: 3, type: 'projectile',
      damageMul: 1.8, value: 4, duration: 3,
      desc: '每3秒发射金剑，命中造成1.8倍伤害+中毒',
    } },
  },
  // 木行：加速 + 回血
  {
    id: 'spell_wood', name: '青木长生诀', desc: '解锁木行：周期回血+移速加成',
    rarity: 'epic', maxStacks: 3,
    effect: { unlockSpell: {
      id: 'wood', element: 'wood', name: '青木长生诀',
      trigger: 'auto', interval: 5, type: 'buff',
      value: 15, duration: 4,
      desc: '每5秒触发：恢复15生命+4秒移速+30%',
    } },
  },
  // 水行：减速敌人
  {
    id: 'spell_water', name: '玄冰寒流', desc: '解锁水行：周期冰冻周围敌人',
    rarity: 'epic', maxStacks: 3,
    effect: { unlockSpell: {
      id: 'water', element: 'water', name: '玄冰寒流',
      trigger: 'auto', interval: 4, type: 'aoe',
      range: 180, value: 0.4, duration: 3, damageMul: 0.8,
      desc: '每4秒冰冻周围180范围敌人，减速60%持续3秒',
    } },
  },
  // 火行：AOE + 击退
  {
    id: 'spell_fire', name: '烈焰爆裂', desc: '解锁火行：周期范围爆炸+击退',
    rarity: 'epic', maxStacks: 3,
    effect: { unlockSpell: {
      id: 'fire', element: 'fire', name: '烈焰爆裂',
      trigger: 'auto', interval: 3.5, type: 'aoe',
      range: 150, damageMul: 2.0, value: 200,
      desc: '每3.5秒范围爆炸，2倍伤害+击退',
    } },
  },
  // 土行：阻挡墙
  {
    id: 'spell_earth', name: '厚土壁垒', desc: '周期性在周围生成土墙，阻挡敌人和投射物',
    rarity: 'epic', maxStacks: 3,
    effect: { unlockSpell: {
      id: 'earth', element: 'earth', name: '厚土壁垒',
      trigger: 'auto', interval: 6, type: 'wall',
      range: 100, duration: 4, damageMul: 1.2,
      desc: '每6秒在身周生成土墙，阻挡敌人4秒',
    } },
  },
];

/** 商店专属五行法术（用击杀数购买，更强力） */
export const SHOP_SPELL_POOL: Upgrade[] = [
  // 金：杀伐之斧 - 近战慢挥砍，范围高伤
  {
    id: 'shop_metal', name: '杀伐之斧', desc: '金行：近战挥砍，范围高伤（频率慢）',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_metal', element: 'metal', name: '杀伐之斧',
      trigger: 'auto', interval: 2.4, type: 'melee',  // 攻速+20%（原3→2.4）
      range: 103.5, damageMul: 4.0,  // 范围+15%（原90→103.5）
      desc: '每3秒挥砍一次，对范围内敌人造成4倍伤害',
    } },
  },
  // 木：草根汲取 - 周围持续伤害+回血
  {
    id: 'shop_wood', name: '草根汲取', desc: '木行：周围草藤持续伤害+吸血',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_wood', element: 'wood', name: '草根汲取',
      trigger: 'auto', interval: 5, type: 'drain',
      range: 130, damageMul: 0.3, value: 0.5, duration: 4,
      desc: '每5秒伸出草藤，4秒内每秒2点伤害，吸取50%回血',
    } },
  },
  // 水：定身寒针 - 发射冰针定身
  {
    id: 'shop_water', name: '定身寒针', desc: '水行：发射冰针定身敌人数秒',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_water', element: 'water', name: '定身寒针',
      trigger: 'auto', interval: 2, type: 'freeze',
      damageMul: 1.5, value: 2.5,
      desc: '每2秒发射冰针，命中定身2.5秒',
    } },
  },
  // 火：火焰漩涡 - 火球爆炸生成持续漩涡
  {
    id: 'shop_fire', name: '火焰漩涡', desc: '火行：火球爆炸生成持续漩涡',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_fire', element: 'fire', name: '火焰漩涡',
      trigger: 'auto', interval: 4, type: 'vortex',
      range: 175, damageMul: 2.5, duration: 4,  // 初始range 175
      desc: '每4秒发射火球，爆炸生成4秒火焰漩涡',
    } },
  },
  // 土：坚震甲胄 - 护盾抵消伤害+反弹
  {
    id: 'shop_earth', name: '坚震甲胄', desc: '土行：生成护盾，抵消伤害并反弹',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_earth', element: 'earth', name: '坚震甲胄',
      trigger: 'auto', interval: 12, type: 'shield',
      value: 0.1, duration: 5,
      desc: '生成最大生命10%护盾，抵消伤害并反弹，破碎后5秒恢复',
    } },
  },
  // 土：巨门化暗 - 标记最近敌人，1秒后造成3倍土行伤害
  {
    id: 'shop_earth2', name: '巨门化暗', desc: '化气为暗，对最近的敌人方位造成3倍伤害',
    rarity: 'epic', maxStacks: 8,
    effect: { unlockSpell: {
      id: 'shop_earth2', element: 'earth', name: '巨门化暗',
      trigger: 'auto', interval: 4, type: 'mark',
      range: 300, damageMul: 3.0,
      desc: '化气为暗，对最近的敌人方位造成3倍伤害',
    } },
  },
];

/** 玩家运行时属性（受升级影响） */
export interface PlayerStats {
  damage: number;
  attackSpeed: number;     // 每秒攻击次数
  moveSpeed: number;
  maxHp: number;
  auraRange: number;
  auraDamage: number;
  pickupRange: number;
  xpMul: number;
  hpRegen: number;
  projectileCount: number;
  pierce: number;
  hasChain: boolean;
  hasStorm: boolean;
  hasShield: boolean;
  /** 五行减伤率（乘算叠加：1-(1-A)*(1-B)...） */
  elementReduction: number;
  /** 防御加成（升级提供） */
  defenseAdd: number;
  /** 已解锁的五行法术列表 */
  spells: SpellDef[];
  /** 各法术叠加次数（用于增强） */
  spellStacks: Record<string, number>;
  /** 已获得法宝列表（背包） */
  treasures: import('./TreasureSystem').Treasure[];
  /** 装备中的法宝（最多5个） */
  equippedTreasures: (import('./TreasureSystem').Treasure | null)[];
  /** 已获得的先天灵宝 ID 列表 */
  spiritTreasures: string[];
  /** 业值（用于兑换先天灵宝） */
  karma: number;
}

/** 初始属性 */
export function createInitialStats(): PlayerStats {
  return {
    damage: 20,           // 初始伤害20
    attackSpeed: 1.5,
    moveSpeed: 150,
    maxHp: 200,           // 初始生命200
    auraRange: 80,
    auraDamage: 5,
    pickupRange: 240,     // 初始拾取范围+100（原140→240）
    xpMul: 1.0,
    hpRegen: 0.5,         // 0 → 0.5（基础回血，缓解压力）
    projectileCount: 1,
    pierce: 0,
    hasChain: false,
    hasStorm: false,
    hasShield: false,
    elementReduction: 0,
    defenseAdd: 0,
    spells: [],
    spellStacks: {},
    treasures: [],
    equippedTreasures: [null, null, null, null, null],
    spiritTreasures: [],
    karma: 0,
  };
}

/** 应用升级到属性 */
export function applyUpgrade(stats: PlayerStats, upgrade: Upgrade): void {
  const e = upgrade.effect;
  if (e.damageMul) stats.damage *= e.damageMul;
  if (e.attackSpeedMul) stats.attackSpeed *= e.attackSpeedMul;
  if (e.moveSpeedMul) stats.moveSpeed *= e.moveSpeedMul;
  if (e.moveSpeedAdd) stats.moveSpeed += e.moveSpeedAdd;
  if (e.maxHpAdd) stats.maxHp += e.maxHpAdd;
  if (e.auraRangeMul) stats.auraRange *= e.auraRangeMul;
  if (e.pickupRangeMul) stats.pickupRange *= e.pickupRangeMul;
  if (e.xpMul) stats.xpMul *= e.xpMul;
  if (e.hpRegenAdd) stats.hpRegen += e.hpRegenAdd;
  if (e.projectileAdd) stats.projectileCount += e.projectileAdd;
  if (e.pierceAdd) stats.pierce += e.pierceAdd;
  if (e.unlock === 'chain') stats.hasChain = true;
  if (e.unlock === 'storm') stats.hasStorm = true;
  if (e.unlock === 'shield') stats.hasShield = true;
  // 五行减伤（乘算叠加：1-(1-A)*(1-B)...）
  if (e.elementReductionAdd) {
    stats.elementReduction = 1 - (1 - stats.elementReduction) * (1 - e.elementReductionAdd);
  }
  // 防御加成
  if (e.defenseAdd) stats.defenseAdd += e.defenseAdd;
  // 五行法术解锁/强化
  if (e.unlockSpell) {
    const spell = e.unlockSpell;
    const existing = stats.spells.find(s => s.id === spell.id);
    if (!existing) {
      // 首次解锁：复制一份（避免修改池中原始对象）
      stats.spells.push({ ...spell });
      stats.spellStacks[spell.id] = 1;
    } else {
      // 已有：叠加增强
      const stacks = (stats.spellStacks[spell.id] ?? 1) + 1;
      stats.spellStacks[spell.id] = stacks;
      // 进化判定：5次后进化为彩色技能（大幅提升）
      if (stacks === 5 && !existing.evolved) {
        existing.evolved = true;
        // 进化：伤害×2，范围×1.3，数值×2，间隔减半
        if (existing.damageMul) existing.damageMul *= 2;
        if (existing.range) existing.range *= 1.3;
        if (existing.value) existing.value *= 2;
        if (existing.interval) existing.interval = Math.max(0.5, existing.interval * 0.5);
        if (existing.duration) existing.duration *= 1.5;
      } else if (stacks > 5) {
        // 进化后继续叠加（小幅增长）
        if (existing.damageMul) existing.damageMul *= 1.1;
        if (existing.range) existing.range *= 1.1;
        if (existing.value) existing.value *= 1.2;
      } else {
        // 普通叠加：伤害×1.3，范围×1.1
        if (existing.damageMul) existing.damageMul *= 1.3;
        if (existing.range) existing.range *= 1.1;
        if (existing.value) existing.value *= 1.3;
        if (existing.interval) existing.interval = Math.max(1, existing.interval * 0.85);
      }
    }
  }
}

/** 随机抽取 N 个升级（考虑稀有度和叠加次数） */
export function rollUpgrades(taken: Record<string, number>, count: number): Upgrade[] {
  // 过滤掉已满叠加次数的
  const available = UPGRADE_POOL.filter(u => {
    const takenCount = taken[u.id] ?? 0;
    return u.maxStacks === 0 || takenCount < u.maxStacks;
  });
  // 按稀有度加权
  const weighted: Upgrade[] = [];
  for (const u of available) {
    const weight = u.rarity === 'common' ? 10 : u.rarity === 'rare' ? 4 : 1.5;
    for (let i = 0; i < weight; i++) weighted.push(u);
  }
  // 随机抽取不重复
  const result: Upgrade[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (result.length < count && attempts < 200 && weighted.length > 0) {
    const idx = Math.floor(Math.random() * weighted.length);
    const u = weighted[idx];
    if (!used.has(u.id)) {
      used.add(u.id);
      result.push(u);
    }
    attempts++;
  }
  return result;
}
