/**
 * Debuff 系统 - 独立模块
 * 遵循开闭原则：通过组合方式扩展实体 debuff
 *
 * 支持的 debuff：
 * - 撕裂：每移动20距离受到1点无视防御的伤害，不可叠加
 * - 眩晕：无法进行任何行动（攻击/法术/移动）
 */

/** Debuff 类型 */
export type DebuffType = 'tear' | 'stun' | 'weaken' | 'grievous';

/** Debuff 实例 */
export interface DebuffInstance {
  type: DebuffType;
  remaining: number;  // 剩余秒数
  /** 撕裂专用：上次记录的位置 */
  lastX?: number;
  lastY?: number;
  /** 撕裂累计距离 */
  accDist?: number;
}

/** Debuff 持有者接口 */
export interface IDebuffable {
  debuffs: DebuffInstance[];
}

/** Debuff 系统工具类 */
export class DebuffSystem {
  /** 创建初始 debuff 容器 */
  static createDebuffs(): IDebuffable {
    return { debuffs: [] };
  }

  /** 施加 debuff（撕裂不可叠加，眩晕/衰弱取最长） */
  static applyDebuff(d: IDebuffable, type: DebuffType, duration: number): void {
    const existing = d.debuffs.find(db => db.type === type);
    if (existing) {
      if (type === 'stun' || type === 'weaken' || type === 'grievous') {
        existing.remaining = Math.max(existing.remaining, duration);
      }
      // tear 不刷新持续时间
    } else {
      d.debuffs.push({ type, remaining: duration, accDist: 0 });
    }
  }

  /** 检查是否有指定 debuff */
  static hasDebuff(d: IDebuffable, type: DebuffType): boolean {
    return d.debuffs.some(db => db.type === type);
  }

  /** 检查是否有重伤（治疗降低70%） */
  static hasGrievous(d: IDebuffable): boolean {
    return d.debuffs.some(db => db.type === 'grievous');
  }

  /** 更新 debuff（返回撕裂造成的伤害） */
  static updateDebuffs(d: IDebuffable, dt: number, currentX: number, currentY: number): { tearDamage: number } {
    let tearDamage = 0;
    for (let i = d.debuffs.length - 1; i >= 0; i--) {
      const db = d.debuffs[i];
      db.remaining -= dt;
      if (db.remaining <= 0) {
        d.debuffs.splice(i, 1);
        continue;
      }
      // 撕裂：累计移动距离
      if (db.type === 'tear') {
        if (db.lastX !== undefined && db.lastY !== undefined) {
          const dx = currentX - db.lastX;
          const dy = currentY - db.lastY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          db.accDist = (db.accDist ?? 0) + dist;
          // 每20距离1点伤害
          while (db.accDist >= 20) {
            db.accDist -= 20;
            tearDamage += 1;
          }
        }
        db.lastX = currentX;
        db.lastY = currentY;
      }
    }
    return { tearDamage };
  }
}
