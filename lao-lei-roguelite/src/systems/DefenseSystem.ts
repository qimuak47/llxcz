/**
 * 防御系统 - 独立模块，通过组合方式扩展实体防御属性
 * 遵循开闭原则：不修改现有类，通过接口扩展
 *
 * 防御效果：每次受到伤害时先减去防御值再进行后续计算
 * 伤害 = max(1, 原始伤害 - 防御值)
 */

/** 防御属性持有者接口 */
export interface IDefensible {
  /** 当前防御值 */
  defense: number;
  /** 临时防御加成（土行符箓等） */
  tempDefense: number;
  /** 临时防御持续时间 */
  tempDefenseTimer: number;
}

/** 防御系统工具类 */
export class DefenseSystem {
  /** 创建初始防御属性 */
  static createDefense(): IDefensible {
    return {
      defense: 0,
      tempDefense: 0,
      tempDefenseTimer: 0,
    };
  }

  /** 计算实际防御值（基础+临时） */
  static getEffectiveDefense(d: IDefensible): number {
    return d.defense + d.tempDefense;
  }

  /** 应用伤害减免，返回实际伤害值 */
  static applyDefense(d: IDefensible, rawDamage: number): number {
    const totalDef = DefenseSystem.getEffectiveDefense(d);
    return Math.max(1, rawDamage - totalDef);
  }

  /** 更新临时防御计时器 */
  static updateDefense(d: IDefensible, dt: number): void {
    if (d.tempDefenseTimer > 0) {
      d.tempDefenseTimer -= dt;
      if (d.tempDefenseTimer <= 0) {
        d.tempDefense = 0;
      }
    }
  }

  /** 施加临时防御 */
  static applyTempDefense(d: IDefensible, amount: number, duration: number): void {
    d.tempDefense = Math.max(d.tempDefense, amount);
    d.tempDefenseTimer = Math.max(d.tempDefenseTimer, duration);
  }
}

/** 五行减伤系统 - 神使/神之手专用 */
export class ElementReductionSystem {
  /** 计算五行减伤后的伤害 */
  static applyReduction(rawDamage: number, reductionRate: number): number {
    return rawDamage * (1 - reductionRate);
  }

  /** 判断是否同属性吸收（返回 true 表示吸收，不掉血且回血） */
  static isSameElementAbsorb(attackElement: string, defenderElement: string): boolean {
    return attackElement === defenderElement && attackElement !== 'none';
  }
}
