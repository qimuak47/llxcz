/**
 * 火焰漩涡 - 火行商店法术生成
 * 持续对周围敌人造成伤害并旋转牵引
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';

export class FireVortex extends Phaser.Physics.Arcade.Sprite {
  public life: number;
  public maxLife: number;
  public damage: number;  // 每秒伤害
  private gfx: Phaser.GameObjects.Graphics;
  private phase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, duration: number, dps: number) {
    super(scene, x, y, 'proj_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.life = duration;
    this.maxLife = duration;
    this.damage = dps;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(50, 0, 0);
    body.setImmovable(true);
    body.moves = false;

    this.setDepth(7);
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(7);
  }

  update(dt: number): void {
    this.life -= dt;
    this.phase += dt * 4;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    this.draw();
  }

  /** 对范围内敌人造成伤害+牵引（由 GameScene 调用） */
  applyEffect(enemies: { x: number; y: number; takeDamage: (d: number) => void; applyKnockback?: (vx: number, vy: number) => void }[], dt: number): void {
    const range = 50;
    for (const e of enemies) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (dist < range) {
        e.takeDamage(this.damage * dt);
        // 旋转牵引：朝漩涡中心 + 切线方向
        const angle = Phaser.Math.Angle.Between(e.x, e.y, this.x, this.y);
        const pullForce = 60 * (1 - dist / range);
        const tangentAngle = angle + Math.PI / 2;
        e.applyKnockback?.(
          Math.cos(angle) * pullForce + Math.cos(tangentAngle) * pullForce * 1.5,
          Math.sin(angle) * pullForce + Math.sin(tangentAngle) * pullForce * 1.5,
        );
      }
    }
  }

  private draw(): void {
    this.gfx.clear();
    const fadeRatio = Math.min(1, this.life / this.maxLife * 2);
    const r = 50;

    // 外层光晕
    this.gfx.fillStyle(COLORS.ELEMENT_FIRE, 0.15 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r);
    this.gfx.fillStyle(COLORS.ELEMENT_FIRE, 0.3 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r * 0.7);

    // 旋转火焰螺旋
    for (let i = 0; i < 3; i++) {
      const baseAngle = this.phase + (i / 3) * Math.PI * 2;
      this.gfx.lineStyle(4, i % 2 ? 0xffeb3b : COLORS.ELEMENT_FIRE, 0.8 * fadeRatio);
      this.gfx.beginPath();
      for (let t = 0; t < 1; t += 0.1) {
        const a = baseAngle + t * Math.PI * 2;
        const rr = r * (1 - t * 0.7);
        const px = this.x + Math.cos(a) * rr;
        const py = this.y + Math.sin(a) * rr;
        if (t === 0) this.gfx.moveTo(px, py);
        else this.gfx.lineTo(px, py);
      }
      this.gfx.strokePath();
    }

    // 中心
    this.gfx.fillStyle(0xffeb3b, fadeRatio);
    this.gfx.fillCircle(this.x, this.y, 6);
    this.gfx.fillStyle(0xffffff, fadeRatio);
    this.gfx.fillCircle(this.x, this.y, 3);
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
