/**
 * 颜色调色板 - 修仙界主题
 * 所有 UI 和实体颜色集中管理，方便统一调整风格
 */
export const COLORS = {
  // 背景
  BG_DARK: 0x0a0e1a,
  BG_MID: 0x141b2e,
  BG_LIGHT: 0x1e2a44,

  // 玩家老雷 - 磁场转动主题（青蓝色系）
  PLAYER: 0x4dd0e1,
  PLAYER_GLOW: 0x00e5ff,
  PLAYER_AURA: 0x80deea,
  PLAYER_DASH: 0xffffff,

  // 放电（雷电）
  LIGHTNING: 0xffeb3b,
  LIGHTNING_CORE: 0xffffff,
  LIGHTNING_GLOW: 0xfff176,

  // 磁场领域
  MAGNETIC: 0x7c4dff,
  MAGNETIC_GLOW: 0xb388ff,

  // 妖兽
  ENEMY_RABBIT: 0xe0e0e0,   // 妖兔 - 灰白
  ENEMY_SNAKE: 0x66bb6a,    // 石蟒 - 绿
  ENEMY_WOLF: 0x90a4ae,     // 灵狼 - 钢灰
  ENEMY_BAT: 0xab47bc,      // 妖蝠 - 紫
  ENEMY_BOSS: 0xe53935,     // 妖兽统领 - 红

  // 灵石（经验）
  GEM: 0x26c6da,
  GEM_GLOW: 0x80deea,

  // UI
  HP_BG: 0x37474f,
  HP_FILL: 0xef5350,
  HP_FILL_LOW: 0xd32f2f,
  XP_BG: 0x37474f,
  XP_FILL: 0x26c6da,
  TEXT: 0xffffff,
  TEXT_DIM: 0xb0bec5,
  TEXT_GOLD: 0xffd54f,
  TEXT_CYAN: 0x4dd0e1,

  // 升级卡
  CARD_BG: 0x1e2a44,
  CARD_BORDER: 0x4dd0e1,
  CARD_HOVER: 0x3949ab,

  // 地形
  MOUNTAIN: 0x263238,
  MOUNTAIN_LIGHT: 0x37474f,
  GRID: 0x1a2332,

  // ===== 五行 =====
  ELEMENT_NONE: 0x9e9e9e,
  ELEMENT_METAL: 0xffd54f,   // 金 - 金黄
  ELEMENT_WOOD: 0x66bb6a,    // 木 - 翠绿
  ELEMENT_EARTH: 0xa1887f,   // 土 - 赭石
  ELEMENT_WATER: 0x4fc3f7,   // 水 - 湛蓝
  ELEMENT_FIRE: 0xff7043,    // 火 - 烈焰橙
} as const;

/** 主题色字符串版本（用于 Phaser 文本 fill） */
export const COLOR_STR = {
  WHITE: '#ffffff',
  CYAN: '#4dd0e1',
  GOLD: '#ffd54f',
  RED: '#ef5350',
  GREEN: '#66bb6a',
  PURPLE: '#b388ff',
  DIM: '#b0bec5',
  METAL: '#ffd54f',
  WOOD: '#66bb6a',
  EARTH: '#a1887f',
  WATER: '#4fc3f7',
  FIRE: '#ff7043',
};
