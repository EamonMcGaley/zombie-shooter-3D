// The survivors you can play as. Each comes with their own weapon (the
// weapon's rules are in game.js). Original names.
// See .scratch/maps-characters-settings/spec.md.

export const CHARACTERS = [
  {
    id: 'jack',
    name: 'Jack',
    weapon: 'rifle',
    weaponName: 'Rifle',
    blurb: 'Steady all-rounder. 5 shots a second.',
    colours: { skin: '#e0ac69', shirt: '#3a86ff', trousers: '#23395d', hair: '#4a2f1b' },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    weapon: 'shotgun',
    weaponName: 'Shotgun',
    blurb: '6-pellet blast. Brutal up close, useless far away.',
    colours: { skin: '#c68642', shirt: '#c0392b', trousers: '#2b2b2b', hair: '#1a1a1a' },
  },
  {
    id: 'kenji',
    name: 'Kenji',
    weapon: 'smg',
    weaponName: 'SMG',
    blurb: 'Sprays 11 shots a second, with a little wobble.',
    colours: { skin: '#f1c27d', shirt: '#2e8b57', trousers: '#3b3b3b', hair: '#111111' },
  },
  {
    id: 'ivy',
    name: 'Ivy',
    weapon: 'sniper',
    weaponName: 'Sniper',
    blurb: 'Slow to fire, but every bullet goes through 5 zombies.',
    colours: { skin: '#8d5524', shirt: '#6b6b6b', trousers: '#1f1f1f', hair: '#d9c27a' },
  },
];
