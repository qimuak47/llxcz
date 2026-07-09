/**
 * 入口文件 - Phaser 游戏配置
 * 游戏视口 960×540（横屏），世界地图 2880×1620（9倍），相机跟随玩家
 * 移动端竖屏时自动适配
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameOverScene } from './scenes/GameOverScene';
import { CodexScene } from './scenes/CodexScene';

/** 世界尺寸（大地图，9倍于视口） */
export const WORLD_W = 2880;
export const WORLD_H = 1620;
/** 视口尺寸（横屏基准） */
export const VIEW_W = 960;
export const VIEW_H = 540;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0a0e1a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,  // 自适应缩放，支持竖屏
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W,
    height: VIEW_H,
  },
  input: {
    activePointers: 3,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: [BootScene, MenuScene, CodexScene, GameScene, UIScene, GameOverScene],
};

new Phaser.Game(config);
