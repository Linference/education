import atlas from '../assets/companion-roles-v1.png';
import type { CSSProperties } from 'react';
const IDS = ['peer','teacher','student','examiner','researcher'];
export default function RolePortrait({ roleId, name, speaking = false }: { roleId: string; name: string; speaking?: boolean }) {
  const index = Math.max(0, IDS.indexOf(roleId));
  return <div className={'role-portrait ' + (speaking ? 'is-speaking' : '')} role="img" aria-label={name + (speaking ? '正在说话' : '数字人')} style={{ backgroundImage: `url(${atlas})`, backgroundPosition: `${index * 25}% center`, '--role-index': index } as CSSProperties}><span className="role-voice-ring" aria-hidden="true" /></div>;
}
