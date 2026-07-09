/**
 * MenuScene - 主菜单
 * 显示标题、开始按钮、历史记录、操作说明
 */
import Phaser from 'phaser';
import { COLORS, COLOR_STR } from '../utils/colors';
import { SaveSystem } from '../systems/SaveSystem';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 渐变背景
    this.drawBackground(W, H);

    // 标题
    const titleY = H * 0.22;
    this.add.text(W / 2, titleY, '穿越者老雷', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '64px',
      color: COLOR_STR.CYAN,
      fontStyle: 'bold',
      stroke: '#003344',
      strokeThickness: 6,
    }).setOrigin(0.5).setShadow(0, 0, COLOR_STR.CYAN, 20, true, true);

    this.add.text(W / 2, titleY + 60, '· 修仙肉鸽 ·', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color: COLOR_STR.GOLD,
    }).setOrigin(0.5);

    // 副标题/剧情
    this.add.text(W / 2, titleY + 110,
      '一道惊雷劈下，老雷坠入群山之中……\n磁场转动，放电御敌，于妖兽环伺间开辟仙途。',
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        color: COLOR_STR.DIM,
        align: 'center',
        lineSpacing: 6,
      }).setOrigin(0.5);

    // 开始按钮
    const btnY = H * 0.54;
    const startBtn = this.createButton(W / 2, btnY, '开 始 穿 越', 0x4dd0e1, () => {
      this.showLevelSelect();
    });
    startBtn.setScale(1.1);

    // 图鉴按钮
    const codexBtn = this.createButton(W / 2, btnY + 60, '图  鉴', 0xffd54f, () => {
      this.scene.start('Codex');
    });
    codexBtn.setScale(0.9);

    // 历史记录
    const save = SaveSystem.load();
    const recordY = H * 0.72;
    this.add.text(W / 2, recordY,
      `累计击杀：${save.totalKills}    游玩次数：${save.totalRuns}\n` +
      `最高等级：${save.bestLevel}    最长存活：${this.formatTime(save.bestTime)}`,
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        color: COLOR_STR.DIM,
        align: 'center',
        lineSpacing: 4,
      }).setOrigin(0.5);

    // 操作说明
    const helpY = H * 0.86;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) {
      this.add.text(W / 2, helpY,
        '左半屏拖动 = 移动   ·   自动攻击最近妖兽',
        { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: COLOR_STR.DIM })
        .setOrigin(0.5);
    } else {
      this.add.text(W / 2, helpY,
        'WASD / 方向键 = 移动   ·   自动攻击最近妖兽   ·   ESC 暂停',
        { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: COLOR_STR.DIM })
        .setOrigin(0.5);
    }
  }

  private drawBackground(W: number, H: number): void {
    // 渐变
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.BG_DARK, COLORS.BG_DARK, COLORS.BG_MID, COLORS.BG_MID, 1);
    bg.fillRect(0, 0, W, H);

    // 远山剪影
    bg.fillStyle(COLORS.MOUNTAIN, 0.6);
    bg.beginPath();
    bg.moveTo(0, H * 0.7);
    for (let x = 0; x <= W; x += 40) {
      const y = H * 0.7 + Math.sin(x * 0.01) * 30 + Math.sin(x * 0.03) * 15;
      bg.lineTo(x, y);
    }
    bg.lineTo(W, H);
    bg.lineTo(0, H);
    bg.closePath();
    bg.fillPath();

    bg.fillStyle(COLORS.MOUNTAIN_LIGHT, 0.5);
    bg.beginPath();
    bg.moveTo(0, H * 0.8);
    for (let x = 0; x <= W; x += 30) {
      const y = H * 0.8 + Math.sin(x * 0.015 + 1) * 20;
      bg.lineTo(x, y);
    }
    bg.lineTo(W, H);
    bg.lineTo(0, H);
    bg.closePath();
    bg.fillPath();

    // 星空
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H * 0.6;
      const r = Math.random() * 1.5 + 0.3;
      bg.fillStyle(0xffffff, Math.random() * 0.6 + 0.2);
      bg.fillCircle(x, y, r);
    }
  }

  /** 创建按钮 */
  /** 选关界面 */
  private showLevelSelect(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 半透明遮罩
    const mask = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);
    mask.setDepth(100);

    // 标题
    const title = this.add.text(W / 2, H * 0.2, '选择地图', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '36px',
      color: '#ffd54f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(101);

    // 地图选项：东南山脉（初始地图）
    const mapBtn = this.createButton(W / 2, H * 0.45, '东南山脉', 0x4dd0e1, () => {
      this.scene.start('Game');
    });
    mapBtn.setScale(1.2);
    mapBtn.setDepth(101);

    // 地图描述
    this.add.text(W / 2, H * 0.55, '群山之中，妖兽环伺，灵石矿脉隐现', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#b0bec5',
    }).setOrigin(0.5).setDepth(101);

    // 返回按钮
    const backBtn = this.createButton(W / 2, H * 0.75, '返回', 0x607d8b, () => {
      mask.destroy();
      title.destroy();
      mapBtn.destroy();
      backBtn.destroy();
      // 重新创建主菜单元素（简化：直接重启场景）
      this.scene.restart();
    });
    backBtn.setDepth(101);
  }

  private createButton(x: number, y: number, label: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
    const W = 240;
    const H = 56;
    const rect = this.add.rectangle(0, 0, W, H, color, 0.15)
      .setStrokeStyle(2, color, 0.9);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '22px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const c = this.add.container(x, y, [rect, text]);
    c.setSize(W, H);
    c.setInteractive({ useHandCursor: true });

    c.on('pointerover', () => {
      rect.setFillStyle(color, 0.3);
      rect.setStrokeStyle(3, color, 1);
      c.setScale(1.05);
    });
    c.on('pointerout', () => {
      rect.setFillStyle(color, 0.15);
      rect.setStrokeStyle(2, color, 0.9);
      c.setScale(1);
    });
    c.on('pointerdown', () => {
      onClick();
    });

    return c;
  }

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
