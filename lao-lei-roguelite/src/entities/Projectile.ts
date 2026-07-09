/**
 * 雷电投射物 - 老雷的放电攻击
 * 直线飞行，命中敌人造成伤害，可穿透
 * 解锁雷链后命中可跳跃到附近敌人
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  public damage: number;
  public pierce: number;
  public hasChain: boolean;
  /** 已命中敌人集合（防止穿透时重复命中） */
  private hitSet: Set<Enemy> = new Set();
  /** 生命周期（秒） */
  private life = 2.0;
  /** 视觉 */
  private gfx: Phaser.GameObjects.Graphics;
  /** 飞行角度 */
  private angle2 = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, vx: number, vy: number, damage: number, pierce: number, hasChain: boolean) {
    super(scene, x, y, 'proj_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.damage = damage;
    this.pierce = pierce;
    this.hasChain = hasChain;
    this.angle2 = Math.atan2(vy, vx);

    this.setVelocity(vx, vy);
    this.setCircle(6, 0, 0);
    this.setDepth(7);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(7);
  }

  update(dt: number, enemies: any[]): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    this.draw();

    // 检测命中（由场景的 physics collider 处理，这里只做穿透逻辑）
    // 实际命中回调通过 setHitCallback 或场景 collider 处理
  }

  /** 命中敌人处理，返回 true 表示已命中过或已销毁（不应再造成伤害） */
  onHit(enemy: any, allEnemies: any[]): boolean {
    if (this.hitSet.has(enemy)) return true;  // 已命中过，返回true阻止重复伤害
    this.hitSet.add(enemy);

    // 雷链：跳跃到附近未命中的敌人
    if (this.hasChain && this.hitSet.size === 1) {
      const candidates = allEnemies.filter(e => e !== enemy && e.active && !this.hitSet.has(e));
      candidates.sort((a, b) => {
        const da = Phaser.Math.Distance.Between(enemy.x, enemy.y, a.x, a.y);
        const db = Phaser.Math.Distance.Between(enemy.x, enemy.y, b.x, b.y);
        return da - db;
      });
      if (candidates.length > 0) {
        const target = candidates[0];
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        if (dist < 200) {
          this.scene.events.emit('chain-fx', enemy.x, enemy.y, target.x, target.y);
          this.scene.events.emit('chain-damage', target, this.damage * 0.6);
        }
      }
    }

    if (this.hitSet.size > this.pierce + 1) {
      this.destroy();
      return true;
    }
    return false;  // 首次命中，应造成伤害
  }

  private draw(): void {
    this.gfx.clear();
    // 雷电锯齿光弹
    this.gfx.fillStyle(COLORS.LIGHTNING_GLOW, 0.4);
    this.gfx.fillCircle(this.x, this.y, 10);
    this.gfx.fillStyle(COLORS.LIGHTNING, 0.9);
    this.gfx.fillCircle(this.x, this.y, 6);
    this.gfx.fillStyle(COLORS.LIGHTNING_CORE, 1);
    this.gfx.fillCircle(this.x, this.y, 3);

    // 拖尾锯齿
    const tailLen = 14;
    const tx = this.x - Math.cos(this.angle2) * tailLen;
    const ty = this.y - Math.sin(this.angle2) * tailLen;
    this.gfx.lineStyle(2, COLORS.LIGHTNING, 0.7);
    this.gfx.beginPath();
    this.gfx.moveTo(this.x, this.y);
    // 锯齿
    const segs = 4;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const px = this.x + (tx - this.x) * t + (Math.random() - 0.5) * 4;
      const py = this.y + (ty - this.y) * t + (Math.random() - 0.5) * 4;
      this.gfx.lineTo(px, py);
    }
    this.gfx.strokePath();
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}

import { Enemy } from './Enemy';
