/**
 * BootScene - 启动场景
 * 生成 1x1 像素纹理（用作 Physics Sprite 基底），然后跳转菜单
 * 所有视觉用 Graphics 实时绘制，无需外部图片
 */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // 生成 1x1 白色像素纹理，作为所有 sprite 的基底
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff, 0);  // 完全透明
    gfx.fillRect(0, 0, 1, 1);
    gfx.generateTexture('player_body', 1, 1);
    gfx.generateTexture('enemy_body', 1, 1);
    gfx.generateTexture('proj_body', 1, 1);
    gfx.generateTexture('gem_body', 1, 1);
    gfx.destroy();

    // 适配缩放
    this.scale.refresh();

    // 跳转菜单
    this.scene.start('Menu');
  }
}
