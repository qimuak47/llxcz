/**
 * 先天灵宝实体 - 自动行动，不需要玩家操作
 * 每个灵宝有独立的行动逻辑和视觉
 */
import Phaser from 'phaser';
import { SpiritTreasureId } from '../systems/SpiritTreasureSystem';

export class SpiritTreasureEntity extends Phaser.GameObjects.Container {
  public id: SpiritTreasureId;
  private gfx: Phaser.GameObjects.Graphics;
  private actionTimer = 0;
  private phase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, id: SpiritTreasureId) {
    super(scene, x, y);
    this.id = id;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(12);
    this.add(this.gfx);

    // 初始化行动计时器
    if (id === 'zhan_yan_luo') this.actionTimer = 4;
    else if (id === 'bu_gu_po_fa') this.actionTimer = 2;
    else if (id === 'fu_cang_long') this.actionTimer = 2;

    scene.add.existing(this);
    this.setDepth(12);
  }

  /** 每帧更新，返回 {action: string, target?: {x,y}} 表示触发了行动 */
  update(dt: number, playerX: number, playerY: number, nearestEnemy: { x: number; y: number } | null): { action: string; targetX?: number; targetY?: number } | null {
    this.phase += dt * 2;
    this.actionTimer -= dt;

    // 更新位置（环绕/头顶/游弋）
    if (this.id === 'zhan_yan_luo') {
      // 红色直刃长刀，环绕玩家
      const angle = this.phase * 0.8;
      const r = 50;
      this.x = playerX + Math.cos(angle) * r;
      this.y = playerY + Math.sin(angle) * r;
    } else if (this.id === 'bu_gu_po_fa') {
      // 银色短棍，头顶
      this.x = playerX;
      this.y = playerY - 35 + Math.sin(this.phase * 2) * 3;
    } else if (this.id === 'fu_cang_long') {
      // 红金长鞭，150距离外游弋
      const angle = this.phase * 0.5;
      const r = 150;
      this.x = playerX + Math.cos(angle) * r;
      this.y = playerY + Math.sin(angle) * r;
    }

    this.draw();

    // 行动触发
    if (this.actionTimer <= 0) {
      if (this.id === 'zhan_yan_luo') {
        this.actionTimer = 4;
        if (nearestEnemy) {
          return { action: 'zhan_yan_luo_slash', targetX: nearestEnemy.x, targetY: nearestEnemy.y };
        }
      } else if (this.id === 'bu_gu_po_fa') {
        this.actionTimer = 2;
        return { action: 'bu_gu_po_fa_cleanse' };
      } else if (this.id === 'fu_cang_long') {
        this.actionTimer = 2;
        return { action: 'fu_cang_long_whip' };
      }
    }
    return null;
  }

  private draw(): void {
    this.gfx.clear();
    const x = this.x;
    const y = this.y;

    if (this.id === 'zhan_yan_luo') {
      // 红色直刃长刀（手动旋转计算，不用 save/rotate/restore）
      const angle = this.phase * 0.8 + Math.PI / 4;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      // 刀身（旋转后的矩形）
      this.gfx.fillStyle(0xff5252, 0.9);
      this.gfx.beginPath();
      this.gfx.moveTo(x + (-2) * cos - (-20) * sin, y + (-2) * sin + (-20) * cos);
      this.gfx.lineTo(x + 2 * cos - (-20) * sin, y + 2 * sin + (-20) * cos);
      this.gfx.lineTo(x + 2 * cos - 20 * sin, y + 2 * sin + 20 * cos);
      this.gfx.lineTo(x + (-2) * cos - 20 * sin, y + (-2) * sin + 20 * cos);
      this.gfx.closePath();
      this.gfx.fillPath();
      // 刀刃高光
      this.gfx.fillStyle(0xffffff, 0.5);
      this.gfx.beginPath();
      this.gfx.moveTo(x + (-1) * cos - (-20) * sin, y + (-1) * sin + (-20) * cos);
      this.gfx.lineTo(x + 0 * cos - (-20) * sin, y + 0 * sin + (-20) * cos);
      this.gfx.lineTo(x + 0 * cos - 20 * sin, y + 0 * sin + 20 * cos);
      this.gfx.lineTo(x + (-1) * cos - 20 * sin, y + (-1) * sin + 20 * cos);
      this.gfx.closePath();
      this.gfx.fillPath();
      // 刀柄
      this.gfx.fillStyle(0x4a148c, 1);
      this.gfx.fillRect(x - 3, y + 18, 6, 8);
    } else if (this.id === 'bu_gu_po_fa') {
      // 银色短棍
      this.gfx.fillStyle(0xc0c0c0, 0.9);
      this.gfx.fillRect(x - 3, y - 15, 6, 30);
      this.gfx.fillStyle(0xffffff, 0.4);
      this.gfx.fillRect(x - 1, y - 15, 1, 30);
      // 两端装饰
      this.gfx.fillStyle(0xffd54f, 1);
      this.gfx.fillCircle(x, y - 15, 4);
      this.gfx.fillCircle(x, y + 15, 4);
    } else if (this.id === 'fu_cang_long') {
      // 红金交织长鞭（波浪线）
      const angle = this.phase * 0.5;
      this.gfx.lineStyle(3, 0xff5252, 0.8);
      this.gfx.beginPath();
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const px = x + Math.cos(angle + t * Math.PI * 2) * 20;
        const py = y + Math.sin(angle + t * Math.PI * 2) * 20;
        if (i === 0) this.gfx.moveTo(px, py);
        else this.gfx.lineTo(px, py);
      }
      this.gfx.strokePath();
      this.gfx.lineStyle(2, 0xffd54f, 0.6);
      this.gfx.beginPath();
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const px = x + Math.cos(angle + t * Math.PI * 2 + 0.5) * 18;
        const py = y + Math.sin(angle + t * Math.PI * 2 + 0.5) * 18;
        if (i === 0) this.gfx.moveTo(px, py);
        else this.gfx.lineTo(px, py);
      }
      this.gfx.strokePath();
    }
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
