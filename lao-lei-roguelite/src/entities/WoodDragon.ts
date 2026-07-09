/**
 * 木行游龙 - 神之手木行召唤
 * 免疫木行和土行伤害，青色长条龙形
 * 快速朝主角冲撞，成功后返回神之手旁等待1秒继续
 */
import Phaser from 'phaser';
import { COLORS } from '../utils/colors';
import { Element, ELEMENT_COLORS } from '../systems/ElementSystem';
import { DefenseSystem, IDefensible } from '../systems/DefenseSystem';

export class WoodDragon extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public damage: number;
  public element: Element = 'wood';
  public isDead = false;
  /** 末法魔化 */
  public magicDesolation = false;
  public defense: IDefensible = DefenseSystem.createDefense();

  private gfx: Phaser.GameObjects.Graphics;
  private phase = 0;
  private hitFlash = 0;
  /** 状态：charging冲撞中, returning返回中, waiting等待中 */
  public state: 'charging' | 'returning' | 'waiting' = 'waiting';
  private stateTimer = 1;
  /** 神之手位置（返回目标） */
  private homeX: number;
  private homeY: number;
  /** 冲撞速度 */
  private speed = 600;
  /** 已命中标记（防止冲撞重复伤害） */
  public hitPlayer = false;

  constructor(scene: Phaser.Scene, x: number, y: number, hp: number, damage: number, homeX: number, homeY: number) {
    super(scene, x, y, 'enemy_body');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.maxHp = hp;
    this.hp = hp;
    this.damage = damage;
    this.defense.defense = 5;  // 游龙防御5
    this.homeX = homeX;
    this.homeY = homeY;

    this.setCircle(12, 0, 0);
    this.setCollideWorldBounds(true);
    this.setDepth(9);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(9);
  }

  /** 更新 home 位置（神之手移动时） */
  updateHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
  }

  update(dt: number, targetX: number, targetY: number): void {
    if (this.isDead) return;
    this.phase += dt * 5;
    this.stateTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    switch (this.state) {
      case 'waiting': {
        this.setVelocity(0, 0);
        if (this.stateTimer <= 0) {
          this.state = 'charging';
          this.hitPlayer = false;
        }
        break;
      }
      case 'charging': {
        // 朝主角冲撞
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        // 命中玩家后切换返回状态（伤害由 GameScene 处理）
        const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
        if (dist < 20) {
          this.state = 'returning';
        }
        // 冲太远也返回
        const distFromHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
        if (distFromHome > 600) {
          this.state = 'returning';
        }
        break;
      }
      case 'returning': {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.homeX, this.homeY);
        this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
        if (dist < 40) {
          this.state = 'waiting';
          this.stateTimer = 1;
          this.setVelocity(0, 0);
        }
        break;
      }
    }

    this.draw();
  }

  /** 检查是否冲撞命中玩家 */
  checkHit(targetX: number, targetY: number): boolean {
    if (this.state === 'charging' && !this.hitPlayer) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
      if (dist < 20) {
        this.hitPlayer = true;
        this.state = 'returning';
        return true;
      }
    }
    return false;
  }

  takeDamage(amount: number, attackElement: Element = 'none', skipFlash = false): boolean {
    if (this.isDead) return true;
    // 免疫木行和土行伤害
    if (attackElement === 'wood' || attackElement === 'earth') {
      return false;
    }
    // 末法魔化减伤
    if (this.magicDesolation) amount *= 0.05;
    amount = DefenseSystem.applyDefense(this.defense, amount);
    this.hp -= amount;
    if (!skipFlash) this.hitFlash = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      return true;
    }
    return false;
  }

  private draw(): void {
    this.gfx.clear();
    const flashing = this.hitFlash > 0;
    const color = flashing ? 0xffffff : 0x66bb6a;
    const r = 12;

    // 龙身（长条形，根据移动方向）
    const angle = Math.atan2(this.body?.velocity?.y ?? 0, this.body?.velocity?.x ?? 0);
    const bodyLen = 30;

    // 光晕
    this.gfx.fillStyle(0x66bb6a, 0.2);
    this.gfx.fillCircle(this.x, this.y, r + 6);

    // 龙身（椭圆）
    this.gfx.fillStyle(color, 1);
    this.gfx.fillEllipse(this.x, this.y, bodyLen, r * 1.5);

    // 龙头（前端圆）
    const headX = this.x + Math.cos(angle) * bodyLen * 0.4;
    const headY = this.y + Math.sin(angle) * bodyLen * 0.4;
    this.gfx.fillCircle(headX, headY, r * 0.8);

    // 龙眼
    this.gfx.fillStyle(0xffeb3b, 1);
    this.gfx.fillCircle(headX + Math.cos(angle) * 3, headY + Math.sin(angle) * 3, 2);

    // 龙尾（渐细）
    const tailX = this.x - Math.cos(angle) * bodyLen * 0.5;
    const tailY = this.y - Math.sin(angle) * bodyLen * 0.5;
    this.gfx.fillStyle(color, 0.6);
    this.gfx.fillCircle(tailX, tailY, r * 0.5);

    // 鳞片纹理
    this.gfx.fillStyle(0x2e7d32, 0.5);
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4;
      const sx = this.x + (headX - this.x) * t;
      const sy = this.y + (headY - this.y) * t;
      this.gfx.fillCircle(sx, sy, 2);
    }
  }

  destroy(fromScene?: boolean): void {
    this.gfx.destroy();
    super.destroy(fromScene);
  }
}
