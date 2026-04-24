import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppShell } from '@/components/AppShell';
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { SetupGate } from '@/components/setup-gate';
import { ToastRenderer } from '@/components/toast-renderer';
import { ChatNotificationToast } from '@/components/chat-notification-toast';
import { DashboardTourGate } from '@/components/dashboard-tour-gate';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mission Control — AI Agent Orchestration Dashboard',
  description:
    'Monitor, chat with, and manage your AI agents, tasks, and workflows — all from a single dashboard.',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#050508',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider>
          <SetupGate>
            <KeyboardShortcuts />
            <AppShell>
              <DashboardTourGate />
              {children}
            </AppShell>
            <ChatNotificationToast />
            <ToastRenderer />
          </SetupGate>
        </ThemeProvider>
      </body>
    </html>
  );
}