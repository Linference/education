import { useEffect, useRef, useState } from 'react';
export default function DshOnboarding() {
  const [visible,setVisible] = useState(false), [installed,setInstalled] = useState(false), [bundled,setBundled] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const refresh = async () => { const s = await window.gezhi.dshSetup.status(); setInstalled(s.installed); setBundled(s.installerBundled); return s; };
  useEffect(() => { let alive = true; void refresh().then(s => { const query=new URLSearchParams(location.search); if (alive && !s.completed && (!query.has('test') || query.has('onboarding'))) setVisible(true); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => { if (visible) opener.current?.focus(); }, [visible]);
  const action = async (type: 'install'|'login'|'complete') => { setBusy(true); setMessage(''); try {
    if (type === 'login') await refresh();
    const r = await window.gezhi.dshSetup[type](); if (!r.ok) throw new Error(r.error);
    if (type === 'complete') setVisible(false); else setMessage(type === 'install' ? '安装程序已打开。安装完成后点击“检查安装状态”。' : '已打开 DeepSeek Harness。请在它的官方窗口登录或配置模型，再返回格致。');
  } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  if (!visible) return null;
  return <div className="dsh-onboarding-backdrop"><section className="dsh-onboarding" role="dialog" aria-modal="true" aria-labelledby="dsh-login-title"><span className="learning-eyebrow">WELCOME TO GEZHI</span><h1 id="dsh-login-title">连接你的 AI 学习伙伴</h1><p>先完成 DeepSeek Harness 登录。账号验证在 DeepSeek Harness 官方窗口进行，格致不收集你的登录密码。</p><div className="dsh-setup-steps"><span className={installed?'done':''}>01 安装运行时 {installed ? '✓' : ''}</span><span>02 登录 / 配置模型</span><span>03 返回学习空间</span></div>{!installed && <button ref={opener} className="learning-primary" disabled={busy || !bundled} onClick={() => void action('install')}>{bundled ? '安装内置 DeepSeek Harness' : '安装程序未随包提供'}</button>}<button ref={installed ? opener : undefined} className={installed?'learning-primary':''} disabled={busy || !installed} onClick={() => void action('login')}>打开 DeepSeek Harness 登录</button><button disabled={busy} onClick={() => void refresh().then(s => setMessage(s.installed?'运行时已安装。请完成官方账号登录或模型配置。':'尚未找到运行时，请完成安装后重试。'))}>检查安装状态</button><button disabled={busy || !installed} onClick={() => void action('complete')}>我已完成登录，进入格致</button>{message && <p className="learning-callout" role="status">{message}</p>}<button className="dsh-skip" onClick={() => setVisible(false)}>暂时离线使用笔记和题库</button><small>运行时可用检查不等于账号已验证；实际 AI 请求失败时会显示服务错误。</small></section></div>;
}
