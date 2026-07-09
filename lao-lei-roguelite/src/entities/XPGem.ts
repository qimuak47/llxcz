/**
 * 灵石（经验宝石）- 妖兽掉落
 * 玩家靠近自动吸引并拾取
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';

export class XPGem extends Phaser.Physics.Arcade.Sprite {
  public xp: number;
  private gfx: Phaser.GameObjects.Graphics;
  /** 是否正在被吸引 */
  private attracting = false;
  /** 浮动相位 */
  private phase = Math.random() * Math.PI * 2;
  /** 生命周期（10秒后销毁） */
  private life = 10;
  /** 闪烁警示（最后3秒） */
  private warnFlash = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, xp: number) {
    super(scene, x, y, 'gem_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.xp = xp;
    this.setCircle(6, 0, 0);
    // 初始弹出速度
    const a = Math.random() * Math.PI * 2;
    this.setVelocity(Math.cos(a) * 60, Math.sin(a) * 60);
    // 阻尼
    (this.body as Phaser.Physics.Arcade.Body).setDrag(80, 80);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(4);
  }

  update(dt: number, playerX: number, playerY: number, pickupRange: number): void {
    // 生命衰减
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    this.warnFlash += dt * 8;
    this.phase += dt * 4;
    // 检测吸引
    const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    if (dist < pickupRange) {
      this.attracting = true;
    }
    if (this.attracting) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      const speed = 300 + (pickupRange - dist) * 4;
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
    this.draw();
  }

  private draw(): void {
    this.gfx.clear();
    const float = Math.sin(this.phase) * 2;
    const y = this.y + float;
    // 最后3秒闪烁警示
    const alpha = this.life < 3 ? (Math.floor(this.warnFlash) % 2 === 0 ? 1 : 0.3) : 1;
    // 光晕
    this.gfx.fillStyle(COLORS.GEM_GLOW, 0.3 * alpha);
    this.gfx.fillCircle(this.x, y, 9);
    // 菱形灵石
    this.gfx.fillStyle(COLORS.GEM, alpha);
    this.gfx.fillTriangle(
      this.x, y - 6,
      this.x + 5, y,
      this.x, y + 6
    );
    this.gfx.fillTriangle(
      this.x, y - 6,
      this.x - 5, y,
      this.x, y + 6
    );
    // 高光
    this.gfx.fillStyle(0xffffff, 0.8 * alpha);
    this.gfx.fillTriangle(
      this.x - 1, y - 4,
      this.x + 2, y - 2,
      this.x - 1, y
    );
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
