/**
 * 虚拟摇杆 - 移动端触屏控制
 * 桌面端自动隐藏，移动端左下角出现
 * 也支持键盘 WASD/方向键（桌面端主要输入方式）
 */
import Phaser from 'phaser';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private base: Phaser.GameObjects.Arc;
  private stick: Phaser.GameObjects.Arc;
  private touchId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private active = false;
  private visible = false;

  /** 摇杆输出向量（归一化方向 × 强度 0~1） */
  public vx = 0;
  public vy = 0;

  /** 最大拖拽半径 */
  private readonly RADIUS = 60;
  private readonly BASE_R = 70;
  private readonly STICK_R = 32;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // 摇杆默认位置：左下角（屏幕坐标）
    this.centerX = 130;
    this.centerY = scene.scale.height - 130;

    this.base = scene.add.circle(this.centerX, this.centerY, this.BASE_R, 0xffffff, 0.08)
      .setStrokeStyle(2, 0xffffff, 0.25);
    this.stick = scene.add.circle(this.centerX, this.centerY, this.STICK_R, 0x4dd0e1, 0.5)
      .setStrokeStyle(2, 0x80deea, 0.8);

    this.container = scene.add.container(0, 0, [this.base, this.stick]);
    this.container.setDepth(1000);
    // 关键：摇杆固定在屏幕上，不跟随相机滚动
    this.container.setScrollFactor(0);
    this.base.setScrollFactor(0);
    this.stick.setScrollFactor(0);
    this.container.setVisible(false);

    this.bindEvents();
    this.checkTouchDevice();
  }

  /** 判断是否触屏设备 */
  private checkTouchDevice(): void {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
      this.visible = true;
      this.container.setVisible(true);
    }
  }

  private bindEvents(): void {
    // 触屏开始：左半屏区域触发摇杆
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.visible) return;
      if (this.touchId !== null) return;
      // 仅响应左半屏
      if (pointer.x > this.scene.scale.width / 2) return;
      this.touchId = pointer.id;
      this.active = true;
      // 摇杆跟随按下位置
      this.centerX = pointer.x;
      this.centerY = pointer.y;
      this.base.setPosition(this.centerX, this.centerY);
      this.stick.setPosition(this.centerX, this.centerY);
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.active || pointer.id !== this.touchId) return;
      const dx = pointer.x - this.centerX;
      const dy = pointer.y - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, this.RADIUS);
      const angle = Math.atan2(dy, dx);
      const sx = this.centerX + Math.cos(angle) * clampedDist;
      const sy = this.centerY + Math.sin(angle) * clampedDist;
      this.stick.setPosition(sx, sy);
      // 输出向量
      const strength = clampedDist / this.RADIUS;
      this.vx = Math.cos(angle) * strength;
      this.vy = Math.sin(angle) * strength;
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.touchId) return;
      this.touchId = null;
      this.active = false;
      this.vx = 0;
      this.vy = 0;
      // 回到默认位置
      this.centerX = 130;
      this.centerY = this.scene.scale.height - 130;
      this.base.setPosition(this.centerX, this.centerY);
      this.stick.setPosition(this.centerX, this.centerY);
    });
  }

  /** 是否启用（触屏设备） */
  isEnabled(): boolean {
    return this.visible;
  }
}
