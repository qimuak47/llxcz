/**
 * 土墙 - 土行厚土壁垒
 * 在玩家周围生成实体墙，阻挡敌人移动
 * 持续一段时间后消失
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';

export class EarthWall extends Phaser.Physics.Arcade.Sprite {
  public life: number;
  public maxLife: number;
  /** 可抵挡的投射物次数 */
  public blockCharges: number;
  private gfx: Phaser.GameObjects.Graphics;
  private phase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, duration: number, blockCharges = 1) {
    super(scene, x, y, 'proj_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.life = duration;
    this.maxLife = duration;
    this.blockCharges = blockCharges;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.setCircle(20, 0, 0);
    body.moves = false;

    this.setDepth(6);
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(6);
  }

  update(dt: number): void {
    this.life -= dt;
    this.phase += dt * 3;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    this.draw();
  }

  private draw(): void {
    this.gfx.clear();
    const fadeRatio = Math.min(1, this.life / this.maxLife * 2);
    const pulse = 1 + Math.sin(this.phase) * 0.05;
    const r = 20 * pulse;

    // 外层光晕
    this.gfx.fillStyle(COLORS.ELEMENT_EARTH, 0.2 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r + 6);
    // 主体（土色实心）
    this.gfx.fillStyle(COLORS.ELEMENT_EARTH, 0.9 * fadeRatio);
    this.gfx.fillCircle(this.x, this.y, r);
    // 内层纹理（石块感）
    this.gfx.fillStyle(0x6d4c41, 0.8 * fadeRatio);
    this.gfx.fillCircle(this.x - 4, this.y - 3, 5);
    this.gfx.fillCircle(this.x + 5, this.y + 2, 4);
    this.gfx.fillCircle(this.x - 2, this.y + 5, 3);
    // 边缘
    this.gfx.lineStyle(2, 0x5d4037, fadeRatio);
    this.gfx.strokeCircle(this.x, this.y, r);
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
