/**
 * UIScene - HUD 覆盖层
 * 显示：血条、经验条、等级、计时、击杀数、boss 血条、五行法术、天劫倒计时、神使血条
 */
import Phaser from 'phaser';
import { COLORS, COLOR_STR } from '../utils/colors';
import { Element, ELEMENT_COLORS, ELEMENT_NAMES, ELEMENT_COLOR_STR } from '../systems/ElementSystem';
import { GRADE_NAMES, GRADE_COLORS } from '../systems/TreasureSystem';
import { SPIRIT_TREASURE_POOL } from '../systems/SpiritTreasureSystem';

interface UIData {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  time: number;
  kills: number;
  boss: { hp: number; maxHp: number } | null;
  spells: { id: string; element: Element; name: string }[];
  tribulation?: {
    active: boolean;
    timer: number;
    count: number;
    envoy: { hp: number; maxHp: number; name: string; element: Element } | null;
  };
  debuffs?: { name: string; time: number }[];
}

export class UIScene extends Phaser.Scene {
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpBarText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private bossBar?: Phaser.GameObjects.Container;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  private bossBarText?: Phaser.GameObjects.Text;
  private spellIcons: Phaser.GameObjects.Container[] = [];
  private spellContainer!: Phaser.GameObjects.Container;
  // debuff 显示
  private debuffText!: Phaser.GameObjects.Text;
  // 磁场转动按钮
  private magneticBtn!: Phaser.GameObjects.Container;
  private magneticCooldown = 0;
  private magneticActive = false;
  private magneticActiveTimer = 0;
  // 天劫 UI
  private tribulationTimerText!: Phaser.GameObjects.Text;
  private tribulationTimerBg!: Phaser.GameObjects.Rectangle;
  private envoyBar?: Phaser.GameObjects.Container;
  private envoyBarFill?: Phaser.GameObjects.Rectangle;
  private envoyBarText?: Phaser.GameObjects.Text;

  constructor() {
    super('UI');
  }

  create(): void {
    const W = this.scale.width;

    // ===== 顶部血条 + 经验条 =====
    const barY = 20;
    const barW = 280;
    const barH = 18;

    // P1 血条（左上）
    this.add.text(20, 8, '老雷', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: COLOR_STR.CYAN,
      fontStyle: 'bold',
    });
    // 血条背景
    this.add.rectangle(20 + barW / 2, barY + barH / 2, barW, barH, COLORS.HP_BG, 0.9)
      .setStrokeStyle(1, 0xffffff, 0.3);
    this.hpBarFill = this.add.rectangle(20, barY, barW, barH, COLORS.HP_FILL, 1)
      .setOrigin(0, 0);
    this.hpBarText = this.add.text(20 + barW / 2, barY + barH / 2, '', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 经验条（血条下方）
    const xpY = barY + barH + 4;
    this.add.rectangle(20 + barW / 2, xpY + 4, barW, 8, COLORS.XP_BG, 0.9);
    this.xpBarFill = this.add.rectangle(20, xpY, barW, 8, COLORS.XP_FILL, 1)
      .setOrigin(0, 0);

    // 等级
    this.levelText = this.add.text(20 + barW + 12, barY, 'Lv.1', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: COLOR_STR.GOLD,
      fontStyle: 'bold',
    });

    // ===== 右上：计时 + 击杀 =====
    this.timeText = this.add.text(W - 20, 12, '0:00', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '28px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.killsText = this.add.text(W - 20, 46, '击杀 0', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: COLOR_STR.DIM,
    }).setOrigin(1, 0);

    // ===== Boss 血条（顶部中央，仅 boss 存在时显示） =====
    this.createBossBar();

    // 监听 GameScene 事件
    const game = this.scene.get('Game');
    game.events.on('ui-update', (data: UIData) => this.updateUI(data));
    game.events.on('boss-spawn', () => this.showBossBar());
    game.events.on('boss-dead', () => this.hideBossBar());

    // 五行法术图标容器（左下角）—— 已移除，改用属性面板查看
    // 保留空容器避免引用错误
    this.spellContainer = this.add.container(20, this.scale.height - 50);
    this.spellContainer.setDepth(50);

    // debuff 提示（血条下方）
    this.debuffText = this.add.text(20, 60, '', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#ff5252',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 2,
      lineSpacing: 2,
    }).setDepth(50);

    // 属性按钮（右下角）
    this.createStatsButton();

    // 磁场转动按钮（右侧正中，跟随相机）
    this.createMagneticButton();

    // 天劫倒计时（顶部中央，醒目）
    this.createTribulationTimer();

    // 神使血条（顶部中央，天劫时显示）
    this.createEnvoyBar();

    // 五行相克说明（右下角）
    this.createElementGuide();

    // 缩放适配
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
    });
  }

  /** 创建氪命爆种按钮（右侧正中，仿真按钮样式） */
  private createMagneticButton(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const btnX = W - 55;
    const btnY = H / 2;

    // 仿真按钮：圆形渐变+高光+边框
    const btnGfx = this.add.graphics();
    btnGfx.setScrollFactor(0);
    btnGfx.setDepth(60);
    const drawButton = (color: number, scale: number) => {
      btnGfx.clear();
      // 外圈光晕
      btnGfx.fillStyle(color, 0.15);
      btnGfx.fillCircle(btnX, btnY, 35 * scale);
      // 按钮主体（渐变圆）
      btnGfx.fillStyle(color, 0.8);
      btnGfx.fillCircle(btnX, btnY, 28 * scale);
      // 高光
      btnGfx.fillStyle(0xffffff, 0.25);
      btnGfx.fillCircle(btnX - 8 * scale, btnY - 8 * scale, 12 * scale);
      // 边框
      btnGfx.lineStyle(3, 0xffffff, 0.6);
      btnGfx.strokeCircle(btnX, btnY, 28 * scale);
      // 内圈装饰
      btnGfx.lineStyle(1, 0xffffff, 0.3);
      btnGfx.strokeCircle(btnX, btnY, 22 * scale);
    };
    drawButton(0xff5252, 1);

    const btnText = this.add.text(btnX, btnY, '氪命\n爆种', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(61);

    const hitArea = this.add.rectangle(btnX, btnY, 70, 70, 0x000000, 0)
      .setScrollFactor(0).setDepth(62).setInteractive({ useHandCursor: true });

    this.magneticBtn = this.add.container(0, 0, [btnGfx, btnText, hitArea]);
    this.magneticBtn.setDepth(60);

    hitArea.on('pointerdown', () => {
      const game = this.scene.get('Game') as any;
      if (!game || !game.player) return;
      if (this.magneticCooldown > 0) {
        const tip = this.add.text(btnX - 80, btnY, '还tmd不能爆发呀！', {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '14px',
          color: '#ff5252',
          fontStyle: 'bold',
          backgroundColor: '#000000',
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5).setScrollFactor(0).setAlpha(0).setDepth(80);
        this.tweens.add({ targets: tip, alpha: 1, duration: 200, yoyo: true, hold: 1000, onComplete: () => tip.destroy() });
        return;
      }
      // 扣除50%当前生命
      game.player.hp -= game.player.hp * 0.5;
      this.magneticActive = true;
      this.magneticActiveTimer = 15;
      this.magneticCooldown = 45;  // 45秒冷却
      game.player.magneticBoost = true;
      game.player.magneticBoostTimer = 15;
      // 按钮变金色
      drawButton(0xffd54f, 1.15);
      btnText.setText('爆发\n中!');
      // 台词显示在玩家位置2秒
      const gameScene = this.scene.get('Game');
      const px = gameScene.cameras.main.scrollX + gameScene.cameras.main.width / 2;
      const py = gameScene.cameras.main.scrollY + gameScene.cameras.main.height / 2 - 100;
      const line = gameScene.add.text(px, py, '他妈的25万匹力量！给我强化普通攻击！', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '20px',
        color: '#ff5252',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0).setDepth(150);
      gameScene.tweens.add({ targets: line, alpha: 1, duration: 300, yoyo: true, hold: 1700, onComplete: () => line.destroy() });
    });
  }
  private createStatsButton(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // 灵宝按钮
    const spiritBtn = this.add.text(W - 200, H - 40, '✨ 灵宝', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60).setInteractive({ useHandCursor: true });
    spiritBtn.on('pointerover', () => spiritBtn.setStyle({ backgroundColor: '#546e7a' }));
    spiritBtn.on('pointerout', () => spiritBtn.setStyle({ backgroundColor: '#37474f' }));
    spiritBtn.on('pointerdown', () => this.showSpiritTreasurePanel());

    // 法宝按钮
    const treasureBtn = this.add.text(W - 130, H - 40, '📿 法宝', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60).setInteractive({ useHandCursor: true });
    treasureBtn.on('pointerover', () => treasureBtn.setStyle({ backgroundColor: '#546e7a' }));
    treasureBtn.on('pointerout', () => treasureBtn.setStyle({ backgroundColor: '#37474f' }));
    treasureBtn.on('pointerdown', () => this.showTreasurePanel());

    // 属性按钮
    const btn = this.add.text(W - 60, H - 40, '📋 属性', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#546e7a' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#37474f' }));
    btn.on('pointerdown', () => this.showStatsPanel());
  }

  /** 显示属性面板（可滚动+点击查看详情） */
  private showStatsPanel(): void {
    const game = this.scene.get('Game');
    const stats = (game as any).stats;
    if (!stats) return;

    const W = this.scale.width;
    const H = this.scale.height;
    this.scene.pause('Game');

    const mask = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);
    mask.setDepth(100).setInteractive();  // 点击遮罩关闭详情

    const panelW = Math.min(W - 40, 520);
    const panelH = Math.min(H - 40, 520);
    const panel = this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x1e2a44, 0.95)
      .setStrokeStyle(2, 0x4dd0e1, 1);
    panel.setDepth(101);

    const title = this.add.text(W / 2, H / 2 - panelH / 2 + 25, '老雷 · 修行录', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '22px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102);

    // 属性摘要（固定顶部）
    const player = (game as any).player;
    const defense = player ? Math.round(player.defense.defense + player.defense.tempDefense) : 0;
    const summary = [
      `境界 Lv.${(game as any).level}  |  击杀 ${(game as any).kills}`,
      `生命 ${Math.ceil(stats.maxHp)}  伤害 ${Math.round(stats.damage)}  防御 ${defense}`,
      `攻速 ${stats.attackSpeed.toFixed(1)}/s  移速 ${Math.round(stats.moveSpeed)}  雷电 ${stats.projectileCount}  穿透 ${stats.pierce}`,
    ].join('\n');
    const summaryText = this.add.text(W / 2 - panelW / 2 + 20, H / 2 - panelH / 2 + 55, summary, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#b0bec5',
      lineSpacing: 4,
    }).setDepth(102);

    // 可点击的法术列表
    const elements: Phaser.GameObjects.Text[] = [];
    let yPos = H / 2 - panelH / 2 + 120;
    const sectionTitle1 = this.add.text(W / 2 - panelW / 2 + 20, yPos, '【五行法术】', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: '#4dd0e1',
      fontStyle: 'bold',
    }).setDepth(102);
    elements.push(sectionTitle1);
    yPos += 22;

    if (stats.spells.length === 0) {
      const t = this.add.text(W / 2 - panelW / 2 + 30, yPos, '（暂无）', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#78909c',
      }).setDepth(102);
      elements.push(t);
      yPos += 18;
    } else {
      for (const s of stats.spells) {
        const stacks = stats.spellStacks[s.id] ?? 0;
        const evo = s.evolved ? ' ★进化' : '';
        // 计算法术实际伤害
        const baseDmg = stats.damage;
        const dmgMul = s.damageMul ?? 1;
        const actualDmg = Math.round(baseDmg * dmgMul);
        const txt = this.add.text(W / 2 - panelW / 2 + 30, yPos,
          `[${ELEMENT_NAMES[s.element as Element]}] ${s.name} Lv.${stacks}${evo}  伤害:${actualDmg}`, {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '13px',
            color: '#ffffff',
          }).setDepth(102).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', () => {
          this.showDetailPopup(s.name, s.desc + (s.evolved ? '\n★已进化' : ''), W, H);
        });
        elements.push(txt);
        yPos += 18;
      }
    }

    yPos += 8;
    const sectionTitle2 = this.add.text(W / 2 - panelW / 2 + 20, yPos, '【已装备法宝】', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setDepth(102);
    elements.push(sectionTitle2);
    yPos += 22;

    const equipped = stats.equippedTreasures.filter((t: any) => t !== null);
    if (equipped.length === 0) {
      const t = this.add.text(W / 2 - panelW / 2 + 30, yPos, '（暂无）', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '13px',
        color: '#78909c',
      }).setDepth(102);
      elements.push(t);
      yPos += 18;
    } else {
      for (const t of equipped) {
        const txt = this.add.text(W / 2 - panelW / 2 + 30, yPos,
          `[${GRADE_NAMES[t.grade as keyof typeof GRADE_NAMES]}] ${t.name}`, {
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontSize: '13px',
            color: '#' + GRADE_COLORS[t.grade as keyof typeof GRADE_COLORS].toString(16).padStart(6, '0'),
          }).setDepth(102).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', () => {
          this.showDetailPopup(t.name, t.desc, W, H);
        });
        elements.push(txt);
        yPos += 18;
      }
    }

    // 关闭按钮
    const closeBtn = this.add.text(W / 2, H / 2 + panelH / 2 - 25, '✕ 关闭', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ff5252',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });

    const closePanel = () => {
      mask.destroy();
      panel.destroy();
      title.destroy();
      summaryText.destroy();
      elements.forEach(e => e.destroy());
      closeBtn.destroy();
      this.scene.resume('Game');
      this.input.keyboard?.off('keydown-ESC', closePanel);
    };
    closeBtn.on('pointerdown', closePanel);
    mask.on('pointerdown', () => {});  // 阻止穿透
    this.input.keyboard?.once('keydown-ESC', closePanel);
  }

  /** 显示详情弹窗（点击法术/法宝时） */
  private showDetailPopup(name: string, desc: string, W: number, H: number): void {
    // 移除旧弹窗
    this.children.list.filter(c => (c as any).name === 'detailPopup').forEach(c => c.destroy());

    const popup = this.add.container(W / 2, H / 2);
    (popup as any).name = 'detailPopup';
    popup.setDepth(110);
    const bg = this.add.rectangle(0, 0, 320, 100, 0x000000, 0.95).setStrokeStyle(2, 0xffd54f, 1);
    const title = this.add.text(0, -30, name, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const descText = this.add.text(0, 5, desc, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 290 },
    }).setOrigin(0.5);
    const hint = this.add.text(0, 35, '点击其他位置关闭', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '11px',
      color: '#78909c',
    }).setOrigin(0.5);
    popup.add([bg, title, descText, hint]);
    bg.setInteractive();
    bg.on('pointerdown', () => popup.destroy());
  }

  /** 法宝面板状态（选中模式） */
  private treasurePanelState: {
    frameElements: Phaser.GameObjects.GameObject[];  // 框架元素（mask/panel/title/hint/closeBtn）
    slotElements: Phaser.GameObjects.GameObject[];   // 动态栏位元素
    selected: { type: 'equip' | 'bag'; index: number } | null;
    detailPopup: Phaser.GameObjects.Container | null;
  } | null = null;

  /** 显示法宝装备面板（选中→交换模式） */
  private showTreasurePanel(): void {
    const game = this.scene.get('Game');
    const stats = (game as any).stats;
    if (!stats) return;

    // 如果面板已打开，先关闭
    if (this.treasurePanelState) {
      this.closeTreasurePanel();
      return;
    }

    const W = this.scale.width;
    const H = this.scale.height;
    this.scene.pause('Game');

    this.treasurePanelState = {
      frameElements: [],
      slotElements: [],
      selected: null,
      detailPopup: null,
    };

    const mask = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);
    mask.setDepth(100).setInteractive();
    this.treasurePanelState.frameElements.push(mask);

    const panelW = Math.min(W - 40, 560);
    const panelH = Math.min(H - 40, 560);
    const panel = this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x1e2a44, 0.95)
      .setStrokeStyle(2, 0xffd54f, 1);
    panel.setDepth(101);
    this.treasurePanelState.frameElements.push(panel);

    const title = this.add.text(W / 2, H / 2 - panelH / 2 + 25, '法宝 · 装备栏', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '22px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102);
    this.treasurePanelState.frameElements.push(title);

    const hint = this.add.text(W / 2, H / 2 - panelH / 2 + 50, '点击法宝选中，再点击目标栏位交换/装备', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: '#78909c',
    }).setOrigin(0.5).setDepth(102);
    this.treasurePanelState.frameElements.push(hint);

    // 关闭按钮（框架元素，不会被重新渲染销毁）
    const closeBtn = this.add.text(W / 2, H / 2 + panelH / 2 - 25, '✕ 关闭', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#ff5252',
      fontStyle: 'bold',
      backgroundColor: '#37474f',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeTreasurePanel());
    this.treasurePanelState.frameElements.push(closeBtn);

    this.renderTreasureSlots(stats, W, H, panelW, panelH);

    this.input.keyboard?.once('keydown-ESC', () => this.closeTreasurePanel());
  }

  /** 渲染法宝栏位（装备栏+背包栏） */
  private renderTreasureSlots(stats: any, W: number, H: number, panelW: number, panelH: number): void {
    // 销毁旧栏位元素
    for (const el of this.treasurePanelState!.slotElements) {
      el.destroy();
    }
    this.treasurePanelState!.slotElements = [];

    const slotSize = Math.min(72, (panelW - 60) / 5);
    const gap = 6;

    // ===== 装备栏（5个栏位） =====
    const equipTitle = this.add.text(W / 2 - panelW / 2 + 20, H / 2 - panelH / 2 + 75, '【装备中】（生效中）', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setDepth(102);
    this.treasurePanelState!.slotElements.push(equipTitle);

    const equipStartX = W / 2 - (slotSize * 5 + gap * 4) / 2 + slotSize / 2;
    const equipY = H / 2 - panelH / 2 + 115;
    for (let i = 0; i < 5; i++) {
      const sx = equipStartX + i * (slotSize + gap);
      const t = stats.equippedTreasures[i];
      this.createTreasureSlot(sx, equipY, slotSize, t, 'equip', i, stats);
    }

    // ===== 背包栏 =====
    const bagTitleY = equipY + slotSize / 2 + 25;
    const bagTitle = this.add.text(W / 2 - panelW / 2 + 20, bagTitleY, `【背包】（${stats.treasures.length}件）`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#4dd0e1',
      fontStyle: 'bold',
    }).setDepth(102);
    this.treasurePanelState!.slotElements.push(bagTitle);

    const bagY = bagTitleY + 25;
    const bagItems = stats.treasures as any[];
    const cols = Math.floor((panelW - 40) / (slotSize + gap));
    const maxRows = Math.floor((H / 2 + panelH / 2 - 60 - bagY) / (slotSize + gap));
    for (let i = 0; i < bagItems.length && i < cols * maxRows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sx = W / 2 - (cols * (slotSize + gap)) / 2 + col * (slotSize + gap) + slotSize / 2;
      const sy = bagY + row * (slotSize + gap);
      const t = bagItems[i];
      this.createTreasureSlot(sx, sy, slotSize, t, 'bag', i, stats);
    }
  }

  /** 创建单个法宝栏位 */
  private createTreasureSlot(x: number, y: number, size: number, treasure: any, type: 'equip' | 'bag', index: number, stats: any): void {
    const isSelected = this.treasurePanelState!.selected?.type === type && this.treasurePanelState!.selected.index === index;
    const borderColor = treasure ? GRADE_COLORS[treasure.grade as keyof typeof GRADE_COLORS] : 0x37474f;
    const borderWidth = isSelected ? 4 : 2;
    const borderColorFinal = isSelected ? 0xffffff : borderColor;

    const slotBg = this.add.rectangle(x, y, size, size, 0x0a0e1a, 0.9)
      .setStrokeStyle(borderWidth, borderColorFinal, 1);
    slotBg.setDepth(102).setInteractive({ useHandCursor: true });
    this.treasurePanelState!.slotElements.push(slotBg);

    if (treasure) {
      // 法宝图标（品级色块）
      const iconBg = this.add.rectangle(x, y - 8, size - 12, size - 28, borderColor, 0.3);
      iconBg.setDepth(103);
      this.treasurePanelState!.slotElements.push(iconBg);

      // 法宝名称（截断）
      const nameText = this.add.text(x, y - 8, treasure.name.slice(0, 3), {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      }).setOrigin(0.5).setDepth(103);
      this.treasurePanelState!.slotElements.push(nameText);

      // 品级标识
      const gradeText = this.add.text(x, y + size / 2 - 10, GRADE_NAMES[treasure.grade as keyof typeof GRADE_NAMES], {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '9px',
        color: '#' + borderColor.toString(16).padStart(6, '0'),
      }).setOrigin(0.5).setDepth(103);
      this.treasurePanelState!.slotElements.push(gradeText);

      // 点击：左键选中/交换，右键查看属性
      slotBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.showTreasureDetail(treasure);
          return;
        }
        this.handleSlotClick(type, index, stats);
      });
    } else {
      // 空栏位
      const emptyText = this.add.text(x, y, '空', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px',
        color: '#37474f',
      }).setOrigin(0.5).setDepth(103);
      this.treasurePanelState!.slotElements.push(emptyText);
      slotBg.on('pointerdown', () => this.handleSlotClick(type, index, stats));
    }
  }

  /** 处理栏位点击（选中/交换逻辑） */
  private handleSlotClick(type: 'equip' | 'bag', index: number, stats: any): void {
    const state = this.treasurePanelState!;
    if (!state.selected) {
      // 没有选中：选中当前栏位（必须有法宝才能选中）
      const t = type === 'equip' ? stats.equippedTreasures[index] : stats.treasures[index];
      if (t) {
        state.selected = { type, index };
      }
    } else {
      // 已选中：执行交换/移动
      const src = state.selected;
      if (src.type === type && src.index === index) {
        // 点击同一个：取消选中
        state.selected = null;
      } else {
        // 执行交换
        this.swapTreasures(src, { type, index }, stats);
        state.selected = null;
      }
    }
    // 重新渲染
    const W = this.scale.width;
    const H = this.scale.height;
    const panelW = Math.min(W - 40, 560);
    const panelH = Math.min(H - 40, 560);
    this.renderTreasureSlots(stats, W, H, panelW, panelH);
  }

  /** 交换两个法宝位置 */
  private swapTreasures(src: { type: string; index: number }, dst: { type: string; index: number }, stats: any): void {
    // 获取源法宝
    let srcTreasure: any;
    if (src.type === 'equip') {
      srcTreasure = stats.equippedTreasures[src.index];
    } else {
      srcTreasure = stats.treasures[src.index];
    }
    // 获取目标法宝
    let dstTreasure: any;
    if (dst.type === 'equip') {
      dstTreasure = stats.equippedTreasures[dst.index];
    } else {
      dstTreasure = stats.treasures[dst.index];
    }

    // 如果源为空，什么都不做
    if (!srcTreasure) return;

    if (src.type === 'equip' && dst.type === 'equip') {
      // 装备栏内部交换
      stats.equippedTreasures[src.index] = dstTreasure;
      stats.equippedTreasures[dst.index] = srcTreasure;
    } else if (src.type === 'bag' && dst.type === 'bag') {
      // 背包内部交换
      stats.treasures[src.index] = dstTreasure;
      stats.treasures[dst.index] = srcTreasure;
    } else if (src.type === 'equip' && dst.type === 'bag') {
      // 装备栏→背包
      if (dstTreasure) {
        // 交换
        stats.equippedTreasures[src.index] = dstTreasure;
        stats.treasures[dst.index] = srcTreasure;
      } else {
        // 移到空位
        stats.equippedTreasures[src.index] = null;
        stats.treasures.push(srcTreasure);
      }
    } else if (src.type === 'bag' && dst.type === 'equip') {
      // 背包→装备栏
      if (dstTreasure) {
        // 交换
        stats.treasures[src.index] = dstTreasure;
        stats.equippedTreasures[dst.index] = srcTreasure;
      } else {
        // 移到空位
        stats.equippedTreasures[dst.index] = srcTreasure;
        stats.treasures.splice(src.index, 1);
      }
    }
  }

  /** 显示法宝详情弹窗 */
  private showTreasureDetail(treasure: any): void {
    // 移除旧弹窗
    if (this.treasurePanelState?.detailPopup) {
      this.treasurePanelState.detailPopup.destroy(true);
      this.treasurePanelState.detailPopup = null;
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const popup = this.add.container(W / 2, H / 2);
    popup.setDepth(110);
    const gradeColor = GRADE_COLORS[treasure.grade as keyof typeof GRADE_COLORS];
    const gradeColorStr = '#' + gradeColor.toString(16).padStart(6, '0');

    const bg = this.add.rectangle(0, 0, 340, 160, 0x000000, 0.95)
      .setStrokeStyle(2, gradeColor, 1);
    bg.setInteractive();
    const title = this.add.text(0, -55, treasure.name, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: gradeColorStr,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const grade = this.add.text(0, -28, `【${GRADE_NAMES[treasure.grade as keyof typeof GRADE_NAMES]}品法宝】`, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#b0bec5',
    }).setOrigin(0.5);
    const desc = this.add.text(0, 5, treasure.desc, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 310 },
    }).setOrigin(0.5);
    const hint = this.add.text(0, 55, '点击关闭', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '11px',
      color: '#78909c',
    }).setOrigin(0.5);
    popup.add([bg, title, grade, desc, hint]);
    bg.on('pointerdown', () => {
      popup.destroy(true);
      if (this.treasurePanelState) this.treasurePanelState.detailPopup = null;
    });
    if (this.treasurePanelState) this.treasurePanelState.detailPopup = popup;
  }

  /** 关闭法宝面板 */
  private closeTreasurePanel(): void {
    if (!this.treasurePanelState) return;
    for (const el of this.treasurePanelState.frameElements) el.destroy();
    for (const el of this.treasurePanelState.slotElements) el.destroy();
    if (this.treasurePanelState.detailPopup) this.treasurePanelState.detailPopup.destroy(true);
    this.treasurePanelState = null;
    this.scene.resume('Game');
    this.input.keyboard?.off('keydown-ESC');
  }

  /** 显示先天灵宝面板 */
  private showSpiritTreasurePanel(): void {
    const game = this.scene.get('Game') as any;
    const stats = game?.stats;
    if (!stats) return;
    this.scene.pause('Game');

    const W = this.scale.width;
    const H = this.scale.height;
    const elements: Phaser.GameObjects.GameObject[] = [];

    const mask = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);
    mask.setDepth(100).setInteractive(); elements.push(mask);

    const panel = this.add.rectangle(W / 2, H / 2, Math.min(W - 40, 480), Math.min(H - 40, 400), 0x1e2a44, 0.95)
      .setStrokeStyle(2, 0xff5252, 1); panel.setDepth(101); elements.push(panel);

    const title = this.add.text(W / 2, H / 2 - 160, '先天灵宝', {
      fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '24px', color: '#ff5252', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102); elements.push(title);

    const spiritIds = stats.spiritTreasures as string[];
    if (spiritIds.length === 0) {
      const empty = this.add.text(W / 2, H / 2, '（暂无先天灵宝）', {
        fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '16px', color: '#78909c',
      }).setOrigin(0.5).setDepth(102); elements.push(empty);
    } else {
      let yPos = H / 2 - 110;
      for (const id of spiritIds) {
        const t = SPIRIT_TREASURE_POOL.find((t: any) => t.id === id);
        if (!t) continue;
        const name = this.add.text(W / 2 - 200, yPos, t.name, {
          fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '16px', color: '#ffd54f', fontStyle: 'bold',
        }).setDepth(102); elements.push(name);
        const desc = this.add.text(W / 2 - 200, yPos + 22, t.desc, {
          fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '12px', color: '#b0bec5', wordWrap: { width: 380 },
        }).setDepth(102); elements.push(desc);
        yPos += 60;
      }
    }

    const closeBtn = this.add.text(W / 2, H / 2 + 160, '✕ 关闭', {
      fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '16px', color: '#ff5252', fontStyle: 'bold',
      backgroundColor: '#37474f', padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true }); elements.push(closeBtn);

    const close = () => { for (const el of elements) el.destroy(); this.scene.resume('Game'); this.input.keyboard?.off('keydown-ESC', close); };
    closeBtn.on('pointerdown', close);
    this.input.keyboard?.once('keydown-ESC', close);
  }

  /** 创建五行相克说明（右下角小字） */
  private createElementGuide(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const txt = this.add.text(W - 12, H - 12,
      '金克木 · 木克土 · 土克水 · 水克火 · 火克金\n相克造成 2 倍伤害',
      {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: '#78909c',
        align: 'right',
        lineSpacing: 2,
      }).setOrigin(1, 1).setDepth(50);
    txt.setAlpha(0.7);
  }

  /** 创建天劫倒计时（顶部中央醒目） */
  private createTribulationTimer(): void {
    const W = this.scale.width;
    const cx = W / 2;
    const y = 48;
    // 背景
    this.tribulationTimerBg = this.add.rectangle(cx, y, 200, 32, 0x000000, 0.6)
      .setStrokeStyle(2, 0xff5252, 0.8);
    this.tribulationTimerBg.setDepth(50);
    // 文字
    this.tribulationTimerText = this.add.text(cx, y, '', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '15px',
      color: '#ff5252',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(51);
  }

  /** 创建神使血条（顶部中央，天劫时显示） */
  private createEnvoyBar(): void {
    const W = this.scale.width;
    const barW = 500;
    const barH = 18;
    const x = (W - barW) / 2;
    const y = 90;

    const bg = this.add.rectangle(x + barW / 2, y + barH / 2, barW, barH, 0x000000, 0.8)
      .setStrokeStyle(3, 0xff5252, 1);
    this.envoyBarFill = this.add.rectangle(x, y, barW, barH, 0xff5252, 1)
      .setOrigin(0, 0);
    this.envoyBarText = this.add.text(W / 2, y + barH / 2, '', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.envoyBar = this.add.container(0, 0, [bg, this.envoyBarFill, this.envoyBarText]);
    this.envoyBar.setDepth(52);
    this.envoyBar.setVisible(false);
  }

  private createBossBar(): void {
    const W = this.scale.width;
    const barW = 400;
    const barH = 14;
    const x = (W - barW) / 2;
    const y = 70;

    const bg = this.add.rectangle(x + barW / 2, y + barH / 2, barW, barH, 0x37474f, 0.95)
      .setStrokeStyle(2, 0xe53935, 0.8);
    this.bossBarFill = this.add.rectangle(x, y, barW, barH, 0xe53935, 1)
      .setOrigin(0, 0);
    this.bossBarText = this.add.text(W / 2, y + barH / 2, '妖兽统领', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '12px',
      color: COLOR_STR.WHITE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.bossBar = this.add.container(0, 0, [bg, this.bossBarFill, this.bossBarText]);
    this.bossBar.setDepth(50);
    this.bossBar.setVisible(false);
  }

  private showBossBar(): void {
    this.bossBar?.setVisible(true);
  }

  private hideBossBar(): void {
    this.bossBar?.setVisible(false);
  }

  private updateUI(data: UIData): void {
    // 血条
    const hpRatio = Math.max(0, data.hp / data.maxHp);
    this.hpBarFill.width = 280 * hpRatio;
    this.hpBarFill.fillColor = hpRatio > 0.5 ? COLORS.HP_FILL : COLORS.HP_FILL_LOW;
    this.hpBarText.setText(`${Math.ceil(data.hp)} / ${data.maxHp}`);

    // 经验条
    const xpRatio = Math.max(0, data.xp / data.xpToNext);
    this.xpBarFill.width = 280 * xpRatio;

    // 等级
    this.levelText.setText(`Lv.${data.level}`);

    // 时间
    const m = Math.floor(data.time / 60);
    const s = Math.floor(data.time % 60);
    this.timeText.setText(`${m}:${s.toString().padStart(2, '0')}`);

    // 击杀
    this.killsText.setText(`击杀 ${data.kills}`);

    // boss 血条
    if (data.boss && this.bossBarFill) {
      const ratio = Math.max(0, data.boss.hp / data.boss.maxHp);
      this.bossBarFill.width = 400 * ratio;
    }

    // 五行法术图标已移除，改用属性面板查看
    // this.updateSpellIcons(data.spells ?? []);

    // debuff 提示
    const debuffs = data.debuffs ?? [];
    if (debuffs.length > 0) {
      const lines = debuffs.map(d => `${d.name} ${Math.ceil(d.time)}s`);
      this.debuffText.setText(lines.join('\n'));
      this.debuffText.setVisible(true);
    } else {
      this.debuffText.setVisible(false);
    }

    // 天劫倒计时 / 神使血条
    this.updateTribulation(data.tribulation);
  }

  /** 更新天劫 UI */
  private updateTribulation(trib?: UIData['tribulation']): void {
    if (!trib) {
      this.tribulationTimerText.setText('天劫 2:00');
      this.envoyBar?.setVisible(false);
      return;
    }
    if (trib.active) {
      // 天劫进行中：显示神使血条，隐藏倒计时
      this.tribulationTimerText.setText('⚡ 天劫降临 ⚡');
      this.tribulationTimerText.setColor('#ff5252');
      this.tribulationTimerBg.setStrokeStyle(2, 0xff5252, 1);
      if (trib.envoy) {
        this.envoyBar?.setVisible(true);
        const ratio = Math.max(0, trib.envoy.hp / trib.envoy.maxHp);
        if (this.envoyBarFill) {
          this.envoyBarFill.width = 500 * ratio;
          this.envoyBarFill.fillColor = ELEMENT_COLORS[trib.envoy.element];
        }
        if (this.envoyBarText) {
          this.envoyBarText.setText(`${trib.envoy.name}  ${Math.ceil(trib.envoy.hp)}/${trib.envoy.maxHp}`);
        }
      }
    } else {
      // 倒计时阶段
      this.envoyBar?.setVisible(false);
      const t = Math.max(0, trib.timer);
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
      // 最后 30 秒闪烁警示
      if (t < 30) {
        const blink = Math.floor(t * 4) % 2 === 0;
        this.tribulationTimerText.setText(`⚠ 天劫 ${timeStr} ⚠`);
        this.tribulationTimerText.setColor(blink ? '#ff5252' : '#ffffff');
        this.tribulationTimerBg.setFillStyle(0x4a0000, 0.8);
        this.tribulationTimerBg.setStrokeStyle(3, 0xff5252, 1);
      } else {
        this.tribulationTimerText.setText(`天劫倒计时 ${timeStr}`);
        this.tribulationTimerText.setColor('#ffb74d');
        this.tribulationTimerBg.setFillStyle(0x000000, 0.6);
        this.tribulationTimerBg.setStrokeStyle(2, 0xff5252, 0.8);
      }
    }
  }

  /** 更新五行法术图标 */
  private updateSpellIcons(spells: { id: string; element: Element; name: string }[]): void {
    // 简单策略：数量变化时重建
    if (this.spellIcons.length === spells.length) {
      // 检查是否一致
      let same = true;
      for (let i = 0; i < spells.length; i++) {
        if (!this.spellIcons[i] || (this.spellIcons[i].getData('element') !== spells[i].element)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    // 清空
    for (const ic of this.spellIcons) ic.destroy(true);
    this.spellIcons = [];
    // 重建
    for (let i = 0; i < spells.length; i++) {
      const spell = spells[i];
      const x = i * 36;
      const color = ELEMENT_COLORS[spell.element];
      const bg = this.add.circle(x, 0, 14, 0x000000, 0.5)
        .setStrokeStyle(2, color, 1);
      const dot = this.add.circle(x, 0, 9, color, 0.8);
      const label = this.add.text(x, 0, ELEMENT_NAMES[spell.element], {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      const c = this.add.container(x, 0, [bg, dot, label]);
      c.setData('element', spell.element);
      c.setDepth(50);
      this.spellContainer.add(c);
      this.spellIcons.push(c);
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    // 磁场转动冷却
    if (this.magneticCooldown > 0) {
      this.magneticCooldown -= dt;
      if (this.magneticCooldown <= 0) {
        this.magneticCooldown = 0;
        // 恢复红色按钮
        const btnGfx = this.magneticBtn.getAt(0) as Phaser.GameObjects.Graphics;
        const btnText = this.magneticBtn.getAt(1) as Phaser.GameObjects.Text;
        const W = this.scale.width;
        const H = this.scale.height;
        const btnX = W - 55;
        const btnY = H / 2;
        btnGfx.clear();
        btnGfx.fillStyle(0xff5252, 0.15); btnGfx.fillCircle(btnX, btnY, 35);
        btnGfx.fillStyle(0xff5252, 0.8); btnGfx.fillCircle(btnX, btnY, 28);
        btnGfx.fillStyle(0xffffff, 0.25); btnGfx.fillCircle(btnX - 8, btnY - 8, 12);
        btnGfx.lineStyle(3, 0xffffff, 0.6); btnGfx.strokeCircle(btnX, btnY, 28);
        btnGfx.lineStyle(1, 0xffffff, 0.3); btnGfx.strokeCircle(btnX, btnY, 22);
        btnText.setText('氪命\n爆种');
      }
    }
    // 磁场转动激活计时
    if (this.magneticActive) {
      this.magneticActiveTimer -= dt;
      if (this.magneticActiveTimer <= 0) {
        this.magneticActive = false;
        const game = this.scene.get('Game') as any;
        if (game.player) {
          game.player.magneticBoost = false;
        }
      }
    }
  }
}
