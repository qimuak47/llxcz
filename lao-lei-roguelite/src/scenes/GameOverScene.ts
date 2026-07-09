/**
 * GameOverScene - 死亡结算
 * 显示本局成绩、历史最佳、重开/返回菜单
 */
import Phaser from 'phaser';
import { COLORS, COLOR_STR } from '../utils/colors';
import { SaveSystem } from '../systems/SaveSystem';

interface GameOverData {
  level: number;
  kills: number;
  time: number;
  gems: number;
  victory?: boolean;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const isVictory = data.victory === true;

    // 背景
    const bg = this.add.graphics();
    if (isVictory) {
      bg.fillGradientStyle(0x1a2a00, 0x1a2a00, 0x0a0e1a, 0x0a0e1a, 1);
    } else {
      bg.fillGradientStyle(0x1a0000, 0x1a0000, 0x0a0e1a, 0x0a0e1a, 1);
    }
    bg.fillRect(0, 0, W, H);

    // 标题
    if (isVictory) {
      this.add.text(W / 2, H * 0.18, '胜  利', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '72px',
        color: '#ffd54f',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 6,
      }).setOrigin(0.5).setShadow(0, 0, '#ffd54f', 25, true, true);

      this.add.text(W / 2, H * 0.18 + 60, '神之手陨落，东南山脉重归太平……', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#b0bec5',
      }).setOrigin(0.5);
    } else {
      this.add.text(W / 2, H * 0.18, '陨  落', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '72px',
        color: '#ef5350',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 6,
      }).setOrigin(0.5).setShadow(0, 0, '#ef5350', 25, true, true);

      this.add.text(W / 2, H * 0.18 + 60, '磁场溃散，老雷倒在了群山之间……', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: '#b0bec5',
      }).setOrigin(0.5);
    }

    // 本局成绩
    const save = SaveSystem.load();
    const statsY = H * 0.4;
    this.add.text(W / 2, statsY, '本局战绩', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: COLOR_STR.GOLD,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const lines = [
      `境界：Lv.${data.level}`,
      `击杀：${data.kills} 只妖兽`,
      `存活：${this.formatTime(data.time)}`,
      `灵石：${data.gems} 颗`,
    ];
    lines.forEach((line, i) => {
      this.add.text(W / 2, statsY + 40 + i * 28, line, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: COLOR_STR.WHITE,
      }).setOrigin(0.5);
    });

    // 历史最佳
    const bestY = statsY + 40 + lines.length * 28 + 30;
    const isNewBestLevel = data.level >= save.bestLevel;
    const isNewBestTime = data.time >= save.bestTime;
    this.add.text(W / 2, bestY,
      `历史最佳：Lv.${save.bestLevel}  ·  ${this.formatTime(save.bestTime)}`,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '14px',
        color: COLOR_STR.DIM,
      }).setOrigin(0.5);

    if (isNewBestLevel || isNewBestTime) {
      this.add.text(W / 2, bestY + 24, '★ 新纪录！ ★', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '18px',
        color: COLOR_STR.GOLD,
        fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // 按钮
    const btnY = H * 0.82;
    this.createButton(W / 2 - 110, btnY, '再 入 凡 尘', 0x4dd0e1, () => {
      this.scene.start('Game');
    });
    this.createButton(W / 2 + 110, btnY, '回 到 山 门', 0x607d8b, () => {
      this.scene.start('Menu');
    });
  }

  private createButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
    const W = 180;
    const H = 50;
    const rect = this.add.rectangle(x, y, W, H, color, 0.15)
      .setStrokeStyle(2, color, 0.9);
    const text = this.add.text(x, y, label, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => {
      rect.setFillStyle(color, 0.35);
      rect.setStrokeStyle(3, color, 1);
    });
    rect.on('pointerout', () => {
      rect.setFillStyle(color, 0.15);
      rect.setStrokeStyle(2, color, 0.9);
    });
    rect.on('pointerdown', () => onClick());
  }

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
