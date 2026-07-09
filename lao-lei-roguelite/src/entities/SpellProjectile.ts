/**
 * 五行法术投射物
 * - 玩家金行庚金剑气：穿透+中毒
 * - 弟子御剑/符箓：敌方投射物
 * - 神使五行攻击：金飞剑/木符箓/水散弹/火锥形燃烧/土石柱
 */
import Phaser from 'phaser';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';

export class SpellProjectile extends Phaser.Physics.Arcade.Sprite {
  public damage: number;
  public element: Element;
  public poisonDps: number;
  public poisonDuration: number;
  /** 已命中敌人集合 */
  private hitSet: Set<Phaser.GameObjects.GameObject> = new Set();
  private life = 2.0;
  private gfx: Phaser.GameObjects.Graphics;
  private angle2 = 0;
  /** 飞行时间累计（用于石柱破碎） */
  private flightTime = 0;

  constructor(
    scene: Phaser.Scene, x: number, y: number, vx: number, vy: number,
    damage: number, element: Element, poisonDps = 0, poisonDuration = 0,
  ) {
    super(scene, x, y, 'proj_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.damage = damage;
    this.element = element;
    this.poisonDps = poisonDps;
    this.poisonDuration = poisonDuration;
    this.angle2 = Math.atan2(vy, vx);

    this.setVelocity(vx, vy);
    this.setCircle(8, 0, 0);
    this.setDepth(7);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(7);
  }

  update(dt: number): void {
    this.life -= dt;
    this.flightTime += dt;

    // 石柱破碎逻辑
    if ((this as any).isPillar && this.flightTime >= (this as any).pillarBreakTime) {
      // 破碎：触发范围伤害事件
      this.scene.events.emit('pillar-break', this.x, this.y, (this as any).pillarBreakDmg, this.element);
      this.destroy();
      return;
    }

    if (this.life <= 0) {
      this.destroy();
      return;
    }
    this.draw();
  }

  /** 命中敌人处理，返回 true 表示已命中过或已销毁（不应再造成伤害） */
  onHit(enemy: Phaser.GameObjects.GameObject): boolean {
    if (this.hitSet.has(enemy)) return true;  // 已命中过，返回true阻止重复伤害
    this.hitSet.add(enemy);

    // 水行散弹：命中减速
    if ((this as any).applySlowOnHit && (enemy as any).applySlow) {
      const slowMul = (this as any).slowMul ?? 0.4;
      const slowDur = (this as any).slowDuration ?? 2;
      (enemy as any).applySlow(slowMul, slowDur);
    }
    // 水行寒针：命中定身
    if ((this as any).freezeOnHit && (enemy as any).applySlow) {
      (enemy as any).applySlow(0.01, (this as any).freezeDuration ?? 2.5);  // 定身=极慢
    }
    // 金行符箓：命中玩家中毒
    if ((this as any).applyPoisonOnHit && (enemy as any).applyPoison) {
      (enemy as any).applyPoison((this as any).poisonRatio ?? 0.03, (this as any).poisonDuration ?? 20);
    }
    // 庚金剑气：命中敌人中毒（按 maxHp 百分比）
    if (this.poisonDps > 0 && this.poisonDps < 1 && (enemy as any).applyPoison) {
      // poisonDps < 1 表示是百分比，按敌人 maxHp 计算
      const enemyMaxHp = (enemy as any).maxHp ?? 100;
      const actualDps = enemyMaxHp * this.poisonDps;
      (enemy as any).applyPoison(actualDps, this.poisonDuration);
    }
    // 火球：命中生成漩涡
    if ((this as any).isFireball) {
      this.scene.events.emit('spawn-fire-vortex', this.x, this.y,
        (this as any).vortexRange ?? 100, (this as any).vortexDuration ?? 4, (this as any).vortexDps ?? 10);
      this.destroy();
      return true;
    }

    // 穿透数量：玩家金剑穿透3，神使金飞剑穿透2，定身寒针穿透999，其他1
    const maxPierce = (this as any).maxPierceOverride ?? ((this as any).fromEnemy ? 2 : 3);
    if (this.hitSet.size >= maxPierce) {
      this.destroy();
      return true;
    }
    return false;
  }

  private draw(): void {
    this.gfx.clear();
    const color = ELEMENT_COLORS[this.element];
    const isFlame = (this as any).isFlame;
    const isPillar = (this as any).isPillar;

    if (isFlame) {
      // 火焰：大光晕 + 脉动
      const pulse = 1 + Math.sin(this.flightTime * 20) * 0.2;
      this.gfx.fillStyle(color, 0.5);
      this.gfx.fillCircle(this.x, this.y, 14 * pulse);
      this.gfx.fillStyle(color, 0.9);
      this.gfx.fillCircle(this.x, this.y, 9 * pulse);
      this.gfx.fillStyle(0xffeb3b, 1);
      this.gfx.fillCircle(this.x, this.y, 5);
    } else if (isPillar) {
      // 石柱：旋转的岩石块
      const rot = this.flightTime * 8;
      this.gfx.fillStyle(color, 0.4);
      this.gfx.fillCircle(this.x, this.y, 14);
      this.gfx.fillStyle(color, 1);
      for (let i = 0; i < 4; i++) {
        const a = rot + (i / 4) * Math.PI * 2;
        this.gfx.fillCircle(this.x + Math.cos(a) * 5, this.y + Math.sin(a) * 5, 5);
      }
      this.gfx.fillStyle(0x6d4c41, 1);
      this.gfx.fillCircle(this.x, this.y, 4);
    } else {
      // 默认：光晕 + 长条
      const isBigSword = (this as any).isBigSword;
      const swordColor = (this as any).swordColor ?? color;  // 万剑归宗彩色飞剑
      const scale = isBigSword ? 3 : 1;
      this.gfx.fillStyle(swordColor, 0.4);
      this.gfx.fillCircle(this.x, this.y, 12 * scale);
      this.gfx.fillStyle(swordColor, 1);
      const len = 16 * scale;
      const tx = this.x - Math.cos(this.angle2) * len;
      const ty = this.y - Math.sin(this.angle2) * len;
      this.gfx.lineStyle(4 * scale, swordColor, 1);
      this.gfx.lineBetween(this.x, this.y, tx, ty);
      this.gfx.fillStyle(0xffffff, 1);
      this.gfx.fillCircle(this.x, this.y, 3 * scale);
    }
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
