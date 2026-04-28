export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      className="auth-light-force flex min-h-screen items-center justify-center p-4"
      style={
        {
          '--background': '#f5f7f5',
          '--foreground': '#1a2e1a',
          '--card': '#f8faf8',
          '--card-foreground': '#1a2e1a',
          '--border': '#d4e4d4',
          '--input': '#d4e4d4',
          '--primary': '#15803d',
          '--primary-foreground': '#ffffff',
          '--muted': '#f0f5f0',
          // Darker muted-foreground to hit WCAG AA on f8faf8 background.
          '--muted-foreground': '#4d6b4d',
          '--ring': '#16a34a',
          '--destructive': '#dc2626',
          colorScheme: 'light',
          backgroundColor: '#f5f7f5',
          color: '#1a2e1a',
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}
