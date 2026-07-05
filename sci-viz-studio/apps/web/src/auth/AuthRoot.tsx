import { useEffect, useState, type ReactNode } from 'react';
import { ClerkFailed, ClerkLoaded, ClerkLoading, ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react';
import { setAuthTokenProvider } from '../api/client';

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

export function AccountIdentity() {
  return publishableKey ? <UserButton /> : <span className="account-placeholder" aria-label="本地测试账号">本地</span>;
}

function AccountDock() {
  return <div className="studio-account-dock"><AccountIdentity /></div>;
}

export function AuthRoot({ children }: { children: ReactNode }) {
  if (!publishableKey) { setAuthTokenProvider(async () => null); return <>{children}<AccountDock /></>; }
  return <ClerkProvider publishableKey={publishableKey} signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
    <ClerkLoading><main className="app-loading"><span>正在恢复登录状态…</span></main></ClerkLoading>
    <ClerkFailed><main className="app-loading"><span>登录服务暂时无法连接，请稍后刷新。</span></main></ClerkFailed>
    <ClerkLoaded>
      <Show when="signed-out"><SignInScreen /></Show>
      <Show when="signed-in">
        <TokenBridge>{children}</TokenBridge>
        <AccountDock />
      </Show>
    </ClerkLoaded>
  </ClerkProvider>;
}
