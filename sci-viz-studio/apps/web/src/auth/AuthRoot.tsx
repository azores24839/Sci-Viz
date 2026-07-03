import { useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react';
import { setAuthTokenProvider } from '../api/client';
import { UsageProfile } from './UsageProfile';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function TokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => { setAuthTokenProvider(() => getToken()); setReady(true); return () => setAuthTokenProvider(async () => null); }, [getToken]);
  return ready ? <>{children}</> : <main className="app-loading"><span>正在验证登录状态…</span></main>;
}

function SignInScreen() {
  return <main className="auth-screen"><section className="auth-brand"><span>研影</span><h1>把科研资料，变成可执行的影像方案。</h1><p>注册后，你上传的文件、解析结果和项目只对自己的账号可见。</p></section><section className="auth-card"><SignIn routing="hash" /></section></main>;
}

export function AuthRoot({ children }: { children: ReactNode }) {
  if (!publishableKey) { setAuthTokenProvider(async () => null); return <>{children}<div className="studio-account-dock"><UsageProfile /></div></>; }
  return <ClerkProvider publishableKey={publishableKey} signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
    <Show when="signed-out"><SignInScreen /></Show>
    <Show when="signed-in"><TokenBridge>{children}<div className="studio-account-dock"><UsageProfile /><UserButton /></div></TokenBridge></Show>
  </ClerkProvider>;
}
