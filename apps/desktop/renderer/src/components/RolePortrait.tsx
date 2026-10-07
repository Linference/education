import atlas from '../assets/companion-roles-v1.png';
import type { CSSProperties } from 'react';
const IDS = ['peer','teacher','student','examiner','researcher'];
export default function RolePortrait({ roleId, name, speaking = false,state='idle' }: { roleId: string; name: string; speaking?: boolean;state?:'idle'|'thinking'|'listening' }) {
  const index = Math.max(0, IDS.indexOf(roleId));
  return <div className={'role-portrait state-'+state+' ' + (speaking ? 'is-speaking' : '')} role="img" aria-label={name + (speaking ? '正在说话' : state==='thinking'?'正在思考':state==='listening'?'正在倾听':'数字人')} style={{ backgroundImage: `url(${atlas})`, backgroundPosition: `${index * 25}% center`, '--role-index': index } as CSSProperties}><span className="role-voice-ring" aria-hidden="true" /></div>;
}
